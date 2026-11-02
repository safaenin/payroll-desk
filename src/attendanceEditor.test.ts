import { expect, it } from 'vitest';
import { attendanceCounts, correctAttendance } from './attendanceEditor';
import { approve, mergeAttendance } from './domain';
import { sampleState } from './test-fixtures/payroll';
it('counts actual statuses and payable values without filling missing days', () => {
  const row = sampleState().attendance[0];
  const summary = attendanceCounts(
    [
      { ...row, status: 'P', payable: 0.75 },
      { ...row, date: '2026-09-02', status: 'HD', payable: 0.5 },
      { ...row, date: '2026-09-03', status: 'Pending', payable: 0 },
    ],
    '2026-09',
  );
  expect(summary.counts.P).toBe(1);
  expect(summary.counts.HD).toBe(1);
  expect(summary.counts.Pending).toBe(1);
  expect(summary.payable).toBe(1.25);
  expect(summary.unrecorded).toBe(27);
});
it('audits corrections, preserves approved runs and source metadata, and protects them on reimport', () => {
  const original = approve(sampleState(), '2026-09');
  const row = original.attendance.find((r) => r.code === 'DEMO001')!;
  const next = correctAttendance(
    original,
    row.code,
    row.date,
    'A',
    0,
    'Manager confirmed absence',
    row.role,
  );
  const updated = next.attendance.find((r) => r.code === row.code && r.date === row.date)!;
  expect(updated.store).toBe(row.store);
  expect(updated.primaryStore).toBe(row.primaryStore);
  expect(updated.manualCorrection?.reason).toBe('Manager confirmed absence');
  expect(next.imports.at(-1)?.revisions[0]).toEqual({ before: row, after: updated });
  expect(next.runs).toEqual(original.runs);
  expect(next.coverage['2026-09']).toBe(false);
  const imported = mergeAttendance(next, [row], 'daily.xlsx');
  expect(imported.attendance.find((r) => r.code === row.code && r.date === row.date)).toEqual(
    updated,
  );
  const released = correctAttendance(
    imported,
    row.code,
    row.date,
    'A',
    0,
    'Use the next verified report',
    row.role,
    true,
  );
  const refreshed = mergeAttendance(released, [row], 'verified.xlsx');
  expect(refreshed.attendance.find((r) => r.code === row.code && r.date === row.date)).toEqual(row);
});
it('adds only the requested date for manual staff and validates date, status, reason and payable', () => {
  const state = sampleState();
  state.attendance = [];
  state.employees[0].manualPayroll = true;
  const added = correctAttendance(
    state,
    'DEMO001',
    '2026-09-01',
    'HD',
    0.5,
    'Supervisor confirmed',
    'FR_Packer',
  );
  expect(added.attendance).toHaveLength(1);
  expect(added.imports.at(-1)?.added).toBe(1);
  expect(() =>
    correctAttendance(state, 'DEMO001', '2026-09-31', 'P', 1, 'Reason', 'FR_Packer'),
  ).toThrow('valid date');
  expect(() => correctAttendance(state, 'DEMO001', '2026-09-01', 'P', 1, '', 'FR_Packer')).toThrow(
    'reason',
  );
  expect(() =>
    correctAttendance(state, 'DEMO001', '2026-09-01', 'F', 1, 'Reason', 'FR_Packer'),
  ).toThrow('zero');
  expect(() =>
    correctAttendance(state, 'DEMO001', '2026-09-01', 'P', 2, 'Reason', 'FR_Packer'),
  ).toThrow('between');
});
