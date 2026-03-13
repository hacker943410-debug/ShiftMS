# 2026-03-13 Patch Summary

## Scope
- Dashboard charts were rebuilt with ECharts and aligned to the current reporting layout.
- Dashboard chart export was added through Electron main/preload with Excel output and save dialog selection.
- Workforce management filters, registration flow, detail view, and shared select UI were refined.
- Site management list/detail behavior was stabilized and the table was expanded with team status.
- Site registration step 1 was rebuilt around direct pattern string input, team index rotation, and calendar simulation.

## Key Changes
- Added a shared custom select component and applied it to top filters across dashboard, schedule, performance, allowance, workforce, and site management.
- Reworked workforce detail actions, wage change layout, profile navigation, and assignment-related read-only summaries.
- Prevented automatic site detail opening on site management entry and added per-team staffing status in the site table.
- Added auto-generated site codes, persisted team index data for shift patterns, and made monthly schedule generation honor saved team indexes.
- Changed site registration step 1 so pattern strings are entered directly and interpreted as cycle positions, for example `주주주휴휴휴야야야휴휴휴` with team indexes `0~11`.

## Verification
- `npm run typecheck`
- `npm run test -- site-storage-service shift-pattern-storage-service monthly-schedule-draft`
- `npm run build`
- `node scripts/validate-structure.mjs`
- Playwright/Electron verification script: `artifacts/scripts/verify-site-step1.cjs`

## Notes
- Verification screenshots remain under `artifacts/` and were kept out of the commit.
- A temporary local Playwright runner was used from `artifacts/playwright-runner` for Electron UI verification.
