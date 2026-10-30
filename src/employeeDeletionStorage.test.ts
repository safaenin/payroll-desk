import { beforeEach, afterEach, it, expect, vi } from 'vitest';
const memory = vi.hoisted(() => ({
  docs: new Map<string, any>(),
  sizes: [] as number[],
  fail: false,
}));
vi.mock('firebase/app', () => ({ initializeApp: () => ({}) }));
vi.mock('firebase/auth', () => ({
  getAuth: () => ({ currentUser: { uid: 'owner' } }),
  GoogleAuthProvider: class {
    static credentialFromResult() {
      return { accessToken: 'test-token' };
    }
    addScope() {}
    setCustomParameters() {}
  },
  signInWithPopup: vi.fn(),
  signOut: vi.fn(),
  setPersistence: vi.fn(),
  browserLocalPersistence: {},
  reauthenticateWithPopup: vi.fn(),
}));
vi.mock('firebase/firestore', () => ({
  getFirestore: () => ({}),
  doc: (_: unknown, ...parts: string[]) => parts.join('/'),
  collection: (_: unknown, ...parts: string[]) => parts.join('/'),
  getDoc: async (path: string) => ({ data: () => structuredClone(memory.docs.get(path)) }),
  getDocs: async (path: string) => ({
    docs: [...memory.docs]
      .filter(([key]) => key.startsWith(path + '/'))
      .map(([key, value]) => ({ id: key.split('/').at(-1), data: () => structuredClone(value) })),
  }),
  runTransaction: async (_: unknown, fn: any) => {
    const writes: Array<() => void> = [];
    await fn({
      get: async (path: string) => ({ data: () => structuredClone(memory.docs.get(path)) }),
      set: (path: string, value: any) =>
        writes.push(() => memory.docs.set(path, structuredClone(value))),
      delete: (path: string) => {
        if (memory.fail) throw new Error('Interrupted cleanup');
        writes.push(() => memory.docs.delete(path));
      },
    });
    memory.sizes.push(writes.length);
    writes.forEach((write) => write());
  },
}));
beforeEach(() => {
  vi.resetModules();
  memory.docs.clear();
  memory.sizes = [];
  memory.fail = false;
  for (const key of [
    'VITE_FIREBASE_API_KEY',
    'VITE_FIREBASE_AUTH_DOMAIN',
    'VITE_FIREBASE_PROJECT_ID',
    'VITE_FIREBASE_APP_ID',
  ])
    vi.stubEnv(key, 'test');
  vi.stubEnv('VITE_OWNER_UID', 'owner');
  memory.docs.set('owners/owner/meta/revision', { value: 0 });
  for (const code of ['target', 'other'])
    memory.docs.set('owners/owner/employees/' + code, {
      code,
      name: code,
      active: true,
      rates: [],
      aadhaar: false,
      bank: false,
      offerSent: false,
      offerReceived: false,
    });
});
afterEach(() => vi.unstubAllEnvs());
it('resumes interrupted multi-batch deletion and blocks ordinary writes during cleanup', async () => {
  const s = await import('./storage');
  for (let i = 0; i < 405; i++)
    memory.docs.set('owners/owner/payments/' + i, {
      id: String(i),
      code: 'target',
      month: '2026-09',
      amount: 1,
      date: '2026-10-08',
      reference: '',
    });
  const initial = await s.loadCloud();
  const locked = await s.startEmployeeDeletion(initial, 'target');
  await expect(s.saveCloud(locked, locked)).rejects.toThrow('pending employee deletion');
  memory.fail = true;
  await expect(s.finishEmployeeDeletion(() => {})).rejects.toThrow('Interrupted cleanup');
  expect((await s.loadCloud()).employeeDeletion?.code).toBe('target');
  expect((await s.loadCloud()).payments).toHaveLength(405);
  memory.fail = false;
  const result = await s.finishEmployeeDeletion(() => {});
  expect(result.employees.map((e) => e.code)).toEqual(['other']);
  expect(result.payments).toEqual([]);
  expect(result.employeeDeletion).toBeNull();
  expect(Math.max(...memory.sizes)).toBeLessThanOrEqual(401);
  expect(memory.sizes).toContain(401);
});
it('requires Drive access before locking a workspace with documents', async () => {
  const s = await import('./storage');
  memory.docs.set('owners/owner/files/document', {
    id: 'document',
    code: 'target',
    name: 'Aadhaar',
    url: 'file',
    uploadedAt: 'now',
  });
  await expect(s.startEmployeeDeletion(await s.loadCloud(), 'target')).rejects.toThrow(
    'Connect Google Drive',
  );
  expect((await s.loadCloud()).employeeDeletion).toBeNull();
});
it('rejects stale state before starting deletion', async () => {
  const s = await import('./storage');
  const initial = await s.loadCloud();
  memory.docs.set('owners/owner/meta/revision', { value: 1 });
  await expect(s.startEmployeeDeletion(initial, 'target')).rejects.toThrow();
  expect((await s.loadCloud()).employeeDeletion).toBeNull();
});
it('round trips business collections and preserves them through employee deletion', async () => {
  const s = await import('./storage');
  const initial = await s.loadCloud();
  const business = {
    brands: [{ id: 'brand', name: 'Basickwear' }],
    registrations: [{ id: 'gst', name: 'Business', gstin: '' }],
    expenses: [],
    recurrences: [],
  };
  const saved = await s.saveCloud(initial, { ...initial, business });
  expect((await s.loadCloud()).business).toEqual(business);
  expect(memory.docs.get('owners/owner/businessBrands/brand')).toEqual(business.brands[0]);
  await s.startEmployeeDeletion(saved, 'target');
  expect((await s.finishEmployeeDeletion(() => {})).business).toEqual(business);
});
it('does not generate recurring records while employee cleanup locks the workspace', async () => {
  const s = await import('./storage');
  const initial = await s.loadCloud();
  await s.startEmployeeDeletion(initial, 'target');
  expect((await s.loadWorkspace()).employeeDeletion?.code).toBe('target');
});
it('shares the owner workspace with configured admins and rejects unlisted accounts', async () => {
  vi.stubEnv('VITE_OWNER_UID', 'different-owner');
  const s = await import('./storage');
  await expect(s.loadCloud()).rejects.toThrow('authorized');
  vi.resetModules();
  vi.stubEnv('VITE_ADMIN_UIDS', 'owner');
  const admin = await import('./storage');
  expect((await admin.loadCloud()).revision).toBe(0);
});

