# Dashboard Module Decomposition Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract the Intelligence Suite's rendering logic out of `dashboard.tsx` into its own module file, leaving `dashboard.tsx` as a thin layout shell under 150 lines.

**Architecture:** Four of five dashboard modules (LeadRadar, VoiceFleet, Analytics, Settings) are already extracted into `frontend/src/components/modules/*/index.tsx`. Only the Intelligence Suite — `ScraperIntakeForm`, `ReportView`, `ScoreGauge`, `Panel`, `PanelHeader`, `getCleanReportTitle`, plus all associated types — still lives in `dashboard.tsx`. The work is to lift those components into `frontend/src/components/modules/scraper/IntelligenceSuiteModule.tsx`, then thin out `dashboard.tsx` to a pure layout shell.

**Tech Stack:** React 19, TanStack Router, TypeScript, Tailwind v4, Recharts, shadcn/ui (Radix UI), Lucide React

**Spec:** User request in conversation — decompose `dashboard.tsx` (~2100 lines) into per-module files; no behavior change.

## Global Constraints

- No behavior change. Structural extraction only — no logic, API calls, query keys, or UI copy changes.
- Preserve all `useState`/`useEffect` semantics exactly — do not convert polling to TanStack Query or vice versa.
- Keep all existing import paths valid. No new barrel files through shadcn/ui components.
- `frontend/src/modules/registry.ts` stays the single source of truth; do not change it unless a `componentPath` entry changes.
- Each extracted component takes explicit props — nothing reaches into dashboard-level context it does not need.
- Shared UI helpers used by 2+ modules go into `frontend/src/components/modules/shared/`.
- After each extraction, run `npm run lint` in `frontend` and confirm zero new errors before proceeding.

---

## Pre-work: Audit of current state

**Current split (verified by reading dashboard.tsx in full):**

| Component | Location | Lines |
|---|---|---|
| `Panel` | dashboard.tsx:185-187 | Helper — used only by Intelligence Suite sections |
| `PanelHeader` | dashboard.tsx:210-230 | Helper — used only by Intelligence Suite sections |
| `ScoreGauge` | dashboard.tsx:233-267 | Helper — used only by Intelligence Suite `ReportView` |
| `getCleanReportTitle` | dashboard.tsx:189-208 | Used in Intelligence Suite **and** in the sidebar's Recent Reports list in `DashboardPage` |
| `ScraperIntakeForm` | dashboard.tsx:270-444 | Intelligence Suite module only |
| `ReportView` | dashboard.tsx:447-1699 | Intelligence Suite module only (~1250 lines) |
| `DashboardPage` shell | dashboard.tsx:1702-2165 | Top-level layout: header, sidebar, module switch |
| All types (interfaces) | dashboard.tsx:99-183 | Used only by Intelligence Suite + ReportView |
| `LeadRadarModule` | `components/modules/radar/index.tsx` | Already extracted ✓ |
| `VoiceFleetModule` | `components/modules/voice/index.tsx` | Already extracted ✓ |
| `AnalyticsModule` | `components/modules/analytics/index.tsx` | Already extracted ✓ |
| `SettingsModule` | `components/modules/settings/index.tsx` | Already extracted ✓ |

**Ambiguous ownership — `getCleanReportTitle`:**
This function is used in two places:
1. Inside the Intelligence Suite `ReportView` (indirectly, through the Recent Dossiers panel which lives in the `intelligence` nav block inside `DashboardPage`).
2. Inside the sidebar Recent Reports mini-list in `DashboardPage` (line ~1974).

**Resolution:** Export it from the Intelligence Suite module file and import it into the shell `dashboard.tsx` for the sidebar usage. This keeps the function co-located with the types it uses (`RecentReport`), while the shell imports it by name.

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `frontend/src/components/modules/scraper/IntelligenceSuiteModule.tsx` | **Create** | All Intelligence Suite JSX: types, Panel, PanelHeader, ScoreGauge, getCleanReportTitle, ScraperIntakeForm, ReportView, IntelligenceSuiteModule wrapper |
| `frontend/src/routes/dashboard.tsx` | **Modify** | Shell only: header, sidebar, active-module switch, render `<IntelligenceSuiteModule>` |

