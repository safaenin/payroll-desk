import { it, expect } from 'vitest';
import { emptyState, monthDates, calculate, approve, type State } from './domain';
function fixture(month: string, payableDays: number): State {
  const state = emptyState();
  state.coverage[month] = true;
  state.employees = [
    {
      code: 'LP1',
      name: 'Loss Prevention',
      active: true,
      aadhaar: false,
      bank: true,
      offerSent: true,
      offerReceived: true,
      rates: [
        {
          from: '2024-01-01',
          role: 'FR_Loss Prevention',
          dailyMinor: 1800000,
          monthlyMinor: 1800000,
          divisor: 30,
          cappedMonthly: true,
          bonusEligible: false,
        },
      ],
    },
  ];
  state.attendance = monthDates(month).map((date, i) => ({
    code: 'LP1',
    name: 'Loss Prevention',
    date,
    role: 'FR_Loss Prevention',
    status: i < payableDays ? 'P' : 'A',
    payable: Math.min(1, Math.max(0, payableDays - i)),
    store: 'Test',
    primaryStore: 'Test',
  }));
  return state;
}
it('caps 31 and 30 payable days at 18000 while preserving attendance counts', () => {
  for (const days of [30, 31]) {
    const line = calculate(fixture('2026-10', days), '2026-10')[0];
    expect(line.base).toBe(1800000);
    expect(line.days).toBe(days);
  }
  expect(calculate(fixture('2026-10', 29), '2026-10')[0].base).toBe(1740000);
  expect(calculate(fixture('2026-10', 29.5), '2026-10')[0].base).toBe(1770000);
});
it('pays the full salary for fully attended 28,29 and30 day months', () => {
  for (const month of ['2026-02', '2024-02', '2026-09'])
    expect(calculate(fixture(month, monthDates(month).length), month)[0].base).toBe(1800000);
  expect(calculate(fixture('2026-02', 27), '2026-02')[0].base).toBe(
    Math.round((1800000 * 27) / 28),
  );
});
it('keeps other wage modes, adjustments and approved snapshots unchanged', () => {
  const state = fixture('2026-10', 31);
  state.employees[0].rates[0].cappedMonthly = false;
  const approved = approve(state, '2026-10');
  // Simulate an immutable snapshot approved before monthly caps were introduced.
  approved.runs[0].lines[0].base = 1860000;
  approved.runs[0].lines[0].net = 1860000;
  approved.employees[0].rates[0].cappedMonthly = true;
  approved.adjustments['2026-10'] = [
    { code: 'LP1', performance: 10000, other: 0, deduction: 20000, note: 'test' },
  ];
  expect(calculate(approved, '2026-10')[0].net).toBe(1790000);
  expect(approved.runs[0].lines[0].base).toBe(1860000);
});

it('caps all existing 26-day monthly wages without requiring a role or a new flag', () => {
  for (const days of [26, 27, 28, 31]) {
    const state = fixture('2026-10', days);
    state.employees[0].rates[0] = {
      from: '2024-01-01',
      role: 'FR_Packer',
      dailyMinor: 1300000,
      monthlyMinor: 1300000,
      divisor: 26,
      bonusEligible: true,
    };
    state.attendance.forEach((r) => (r.role = 'FR_Packer'));
    const line = calculate(state, '2026-10')[0];
    expect(line.base).toBe(1300000);
    expect(line.attendanceBonus).toBe(100000);
    expect(line.net).toBe(1400000);
    expect(line.days).toBe(days);
  }
});
it('keeps shorter attendance prorated and daily-only wages independent of monthly caps', () => {
  const state = fixture('2026-10', 25);
  state.employees[0].rates[0].monthlyMinor = 1300000;
  state.employees[0].rates[0].divisor = 26;
  expect(calculate(state, '2026-10')[0].base).toBe(1250000);
  state.employees[0].rates[0] = {
    from: '2024-01-01',
    role: 'FR_Packer',
    dailyMinor: 50000,
    bonusEligible: false,
  };
  state.attendance.forEach((r) => {
    r.payable = 1;
    r.status = 'P';
  });
  expect(calculate(state, '2026-10')[0].base).toBe(1550000);
});
it('does not multiply the cap when a monthly wage changes mid-month', () => {
  const state = fixture('2026-10', 31);
  state.employees[0].rates[0].monthlyMinor = 1300000;
  state.employees[0].rates[0].divisor = 26;
  state.employees[0].rates.push({
    ...state.employees[0].rates[0],
    from: '2026-10-16',
    monthlyMinor: 2000000,
  });
  const line = calculate(state, '2026-10')[0];
  expect(line.base).toBe(Math.round((1300000 * 15 + 2000000 * 16) / 31));
  expect(line.issues).toEqual([]);
});
