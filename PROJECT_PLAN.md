# Payroll app plan

Status: initial local implementation built; live cloud setup and remaining workflows are not complete.

## Confirmed requirements

- React with TypeScript.
- Run the app locally; no hosted frontend is required.
- Persist application data in Firebase Firestore.
- Store images and other media in Google Drive, not Firebase Storage.
- Country: India. Currency: INR. Company timezone: Asia/Kolkata.
- Support more than 30 employees.
- Process each month's salaries on the 8th of the following month.
- Import the daily Excel attendance report to calculate payroll for the 1st through the last day of a selected month, ignoring other months for that payroll.
- Include only roles beginning with FR_ in attendance-based payroll; exclude all other report roles. Keep an extensible role-inclusion constant for additional eligible exact role names. FR_Packer and FR_Shift Incharge are included in payroll, but attendance-bonus eligibility is a separate rule. Preserve excluded source attendance for review. This corrects the earlier inverted exclusion rule.
- Use muster_payable for base wages: present = 1, half-day = 0.5, weekly off/leave = 0 as supplied. Pending records remain unresolved, even when their source payable value is zero.
- Employees are paid daily wages, with a separate wage rate for each employee.
- Identify employees by employee_code and display their names alongside it.
- Attendance bonus is INR 1,000 for eligible employees with at least 26 full present days in the month. Half-days do not contribute to this threshold. This supersedes the historical workbook’s exact-26 formula. Track bonus eligibility separately from payable units; Shift-Incharge, Security, and Housekeeping are ineligible, with configurable employee eligibility for additional exceptions.
- Exclude the `Zepto Salary Structure` worksheet from app scope, imports, and payroll calculations.
- Support mid-month promotions using effective-dated roles and wages under one employee record; retain earlier earning segments in historical payroll.
- Security receives 36,000 for a full month, represented as 60 days in the existing workbook; do not require 60 calendar attendance dates.
- Track earned salary separately from paid and outstanding amounts because some salaries are not processed immediately.
- Track employee advances as paid amounts with payment references and editable future salary-month recovery installments (for example, 4,000 paid, then 2,000 deducted in each of two following months). Show issued, recovered, outstanding and unscheduled balances. Keep recoveries separate from other deductions; count recovery only when payroll is approved and preserve the approved recovery snapshot.
- Performance bonuses are awarded to employees selected by the manager, with a variable amount per selected employee and payroll month. Enter each award separately from attendance bonuses and other bonuses; there is no fixed performance-bonus amount or automatic attendance-based eligibility. Link awards to employee_code and the payroll month, include them in net salary, and display them separately in payroll and payslips.

The pay period and payment date are separate fields. For example, October 2026 payroll has a scheduled payment date of November 8, 2026. Recording payroll as processed must not imply that money has been transferred. A local app cannot guarantee unattended processing while the computer or app is off; automatic processing has not been requested.

## Decisions needed from the owner

1. Individual wage rates and effective dates, including promotion dates for historical imports.
2. Additional attendance-bonus exceptions and how eligibility changes during a mid-month promotion; resolution of pending attendance and corrections.
3. Which Google Drive account or shared folder should own files, plus Firebase project configuration.
4. Which deductions, allowances, overtime, bonuses, advances, and statutory calculations are needed.
5. Who will use the app, and who may edit employee details, approve payroll, or record payments.
6. Whether payment tracking is sufficient or actual bank/payment integration is required.
7. Whether existing employee and payroll records need importing.

Do not silently select tax rates, statutory deductions, proration rules, or holiday adjustments. Country-specific rules require verification once the jurisdiction is confirmed.

## Proposed workflows to confirm

### Employees

Create and edit employee records with a stable employee ID, employment dates, status, contact details, department, role, and effective-dated salary terms. Archive employees rather than deleting records referenced by historical payroll. Collect sensitive fields only when required.

### Monthly inputs

Select a pay period, review eligible employees, and record the agreed attendance/leave inputs, earnings adjustments, deductions, reimbursements, and advances. Explain every calculated amount and flag missing salary terms or invalid inputs before approval.

### Payroll

Use a draft → reviewed → approved → paid workflow, subject to confirmation of roles. Keep a snapshot of salary terms, inputs, calculation rules, and totals for each payroll. Historical payroll must not change when an employee's current salary changes. Approved payroll changes require an explicit correction with a reason and audit record.

Prevent duplicate monthly payroll and accidental duplicate payment recording. Track scheduled date separately from actual payment date, amount, method, and reference. Handle partial payments if required by the owner. Represent money using integer minor units with explicit rounding rules.

### Documents and reports

Generate individual payslips and monthly summaries. Upload documents and media to the confirmed Drive provider; retain file identifiers and relevant metadata in Firestore. Provide payroll history, outstanding-payment views, and export capability. Confirm whether generated documents should be stored permanently or generated on demand.

