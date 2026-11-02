import { describe, expect, it } from 'vitest';
import {
  addPayment,
  approve,
  calculate,
  dueDate,
  emptyState,
  included,
  mergeAttendance,
  monthDates,
  type Attendance,
} from './domain';
import { sampleState } from './test-fixtures/payroll';
const row = (date = '2026-09-01'): Attendance => ({
  code: 'E1',
  name: 'Example',
  date,
  role: 'FR_Packer',
  status: 'P',
  payable: 1,
  store: 'A',
  primaryStore: 'A',
});
function fixture(days = 26) {
  const s = emptyState();
  s.employees = [
    {
      code: 'E1',
      name: 'Example',
      active: true,
      rates: [{ from: '2026-01-01', role: 'FR_Packer', dailyMinor: 50000, bonusEligible: true }],
      aadhaar: false,
      bank: false,
      offerSent: false,
      offerReceived: false,
    },
  ];
  s.attendance = monthDates('2026-09').slice(0, days).map(row);
  s.coverage['2026-09'] = true;
  return s;
}
describe('payroll rules', () => {
  it('includes only FR_ roles', () => {
    expect(included('FR_Packer')).toBe(true);
    expect(included('FR_Shift Incharge')).toBe(true);
    expect(included('FLEX_CITY')).toBe(false);
    expect(included('DH_CLM Hybrid')).toBe(false);
  });
  it('uses next-month payday across year boundaries', () => {
    expect(dueDate('2026-12')).toBe('2027-01-08');
    expect(dueDate('2026-02')).toBe('2026-03-08');
    expect(monthDates('2028-02')).toHaveLength(29);
  });
  it('awards attendance bonus at 26 and 27 days but not 25', () => {
    expect(calculate(fixture(25), '2026-09')[0].attendanceBonus).toBe(0);
    expect(calculate(fixture(26), '2026-09')[0].attendanceBonus).toBe(100000);
    expect(calculate(fixture(27), '2026-09')[0].attendanceBonus).toBe(100000);
  });
  it('pays half-days without counting them toward attendance bonus', () => {
    const s = fixture(27);
    s.attendance[0].status = 'HD';
    s.attendance[0].payable = 0.5;
    s.attendance[1].status = 'HD';
    s.attendance[1].payable = 0.5;
    const l = calculate(s, '2026-09')[0];
    expect(l.days).toBe(26);
    expect(l.fullDays).toBe(25);
    expect(l.base).toBe(1300000);
    expect(l.attendanceBonus).toBe(0);
  });
  it('never awards a Shift Incharge bonus even with an eligible flag', () => {
    const s = fixture();
    s.employees[0].rates[0].role = 'FR_Shift Incharge';
    expect(calculate(s, '2026-09')[0].attendanceBonus).toBe(0);
  });
  it('applies employee-specific eligibility', () => {
    const s = fixture();
    s.employees[0].rates[0].bonusEligible = false;
    expect(calculate(s, '2026-09')[0].attendanceBonus).toBe(0);
  });
  it('uses promotion date rates without duplicating employee records', () => {
    const s = fixture();
    s.employees[0].rates.push({
      from: '2026-09-16',
      role: 'FR_Shift Incharge',
      dailyMinor: 80000,
      bonusEligible: false,
    });
    const l = calculate(s, '2026-09')[0];
    expect(l.base).toBe(15 * 50000 + 11 * 80000);
    expect(l.attendanceBonus).toBe(0);
  });
  it('filters old months and excluded roles', () => {
    const s = fixture(1);
    s.attendance.push(row('2026-08-31'), { ...row('2026-09-02'), role: 'FLEX_CITY' });
    expect(calculate(s, '2026-09')[0].days).toBe(1);
  });
  it('preserves the monthly-base/divisor rate until final rounding', () => {
    const s = fixture(23);
    s.employees[0].rates[0] = {
      from: '2026-01-01',
      role: 'FR_Shift Incharge',
      dailyMinor: 2000000,
      monthlyMinor: 2000000,
      divisor: 26,
      bonusEligible: false,
    };
    expect(calculate(s, '2026-09')[0].base).toBe(1769231);
  });
  it('quarantines cross-store attendance conflicts', () => {
    const s = mergeAttendance(emptyState(), [row()], 'a.xlsx');
    expect(() => mergeAttendance(s, [{ ...row(), store: 'B' }], 'b.xlsx')).toThrow(
      'Conflicting store',
    );
  });
  it('includes variable bonuses and itemized deductions', () => {
    const s = fixture();
    s.adjustments['2026-09'] = [
      { code: 'E1', performance: 75000, other: 10000, deduction: 25000, note: 'Approved' },
    ];
    expect(calculate(s, '2026-09')[0].net).toBe(1460000);
  });
  it('flags missing wages and pending attendance', () => {
    const s = fixture(1);
    s.employees[0].rates = [];
    s.attendance[0].status = 'Pending';
    s.attendance[0].payable = 0;
    expect(calculate(s, '2026-09')[0].issues.length).toBeGreaterThan(0);
    expect(() => approve(s, '2026-09')).toThrow();
  });
  it('reimports without double-counting, retaining corrections', () => {
    let s = mergeAttendance(emptyState(), [row()], 'one.xlsx');
    s = mergeAttendance(s, [row()], 'two.xlsx');
    expect(s.attendance).toHaveLength(1);
    expect(s.imports[1].unchanged).toBe(1);
    s = mergeAttendance(s, [{ ...row(), status: 'HD', payable: 0.5 }], 'three.xlsx');
    expect(s.attendance[0].payable).toBe(0.5);
    expect(s.imports[2].revisions[0].before.payable).toBe(1);
    expect(s.employees).toHaveLength(1);
  });
  it('rejects duplicate employee/date rows', () =>
    expect(() => mergeAttendance(emptyState(), [row(), row()], 'bad.xlsx')).toThrow('Duplicate'));
  it('requires coverage and prevents duplicate approval', () => {
    const s = fixture();
    s.coverage = {};
    expect(() => approve(s, '2026-09')).toThrow('coverage');
    const approved = approve(fixture(), '2026-09');
    expect(() => approve(approved, '2026-09')).toThrow('already approved');
  });
  it('keeps approved earnings unchanged after later attendance changes', () => {
    const s = approve(fixture(), '2026-09');
    const prior = s.runs[0].lines[0].net;
    const changed = mergeAttendance(s, [{ ...row(), status: 'A', payable: 0 }], 'correction.xlsx');
    expect(changed.runs[0].lines[0].net).toBe(prior);
    expect(calculate(changed, '2026-09')[0].net).not.toBe(prior);
  });
  it('tracks partial payments and rejects duplicate and excess payments', () => {
    const s = approve(fixture(), '2026-09');
    const p = {
      id: 'p1',
      month: '2026-09',
      code: 'E1',
      amount: 100000,
      date: '2026-10-08',
      reference: 'BANK-1',
    };
    const paid = addPayment(s, p);
    expect(paid.payments[0].amount).toBe(100000);
    expect(() => addPayment(paid, { ...p, id: 'p2' })).toThrow('already recorded');
    expect(() =>
      addPayment(paid, { ...p, id: 'p3', reference: 'BANK-2', amount: 1400000 }),
    ).toThrow('outstanding');
  });
  it('processes all 35 synthetic employees through approval', () => {
    const s = sampleState();
    expect(calculate(s, '2026-09')).toHaveLength(35);
    expect(calculate(s, '2026-09').every((l) => l.issues.length === 0)).toBe(true);
    expect(approve(s, '2026-09').runs[0].lines).toHaveLength(35);
  });
});

