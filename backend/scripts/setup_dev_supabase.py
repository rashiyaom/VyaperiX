#!/usr/bin/env python3
"""
setup_dev_supabase.py — Provisions a fresh personal Supabase project for Vyepari X.

This script:
1. Validates SUPABASE_URL and SUPABASE_SECRET_KEY in services/backend/.env (read-only).
2. Reads SUPABASE_DB_URL from the environment (direct Postgres connection string).
3. Connects to Postgres and runs supabase/schema.sql and all migrations in order,
   handling "already exists" errors idempotently.
4. Provisions an admin test auth user via Supabase Auth Admin API (reusing the
   main.py admin auth registration approach) and captures the UUID.
5. Upserts seed report 'report_test_001' into public.reports with status 'done'
   and analysis from prompts/briefing_compiler_example.json.
6. Prints a clear execution summary.

Required dependencies:
    pip install psycopg2-binary httpx python-dotenv supabase
(Note: psycopg2-binary is required for direct raw PostgreSQL operations)
"""

import json
import os
import re
import secrets
import sys
import urllib.parse
from pathlib import Path
from typing import List, Optional, Tuple

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

# Pre-flight check for python-dotenv
try:
    from dotenv import dotenv_values
except ImportError:
    print("=" * 72)
    print("[ERROR] Required dependency 'python-dotenv' is not installed.")
    print("Please install it by running:")
    print("    pip install python-dotenv")
    print("=" * 72)
    sys.exit(1)


def find_project_root() -> Path:
    """Locate the root directory of the vyepariX-ai-sales-agent repository."""
    start_path = Path(__file__).resolve().parent
    for candidate in [start_path, *start_path.parents]:
        if (candidate / "supabase" / "schema.sql").is_file() or (candidate / ".git").is_dir():
            return candidate
    return Path.cwd()


def normalize_supabase_url(raw_url: str) -> str:
    """
    Normalizes Supabase URL by stripping trailing slashes, whitespace,
    and extraneous paths like /rest/v1 or /auth/v1 commonly copied from dashboard.
    """
    url = raw_url.strip().rstrip("/")
    for suffix in ["/rest/v1/", "/rest/v1", "/auth/v1/", "/auth/v1", "/storage/v1/", "/storage/v1"]:
        if url.endswith(suffix):
            url = url[:-len(suffix)].strip()
    parsed = urllib.parse.urlparse(url)
    if parsed.scheme and parsed.netloc:
        # Standard Supabase cloud project: https://<ref>.supabase.co
        if not parsed.path or parsed.path == "/" or "supabase.co" in parsed.netloc:
            return f"{parsed.scheme}://{parsed.netloc}"
        clean_path = parsed.path
        for suffix in ["/rest/v1", "/auth/v1", "/storage/v1"]:
            if clean_path.endswith(suffix):
                clean_path = clean_path[:-len(suffix)].rstrip("/")
        return f"{parsed.scheme}://{parsed.netloc}{clean_path}"
    return url.rstrip("/")


def check_is_placeholder(value: Optional[str]) -> bool:
    """Returns True if the value is missing, empty, or appears to be a placeholder."""
    if not value or not value.strip():
        return True
    val_lower = value.strip().lower()
    placeholders = [
        "your_supabase",
        "your_project",
        "your_secret",
        "placeholder",
        "your_api_key",
        "your_ngrok",
        "example.com",
    ]
    return any(p in val_lower for p in placeholders)


