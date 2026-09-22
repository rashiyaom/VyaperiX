/**
 * MODULE TEMPLATE
 * ────────────────────────────────────────────────────────
 * Copy this entire folder to src/components/modules/<your-module-id>/
 * then fill in the real component logic.
 *
 * Steps:
 * 1. cp -r src/components/modules/_template src/components/modules/your-module
 * 2. Rename ModulePage below and implement it
 * 3. Add backend folder if needed: landing page/backend/<your-module>/
 * 4. Add a VITE_<MODULE>_API_BASE to .env
 * 5. Register in src/modules/registry.ts
 * 6. Wire into src/routes/dashboard.tsx under the activeNav === "your-module" branch
 */

export function ModulePage() {
  return (
    <div className="border border-ink bg-card p-10 text-center space-y-3">
      <h2 className="font-display text-2xl font-extrabold uppercase">
        New Module — Replace This
      </h2>
      <p className="font-mono text-xs text-muted-foreground">
        Implement your module here following the Intelligence Suite pattern.
      </p>
    </div>
  );
}
