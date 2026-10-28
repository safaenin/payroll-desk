# Payroll Desk

Local React + TypeScript payroll application for the Dharampur Chowk workflow. No hosting is required. The browser UI connects directly to Firebase Firestore for company data and Google Drive for uploaded files.

## Run locally

Requires Node.js 20.19+ or 22.12+ and npm.

```sh
npm install
npm run dev
```

Open http://127.0.0.1:5173. The server only listens on the loopback interface. It runs while the terminal process is open.

```sh
npm test
npm run build
```

## Connect Firebase

1. Create or choose a Firebase project, register a Web app, and create a Firestore database in production mode.
2. Enable Google in Firebase Authentication's sign-in providers. Add `localhost` and `127.0.0.1` to authorized domains for local development if absent.
3. Determine the payroll owner's Firebase Authentication UID. If the account has not signed in before, fill in the web configuration below, leave `VITE_OWNER_UID` empty, and restart the app. Sign in through Settings: the app will display your UID for setup, sign you out, and access no payroll records. You can also copy the UID from Firebase Authentication. Then complete the owner UID and rules setup below.
4. Copy `.env.example` to `.env.local`. Fill in all Firebase web configuration values and `VITE_OWNER_UID`. These are client configuration values; do not add service-account keys or OAuth client secrets.
5. In `firestore.rules`, replace `OWNER_FIREBASE_UID` with that same UID. Publish these rules using the Firebase console's Firestore Rules editor. The template denies every user until its owner placeholder is replaced.
6. Restart the local server. In **Settings**, sign in with the owner's Google account and load the Firestore workspace.

The initial access model is a single owner. There is no manager login or employee self-service yet. The manager's selected performance awards are entered by the payroll owner.

Sign-in uses persistent browser authentication. On refresh, the app waits for Firebase to restore the session and then loads Firestore records automatically. It shows a loading screen until records arrive, or a retry/sign-out screen on a connection error; it does not show demo records as a substitute for a failed cloud load. Explicit sign-out returns to the company sign-in screen. Use the same browser and address (`127.0.0.1` versus `localhost` are separate browser origins).

Firestore data is separated into employees, monthly attendance, monthly adjustments, approved runs, payments, file metadata, import history, settings, and a revision counter under `owners/{uid}`. Saves use a transaction and reject stale revisions from another browser session. Reload Firestore from Settings after a conflict. Approval snapshots, payments, files, and import logs are protected from ordinary edits. The explicit employee deletion workflow removes that employee’s history, including entries in approved payrolls.

Monthly attendance and each import log must remain below 900 KB, with a maximum of 450 changed documents per transaction. The app rejects larger saves with an error; it does not silently truncate records. This layout is intended for the current small team, not an unlimited multi-company payroll service.

## Connect Google Drive

Enable the Google Drive API in the Google Cloud project used by Firebase Authentication. Configure the OAuth consent screen and authorized test users as required for your project. Click **Connect Google Drive** in Settings or Documents and approve `drive.file` access with the payroll owner account. The app reauthenticates the existing owner and makes a read-only Drive request to verify access before enabling uploads. Authorization tokens stay in memory and expire; reconnect after refresh or when requested. Firebase sign-in remains persistent independently of Drive authorization.

Under **Documents**, choose an employee and upload a file up to 5 MB. Files are created in the owner's Drive root and remain private by default. The app stores only a Drive identifier, URL, employee code, filename, and timestamp in Firestore. Firebase Storage is not used. If a Drive upload succeeds but the Firestore save fails, the error includes the uploaded file link so it can be recovered; the app does not claim the reference was saved.

Shared-folder selection, resumable large uploads, and automatic archival of original attendance workbooks are not implemented yet.

Documents are linked using the immutable employee code, not the name or filename. Select an employee on the Documents page, then choose Aadhaar, Bank document, or Signed Offer Letter. Every upload keeps its own Drive file ID and Firestore record, so multiple promotion letters coexist. Signed offer letters require an effective date and may include a role/promotion note; they do not update salary rates automatically. Earlier uploads without a document type remain visible as unclassified. Uploads mark the corresponding Aadhaar/bank/offer-received checklist item complete. New types can be added to `DOCUMENT_TYPES` in `src/documents.ts`. If saving the employee link fails after a successful Drive upload, retry saving the link instead of uploading the file again.

