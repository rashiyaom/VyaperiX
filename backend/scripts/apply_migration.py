#!/usr/bin/env python3
"""
apply_migration.py — Direct single-migration runner and verification script for Supabase.

Features:
1. Reads SUPABASE_DB_URL directly from the environment (not .env), exiting cleanly
   with instructions if not set.
2. Accepts a migration filename as a command-line argument, defaulting to the most
   recent file in supabase/migrations/ by filename sort order.
3. Reuses split_sql_statements and is_already_exists_error from setup_dev_supabase.py
   to execute SQL safely and idempotently with autocommit=True.
4. Verifies that public.video_calls exists (printing columns and types), has RLS enabled,
   and has attached RLS policies.
5. Prints a strict PASS/FAIL summary based on live database verification queries.

Does NOT modify services/backend/.env or apps/web/.env.
Does NOT touch tables other than the one created/modified by the migration.
"""

import argparse
import os
import re
import sys
from pathlib import Path
from typing import Optional, Tuple

# Pre-flight check for psycopg2
try:
    import psycopg2
    import psycopg2.errors
except ImportError:
    print("=" * 72)
    print("[ERROR] Required dependency 'psycopg2-binary' is not installed.")
    print("Please install it by running:")
    print("    pip install psycopg2-binary")
    print("=" * 72)
    sys.exit(1)

# Import shared helpers from setup_dev_supabase.py
_script_dir = Path(__file__).resolve().parent
if str(_script_dir) not in sys.path:
    sys.path.insert(0, str(_script_dir))

try:
    from setup_dev_supabase import (
        find_project_root,
        is_already_exists_error,
        split_sql_statements,
    )
except ImportError:
    # Fallback definitions if import fails
    def find_project_root() -> Path:
        start_path = Path(__file__).resolve().parent
        for candidate in [start_path, *start_path.parents]:
            if (candidate / "supabase" / "schema.sql").is_file() or (candidate / ".git").is_dir():
                return candidate
        return Path.cwd()

    def split_sql_statements(sql_text: str):
        statements = []
        current = []
        in_single_quote = False
        in_dollar_quote = False
        dollar_tag = ""
        i = 0
        n = len(sql_text)
        while i < n:
            char = sql_text[i]
            if not in_single_quote and char == '$':
                match = re.match(r'^\$[A-Za-z0-9_]*\$', sql_text[i:])
                if match:
                    tag = match.group(0)
                    if in_dollar_quote and tag == dollar_tag:
                        in_dollar_quote = False
                        dollar_tag = ""
                    elif not in_dollar_quote:
                        in_dollar_quote = True
                        dollar_tag = tag
                    current.append(tag)
                    i += len(tag)
                    continue
            elif not in_dollar_quote and char == "'":
                if in_single_quote and i + 1 < n and sql_text[i + 1] == "'":
                    current.append("''")
                    i += 2
                    continue
                in_single_quote = not in_single_quote
                current.append(char)
                i += 1
                continue

            if char == ';' and not in_single_quote and not in_dollar_quote:
                stmt = "".join(current).strip()
                if stmt:
                    statements.append(stmt)
                current = []
            else:
                current.append(char)
            i += 1
        stmt = "".join(current).strip()
        if stmt:
            statements.append(stmt)
        return statements

    def is_already_exists_error(err: Exception) -> bool:
        err_msg = str(err).lower()
        if "already exists" in err_msg:
            return True
        pgcode = getattr(err, "pgcode", None)
        if pgcode in {"42710", "42P07", "42723", "42701", "23505"}:
            return True
        return False


def get_db_url_from_env() -> str:
    """
    Reads SUPABASE_DB_URL strictly from environment variables (not from .env).
    If missing, prints clear instructions and exits cleanly.
    """
    db_url = os.environ.get("SUPABASE_DB_URL", "").strip()
    # Strip literal brackets if user accidentally copied [PASSWORD]
    if db_url and ":[" in db_url and "]@" in db_url:
        db_url = re.sub(r':\[(.*?)\]@', r':\1@', db_url)

    if not db_url:
        print("=" * 78)
        print("  NOTICE: SUPABASE_DB_URL environment variable is not set")
        print("=" * 78)
        print("  SUPABASE_DB_URL must be set as an environment variable to execute")
        print("  migrations against your Supabase PostgreSQL database.")
        print()
        print("  Set it temporarily in your terminal before running this script:")
        print("    PowerShell (Windows):")
        print('      $env:SUPABASE_DB_URL="postgresql://postgres:[PASSWORD]@db.[REF].supabase.co:5432/postgres"')
        print("      python services/backend/scripts/apply_migration.py [migration_file.sql]")
        print()
        print("    Bash / Zsh (Linux/macOS):")
        print('      export SUPABASE_DB_URL="postgresql://postgres:[PASSWORD]@db.[REF].supabase.co:5432/postgres"')
        print("      python services/backend/scripts/apply_migration.py [migration_file.sql]")
        print("=" * 78)
        sys.exit(0)

    return db_url