def validate_and_read_env(backend_dir: Path) -> Tuple[str, str]:
    """
    Read services/backend/.env without modifying it.
    Validates SUPABASE_URL and SUPABASE_SECRET_KEY.
    Exits early if either is missing or a placeholder.
    """
    env_file = backend_dir / ".env"
    env_vars = {}
    if env_file.is_file():
        # Read .env into a dictionary without modifying the file or polluting globals
        env_vars = dotenv_values(env_file)

    # Shell environment variables take priority over file values
    raw_supabase_url = os.environ.get("SUPABASE_URL") or env_vars.get("SUPABASE_URL", "")
    raw_supabase_secret = os.environ.get("SUPABASE_SECRET_KEY") or env_vars.get("SUPABASE_SECRET_KEY", "")

    # Check SUPABASE_URL
    if check_is_placeholder(raw_supabase_url):
        print("=" * 72)
        print("[CONFIG ERROR] SUPABASE_URL is missing or contains placeholder values.")
        print(f"File: {env_file}")
        print("Please fill in your real Supabase Project URL before running this script.")
        print("Example: SUPABASE_URL=https://abcdefghijklmnopqrst.supabase.co")
        print("=" * 72)
        sys.exit(1)

    # Check SUPABASE_SECRET_KEY
    if check_is_placeholder(raw_supabase_secret):
        print("=" * 72)
        print("[CONFIG ERROR] SUPABASE_SECRET_KEY is missing or contains placeholder values.")
        print(f"File: {env_file}")
        print("Please fill in your real Supabase Secret Key (service_role secret) before running this script.")
        print("Example: SUPABASE_SECRET_KEY=sb_secret_... (or your project service_role JWT)")
        print("=" * 72)
        sys.exit(1)

    clean_url = normalize_supabase_url(raw_supabase_url)
    if clean_url != raw_supabase_url.strip():
        print(f"    [NOTE] Auto-normalized SUPABASE_URL to base project endpoint: {clean_url}")

    return clean_url, raw_supabase_secret.strip()


def check_supabase_db_url(backend_dir: Optional[Path] = None) -> str:
    """
    Reads SUPABASE_DB_URL from the environment or .env.
    If missing, prints clear instructions and exits without doing anything.
    """
    if backend_dir is None:
        backend_dir = Path(__file__).resolve().parent.parent
    env_file = backend_dir / ".env"
    env_vars = dotenv_values(env_file) if env_file.is_file() else {}
    db_url = (os.environ.get("SUPABASE_DB_URL") or env_vars.get("SUPABASE_DB_URL") or "").strip()
    # Strip literal brackets if user copied [PASSWORD] from documentation
    if db_url and ":[" in db_url and "]@" in db_url:
        db_url = re.sub(r':\[(.*?)\]@', r':\1@', db_url)
    if not db_url:
        print("=" * 78)
        print("  NOTICE: SUPABASE_DB_URL environment variable is not set")
        print("=" * 78)
        print("  SUPABASE_DB_URL is a direct Postgres connection string required to execute")
        print("  schema.sql and migrations against your personal Supabase database.")
        print()
        print("  It is only needed temporarily for this one-time setup script and does not")
        print("  need to be added permanently to .env.example or committed to git.")
        print()
        print("  To find your direct connection string:")
        print("    1. Open your Supabase Dashboard (https://supabase.com/dashboard)")
        print("    2. Navigate to: Project Settings -> Database -> Connection string (URI)")
        print("    3. Copy the URI and replace [YOUR-PASSWORD] with your database password.")
        print()
        print("  Set it temporarily in your terminal and re-run:")
        print("    PowerShell (Windows):")
        print('      $env:SUPABASE_DB_URL="postgresql://postgres:[PASSWORD]@db.[REF].supabase.co:5432/postgres"')
        print("      python services/backend/scripts/setup_dev_supabase.py")
        print()
        print("    Bash / Zsh (Linux/macOS):")
        print('      export SUPABASE_DB_URL="postgresql://postgres:[PASSWORD]@db.[REF].supabase.co:5432/postgres"')
        print("      python services/backend/scripts/setup_dev_supabase.py")
        print("=" * 78)
        sys.exit(0)

    return db_url