describe('role changes with the same employee code', () => {
  it('updates a date without duplicating the employee and uses dated wages', () => {
    const s = fixture(30);
    s.employees[0].rates.push({
      from: '2026-09-16',
      role: 'FR_Supervisor',
      dailyMinor: 60000,
      bonusEligible: true,
    });
    const incoming = s.attendance.map((a) =>
      a.date >= '2026-09-16' ? { ...a, role: 'FR_Supervisor' } : a,
    );
    const updated = mergeAttendance(s, incoming, 'role-update.xlsx');
    expect(updated.employees).toHaveLength(1);
    expect(updated.attendance).toHaveLength(30);
    expect(updated.imports.at(-1)?.updated).toBe(15);
    expect(updated.imports.at(-1)?.revisions[0].before.role).toBe('FR_Packer');
    expect(calculate(updated, '2026-09')[0]).toMatchObject({
      code: 'E1',
      base: 1650000,
      attendanceBonus: 100000,
      issues: [],
    });
  });

  it('does not block fixed monthly pay on attendance-bonus role changes', () => {
    const s = fixture(30);
    s.employees[0].rates[0].fixedMonthlyMinor = 1000000;
    s.attendance = s.attendance.map((a) =>
      a.date >= '2026-09-16' ? { ...a, role: 'FR_Shift-Incharge' } : a,
    );
    expect(calculate(s, '2026-09')[0]).toMatchObject({
      base: 1000000,
      attendanceBonus: 0,
      issues: [],
    });
  });
});

it('requires a reason for promotion review and invalidates it when attendance or wages change', async () => {
  const { promotionReviewKey } = await import('./domain');
  const s = fixture(30);
  s.attendance = s.attendance.map((a) =>
    a.date >= '2026-09-16' ? { ...a, role: 'FR_Shift-Incharge' } : a,
  );
  const warning = 'Review attendance-bonus eligibility across promotion';
  expect(calculate(s, '2026-09')[0].issues).toContain(warning);
  s.adjustments['2026-09'] = [
    {
      code: 'E1',
      performance: 0,
      other: 0,
      deduction: 0,
      note: '',
      promotionReview: promotionReviewKey(s, '2026-09', 'E1'),
    },
  ];
  expect(calculate(s, '2026-09')[0].issues).toContain(warning);
  s.adjustments['2026-09'][0].note = 'Promoted on 16 September; excluded for this month.';
  expect(calculate(s, '2026-09')[0]).toMatchObject({ attendanceBonus: 0, issues: [] });
  expect(approve(s, '2026-09').runs[0].lines[0].segments.join(' ')).toContain('Promotion reviewed');
  s.attendance[0].payable = 0;
  expect(calculate(s, '2026-09')[0].issues).toContain(warning);
  s.attendance[0].payable = 1;
  s.employees[0].rates[0].dailyMinor++;
  expect(calculate(s, '2026-09')[0].issues).toContain(warning);
});