## Proposed architecture

- Local React/TypeScript application with a browser-based interface.
- Firestore as the authoritative application datastore; local browser state is not the only copy of payroll records.
- Authentication and Firestore rules that restrict access to authorized company users. Running on localhost does not make a cloud database private.
- A Drive integration using user authorization and appropriate file permissions. Never bundle service-account credentials or client secrets in frontend code.
- Choose browser-only integration or a local companion service after confirming provider authentication requirements. Neither option requires hosting the frontend.
- Separate payroll calculation functions from UI and persistence, with versioned calculation rules and reproducible results.
- Show loading, failed-save, disconnected, and retry states clearly. Approval and payment operations must confirm authoritative persistence before displaying success.

Suggested data groups: organization settings, authorized members, employees, salary revisions, monthly inputs, payroll runs, payroll entries, payments, file metadata, and audit events. Final collection structure and access rules depend on confirmed workflows.

## Implementation sequence

1. Confirm core payroll rules, Drive provider, and user roles.
2. Scaffold the local React/TypeScript project, app navigation, settings, and development instructions.
3. Configure Firebase authentication, Firestore data access, validation, and access rules; verify with an emulator before connecting real employee data.
4. Build employee records and effective-dated salary management.
5. Build monthly inputs and deterministic payroll calculation with review, approval, correction, and payment tracking.
6. Connect Drive uploads, file access, payslip generation, and reports.
7. Validate complete workflows with synthetic records for at least 35 employees, then connect owner-provided accounts and configuration.

## Completion evidence required

- App starts locally using documented commands and passes TypeScript/build checks.
- Employee and salary changes persist in Firestore and survive reloads.
- Unauthorized users cannot read or modify payroll data; authorized roles have verified access.
- Payroll computes the agreed rules correctly, including month/year boundaries, salary changes, joining/leaving, and rounding.
- Each month's scheduled payment date is the 8th of the following month, including December → January.
- Duplicate payroll/payment attempts do not create duplicate authoritative records.
- Historical approved payroll is stable after current employee details or salary changes.
- Files upload to Drive, open for authorized users, and are referenced correctly from Firestore; no Firebase Storage dependency is introduced.
- Save/upload failures are visible and recoverable without misleading success messages.
- Payslips and reports reconcile with payroll and payment records.
- The full monthly workflow works for at least 35 synthetic employees.
- Real Firestore and Drive integrations are verified with owner-provided configuration; mock-only workflows do not count as completion.

## Current state

The workspace was empty when inspected on October 24, 2026. A local React/TypeScript app is now implemented with demo mode, employee profiles, dated daily wages, attendance import and revision history, payroll approval snapshots, variable bonuses/deductions, payment recording, CSV export, printable payslips, and Firebase/Drive adapters. TypeScript/build checks and 20 tests pass. The supplied attendance report parses as 810 records, including 658 FR records across 38 employee profiles; repeating the import preserves 810 attendance records. Browser checks verified sample payroll approval and a partial payment. Live Firebase/Drive configuration and access-rule verification are still outstanding. See README.md for setup and remaining limitations, including salary-workbook migration and post-approval corrections. The full goal is not complete.

## Attendance report inspection — October 24, 2026

Source: `/Users/mudssirahmed/Downloads/DED-Dharampur_Chowk-Attendance-report-4473826.xlsx`, worksheet `Attendance`, A1:L811. Source workbook inspected read-only.

- 810 data rows, 57 distinct employee codes, 15 roles.
- This sample contains October 1–24, 2026 only, not a previous month. The importer must still support the owner's stated multi-month reports and filter by scheduled_date, not import date or filename.
- Columns: primary_store, store_name, scheduled_date, full_name, employee_code, DOJ, employee_role_name, user_status, muster_status, muster_payable, packman_work_hours, thor_work_hours.
- Status/payable pairs: P/1.0 (606 rows), HD/0.5 (4), A/0.0 (82), WO/0.0 (71), Pending/0.0 (32), F/0.0 (12), L/0.0 (2), A-R/0.0 (1). These are observed values, not approved payroll policy. Their payable values sum to 608 days before exclusions; this is not a completed monthly payroll total.
- No duplicate employee_code/scheduled_date pairs in this sample. Employee codes, not names, should identify employees.
- 51 records have INACTIVE user_status. Do not automatically remove historical earned attendance based on current status.
- Seven records have a different primary_store from store_name. Confirm treatment of visiting employees rather than silently excluding them.
- DOJ is blank in 48 records. Work-hour fields are incomplete and should not replace muster_payable without an explicit rule.
- No employee wage column exists; wages must be maintained separately in the app.

### Import and calculation requirements

