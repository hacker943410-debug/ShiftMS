# Implementation Analysis

## Root Cause
`deleteStoredEmployee` physically deletes employee-related rows. This breaks historical calculation because returned performance parsing and monthly schedule restoration need employee code, wage rate, and site assignment history for the original work date.

## Design
- Add an archived/deleted marker to employees.
- Default employee lists exclude archived records.
- Calculation and restoration services explicitly include archived records.
- Historical site matching uses assignment date overlap with the target month.

## Recovery Note
Rows that were already hard-deleted before this patch cannot be reconstructed from nothing. Recovery requires a DB backup, re-registering the employee with the same employee code and wage history, or a future audited manual override workflow.