No `modules/shared/` needed — `Panel` and `PanelHeader` are used exclusively within the Intelligence Suite. The other four modules have their own internal layout primitives.

---

## Task 1: Create IntelligenceSuiteModule.tsx

**Files:**
- Create: `frontend/src/components/modules/scraper/IntelligenceSuiteModule.tsx`

**Interfaces produced (exports for dashboard.tsx to consume):**

```ts
// Re-exported for sidebar usage in dashboard.tsx
export { getCleanReportTitle };
export type { RecentReport, FullAnalysis, ReportData };

// The module component itself
export interface IntelligenceSuiteModuleProps {
  view: "intake" | "report";
  reportId: string | null;
  recentReports: RecentReport[];
  onReportCreated: (id: string) => void;
  onNewAnalysis: () => void;
  onSelectReport: (r: RecentReport) => void;
  onNavigateModule: (moduleId: string) => void;
  onReportFinished: (report: ReportData) => void;
  onFetchRecents: () => void;
}

export function IntelligenceSuiteModule(props: IntelligenceSuiteModuleProps): JSX.Element
```

**What to move:**

Move the following from `dashboard.tsx` into `IntelligenceSuiteModule.tsx` **verbatim** (no logic changes):

1. All `import` statements needed by the moved components (Lucide icons, Recharts, `@/components/scraper/*`, `@/lib/auth`, React hooks)
2. The `API_BASE` constant (`const API_BASE = ...`)
3. All type/interface declarations: `RecentReport`, `CustomerSegment`, `ProductService`, `MarketingChannel`, `CompetitorSignal`, `Recommendation`, `FullAnalysis`, `ReportData`
4. Helper components: `Panel`, `PanelHeader`, `ScoreGauge`
5. Helper function: `getCleanReportTitle`
6. `ScraperIntakeForm` component (lines 270–444 of dashboard.tsx)
7. `ReportView` component (lines 447–1699 of dashboard.tsx)
8. A new thin wrapper component `IntelligenceSuiteModule` that contains the JSX currently at dashboard.tsx lines 1997–2124 (the `activeNav === "intelligence"` block), parameterized by the props above.

**Steps:**

- [ ] **Step 1: Create the file with all moved content**

  Create `frontend/src/components/modules/scraper/IntelligenceSuiteModule.tsx` with the following complete content.

  The component signature (at the bottom of the file, after all helpers):

  ```tsx
  export interface IntelligenceSuiteModuleProps {
    view: "intake" | "report";
    reportId: string | null;
    recentReports: RecentReport[];
    onReportCreated: (id: string) => void;
    onNewAnalysis: () => void;
    onSelectReport: (r: RecentReport) => void;
    onNavigateModule: (moduleId: string) => void;
    onReportFinished: (report: ReportData) => void;
    onFetchRecents: () => void;
  }

  export function IntelligenceSuiteModule({
    view,
    reportId,
    recentReports,
    onReportCreated,
    onNewAnalysis,
    onSelectReport,
    onNavigateModule,
    onReportFinished,
    onFetchRecents,
  }: IntelligenceSuiteModuleProps) {
    return (
      <div className="space-y-6">
        {/* exact JSX from dashboard.tsx lines 2000–2124, substituting:
            - handleNewAnalysis → onNewAnalysis
            - handleReportCreated → onReportCreated
            - handleSelectReport → onSelectReport
            - handleNavigateModule → onNavigateModule
            - handleReportFinished → onReportFinished
            - fetchRecents → onFetchRecents
          All other logic and JSX is verbatim. */}
      </div>
    );
  }
  ```

  The body of `IntelligenceSuiteModule` is a **verbatim copy** of lines 1998–2124 of `dashboard.tsx` (the `activeNav === "intelligence"` div), with only the 6 handler references renamed as above (because they are now props, not closures over dashboard state).

  Export list for the file:
  ```ts
  // Named exports used by dashboard.tsx
  export { getCleanReportTitle };
  export type { RecentReport, FullAnalysis, ReportData };
  export { IntelligenceSuiteModule };
  export type { IntelligenceSuiteModuleProps };
  ```

