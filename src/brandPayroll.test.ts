import { it, expect } from 'vitest';
import { approve, emptyState, type Employee } from './domain';
import {
  brandPayrollSummary,
  salaryShare,
  salaryShares,
  validateSalaryAssignment,
} from './brandPayroll';
const employee = (): Employee => ({
  code: 'staff',
  name: 'Brand employee',
  active: true,
  manualPayroll: true,
  rates: [
    {
      from: '2026-08-01',
      role: 'Staff',
      dailyMinor: 1000000,
      fixedMonthlyMinor: 1000000,
      bonusEligible: false,
    },
  ],
  aadhaar: false,
  bank: false,
  offerSent: false,
  offerReceived: false,
  brandHistory: [{ from: '2026-08', shares: [{ brandId: 'basickwear', basisPoints: 10000 }] }],
});
function payroll() {
  const s = emptyState();
  s.employees = [employee()];
  s.coverage['2026-09'] = true;
  return approve(s, '2026-09');
}
it('records a 10000 fixed salary against Basickwear without expense duplication', () => {
  const s = payroll();
  const totals = brandPayrollSummary(s, 'basickwear', '', '');
  expect(totals.cost).toBe(1000000);
  expect(totals.outstanding).toBe(1000000);
  expect(s.business?.expenses ?? []).toEqual([]);
});
it('preserves historical approved allocations after an employee changes brands', () => {
  const s = payroll();
  s.employees[0].brandHistory = [
    { from: '2026-08', shares: [{ brandId: 'other', basisPoints: 10000 }] },
  ];
  expect(brandPayrollSummary(s, 'basickwear', '', '').cost).toBe(1000000);
  expect(brandPayrollSummary(s, 'other', '', '').cost).toBe(0);
});
it('uses effective months and splits salary totals exactly', () => {
  const e = employee();
  e.brandHistory!.push({
    from: '2026-10',
    shares: [
      { brandId: 'basickwear', basisPoints: 6000 },
      { brandId: 'other', basisPoints: 4000 },
    ],
  });
  expect(salaryShares(e, '2026-09')).toHaveLength(1);
  const shares = salaryShares(e, '2026-10');
  expect(salaryShare(1000000, shares, 'basickwear')).toBe(600000);
  expect(salaryShare(1, shares, 'basickwear') + salaryShare(1, shares, 'other')).toBe(1);
});
it('separates payroll month costs from actual salary payment dates', () => {
  const s = payroll();
  s.payments = [
    {
      id: 'p',
      month: '2026-09',
      code: 'staff',
      amount: 400000,
      date: '2026-10-08',
      reference: 'bank',
    },
  ];
  const sep = brandPayrollSummary(s, 'basickwear', '2026-09-01', '2026-09-30');
  expect(sep.cost).toBe(1000000);
  expect(sep.paid).toBe(0);
  expect(sep.outstanding).toBe(600000);
  const oct = brandPayrollSummary(s, 'basickwear', '2026-10-01', '2026-10-31');
  expect(oct.cost).toBe(0);
  expect(oct.paid).toBe(400000);
});
it('does not count draft payroll and flags unassigned approved employees', () => {
  const s = emptyState();
  s.employees = [employee()];
  expect(brandPayrollSummary(s, '', '', '').cost).toBe(0);
  s.employees[0].brandHistory = [];
  s.coverage['2026-09'] = true;
  const approved = approve(s, '2026-09');
  expect(brandPayrollSummary(approved, '', '', '').unassigned).toBe(1);
  expect(brandPayrollSummary(approved, 'basickwear', '', '').cost).toBe(0);
});
it('rejects invalid, duplicate or incomplete brand shares', () => {
  for (const shares of [
    [{ brandId: 'a', basisPoints: 9000 }],
    [{ brandId: 'missing', basisPoints: 10000 }],
    [
      { brandId: 'a', basisPoints: 5000 },
      { brandId: 'a', basisPoints: 5000 },
    ],
  ])
    expect(() => validateSalaryAssignment({ from: '2026-10', shares }, ['a'])).toThrow();
});
it('uses dated assignments for older payrolls lacking snapshots', () => {
  const s = payroll();
  delete s.runs[0].lines[0].brandAllocations;
  expect(brandPayrollSummary(s, 'basickwear', '', '').cost).toBe(1000000);
});

it('counts advance recovery in salary cost without treating it as a new cash payment', () => {
  const s = payroll();
  s.runs[0].lines[0].net = 900000;
  s.runs[0].lines[0].advanceRecovery = 100000;
  const totals = brandPayrollSummary(s, 'basickwear', '', '');
  expect(totals.cost).toBe(1000000);
  expect(totals.outstanding).toBe(900000);
  expect(totals.paid).toBe(0);
});