**Delete document:** connect Drive, click Delete document beside the file, review its employee/type/name, then confirm. The app atomically saves a deletion request and recalculates that employee's affected checklist from remaining active files. Deleting the last Aadhaar, bank document, or signed offer letter clears its respective completion flag. Other files and employees remain unchanged. It then moves the file to Google Drive Trash (not permanent deletion) and records completion. Failed Drive cleanup remains visible with a retry button and survives refresh. Original file metadata is retained for audit; deleted files are excluded from the active document list. Restoring a file directly in Drive does not automatically restore its employee link.

Publish the updated `firestore.rules` before using deletion: the new owner-only `fileDeletions` collection records requests and permits only the pending-to-trashed completion update. If the initial Firestore request fails, the Drive file is left untouched.

## Monthly workflow

1. Import the daily `.xlsx` report containing the `Attendance` worksheet. Preview roles and month coverage, then confirm. Rows outside the selected payroll month remain available for their own months.
2. Only `FR_` roles enter payroll. Other source rows remain visible as excluded. Adjust the allowlist in `src/config/payroll.ts` when additional roles are authorized. The separate **Zepto Salary Structure** sheet is never imported.
3. Included employees receive profiles keyed by `employee_code`. Add each employee's daily wage and effective date in **Employees**. The app never guesses missing wages from names or roles.
4. Add dated wages for promotions. Earlier wage entries remain in history, and payroll applies the wage effective on each attendance date. Dated roles and employee attendance-bonus eligibility remain separate from the role inclusion rule.
5. In **Payroll**, add manager-selected performance bonuses, other bonuses, and deductions with a reason. These are month-specific amounts in INR.
6. Review missing wages, pending attendance, and full-month coverage. A month cannot be approved before its end. Confirm coverage only after reviewing missing dates, joining/leaving dates, and source corrections.
7. Approve payroll to save an immutable earnings snapshot. Payment is scheduled for the 8th of the following month.
8. Record completed payments with an amount, date, and reference. Partial payments are supported; duplicate references for the same employee/month and overpayments are rejected. The app does not initiate bank transfers.
9. Export a payroll CSV or open an approved employee payslip and print/save it as PDF.

Payslips show the Safa Enterprises name and supplied logo, including print/PDF styling. Payroll CSV exports include a Firm column and use a `safa-enterprises-payroll-YYYY-MM.csv` filename. The shared firm identity is in `src/config/company.ts`; the supplied logo is bundled locally as an application asset, not uploaded to Firebase Storage.

## Calculation rules

### Salary advances

Use **Advances → Record advance** after paying an employee. Enter the employee, amount, date, and payment reference, then add recovery installments by **salary month**. For example, a ₹4,000 advance paid in October can have ₹2,000 scheduled against November salary and ₹2,000 against December salary. These salaries are paid on December 8 and January 8 respectively; choose the salary month, not the bank-payment month.

The ledger shows issued, recovered, outstanding, and unscheduled amounts. Draft payroll includes the scheduled recovery as a separate deduction, but the outstanding advance balance reduces only when that payroll is approved. The approved payroll stores each advance ID and recovered amount, so reopening or recalculating cannot recover it twice. CSV exports and payslips list advance recoveries separately from other deductions. Do not enter the same recovery again as a manual deduction.

Use **Edit schedule** to move or split unrecovered installments. Issued advance details and approved installments are locked. Unallocated balances remain visible; a past-month installment remains outstanding until its payroll is approved or its installment is rescheduled. If the employee has no eligible payroll or the deduction exceeds earnings, approval is blocked rather than silently losing the recovery. There is no automatic transfer of money or automatic carry-forward to another month.

Advance records are stored in Firestore's `advances` collection under the owner. **Existing Firebase setups must publish the updated `firestore.rules`** to permit advance creation and schedule-only updates. Approved payrolls without advance fields continue to load.

### Earnings and deductions

