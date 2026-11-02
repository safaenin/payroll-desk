import { expect, it } from 'vitest';
import { markInactive, reactivateEmployee, employedOn } from './employment';
import { sampleState } from './test-fixtures/payroll';
import { calculate, approve, mergeAttendance } from './domain';
it('requires valid dates and reasons and preserves the employee record', () => {
  const employee = sampleState().employees[0];
  expect(() => markInactive(employee, '2026-09-31', 'Resigned')).toThrow('valid date');
  expect(() => markInactive(employee, '2026-09-15', ' ')).toThrow('reason');
  const inactive = markInactive(employee, '2026-09-15', 'Resigned');
  expect(inactive.active).toBe(false);
  expect(inactive.rates).toEqual(employee.rates);
  expect(inactive.exits?.[0]).toMatchObject({ lastWorkingDay: '2026-09-15', reason: 'Resigned' });
  expect(employedOn(inactive, '2026-09-15')).toBe(true);
  expect(employedOn(inactive, '2026-09-16')).toBe(false);
});
it('keeps historical attendance and approved pay, excludes post-exit earnings, and does not reactivate on import', () => {
  const original = approve(sampleState(), '2026-09');
  const state = structuredClone(original);
  state.employees[0] = markInactive(state.employees[0], '2026-09-15', 'Contract ended');
  const line = calculate(state, '2026-09').find((l) => l.code === 'DEMO001')!;
  expect(line.days).toBe(15);
  expect(line.attendanceBonus).toBe(0);
  expect(state.runs).toEqual(original.runs);
  expect(state.attendance).toEqual(original.attendance);
  const imported = mergeAttendance(
    state,
    [{ ...state.attendance[0], date: '2026-10-01' }],
    'new-report',
  );
  expect(imported.employees[0].active).toBe(false);
  expect(calculate(imported, '2026-10').some((l) => l.code === 'DEMO001')).toBe(false);
});
it('requires manual fixed final salary and preserves earlier month calculations', () => {
  const state = sampleState();
  state.employees[0].rates[0].fixedMonthlyMinor = 1000000;
  expect(() => markInactive(state.employees[0], '2026-10-15', 'Resigned')).toThrow(
    'final fixed salary',
  );
  state.employees[0] = markInactive(state.employees[0], '2026-10-15', 'Resigned', 400000);
  expect(calculate(state, '2026-09').find((l) => l.code === 'DEMO001')!.base).toBe(1000000);
  expect(calculate(state, '2026-10').find((l) => l.code === 'DEMO001')!.base).toBe(400000);
  expect(calculate(state, '2026-11').some((l) => l.code === 'DEMO001')).toBe(false);
});
it('keeps employment gaps excluded when an employee rejoins', () => {
  const inactive = markInactive(sampleState().employees[0], '2026-09-15', 'Resigned');
  expect(() => reactivateEmployee(inactive, '2026-09-15', 'Rejoined')).toThrow('after');
  const active = reactivateEmployee(inactive, '2026-10-05', 'Rejoined');
  expect(active.active).toBe(true);
  expect(employedOn(active, '2026-09-15')).toBe(true);
  expect(employedOn(active, '2026-09-20')).toBe(false);
  expect(employedOn(active, '2026-10-04')).toBe(false);
  expect(employedOn(active, '2026-10-05')).toBe(true);
  const leftAgain = markInactive(active, '2026-10-20', 'Contract ended');
  expect(leftAgain.exits).toHaveLength(2);
  expect(employedOn(leftAgain, '2026-10-10')).toBe(true);
  expect(employedOn(leftAgain, '2026-10-21')).toBe(false);
});