def resolve_migration_file(root_dir: Path, requested_arg: Optional[str]) -> Path:
    """
    Resolves the migration file to apply:
    - If argument provided, resolves by absolute path, relative path, or filename in supabase/migrations/
    - If no argument provided, defaults to the latest migration in supabase/migrations/ by filename sort
    """
    migrations_dir = root_dir / "supabase" / "migrations"
    if not migrations_dir.is_dir():
        print(f"[ERROR] Migrations directory not found at: {migrations_dir}")
        sys.exit(1)

    if requested_arg and requested_arg.strip():
        arg_clean = requested_arg.strip()
        candidate = Path(arg_clean)
        # 1. Direct path exists
        if candidate.is_file():
            return candidate.resolve()
        # 2. Check within supabase/migrations/
        in_migrations = migrations_dir / candidate.name
        if in_migrations.is_file():
            return in_migrations.resolve()

        print(f"[ERROR] Specified migration file could not be found: '{arg_clean}'")
        print(f"Checked:\n  - {candidate.resolve()}\n  - {in_migrations.resolve()}")
        sys.exit(1)

    # No argument given: default to most recent file in supabase/migrations/
    sql_files = sorted([f for f in migrations_dir.glob("*.sql") if f.is_file()], key=lambda p: p.name)
    if not sql_files:
        print(f"[ERROR] No .sql migration files found in: {migrations_dir}")
        sys.exit(1)

    latest = sql_files[-1]
    print("[+] No migration file specified.")
    print(f"    Defaulting to latest migration by filename: {latest.name}")
    return latest.resolve()


def execute_migration_file(cur, migration_path: Path):
    """Executes SQL statements in the chosen migration file, handling already exists idempotently."""
    print(f"\n[+] Executing migration: {migration_path.name}")
    content = migration_path.read_text(encoding="utf-8")
    statements = split_sql_statements(content)

    applied = 0
    skipped = 0

    for idx, stmt in enumerate(statements, 1):
        clean_stmt = stmt.strip()
        if not clean_stmt:
            continue
        try:
            cur.execute(clean_stmt)
            applied += 1
        except Exception as e:
            if is_already_exists_error(e):
                first_lines = [l.strip() for l in clean_stmt.splitlines() if l.strip() and not l.strip().startswith("--")]
                snippet = first_lines[0][:65] if first_lines else "SQL statement"
                print(f"    [WARNING] Object already exists ({snippet}...): {str(e).strip().splitlines()[0]}")
                skipped += 1
            else:
                print(f"    [ERROR] Statement {idx} in {migration_path.name} failed:")
                print(clean_stmt[:300])
                raise e

    print(f"    -> Complete: {applied} applied, {skipped} skipped (already existing).")


