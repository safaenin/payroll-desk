import { doc, runTransaction, type Firestore } from 'firebase/firestore';

/** Shared by production saves and emulator tests; stale snapshots must never overwrite data. */
export async function commitCloudChanges(
  db: Firestore,
  root: string,
  revision: number,
  changes: [string, unknown][],
) {
  await runTransaction(db, async (tx) => {
    const ref = doc(db, root, 'meta/revision');
    const metadata = (await tx.get(ref)).data();
    if (metadata?.expenseDeletion)
      throw new Error('Finish the pending expense deletion before saving changes.');
    if (metadata?.employeeDeletion)
      throw new Error('Finish the pending employee deletion before changing payroll records.');
    const current = metadata?.value ?? 0;
    if (current !== revision)
      throw new Error('Another session changed the records. Reload before saving.');
    for (const [path, value] of changes) tx.set(doc(db, root, path), value);
    tx.set(ref, { value: current + 1 });
  });
}