it('rejects impossible and future completed-payment dates while allowing actual earlier payments', () => {
  const s = approve(fixture(), '2026-09');
  const payment = {
    id: 'date-check',
    month: '2026-09',
    code: 'E1',
    amount: 100,
    date: '2026-10-08',
    reference: 'bank-ref',
  };
  for (const date of ['2026-02-30', '2026-13-01', 'not-a-date', '2999-01-01']) {
    expect(() => addPayment(s, { ...payment, date })).toThrow('valid completed payment date');
  }
  expect(addPayment(s, payment).payments).toHaveLength(1);
});

it('voids an incorrect payment with an audit and restores payroll and brand balances', async () => {
  const { voidPayment } = await import('./domain');
  const { brandPayrollSummary } = await import('./brandPayroll');
  const approved = approve(fixture(), '2026-09');
  const amount = approved.runs[0].lines[0].net;
  const payment = {
    id: 'original',
    month: '2026-09',
    code: 'E1',
    amount,
    date: '2026-10-08',
    reference: 'ref',
  };
  const paid = addPayment(approved, payment);
  expect(brandPayrollSummary(paid, '', '', '').outstanding).toBe(0);
  expect(() => voidPayment(paid, 'original', ' ')).toThrow('reason');
  const corrected = voidPayment(paid, 'original', 'Entered twice in source register');
  expect(corrected.payments[0]).toMatchObject({
    ...payment,
    voidReason: 'Entered twice in source register',
  });
  expect(corrected.payments[0].voidedAt).toBeTruthy();
  expect(paid.payments[0].voidedAt).toBeUndefined();
  expect(corrected.runs).toEqual(approved.runs);
  expect(brandPayrollSummary(corrected, '', '', '')).toMatchObject({
    paid: 0,
    outstanding: amount,
  });
  expect(() => voidPayment(corrected, 'original', 'Again')).toThrow('already voided');
  expect(() => voidPayment(corrected, 'missing', 'Reason')).toThrow('not found');
  const replacement = addPayment(corrected, { ...payment, id: 'replacement' });
  expect(replacement.payments).toHaveLength(2);
  expect(brandPayrollSummary(replacement, '', '', '').outstanding).toBe(0);
  expect(() => addPayment(corrected, payment)).toThrow('already recorded');
  expect(() => addPayment(approved, { ...payment, voidedAt: 'now' })).toThrow('void details');
});

it('revises approved earnings while preserving versions, payments and counting advances once', async () => {
  const { payrollVersion } = await import('./domain');
  const { recovered } = await import('./advances');
  const s = fixture(30);
  s.advances = [
    {
      id: 'a',
      code: 'E1',
      amount: 400000,
      paidOn: '2026-08-01',
      reference: 'adv',
      note: '',
      createdAt: 'now',
      schedule: [{ month: '2026-09', amount: 200000 }],
    },
  ];
  const first = approve(s, '2026-09');
  const paid = addPayment(first, {
    id: 'paid',
    month: '2026-09',
    code: 'E1',
    amount: first.runs[0].lines[0].net,
    date: '2026-10-08',
    reference: 'bank',
  });
  paid.adjustments['2026-09'] = [
    { code: 'E1', performance: 0, other: 0, deduction: 10000, note: 'Correction' },
  ];
  expect(() => approve(paid, '2026-09', ' ')).toThrow('reason');
  expect(() => approve({ ...paid, coverage: {} }, '2026-09', 'Correction')).toThrow('coverage');
  const revised = approve(paid, '2026-09', 'Correct deduction');
  expect(revised.runs).toHaveLength(1);
  expect(revised.runs[0].history).toEqual([payrollVersion(first.runs[0])]);
  expect(revised.payments).toEqual(paid.payments);
  expect(revised.runs[0].lines[0].net).toBe(first.runs[0].lines[0].net - 10000);
  expect(recovered(revised, 'a')).toBe(200000);
  const again = approve(revised, '2026-09', 'Second review');
  expect(again.runs[0].history).toEqual([
    payrollVersion(first.runs[0]),
    payrollVersion(revised.runs[0]),
  ]);
  expect(recovered(again, 'a')).toBe(200000);
  const { purgeEmployee } = await import('./employeeDeletion');
  expect(purgeEmployee(again, 'E1').runs[0].history?.every((v) => v.lines.length === 0)).toBe(true);
});