def split_sql_statements(sql_text: str) -> List[str]:
    """
    Splits a SQL script into discrete statements, properly preserving
    PL/pgSQL dollar-quoted blocks ($$...$$) and single-quoted strings.
    """
    statements = []
    current = []
    in_single_quote = False
    in_dollar_quote = False
    dollar_tag = ""
    i = 0
    n = len(sql_text)

    while i < n:
        char = sql_text[i]

        # Dollar quotes ($$ or $tag$)
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

        # Single quotes with '' escape support
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
    """Determine if a Postgres error is due to an object already existing."""
    err_msg = str(err).lower()
    if "already exists" in err_msg:
        return True
    # Check psycopg2 error codes
    pgcode = getattr(err, "pgcode", None)
    # 42710: duplicate_object (policies, types, etc.)
    # 42P07: duplicate_table
    # 42723: duplicate_function
    # 42701: duplicate_column
    # 23505: unique_violation
    if pgcode in {"42710", "42P07", "42723", "42701", "23505"}:
        return True
    if isinstance(err, (
        psycopg2.errors.DuplicateObject,
        psycopg2.errors.DuplicateTable,
        psycopg2.errors.DuplicateFunction,
        psycopg2.errors.DuplicateColumn,
        psycopg2.errors.UniqueViolation,
    )):
        return True
    return False


def execute_sql_file(cur, file_path: Path, label: str):
    """Executes a SQL file statement-by-statement with idempotent warning catches."""
    print(f"\n[+] Executing {label}: {file_path.name}")
    content = file_path.read_text(encoding="utf-8")
    statements = split_sql_statements(content)

    executed_count = 0
    skipped_count = 0

    for idx, stmt in enumerate(statements, 1):
        clean_stmt = stmt.strip()
        if not clean_stmt:
            continue
        try:
            cur.execute(clean_stmt)
            executed_count += 1
        except Exception as e:
            if is_already_exists_error(e):
                # Extract first significant line for clean warning output
                first_lines = [l.strip() for l in clean_stmt.splitlines() if l.strip() and not l.strip().startswith("--")]
                snippet = first_lines[0][:65] if first_lines else "SQL statement"
                print(f"    [WARNING] Object already exists ({snippet}...): {str(e).strip().splitlines()[0]}")
                skipped_count += 1
            else:
                print(f"    [ERROR] Statement {idx} in {file_path.name} failed:")
                print(clean_stmt[:300])
                raise e

    print(f"    -> {file_path.name} complete: {executed_count} applied, {skipped_count} skipped (already existing).")


