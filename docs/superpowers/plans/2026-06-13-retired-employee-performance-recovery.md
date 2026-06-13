# Retired Employee Performance Recovery Plan

## Goal
Ensure past-month performance can still be calculated after an employee retires, transfers, or is removed from the visible roster. Historical employee identity, wage rates, and site assignment data must remain available to calculation services while remaining hidden from normal active roster views.

## Problem Summary
- `deleteStoredEmployee` physically deletes employee, wage, and assignment rows.
- Monthly schedule queries depend on joining the current employee table, so historical schedule items become unusable after physical deletion.
- Returned performance parsing resolves employee code, availability, and hourly wage from current employee records only.
- Therefore a May worker deleted at the end of May cannot be paid in June because the calculation has no employee or wage source.

## Implementation Scope
1. Add regression tests that reproduce the missing historical employee and missing hourly rate behavior.
2. Change employee deletion to a soft-delete/archive operation that hides the employee from normal roster lists but preserves wage and assignment rows.
3. Add storage/query support for including archived employees only from domain calculation paths.
4. Update returned performance parsing to resolve employees and hourly rates using archived historical records when the work date is before retirement/assignment end.
5. Update monthly schedule restoration to use historical site assignment overlap, not only the current visible site assignment.
6. Document the current recovery limitation: if an employee was already physically deleted before this patch, payroll can be recovered only after restoring/recreating the missing employee and wage history or restoring a DB backup.

## Out Of Scope
- Full manual override UI for arbitrary time and hourly-rate entry. This is a fallback workflow that should be separately designed with audit history and approval controls.
- Automatic reconstruction of an already hard-deleted employee when no backup, employee code, wage rate, or assignment history exists.

## Verification
1. Run focused failing tests after adding RED cases.
2. Implement storage and calculation changes.
3. Run focused tests for employee storage, monthly schedule restoration, and performance parsing.
4. Run `npm run test`.
5. Run `npm run build` if the focused and full test suites pass.