- Included attendance: report role starts with `FR_`, or is explicitly added to the role inclusion constant.
- Base pay: sum of `muster_payable × effective daily wage`. Present = 1, half-day = 0.5. The source payable field is authoritative.
- Attendance bonus: ₹1,000 at 26 or more full `P` days with payable value 1. Half-days do not count toward this threshold.
- Shift-Incharge, Security, and Housekeeping are attendance-bonus ineligible. Individual wage entries can also disable eligibility.
- Performance and other bonuses are independent of attendance bonus; amounts vary by employee/month.
- Net: base + attendance bonus + performance bonus + other bonus − other deductions − scheduled advance recoveries.
- Monetary amounts are stored in paise. The editor accepts daily wages or a monthly base divided by a chosen number of days (such as 20,000 ÷ 26). Derived daily rates retain their precision until the monthly base earnings are rounded to paise.
- Current `FR_`-only payroll intentionally excludes non-FR security/housekeeping attendance. The previously discussed separate ₹36,000 security arrangement is documented but is not automatically added to FR payroll.

## Verified and outstanding

Verified locally: TypeScript compilation, production build, 30 automated tests, source attendance import (810 records; 658 FR records; 38 FR employee profiles), repeat-import idempotency, and browser checks of sample approval, partial payment, and a ₹4,000 advance scheduled in two ₹2,000 installments. Advance tests cover full/partial recovery, approval locking, remaining balances, rescheduling, duplicate prevention, insufficient salary, missing payroll, and old records without advance fields. Live cloud verification remains pending account configuration.

Still required before production use:

- Configure and verify live Firestore authentication, access rules, reload persistence, concurrent-session behavior, and Google Drive uploads with the owner's account. No real cloud account has been connected yet; rules have not been emulator-tested.
- Historical Salary workbook migration, employee alias mapping, and decisions for mixed-role attendance-bonus eligibility during promotions.
- An explicit correction/adjustment workflow for approved payroll and payment mistakes. Approved data is currently locked; later attendance corrections preserve that snapshot but do not create a revised payroll automatically.
- Additional user roles, statutory calculations, automatic bank transfers, and comprehensive accounting are outside this initial implementation. No tax or statutory deduction rules are assumed.

## Integration references

- [Firestore transactions](https://firebase.google.com/docs/firestore/manage-data/transactions)
- [Google Drive uploads](https://developers.google.com/workspace/drive/api/guides/manage-uploads)
- [Firebase Google authentication](https://firebase.google.com/docs/auth/web/google-signin)

## Delete an employee

Publish the latest firestore.rules before using this feature. Employees → Delete employee shows the affected record counts and requires the exact employee code. Deletion removes their profile, attendance, wage history, adjustments, payroll lines, payments, advances, document metadata, and attendance revision details. Shared monthly records retain other employees.

Uploaded documents move to Google Drive Trash (Google Drive access is required). A persistent deletion job locks workspace changes until all cleanup completes; reconnect Drive and choose Continue deletion after an interruption. Firestore cleanup uses bounded transactions. There is no in-app undo. Previously downloaded exports and original import workbooks are unaffected, and reimporting old attendance can recreate the employee.

The app now requires company sign-in. Sample data is available only in automated test fixtures; the former local demo cache is cleared on startup.

### Drive folders

New uploads automatically create/reuse `employees/{name-employeeCode}/` in Google Drive. App properties identify folders by owner and employee code, so equal names do not merge employees. Folder names refresh on upload or organization after a name change. In Documents, connect Drive and choose **Organize existing documents into folders** to move earlier uploads without changing file IDs or Firestore links. The operation skips removed document links and can be retried after a partial failure. Empty employee folders are retained when employee documents are deleted.

### Fixed monthly and manual payroll

In Employees → Add employee, keep the generated internal SE code when no official code exists. Enable Manual payroll for staff absent from imported reports; this explicitly includes their non-FR roles. Add a dated wage using Fixed monthly — regardless of attendance, enter 10000 for ₹10,000, and choose the first day of the starting month. Save the wage and employee. Active fixed-pay employees appear in payroll without attendance; attendance bonus is disabled, while bonuses, deductions and advance recovery still apply. Fixed-pay changes must start on a month boundary; no automatic partial-month proration is performed.

For manual attendance-based wages, choose Daily wage or Monthly base ÷ days instead. Under Attendance → Manual attendance, select the employee and enter every day of the selected month (P full, HD half, A/WO/L unpaid). Half-days count toward pay but not the 26-day bonus threshold. Missing days block approval for manual attendance employees. Review month coverage and approve payroll as usual after month end. Manual edits to approved months are blocked; imported reports cannot overwrite employees explicitly configured for manual payroll.