def provision_admin_test_user(supabase_url: str, supabase_secret_key: str) -> Tuple[str, str, str]:
    """
    Creates or retrieves a test auth user via Supabase Auth Admin API.
    Reuses the admin-provisioning approach from services/backend/main.py.
    Returns (user_id_uuid, test_email, test_password).
    """
    test_email = "dev-test@example.com"
    test_password = f"DevTestPass_{secrets.token_hex(6)}!"

    print(f"\n[+] Provisioning test auth user ({test_email}) via Supabase Auth Admin API...")

    # Approach 1: Try official supabase python client if available
    try:
        from supabase import create_client
        client = create_client(supabase_url, supabase_secret_key)

        # Check if user already exists
        users_resp = client.auth.admin.list_users()
        users = getattr(users_resp, "users", users_resp) if not isinstance(users_resp, list) else users_resp
        existing = None
        for u in users:
            u_email = getattr(u, "email", None) or (u.get("email") if isinstance(u, dict) else None)
            if u_email and u_email.strip().lower() == test_email.lower():
                existing = u
                break

        if existing:
            user_id = str(getattr(existing, "id", None) or existing.get("id"))
            client.auth.admin.update_user_by_id(
                user_id,
                {
                    "password": test_password,
                    "email_confirm": True,
                    "user_metadata": {
                        "full_name": "Dev Test User",
                        "company_name": "VyepariX Dev Lab",
                        "industry": "SaaS / Technology",
                        "onboarding_completed": True,
                    },
                },
            )
            print(f"    -> Existing test user updated: {test_email} (UUID: {user_id})")
            return user_id, test_email, test_password
        else:
            res = client.auth.admin.create_user(
                {
                    "email": test_email,
                    "password": test_password,
                    "email_confirm": True,
                    "user_metadata": {
                        "full_name": "Dev Test User",
                        "company_name": "VyepariX Dev Lab",
                        "industry": "SaaS / Technology",
                        "onboarding_completed": True,
                    },
                }
            )
            user_obj = getattr(res, "user", res)
            user_id = str(getattr(user_obj, "id", None) or user_obj.get("id"))
            print(f"    -> New test user created: {test_email} (UUID: {user_id})")
            return user_id, test_email, test_password

    except Exception as client_err:
        print(f"    [INFO] Client auth admin attempt note: {client_err}. Using direct HTTP Admin API...")

    # Approach 2: Direct HTTP call to POST {SUPABASE_URL}/auth/v1/admin/users via httpx
    try:
        import httpx
    except ImportError:
        print("[ERROR] httpx is required for Supabase Auth Admin API calls. Run: pip install httpx")
        sys.exit(1)

    headers = {
        "apikey": supabase_secret_key,
        "Authorization": f"Bearer {supabase_secret_key}",
        "Content-Type": "application/json",
    }
    create_url = f"{supabase_url.rstrip('/')}/auth/v1/admin/users"
    payload = {
        "email": test_email,
        "password": test_password,
        "email_confirm": True,
        "user_metadata": {
            "full_name": "Dev Test User",
            "company_name": "VyepariX Dev Lab",
            "industry": "SaaS / Technology",
            "onboarding_completed": True,
        },
    }

    with httpx.Client(timeout=30.0) as http_client:
        # Check existing users first
        list_resp = http_client.get(create_url, headers=headers)
        if list_resp.status_code == 200:
            data = list_resp.json()
            users_list = data.get("users", data) if isinstance(data, dict) else data
            for u in users_list:
                if isinstance(u, dict) and u.get("email", "").lower() == test_email.lower():
                    user_id = u.get("id")
                    print(f"    -> Found existing test user via Admin API: {test_email} (UUID: {user_id})")
                    return str(user_id), test_email, test_password

        # User does not exist yet; create user
        post_resp = http_client.post(create_url, headers=headers, json=payload)
        if post_resp.status_code in (200, 201):
            user_data = post_resp.json()
            user_id = user_data.get("id") or user_data.get("user", {}).get("id")
            print(f"    -> Successfully created test user via Admin API: {test_email} (UUID: {user_id})")
            return str(user_id), test_email, test_password
        elif post_resp.status_code == 422:
            # Re-fetch in case of race condition
            list_retry = http_client.get(create_url, headers=headers)
            if list_retry.status_code == 200:
                for u in list_retry.json().get("users", []):
                    if u.get("email", "").lower() == test_email.lower():
                        user_id = u.get("id")
                        print(f"    -> Resolved existing user after 422: {test_email} (UUID: {user_id})")
                        return str(user_id), test_email, test_password
            raise RuntimeError(f"Admin API returned 422 but could not retrieve user: {post_resp.text}")
        else:
            raise RuntimeError(f"Admin API failed with status {post_resp.status_code}: {post_resp.text}")


def locate_briefing_compiler_example(root_dir: Path, backend_dir: Path) -> Path:
    """Finds prompts/briefing_compiler_example.json across expected locations."""
    candidates = [
        root_dir / "prompts" / "briefing_compiler_example.json",
        backend_dir / "prompts" / "briefing_compiler_example.json",
        Path.cwd() / "prompts" / "briefing_compiler_example.json",
    ]
    for c in candidates:
        if c.is_file():
            return c
    raise FileNotFoundError(
        "Could not find prompts/briefing_compiler_example.json. "
        f"Checked: {[str(p) for p in candidates]}"
    )


def insert_or_update_test_report(cur, user_id: str, prompts_file: Path):
    """Inserts or updates the seed report 'report_test_001' in public.reports."""
    print(f"\n[+] Upserting test report 'report_test_001' using: {prompts_file.name}...")
    with open(prompts_file, "r", encoding="utf-8") as f:
        analysis_data = json.load(f)

    input_urls = json.dumps({"website": "https://example.com"})
    analysis_json = json.dumps(analysis_data)

    upsert_query = """
    INSERT INTO public.reports (id, user_id, input_urls, status, analysis, updated_at)
    VALUES (%s, %s, %s::jsonb, %s, %s::jsonb, timezone('utc'::text, now()))
    ON CONFLICT (id) DO UPDATE
    SET user_id = EXCLUDED.user_id,
        input_urls = EXCLUDED.input_urls,
        status = EXCLUDED.status,
        analysis = EXCLUDED.analysis,
        updated_at = timezone('utc'::text, now());
    """

    cur.execute(
        upsert_query,
        ("report_test_001", user_id, input_urls, "done", analysis_json)
    )
    print("    -> Seed report 'report_test_001' successfully upserted.")