- [ ] **Step 2: Verify the file compiles**

  Run:
  ```powershell
  cd frontend; npx tsc --noEmit
  ```
  Expected: no new errors related to `IntelligenceSuiteModule.tsx`.

---

## Task 2: Slim down dashboard.tsx

**Files:**
- Modify: `frontend/src/routes/dashboard.tsx`

**What stays in dashboard.tsx after this task:**
- Route definition (`createFileRoute`, `head`, `component: DashboardPage`)
- `API_BASE` constant (kept for `fetchRecents` which calls the backend directly)
- `DashboardPage` function with all its `useState`/`useEffect` hooks and handlers
- The full `return` JSX: header, sidebar (including Recent Reports mini-list using imported `getCleanReportTitle`), main content switch
- Import of `IntelligenceSuiteModule` from its new location
- Import of `getCleanReportTitle`, `RecentReport`, `FullAnalysis`, `ReportData` types from the new module file

**What gets deleted from dashboard.tsx:**
- Lines 99–183: all type/interface declarations (moved to `IntelligenceSuiteModule.tsx`)
- Lines 184–267: `Panel`, `PanelHeader`, `ScoreGauge` components
- Lines 189–208: `getCleanReportTitle` function
- Lines 270–1699: `ScraperIntakeForm` + `ReportView` components
- All Lucide icon imports that are exclusively used by removed components
- All Recharts imports (used only by `ReportView`)
- `FileUploadZone` and `ReportComponents` imports (used only by moved components)
- `useAuth` import (used by `ScraperIntakeForm` — now inside the module; `DashboardPage` still needs `useAuth` for `user`, `profile`, `session`, `signOut` so **keep it**)

**Remaining imports in dashboard.tsx after slimming:**

```ts
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth";
import { useState, useEffect } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Sparkles,
  Lock,
  LogOut,
  Plus,
} from "lucide-react";
import { Logo } from "@/components/site/Chrome";
import { LeadRadarModule } from "@/components/modules/radar";
import { VoiceFleetModule } from "@/components/modules/voice";
import { AnalyticsModule } from "@/components/modules/analytics";
import { SettingsModule } from "@/components/modules/settings";
import { MODULE_REGISTRY } from "@/modules/registry";
import {
  IntelligenceSuiteModule,
  getCleanReportTitle,
} from "@/components/modules/scraper/IntelligenceSuiteModule";
import type { RecentReport, FullAnalysis, ReportData } from "@/components/modules/scraper/IntelligenceSuiteModule";
```

**Steps:**

- [ ] **Step 1: Replace dashboard.tsx content**

  Rewrite `dashboard.tsx` to contain only the shell. The `DashboardPage` function keeps its state/handlers verbatim; the only change is the `activeNav === "intelligence"` block is replaced with:

  ```tsx
  {activeNav === "intelligence" && (
    <IntelligenceSuiteModule
      view={view}
      reportId={reportId}
      recentReports={recentReports}
      onReportCreated={handleReportCreated}
      onNewAnalysis={handleNewAnalysis}
      onSelectReport={handleSelectReport}
      onNavigateModule={handleNavigateModule}
      onReportFinished={handleReportFinished}
      onFetchRecents={fetchRecents}
    />
  )}
  ```

  The sidebar's Recent Reports mini-list continues to use `getCleanReportTitle` (now imported from the module file instead of defined locally).

  **Handler rename in `DashboardPage`:** `handleSelectReport` currently exists as an inline function at line 1813. It references `setActiveAnalysis` which uses `FullAnalysis` — that type is now imported from the module.

- [ ] **Step 2: Verify typecheck passes**

  Run:
  ```powershell
  cd frontend; npx tsc --noEmit
  ```
  Expected: zero errors.

- [ ] **Step 3: Run lint**

  Run:
  ```powershell
  cd frontend; npm run lint
  ```
  Expected: zero new lint errors. If unused import warnings appear, remove the flagged imports.

