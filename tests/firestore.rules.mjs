import { test, before, after, beforeEach } from 'node:test';
import { readFile } from 'node:fs/promises';
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} from '@firebase/rules-unit-testing';
import { doc, setDoc, getDoc, updateDoc, deleteDoc } from 'firebase/firestore';
const uid = 'oazDtOGd96ecNL255rXvm3IYkaK2';
const root = `owners/${uid}`;
let env;
before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-payroll-rules',
    firestore: { rules: await readFile('firestore.rules', 'utf8') },
  });
});
after(async () => {
  await env?.cleanup();
});
beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, `${root}/meta/revision`), { value: 1 });
    await setDoc(doc(db, `${root}/payments/p1`), {
      id: 'p1',
      code: 'E1',
      month: '2026-09',
      amount: 10000,
      date: '2026-10-08',
      reference: 'bank-ref',
    });
    await setDoc(doc(db, `${root}/employees/E1`), { code: 'E1', name: 'Test' });
  });
});
const owner = () => env.authenticatedContext(uid).firestore();
test('unauthenticated and unrelated users cannot read or write company records', async () => {
  for (const db of [
    env.unauthenticatedContext().firestore(),
    env.authenticatedContext('outsider').firestore(),
  ]) {
    await assertFails(getDoc(doc(db, `${root}/employees/E1`)));
    await assertFails(setDoc(doc(db, `${root}/employees/E2`), { code: 'E2' }));
  }
});
test('owner can read workspace but cannot access another workspace', async () => {
  await assertSucceeds(getDoc(doc(owner(), `${root}/employees/E1`)));
  await assertFails(getDoc(doc(owner(), 'owners/outsider/employees/E1')));
});
test('payment void adds audit only and cannot be changed or undone', async () => {
  const ref = doc(owner(), `${root}/payments/p1`);
  await assertFails(updateDoc(ref, { amount: 1 }));
  await assertFails(updateDoc(ref, { reference: 'changed' }));
  await assertFails(updateDoc(ref, { voidedAt: 'now', voidReason: '' }));
  await assertFails(updateDoc(ref, { voidedAt: 'now', voidReason: 'mistake', amount: 1 }));
  await assertSucceeds(
    updateDoc(ref, { voidedAt: '2026-11-02T00:00:00Z', voidReason: 'Duplicate entry' }),
  );
  await assertFails(updateDoc(ref, { voidReason: 'rewritten' }));
  await assertFails(deleteDoc(ref));
});
test('employee deletion requires a persisted deletion job', async () => {
  const db = owner();
  const ref = doc(db, `${root}/employees/E1`);
  await assertFails(deleteDoc(ref));
  await assertSucceeds(
    updateDoc(doc(db, `${root}/meta/revision`), { employeeDeletion: { id: 'job', code: 'E1' } }),
  );
  await assertSucceeds(deleteDoc(ref));
});

test('approved payroll, import audit and document links resist ordinary overwrites', async () => {
  const db = owner();
  for (const [path, value] of [
    ['runs/2026-09', { month: '2026-09', lines: [{ code: 'E1', net: 10000 }], approvedAt: 'now' }],
    ['imports/report', { id: 'report', revisions: [] }],
    ['files/file', { id: 'file', code: 'E1', url: 'private' }],
  ]) {
    const ref = doc(db, `${root}/${path}`);
    await assertSucceeds(setDoc(ref, value));
    await assertFails(setDoc(ref, { ...value, tampered: true }));
    await assertFails(deleteDoc(ref));
  }
});

test('production transaction permits one competing save and rejects the stale session', async () => {
  const { commitCloudChanges } = await import('../src/cloudTransaction.ts');
  const { strict: assert } = await import('node:assert');
  const db1 = owner(),
    db2 = owner();
  const results = await Promise.allSettled([
    commitCloudChanges(db1, root, 1, [['employees/E1', { code: 'E1', name: 'First' }]]),
    commitCloudChanges(db2, root, 1, [['employees/E1', { code: 'E1', name: 'Second' }]]),
  ]);
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
  assert.match(results.find((r) => r.status === 'rejected').reason.message, /Another session/);
  assert.equal((await getDoc(doc(db1, `${root}/meta/revision`))).data().value, 2);
});

test('production transaction blocks during deletion and rolls back denied writes atomically', async () => {
  const { commitCloudChanges } = await import('../src/cloudTransaction.ts');
  const { strict: assert } = await import('node:assert');
  const db = owner();
  await assert.rejects(
    commitCloudChanges(db, root, 1, [
      ['employees/E1', { code: 'E1', name: 'Changed' }],
      ['payments/p1', { amount: 1 }],
    ]),
  );
  assert.equal((await getDoc(doc(db, `${root}/employees/E1`))).data().name, 'Test');
  assert.equal((await getDoc(doc(db, `${root}/meta/revision`))).data().value, 1);
  await updateDoc(doc(db, `${root}/meta/revision`), {
    employeeDeletion: { id: 'job', code: 'E1' },
  });
  await assert.rejects(commitCloudChanges(db, root, 1, []), /pending employee deletion/);
});