def verify_database_state(cur, target_table: str = "video_calls") -> bool:
    """
    Executes live verification queries against PostgreSQL:
    1. Checks if public.<target_table> exists, printing column names and data types.
    2. Checks if Row Level Security is enabled via pg_class.relrowsecurity.
    3. Lists RLS policies attached to the table via pg_policies.
    Returns True if all checks pass, False otherwise.
    """
    print(f"\n[+] Verifying database state for table 'public.{target_table}'...")
    all_passed = True

    # 1. Check table existence & columns
    cur.execute("""
        SELECT column_name, data_type, is_nullable, column_default
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = %s
        ORDER BY ordinal_position;
    """, (target_table,))
    columns = cur.fetchall()

    table_exists = len(columns) > 0
    if table_exists:
        print(f"\n  [1] Table 'public.{target_table}' verified. Columns ({len(columns)}):")
        max_col = max(len(c[0]) for c in columns)
        max_type = max(len(c[1]) for c in columns)
        for col_name, data_type, nullable, default_val in columns:
            nullable_str = "NULL" if nullable == "YES" else "NOT NULL"
            def_str = f" DEFAULT {default_val}" if default_val else ""
            print(f"      - {col_name.ljust(max_col)} : {data_type.ljust(max_type)} ({nullable_str}{def_str})")
    else:
        print(f"\n  [1] [FAIL] Table 'public.{target_table}' does NOT exist in public schema.")
        all_passed = False

    # 2. Check Row Level Security in pg_class
    cur.execute("""
        SELECT c.relrowsecurity, c.relforcerowsecurity
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relname = %s;
    """, (target_table,))
    rls_row = cur.fetchone()

    rls_enabled = bool(rls_row and rls_row[0])
    if rls_enabled:
        print(f"\n  [2] Row Level Security (RLS): ENABLED on 'public.{target_table}' (pg_class.relrowsecurity = True).")
    else:
        print(f"\n  [2] [FAIL] Row Level Security (RLS) is NOT enabled on 'public.{target_table}'.")
        all_passed = False

    # 3. Check RLS policies in pg_policies
    cur.execute("""
        SELECT policyname, permissive, roles, cmd
        FROM pg_policies
        WHERE schemaname = 'public' AND tablename = %s
        ORDER BY policyname;
    """, (target_table,))
    policies = cur.fetchall()

    if policies:
        print(f"\n  [3] Attached RLS Policies ({len(policies)}):")
        for pol_name, permissive, roles, cmd in policies:
            print(f"      - \"{pol_name}\" [Command: {cmd}, Roles: {roles}, Permissive: {permissive}]")
    else:
        print(f"\n  [3] [FAIL] No RLS policies attached to 'public.{target_table}'.")
        all_passed = False

    # 4. Final PASS/FAIL Summary
    print("\n" + "=" * 74)
    print(f"             MIGRATION VERIFICATION SUMMARY: public.{target_table}")
    print("=" * 74)
    print(f"  [{'PASS' if table_exists else 'FAIL'}] Table existence (found {len(columns)} columns)")
    print(f"  [{'PASS' if rls_enabled else 'FAIL'}] Row Level Security (relrowsecurity = True)")
    print(f"  [{'PASS' if len(policies) > 0 else 'FAIL'}] RLS Policies (found {len(policies)} policies)")
    print("=" * 74)
    if all_passed:
        print("  FINAL STATUS: PASS")
    else:
        print("  FINAL STATUS: FAIL")
    print("=" * 74 + "\n")

    return all_passed


def main():
    parser = argparse.ArgumentParser(
        description="Direct Supabase single-migration runner and verification script."
    )
    parser.add_argument(
        "migration",
        nargs="?",
        default=None,
        help="Migration filename or path (defaults to latest in supabase/migrations/)",
    )
    parser.add_argument(
        "--table",
        default="video_calls",
        help="Target table to verify after execution (defaults to 'video_calls')",
    )
    args = parser.parse_args()

    root_dir = find_project_root()

    print("=" * 74)
    print("         VYEPARI X -- SUPABASE MIGRATION RUNNER & VERIFIER")
    print("=" * 74)
    print(f"Repository Root: {root_dir}")

    # 1. Read SUPABASE_DB_URL strictly from environment
    db_url = get_db_url_from_env()
    print("[+] SUPABASE_DB_URL environment variable detected.")

    # 2. Resolve migration file
    migration_path = resolve_migration_file(root_dir, args.migration)
    print(f"[+] Selected migration file: {migration_path.name}")

    # 3. Connect to PostgreSQL
    print("[+] Connecting to Supabase PostgreSQL database...")
    try:
        conn = psycopg2.connect(db_url)
        conn.autocommit = True
        cur = conn.cursor()
    except Exception as conn_err:
        print(f"[FATAL] Could not connect to Postgres database: {conn_err}")
        sys.exit(1)

    try:
        # 4. Execute migration
        execute_migration_file(cur, migration_path)

        # 5. Run live verification queries
        passed = verify_database_state(cur, target_table=args.table)

        cur.close()
        conn.close()

        if not passed:
            sys.exit(1)

    except Exception as run_err:
        print(f"[FATAL] Migration execution failed: {run_err}")
        try:
            cur.close()
            conn.close()
        except Exception:
            pass
        sys.exit(1)


if __name__ == "__main__":
    main()