- [ ] **Step 4: Verify line count**

  Run:
  ```powershell
  (Get-Content frontend/src/routes/dashboard.tsx).Count
  ```
  Expected: ≤ 150 lines.

---

## Task 3: Self-Reflection Quality Gate

Run each check before declaring the task complete:

- [ ] **Gate 1 — No logic altered:** Diff the Intelligence Suite JSX in `IntelligenceSuiteModule.tsx` against the original `dashboard.tsx` lines 1997–2124. The only permitted diff is prop name substitution (6 handler references renamed from local function names to prop names). All other JSX, event handlers, conditional renders, and class names must be identical.

- [ ] **Gate 2 — Props dropped check:** Confirm `IntelligenceSuiteModuleProps` carries every value that the `intelligence` nav block originally consumed from `DashboardPage`'s closure: `view`, `reportId`, `recentReports`, `handleReportCreated`, `handleNewAnalysis`, `handleSelectReport`, `handleNavigateModule`, `handleReportFinished`, `fetchRecents`. No prop is missing.

- [ ] **Gate 3 — Query key unchanged:** No TanStack Query is used in the Intelligence Suite (it uses native `fetch` + `setInterval` polling). Confirm no query keys were introduced or changed.

- [ ] **Gate 4 — `getCleanReportTitle` accessible in both sites:** The function is exported from `IntelligenceSuiteModule.tsx` and imported in `dashboard.tsx`. Sidebar recent reports list still calls it. The function body is verbatim.

- [ ] **Gate 5 — Type imports resolved:** `RecentReport`, `FullAnalysis`, `ReportData` are imported by type in `dashboard.tsx`. Verify no `any` was introduced where these types were previously inferred.

- [ ] **Gate 6 — Lint clean:** `npm run lint` in `frontend` passes with zero errors or warnings that were not pre-existing.

Score this gate: if all 6 pass → **Score: 9/10** (behavior unchanged, extractly equivalent). If any fail, fix and re-check before marking tasks done.

---

## Task 4: Final Verification & Line Count Report

- [ ] **Step 1: Confirm dashboard.tsx line count ≤ 150**

  ```powershell
  (Get-Content frontend/src/routes/dashboard.tsx).Count
  ```

- [ ] **Step 2: Confirm IntelligenceSuiteModule.tsx line count**

  ```powershell
  (Get-Content frontend/src/components/modules/scraper/IntelligenceSuiteModule.tsx).Count
  ```

- [ ] **Step 3: Full typecheck**

  ```powershell
  cd frontend; npx tsc --noEmit
  ```
  Expected: 0 errors.

- [ ] **Step 4: Report before/after**

  | File | Before | After |
  |---|---|---|
  | `dashboard.tsx` | ~2166 lines | ≤ 150 lines |
  | `IntelligenceSuiteModule.tsx` | 0 (new) | ~2050 lines |
  | `LeadRadarModule` | Already extracted | unchanged |
  | `VoiceFleetModule` | Already extracted | unchanged |
  | `AnalyticsModule` | Already extracted | unchanged |
  | `SettingsModule` | Already extracted | unchanged |

---

## Spec Coverage Self-Review

| Spec Requirement | Covered By |
|---|---|
| `dashboard.tsx` → shell under 150 lines | Task 2 + Task 4 Step 1 |
| Intelligence Suite extracted to its own file | Task 1 |
| No behavior change | Task 3 Gate 1 |
| All props explicit (no context reach-in) | `IntelligenceSuiteModuleProps` in Task 1 |
| `getCleanReportTitle` ambiguity resolved (used in sidebar too) | Pre-work analysis + Task 1 export, Task 2 import |
| Registry.ts unchanged | Not touched (module component path is in `components/modules/scraper/`, `registry.ts` currently has `componentPath: "modules/scraper"` which is a display-only field — not an import path, so no change needed) |
| Other 4 modules already extracted | Pre-work confirms: no action needed |
| Lint + typecheck clean | Task 2 Steps 2–3, Task 4 Step 3 |
| No shared/ needed | Pre-work analysis: Panel/PanelHeader are Intelligence-Suite-only |
