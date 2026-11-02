import { markInactive, reactivateEmployee } from '../src/employment';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { readFile } from 'node:fs/promises';
import { initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { type Firestore } from 'firebase/firestore';
import { addPayment, approve, payrollVersion } from '../src/domain';
import { recovered, saveAdvance } from '../src/advances';
import { sampleState } from '../src/test-fixtures/payroll';

const connection = vi.hoisted(() => ({ db: null as Firestore | null }));
vi.mock('firebase/firestore', async (original) => ({
  ...(await original<typeof import('firebase/firestore')>()),
  getFirestore: () => connection.db,
}));
vi.mock('firebase/auth', async (original) => ({
  ...(await original<typeof import('firebase/auth')>()),
  getAuth: () => ({ currentUser: { uid: 'oazDtOGd96ecNL255rXvm3IYkaK2' } }),
}));

// Never connects to the production project. Run through npm run test:rules.
describe.skipIf(!process.env.FIRESTORE_EMULATOR_HOST)('cloud payroll lifecycle', () => {
  let env: RulesTestEnvironment;
  beforeAll(async () => {
    env = await initializeTestEnvironment({
      projectId: 'demo-payroll-lifecycle',
      firestore: { rules: await readFile('firestore.rules', 'utf8') },
    });
    await env.clearFirestore();
    connection.db = env
      .authenticatedContext('oazDtOGd96ecNL255rXvm3IYkaK2')
      .firestore() as unknown as Firestore;
    for (const [key, value] of Object.entries({
      VITE_FIREBASE_API_KEY: 'emulator-only',
      VITE_FIREBASE_PROJECT_ID: 'demo-payroll-lifecycle',
      VITE_FIREBASE_AUTH_DOMAIN: 'localhost',
      VITE_FIREBASE_APP_ID: 'emulator-only',
      VITE_OWNER_UID: 'oazDtOGd96ecNL255rXvm3IYkaK2',
    }))
      vi.stubEnv(key, value);
  });
  afterAll(async () => {
    vi.unstubAllEnvs();
    await env?.cleanup();
  });

  it('reloads 35 employees, approved pay, installments, payments and exact revision history', async () => {
    const { loadCloud, saveCloud, startEmployeeDeletion, finishEmployeeDeletion } =
      await import('../src/storage');
    const empty = await loadCloud();
    const input = saveAdvance(sampleState(), {
      id: 'advance-test',
      code: 'DEMO001',
      amount: 400000,
      paidOn: '2026-08-20',
      reference: 'fictional-advance',
      note: 'Emulator fixture',
      createdAt: '2026-08-20T00:00:00Z',
      schedule: [
        { month: '2026-09', amount: 200000 },
        { month: '2026-10', amount: 200000 },
      ],
    });
    input.attendanceBonusExclusions = ['Shift-Incharge', 'Security', 'Housekeeping'];
    input.attendanceBonusExactMatch = true;
    await saveCloud(empty, input);
    let state = await loadCloud();
    expect(state.attendanceBonusExclusions).toEqual(input.attendanceBonusExclusions);
    expect(state.attendanceBonusExactMatch).toBe(true);
    expect(state.employees).toHaveLength(35);
    expect(state.attendance).toHaveLength(1050);
    expect(state.advances).toEqual(input.advances);
    await saveCloud(state, approve(state, '2026-09'));
    state = await loadCloud();
    const original = structuredClone(state.runs[0]);
    expect(original.lines).toHaveLength(35);
    expect(original.due).toBe('2026-10-08');
    expect(recovered(state, 'advance-test')).toBe(200000);
    await saveCloud(
      state,
      addPayment(state, {
        id: 'payment-test',
        code: 'DEMO001',
        month: '2026-09',
        amount: 500000,
        date: '2026-10-08',
        reference: 'fictional-bank-payment',
      }),
    );
    state = await loadCloud();
    const paid = structuredClone(state.payments);
    const revisedInputs = structuredClone(state);
    revisedInputs.adjustments['2026-09'][0].performance += 10000;
    await saveCloud(
      state,
      approve(revisedInputs, '2026-09', 'Manager corrected performance bonus'),
    );
    state = await loadCloud();
    expect(state.runs[0].history).toEqual([payrollVersion(original)]);
    expect(state.runs[0].lines.find((l) => l.code === 'DEMO001')!.net).toBe(
      original.lines.find((l) => l.code === 'DEMO001')!.net + 10000,
    );
    expect(state.payments).toEqual(paid);
    expect(recovered(state, 'advance-test')).toBe(200000);
    const stale = structuredClone(state);
    await saveCloud(state, approve(state, '2026-09', 'Second reviewed version'));
    state = await loadCloud();
    expect(state.runs[0].history).toHaveLength(2);
    expect(state.runs[0].history![0]).toEqual(payrollVersion(original));
    expect(state.payments).toEqual(paid);
    await expect(saveCloud(stale, stale)).rejects.toThrow('Another session');

    const beforeExit = structuredClone(state);
    const inactive = markInactive(
      state.employees.find((e) => e.code === 'DEMO001')!,
      '2026-10-15',
      'Contract ended',
    );
    await saveCloud(state, {
      ...state,
      employees: state.employees.map((e) => (e.code === inactive.code ? inactive : e)),
    });
    state = await loadCloud();
    expect(state.employees.find((e) => e.code === 'DEMO001')!.active).toBe(false);
    expect(state.employees.find((e) => e.code === 'DEMO001')!.exits?.[0].reason).toBe(
      'Contract ended',
    );
    expect(state.runs).toEqual(beforeExit.runs);
    expect(state.payments).toEqual(beforeExit.payments);
    expect(state.attendance).toEqual(beforeExit.attendance);
    expect(state.advances).toEqual(beforeExit.advances);
    const rejoined = reactivateEmployee(
      state.employees.find((e) => e.code === 'DEMO001')!,
      '2026-11-01',
      'Rejoined',
    );
    await saveCloud(state, {
      ...state,
      employees: state.employees.map((e) => (e.code === rejoined.code ? rejoined : e)),
    });
    state = await loadCloud();
    expect(state.employees.find((e) => e.code === 'DEMO001')!.exits?.[0].rejoinedOn).toBe(
      '2026-11-01',
    );

    // Reproduce the zero-document cleanup path using real Firestore rules.
    const otherEmployees = state.employees.filter((e) => e.code !== 'DEMO001');
    const otherLines = state.runs[0].lines.filter((l) => l.code !== 'DEMO001');
    await startEmployeeDeletion(state, 'DEMO001');
    const pending = await loadCloud();
    expect(pending.employeeDeletion?.code).toBe('DEMO001');
    await expect(saveCloud(pending, pending)).rejects.toThrow('pending employee deletion');
    await finishEmployeeDeletion(() => {});
    const cleaned = await loadCloud();
    expect(cleaned.employeeDeletion).toBeNull();
    expect(cleaned.employees).toEqual(otherEmployees);
    expect(cleaned.attendance).toHaveLength(1020);
    expect(cleaned.attendance.some((a) => a.code === 'DEMO001')).toBe(false);
    expect(cleaned.adjustments['2026-09'].some((a) => a.code === 'DEMO001')).toBe(false);
    expect(cleaned.payments).toEqual([]);
    expect(cleaned.advances).toEqual([]);
    expect(cleaned.runs[0].lines).toEqual(otherLines);
    expect(cleaned.runs[0].history).toHaveLength(2);
    for (const version of cleaned.runs[0].history!) {
      expect(version.lines).toHaveLength(34);
      expect(version.lines.some((l) => l.code === 'DEMO001')).toBe(false);
    }
    await expect(saveCloud(cleaned, cleaned)).resolves.toMatchObject({
      revision: cleaned.revision + 1,
    });
  }, 30000);
});