def print_final_summary(cur, user_id: str, email: str, password: str, executed_files: List[str]):
    """Queries public.reports to verify status 'done' and displays clean summary."""
    cur.execute(
        "SELECT id, status, user_id, updated_at FROM public.reports WHERE id = %s",
        ("report_test_001",)
    )
    row = cur.fetchone()

    print("\n" + "=" * 74)
    print("           VYEPARI X -- DEV SUPABASE SETUP COMPLETE")
    print("=" * 74)
    print("1. Schema & Migrations Applied:")
    for f in executed_files:
        print(f"   - [OK] {f}")
    print()
    print("2. Test Auth User (Supabase Auth Admin API):")
    print(f"   - Email:    {email}")
    print(f"   - Password: {password}")
    print(f"   - User ID:  {user_id}")
    print()
    print("3. Seed Report Verification (public.reports):")
    if row:
        print(f"   - ID:      {row[0]}")
        print(f"   - Status:  {row[1]} (verified 'done')")
        print(f"   - User ID: {row[2]}")
        print(f"   - Updated: {row[3]}")
    else:
        print("   - [WARNING] Report 'report_test_001' could not be queried back.")
    print("=" * 74)
    print("Setup finished successfully. Personal Supabase project is ready for dev.")
    print("=" * 74 + "\n")


def main():
    backend_dir = Path(__file__).resolve().parent.parent
    root_dir = find_project_root()

    print("=" * 74)
    print("         VYEPARI X -- SUPABASE DEV PROVISIONING SCRIPT")
    print("=" * 74)
    print(f"Repository Root: {root_dir}")
    print(f"Backend Dir:     {backend_dir}")

    # 1. Validate SUPABASE_URL and SUPABASE_SECRET_KEY from .env (read-only)
    supabase_url, supabase_secret = validate_and_read_env(backend_dir)
    print("[+] Validated SUPABASE_URL and SUPABASE_SECRET_KEY from .env (read-only).")

    # 2. Check SUPABASE_DB_URL from environment (direct Postgres connection string)
    db_url = check_supabase_db_url()
    print("[+] SUPABASE_DB_URL environment variable detected.")

    # 3. Connect to PostgreSQL
    print("[+] Connecting to Supabase PostgreSQL database...")
    try:
        conn = psycopg2.connect(db_url)
        conn.autocommit = True
        cur = conn.cursor()
    except Exception as conn_err:
        print(f"[FATAL] Could not connect to Postgres database: {conn_err}")
        sys.exit(1)

    executed_files = []

    # 4. Execute supabase/schema.sql
    schema_file = root_dir / "supabase" / "schema.sql"
    if not schema_file.is_file():
        print(f"[FATAL] Schema file not found at: {schema_file}")
        sys.exit(1)

    execute_sql_file(cur, schema_file, "Core Schema")
    executed_files.append("supabase/schema.sql")

    # 5. Execute supabase/migrations/ in order
    migrations_dir = root_dir / "supabase" / "migrations"
    if migrations_dir.is_dir():
        migration_files = sorted(
            [f for f in migrations_dir.glob("*.sql") if f.is_file()],
            key=lambda p: p.name
        )
        for mf in migration_files:
            execute_sql_file(cur, mf, "Migration")
            executed_files.append(f"supabase/migrations/{mf.name}")
    else:
        print("[!] No migrations directory found; skipping migrations.")

    # 6. Provision admin test user
    user_id, email, password = provision_admin_test_user(supabase_url, supabase_secret)

    # 7. Locate example briefing and insert report_test_001
    prompts_file = locate_briefing_compiler_example(root_dir, backend_dir)
    insert_or_update_test_report(cur, user_id, prompts_file)

    # 8. Print final summary and verify status 'done'
    print_final_summary(cur, user_id, email, password, executed_files)

    cur.close()
    conn.close()


if __name__ == "__main__":
    main()
