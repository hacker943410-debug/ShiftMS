# Functional Spec

## Behavior
- Deleting a retired employee hides the employee from normal workforce lists.
- Hidden historical employees remain available to payroll calculation for work dates before their retirement or assignment end boundary.
- Wage lookup must use the historical employee code and effective wage-rate dates.
- Monthly schedule restoration must map returned schedule names to employees assigned to the site during the target month, including hidden historical employees.

## Current Recovery Limitation
If the employee was already physically deleted before this patch and no backup or recreated employee history exists, automatic calculation cannot infer a trustworthy wage rate.

