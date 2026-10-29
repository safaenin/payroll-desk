import { emptyBusiness, generateRecurring, type Brand } from './expenses';
import { initializeApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  setPersistence,
  browserLocalPersistence,
  reauthenticateWithPopup,
} from 'firebase/auth';
import { collection, doc, getDoc, getDocs, getFirestore, runTransaction } from 'firebase/firestore';
import { type State, type FileRecord } from './domain';
import { validateDocument, type DocumentDetails } from './documents';
import { purgeEmployee, type EmployeeDeletion } from './employeeDeletion';

const env = import.meta.env;
const allowedAdminUids = String(env.VITE_ADMIN_UIDS ?? '')
  .split(',')
  .map((uid) => uid.trim())
  .filter(Boolean);
const authorizedUser = (uid: string) =>
  uid === env.VITE_OWNER_UID || allowedAdminUids.includes(uid);
export const firebaseConfigured = Boolean(
  env.VITE_FIREBASE_API_KEY &&
  env.VITE_FIREBASE_PROJECT_ID &&
  env.VITE_FIREBASE_AUTH_DOMAIN &&
  env.VITE_FIREBASE_APP_ID,
);
export const configured = firebaseConfigured && Boolean(env.VITE_OWNER_UID);
const app = firebaseConfigured
  ? initializeApp({
      apiKey: env.VITE_FIREBASE_API_KEY,
      authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
      projectId: env.VITE_FIREBASE_PROJECT_ID,
      appId: env.VITE_FIREBASE_APP_ID,
    })
  : null;
