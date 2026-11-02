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
  expect(approved.runs[0].lines[0].base).toBe(1860000);
  approved.employees[0].rates[0].cappedMonthly = true;
  approved.adjustments['2026-10'] = [
    { code: 'LP1', performance: 10000, other: 0, deduction: 20000, note: 'test' },
  ];
  expect(calculate(approved, '2026-10')[0].net).toBe(1790000);
  expect(approved.runs[0].lines[0].base).toBe(1860000);
});