1. Preview report coverage, role counts, excluded employees, missing wage rates, pending attendance, and conflicts before committing an import or approving payroll.
2. Preserve raw attendance values and import provenance. Reimporting an identical report must not add payable days. Later reports may correct existing attendance; surface changes and retain revision history. Quarantine ambiguous same-employee/date records, including cross-store cases, rather than summing them automatically.
3. Filter by the selected calendar month using its first day inclusive and the following month's first day exclusive. Do not treat missing dates or Pending as confirmed absence or silently finalize incomplete data.
4. Use the role-inclusion constant (FR_ prefix by default) and snapshot the applied eligibility rules into approved payroll. Preserve excluded source records for review.
5. Proposed base earnings calculation, sum each included day's payable units × that employee's daily wage effective on that date. If a wage is constant for the entire month, this is total payable days × daily wage. Missing wages must remain unresolved, never silently zero.
6. Keep approved payroll unchanged when a later daily report corrects past attendance; use an explicit payroll correction workflow.
7. Test repeated imports, revised attendance, multi-month input, excluded roles, individual rate changes, half-days, pending records, and month-end completeness.

## Salary workbook inspection — October 24, 2026

Source: `/Users/mudssirahmed/Documents/Zepto/Excel/Employees Salary.xlsx`, inspected read-only. Sheets: `Salary` and `Zepto Salary Structure`. No explicit payroll month or currency is supplied in populated cells; do not join its present-day totals to October attendance as though they represent the same period.

### Observed salary rules and fields

- Salary rows 2–38 use 500 per day. Rows 2–36 calculate attendance bonus as 1,000 only when present days equal exactly 26. The owner subsequently specified at least 26 full present days, excluding half-days, and role/employee eligibility exceptions. The app must use that newer rule instead of copying the historical exact-equality formula.
- Security row 40 uses 600 × 60 days = 36,000. The owner confirmed 36,000 is the full-month security payment represented by 60 days. Partial-month handling remains unspecified.
- Housekeeping row 41 has a fixed salary amount of 11,500 without a day count.
- Rows 43–45 use present days × (20,000 / 26), plus bonuses minus penalties. Row 47 uses (10,000 / 26). Preserve the monthly numerator and divisor rather than prematurely rounding the derived daily rate; final rounding policy needs confirmation.
- Other Bonus, Attendance Bonus, and Penealty are separate fields. Column I is relabeled Performance for later sections, so import interpretation depends on section, not only the first header.
- Track Aadhaar-added, bank-added, offer-letter-sent, and offer-letter-received flags. Blank flags are unknown, not automatically No. Bank Type contains Within/Other, whose meaning needs confirmation.
- Transfer status contains Transferred, Pending, and Not Applicable. Historical labels lack transfer dates and references, so importing them must not invent payment evidence.

### Reconciliation and mapping issues

- 43 employee pay lines after excluding repeated Name headers and Packer Performance; Tarun Jain appears twice (rows 34 and 45) because the owner confirmed a mid-month promotion to Shift-Incharge. Model this as one employee with two dated earning segments. Use only the promoted rate next month; retain both historical segments. Exact promotion date is still needed for migration.
- The workbook has names but no employee codes. Case/whitespace-normalized matching finds 28 of 43 lines in the attendance report; 15 do not match exactly. Review aliases and missing employees before linking to stable employee codes; fuzzy matches are suggestions only.
- Cached salary line values total 381,730.76923076925, including 366,230.76923076925 labeled Transferred, 6,500 Pending, and 9,000 Not Applicable. These are workbook figures, not verified bank payments or a final rounded payroll.
- Salary Paid at O60 is a hardcoded 387,730, which differs from both all employee salary lines and Transferred lines. O61 contains Amount Received of 590,458; O62 subtracts O60 from O61 to yield 202,728. The app should derive payroll/payment summaries from underlying records and expose unreconciled manual figures.
- M18 contains an unlabeled 2,000, not referenced by that row's salary formula. Its purpose is unknown.
- A row with 9,000 salary is labeled Not Applicable; clarify whether this indicates withholding, exclusion, or something else.
- Present days are blank on row 24 while its formula yields zero. Preserve the missing input rather than interpreting it as confirmed zero attendance.
- The owner explicitly excluded the separate `Zepto Salary Structure` worksheet. Do not import it or use its values for app configuration, payroll, or reconciliation.

### Design implications

Support employee-specific daily wages, a monthly-base/divisor rate option, fixed amounts where confirmed, distinct attendance/performance/other bonuses, itemized deductions with reasons, document completion flags, and payment tracking. Preserve multiple earning lines when explicitly approved. Preview historical salary imports separately from attendance imports, require a payroll month, resolve employee mappings, and reconcile source totals before committing them.