export const auth = app ? getAuth(app) : null;
const db = app ? getFirestore(app) : null;
let driveToken = '';
export async function login() {
  if (!auth) throw new Error('Add Firebase configuration to .env.local first.');
  await setPersistence(auth, browserLocalPersistence);
  const provider = new GoogleAuthProvider();
  const result = await signInWithPopup(auth, provider);
  if (!env.VITE_OWNER_UID) {
    const uid = result.user.uid;
    await signOut(auth);
    throw new Error(
      `Owner setup: your Firebase UID is ${uid}. Set VITE_OWNER_UID in .env.local and use the same UID in firestore.rules, publish those rules, then restart the app and sign in again. No payroll records were accessed.`,
    );
  }
  if (!authorizedUser(result.user.uid)) {
    await signOut(auth);
    throw new Error('This Google account is not an authorized workspace owner or admin.');
  }
}
export async function logout() {
  driveToken = '';
  if (auth) await signOut(auth);
}
function ownerUid() {
  if (!env.VITE_OWNER_UID || !auth?.currentUser || !authorizedUser(auth.currentUser.uid))
    throw new Error('Sign in with an authorized workspace owner or admin account first.');
  return env.VITE_OWNER_UID;
}
function groupDocuments(state: State): Record<string, unknown> {
  const docs: Record<string, unknown> = {};
  const business = state.business ?? emptyBusiness();
  for (const [group, rows] of Object.entries({
    businessBrands: business.brands,
    businessRegistrations: business.registrations,
    businessExpenses: business.expenses,
    businessRecurrences: business.recurrences,
  }))
    for (const row of rows) docs[`${group}/${row.id}`] = row;
  for (const d of state.fileDeletions ?? []) docs[`fileDeletions/${d.id}`] = d;
  for (const a of state.advances ?? []) docs[`advances/${a.id}`] = a;
  for (const e of state.employees) docs[`employees/${encodeURIComponent(e.code)}`] = e;
  for (const month of new Set(state.attendance.map((a) => a.date.slice(0, 7))))
    docs[`attendance/${month}`] = {
      rows: state.attendance.filter((a) => a.date.startsWith(month)),
    };
  for (const [month, rows] of Object.entries(state.adjustments))
    docs[`adjustments/${month}`] = { rows };
  for (const r of state.runs) docs[`runs/${r.month}`] = r;
  for (const p of state.payments) docs[`payments/${p.id}`] = p;
  for (const f of state.files) docs[`files/${f.id}`] = f;
  for (const i of state.imports) docs[`imports/${i.id}`] = i;
  docs['settings/coverage'] = state.coverage;
  return docs;
}
export async function loadCloud(): Promise<State> {
  if (!db || !auth?.currentUser) throw new Error('Sign in first.');
  const root = `owners/${ownerUid()}`;
  // A revision read on each side detects concurrent writes during the multi-collection read.
  for (let attempt = 0; attempt < 3; attempt++) {
    const before = (await getDoc(doc(db, root, 'meta/revision'))).data()?.value ?? 0;
    const names = [
      'employees',
      'attendance',
      'adjustments',
      'runs',
      'payments',
      'files',
      'imports',
      'settings',
      'advances',
      'fileDeletions',
      'businessBrands',
      'businessRegistrations',
      'businessExpenses',
      'businessRecurrences',
    ];
    const snapshots = await Promise.all(names.map((n) => getDocs(collection(db!, root, n))));
    const metadata = (await getDoc(doc(db, root, 'meta/revision'))).data();
    const after = metadata?.value ?? 0;
    if (before !== after) continue;
    const data = Object.fromEntries(
      names.map((n, i) => [n, snapshots[i].docs.map((d) => ({ id: d.id, data: d.data() }))]),
    );
    return {
      business: {
        brands: data.businessBrands.map((d) => d.data),
        registrations: data.businessRegistrations.map((d) => d.data),
        expenses: data.businessExpenses.map((d) => d.data),
        recurrences: data.businessRecurrences.map((d) => d.data),
      },
      revision: after,
      employeeDeletion: metadata?.employeeDeletion ?? null,
      fileDeletions: data.fileDeletions.map((d) => d.data),
      advances: data.advances.map((d) => d.data),
      employees: data.employees.map((d) => d.data),
      attendance: data.attendance.flatMap((d) => d.data.rows),
      adjustments: Object.fromEntries(data.adjustments.map((d) => [d.id, d.data.rows])),
      runs: data.runs.map((d) => d.data),
      payments: data.payments.map((d) => d.data),
      files: data.files.map((d) => d.data),
      imports: data.imports.map((d) => d.data),
      coverage: data.settings.find((d) => d.id === 'coverage')?.data ?? {},
    } as State;
  }
  throw new Error('Records changed while loading. Reload and try again.');
}
export async function saveCloud(previous: State, next: State): Promise<State> {
  if (!db || !auth?.currentUser) throw new Error('Sign in before saving.');
  const oldDocs = groupDocuments(previous),
    newDocs = groupDocuments(next);
  const changed = Object.entries(newDocs).filter(
    ([k, v]) => JSON.stringify(oldDocs[k]) !== JSON.stringify(v),
  );
  if (changed.length > 450)
    throw new Error('This import is too large. Split it into smaller monthly reports.');
  for (const [, v] of changed)
    if (new TextEncoder().encode(JSON.stringify(v)).length > 900000)
      throw new Error(
        'A monthly record exceeds the supported size. Split the report before importing.',
      );
  const root = `owners/${ownerUid()}`;
  try {
    await runTransaction(db, async (tx) => {
      const ref = doc(db!, root, 'meta/revision');
      const metadata = (await tx.get(ref)).data();
      if (metadata?.employeeDeletion)
        throw new Error('Finish the pending employee deletion before changing payroll records.');
      const current = metadata?.value ?? 0;
      if (current !== previous.revision)
        throw new Error('Another session changed the records. Reload before saving.');
      for (const [path, value] of changed) tx.set(doc(db!, root, path), value);
      tx.set(ref, { value: current + 1 });
    });
  } catch (error) {
    if (
      error &&
      typeof error === 'object' &&
      'code' in error &&
      error.code === 'permission-denied' &&
      changed.some(([path]) => path.startsWith('business'))
    )
      throw new Error(
        'Firestore blocked business expense storage. Publish the latest firestore.rules from this project in Firebase Console → payroll-desk → Firestore Database → Rules, then retry saving.',
      );
    throw error;
  }
  return { ...next, revision: previous.revision + 1 };
}
export async function connectDrive() {
  ownerUid();
  driveToken = '';
  const provider = new GoogleAuthProvider();
  provider.addScope('https://www.googleapis.com/auth/drive.file');
  provider.setCustomParameters({ prompt: 'consent', login_hint: auth!.currentUser!.email ?? '' });
  // Reauthenticate the owner instead of switching the Firebase account.
  const result = await reauthenticateWithPopup(auth!.currentUser!, provider);
  const token = GoogleAuthProvider.credentialFromResult(result)?.accessToken;
  if (!token) throw new Error('Google Drive authorization was not granted.');
  const response = await fetch(
    'https://www.googleapis.com/drive/v3/files?pageSize=1&fields=files(id)',
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!response.ok) throw new Error(await driveError(response));
  driveToken = token;
}
async function driveError(response: Response) {
  const body = await response.json().catch(() => ({}));
  const reason = body.error?.errors?.[0]?.reason;
  if (response.status === 401) {
    driveToken = '';
    return 'Google Drive access expired. Click Connect Google Drive again, then retry your upload.';
  }
  if (
    reason === 'accessNotConfigured' ||
    body.error?.details?.some((d: { reason?: string }) => d.reason === 'SERVICE_DISABLED')
  )
    return 'Enable Google Drive API in the payroll-desk Google Cloud project, wait a moment, then connect again.';
  if (reason === 'storageQuotaExceeded')
    return 'Your Google Drive storage is full. Free some space before uploading.';
  if (response.status === 403)
    return 'Google Drive denied access. Connect again and allow the requested file permission. Check that Drive API is enabled and your account is allowed in the OAuth consent screen.';
  return `Google Drive request failed (${response.status}). Try again; no successful upload was confirmed.`;
}
const driveQuote = (value: string) => value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
async function driveJson(path: string, init: RequestInit = {}) {
  ownerUid();
  if (!driveToken) throw new Error('Connect Google Drive before organizing documents.');
  const response = await fetch('https://www.googleapis.com/drive/v3/files' + path, {
    ...init,
    headers: { Authorization: `Bearer ${driveToken}`, 'Content-Type': 'application/json' },
  });
  if (!response.ok) throw new Error(await driveError(response));
  return response.json();
}
async function ensureFolder(
  name: string,
  kind: string,
  parent: string,
  code = '',
  identityKey = 'employeeCode',
): Promise<string> {
  const properties = {
    payrollOwner: ownerUid(),
    payrollFolder: kind,
    ...(code ? { [identityKey]: code } : {}),
  };
  const q = [
    'trashed = false',
    "mimeType = 'application/vnd.google-apps.folder'",
    `'${driveQuote(parent)}' in parents`,
    ...Object.entries(properties).map(
      ([key, value]) => `appProperties has { key='${key}' and value='${driveQuote(value)}' }`,
    ),
  ].join(' and ');
  const found = await driveJson(
    '?' + new URLSearchParams({ q, fields: 'files(id,name)', pageSize: '100' }),
  );
  if (found.files?.length) {
    const folder = found.files[0];
    if (folder.name !== name)
      await driveJson('/' + encodeURIComponent(folder.id) + '?fields=id', {
        method: 'PATCH',
        body: JSON.stringify({ name }),
      });
    return folder.id;
  }
  const created = await driveJson('?fields=id', {
    method: 'POST',
    body: JSON.stringify({
      name,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [parent],
      appProperties: properties,
    }),
  });
  if (!created.id) throw new Error('Drive did not return the new folder ID.');
  return created.id;
}
async function employeeFolder(code: string, name: string) {
  const root = await ensureFolder('employees', 'employees', 'root');
  return ensureFolder(`${name.trim() || code}-${code}`, 'employee', root, code);
}
export async function organizeEmployeeDocuments(state: State, progress: (message: string) => void) {
  const active = state.files.filter((f) => !state.fileDeletions?.some((d) => d.id === f.id));
  let count = 0;
  for (const employee of state.employees) {
    const files = active.filter((f) => f.code === employee.code);
    if (!files.length) continue;
    const folder = await employeeFolder(employee.code, employee.name);
    for (const file of files) {
      progress(`Organizing ${employee.name}: ${count} of ${active.length} documents checked…`);
      const path = '/' + encodeURIComponent(file.id);
      const current = await driveJson(path + '?fields=parents,trashed');
      if (current.trashed)
        throw new Error(
          `${file.name} is in Drive Trash. Restore it or remove its document link before retrying.`,
        );
      if (!current.parents?.includes(folder)) {
        const query = new URLSearchParams({ addParents: folder, fields: 'id,parents' });
        if (current.parents?.length) query.set('removeParents', current.parents.join(','));
        const moved = await driveJson(path + '?' + query, { method: 'PATCH', body: '{}' });
        if (!moved.parents?.includes(folder))
          throw new Error('Drive did not confirm the document move. Retry organizing.');
      }
      count++;
    }
  }
  progress(`Organized ${count} documents into employee folders. Existing links are unchanged.`);
}
export async function uploadDrive(
  file: File,
  code: string,
  details?: DocumentDetails,
  employeeName = code,
): Promise<FileRecord> {
  ownerUid();
  if (details) validateDocument(details);
  if (file.size > 5 * 1024 * 1024) throw new Error('Choose a file no larger than 5 MB.');
  if (!code.trim()) throw new Error('Select an employee before uploading.');
  if (!driveToken) throw new Error('Click Connect Google Drive before uploading a file.');
  const folder = await employeeFolder(code, employeeName);
  const boundary = `payroll_${crypto.randomUUID()}`;
  const body = new Blob([
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n`,
    JSON.stringify({
      name: file.name,
      parents: [folder],
      description: `Payroll employee ${code}`,
      appProperties: {
        employeeCode: code,
        ...(details ? { documentType: details.documentType } : {}),
      },
    }),
    `\r\n--${boundary}\r\nContent-Type: ${file.type || 'application/octet-stream'}\r\n\r\n`,
    file,
    `\r\n--${boundary}--`,
  ]);
  const res = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${driveToken}`,
        'Content-Type': `multipart/related; boundary=${boundary}`,
      },
      body,
    },
  );
  if (!res.ok) throw new Error(await driveError(res));
  const data = await res.json();
  return {
    id: data.id,
    name: data.name,
    url: data.webViewLink || `https://drive.google.com/file/d/${data.id}/view`,
    code,
    uploadedAt: new Date().toISOString(),
    ...(details ?? {}),
  };
}
export async function trashDriveFile(id: string) {
  ownerUid();
  if (!driveToken)
    throw new Error('Connect Google Drive to finish moving the removed document to Trash.');
  const response = await fetch(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}?fields=id,trashed`,
    {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${driveToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ trashed: true }),
    },
  );
  if (!response.ok) throw new Error(await driveError(response));
  const result = await response.json();
  if (result.id !== id || result.trashed !== true)
    throw new Error('Drive did not confirm that the file is in Trash. Retry the pending removal.');
}
export async function startEmployeeDeletion(previous: State, code: string): Promise<State> {
  ownerUid();
  if (!db) throw new Error('Firestore is not configured.');
  if (!previous.employees.some((e) => e.code === code))
    throw new Error('Employee not found. Reload the workspace.');
  const job: EmployeeDeletion = {
    id: crypto.randomUUID(),
    code,
    requestedAt: new Date().toISOString(),
    fileIds: previous.files.filter((f) => f.code === code).map((f) => f.id),
    completedFileIds: [],
  };
  if (job.fileIds.length && !driveToken)
    throw new Error('Connect Google Drive before deleting an employee with documents.');
  await runTransaction(db, async (tx) => {
    const ref = doc(db!, `owners/${ownerUid()}/meta/revision`),
      metadata = (await tx.get(ref)).data();
    if (metadata?.employeeDeletion)
      throw new Error('Another employee deletion is already pending. Reload to continue it.');
    if ((metadata?.value ?? 0) !== previous.revision)
      throw new Error('Records changed in another session. Reload and review the deletion again.');
    tx.set(ref, { value: previous.revision + 1, employeeDeletion: job });
  });
  return { ...previous, revision: previous.revision + 1, employeeDeletion: job };
}
export async function finishEmployeeDeletion(progress: (message: string) => void): Promise<State> {
  try {
    return await continueEmployeeDeletion(progress);
  } catch (error) {
    if (
      error &&
      typeof error === 'object' &&
      'code' in error &&
      error.code === 'permission-denied'
    ) {
      throw new Error(
        'Firestore blocked employee cleanup. Publish the latest firestore.rules from this project in Firebase Console → payroll-desk → Firestore Database → Rules, then click Continue deletion. Your pending deletion is saved; Google Drive connection will not fix this permission error.',
      );
    }
    throw error;
  }
}
async function continueEmployeeDeletion(progress: (message: string) => void): Promise<State> {
  if (!db) throw new Error('Firestore is not configured.');
  const root = `owners/${ownerUid()}`,
    ref = doc(db, root, 'meta/revision');
  let current = await loadCloud(),
    job = current.employeeDeletion;
  if (!job) throw new Error('No employee deletion is pending. Reload the workspace.');
  const jobId = job.id;
  for (const id of job.fileIds) {
    if (job.completedFileIds.includes(id)) continue;
    progress(
      `Moving employee documents to Drive Trash (${job.completedFileIds.length}/${job.fileIds.length})…`,
    );
    await trashDriveFile(id);
    await runTransaction(db, async (tx) => {
      const meta = (await tx.get(ref)).data();
      if (meta?.employeeDeletion?.id !== jobId)
        throw new Error('Deletion state changed. Reload before continuing.');
      const live = meta.employeeDeletion as EmployeeDeletion;
      tx.set(ref, {
        value: meta.value + 1,
        employeeDeletion: {
          ...live,
          completedFileIds: [...new Set([...live.completedFileIds, id])],
        },
      });
    });
    job = { ...job, completedFileIds: [...new Set([...job.completedFileIds, id])] };
  }
  // The persistent workspace lock prevents normal writes. Each bounded batch is
  // recomputed from persisted records, so interrupted cleanup resumes safely.
  for (;;) {
    current = await loadCloud();
    if (current.employeeDeletion?.id !== jobId)
      throw new Error('Deletion state changed. Reload the workspace.');
    const oldDocs = groupDocuments(current),
      newDocs = groupDocuments(purgeEmployee(current, job.code));
    const operations = Object.keys(oldDocs)
      .filter((k) => !(k in newDocs) || JSON.stringify(oldDocs[k]) !== JSON.stringify(newDocs[k]))
      .slice(0, 400);
    progress(
      operations.length
        ? 'Removing employee records from Firestore…'
        : 'Finalizing employee deletion…',
    );
    await runTransaction(db, async (tx) => {
      const meta = (await tx.get(ref)).data();
      if (meta?.value !== current.revision || meta?.employeeDeletion?.id !== jobId)
        throw new Error('Deletion progress changed in another session. Retry to continue.');
      for (const path of operations) {
        if (path in newDocs) tx.set(doc(db!, root, path), newDocs[path]);
        else tx.delete(doc(db!, root, path));
      }
      tx.set(
        ref,
        operations.length
          ? { value: current.revision + 1, employeeDeletion: current.employeeDeletion }
          : { value: current.revision + 1 },
      );
    });
    if (!operations.length) return loadCloud();
  }
}

export async function loadWorkspace(): Promise<State> {
  const state = await loadCloud();
  if (state.employeeDeletion) return state;
  const business = generateRecurring(state.business ?? emptyBusiness());
  if (JSON.stringify(business) !== JSON.stringify(state.business))
    return saveCloud(state, { ...state, business });
  return state;
}
async function expenseInvoiceFolder(brands: Brand[]) {
  if (
    !brands.length ||
    brands.some((b) => !b.id.trim() || !b.name.trim()) ||
    new Set(brands.map((b) => b.id)).size !== brands.length
  )
    throw new Error('Select the expense brands before uploading an invoice.');
  const ordered = [...brands].sort((a, b) => a.id.localeCompare(b.id));
  // Stable IDs keep folders reusable even when brand names change. Hashing stays
  // within Drive's app-property size limit for expenses shared by many brands.
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(JSON.stringify(ordered.map((b) => b.id))),
  );
  const identity = Array.from(new Uint8Array(digest), (n) => n.toString(16).padStart(2, '0')).join(
    '',
  );
  const root = await ensureFolder('Business invoices', 'business-invoices', 'root');
  const parent =
    ordered.length > 1 ? await ensureFolder('Shared', 'business-invoices-shared', root) : root;
  return ensureFolder(
    ordered.map((b) => b.name.trim()).join(' + '),
    'business-invoice-brands',
    parent,
    identity,
    'brandGroup',
  );
}
export async function uploadExpenseInvoice(file: File, expenseId: string, brands: Brand[]) {
  ownerUid();
  if (!driveToken) throw new Error('Connect Google Drive before uploading an invoice.');
  if (
    file.size > 5 * 1024 * 1024 ||
    file.size === 0 ||
    !['application/pdf', 'image/jpeg', 'image/png', 'image/webp'].includes(file.type)
  )
    throw new Error('Choose a PDF, JPEG, PNG or WebP invoice up to 5 MB.');
  const folder = await expenseInvoiceFolder(brands);
  const boundary = `invoice_${crypto.randomUUID()}`;
  const body = new Blob([
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n`,
    JSON.stringify({
      name: file.name,
      parents: [folder],
      appProperties: { expenseId, payrollOwner: ownerUid() },
    }),
    `\r\n--${boundary}\r\nContent-Type: ${file.type}\r\n\r\n`,
    file,
    `\r\n--${boundary}--`,
  ]);
  const response = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${driveToken}`,
        'Content-Type': `multipart/related; boundary=${boundary}`,
      },
      body,
    },
  );
  if (!response.ok) throw new Error(await driveError(response));
  const data = await response.json();
  if (!data.id) throw new Error('Drive did not confirm the invoice upload.');
  return {
    id: data.id,
    name: data.name,
    url: data.webViewLink || `https://drive.google.com/file/d/${data.id}/view`,
    uploadedAt: new Date().toISOString(),
  };
}