it('deletes only the selected invoice record and its embedded related information', async () => {
  const s = await import('./storage');
  memory.docs.set('owners/owner/businessExpenses/invoice', {
    id: 'invoice',
    invoices: [],
    payments: [{ id: 'payment' }],
    items: [{ id: 'item' }],
  });
  memory.docs.set('owners/owner/businessExpenses/other', { id: 'other', invoices: [] });
  const state = await s.deleteExpense(await s.loadCloud(), 'invoice', () => {});
  expect(state.business?.expenses.map((e) => e.id)).toEqual(['other']);
  expect(memory.docs.has('owners/owner/businessExpenses/invoice')).toBe(false);
  expect(memory.docs.get('owners/owner/meta/revision').expenseDeletion).toBeUndefined();
});
it('persists unfinished file cleanup and resumes without retrashing completed files', async () => {
  const s = await import('./storage');
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(new Response('{"files":[]}'))
    .mockResolvedValueOnce(new Response('{"id":"file1","trashed":true}'))
    .mockResolvedValueOnce(new Response('{}', { status: 403 }));
  vi.stubGlobal('fetch', fetchMock);
  try {
    memory.docs.set('owners/owner/businessExpenses/invoice', {
      id: 'invoice',
      invoices: [{ id: 'file1' }, { id: 'file2' }],
    });
    await s.connectDrive();
    await expect(s.deleteExpense(await s.loadCloud(), 'invoice', () => {})).rejects.toThrow();
    const pending = await s.loadCloud();
    expect(pending.business?.expenses[0].deletion?.remainingFileIds).toEqual(['file2']);
    await expect(s.saveCloud(pending, pending)).rejects.toThrow('pending expense deletion');
    fetchMock.mockResolvedValueOnce(new Response('{"id":"file2","trashed":true}'));
    expect((await s.deleteExpense(pending, 'invoice', () => {})).business?.expenses).toEqual([]);
    expect(fetchMock.mock.calls.filter(([url]) => String(url).includes('/file1?'))).toHaveLength(1);
  } finally {
    vi.unstubAllGlobals();
  }
});
it('keeps invoices if Drive is disconnected or the workspace revision changed', async () => {
  const s = await import('./storage');
  memory.docs.set('owners/owner/businessExpenses/invoice', {
    id: 'invoice',
    invoices: [{ id: 'file' }],
  });
  await expect(s.deleteExpense(await s.loadCloud(), 'invoice', () => {})).rejects.toThrow(
    'Connect Google Drive',
  );
  memory.docs.set('owners/owner/businessExpenses/invoice', { id: 'invoice', invoices: [] });
  const stale = await s.loadCloud();
  memory.docs.set('owners/owner/meta/revision', { value: 99 });
  await expect(s.deleteExpense(stale, 'invoice', () => {})).rejects.toThrow('Records changed');
  expect(memory.docs.has('owners/owner/businessExpenses/invoice')).toBe(true);
});
