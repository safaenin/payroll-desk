import { describe, expect, it } from 'vitest';
import { recovered, saveAdvance, type Advance } from './advances';
import { approve, calculate, emptyState, monthDates, type State } from './domain';
const advance = (): Advance => ({
  id: 'advance-1',
  code: 'E1',
  amount: 400000,
  paidOn: '2026-06-15',
  reference: 'BANK-A1',
  note: 'Salary advance',
  createdAt: '2026-06-15T10:00:00Z',
  schedule: [
    { month: '2026-07', amount: 200000 },
    { month: '2026-08', amount: 200000 },
  ],
});
function fixture(): State {
  const s = emptyState();
  s.employees = [
    {
      code: 'E1',
      name: 'Example',
      active: true,
      aadhaar: false,
      bank: true,
      offerSent: false,
      offerReceived: false,
      rates: [{ from: '2026-01-01', role: 'FR_Packer', dailyMinor: 50000, bonusEligible: true }],
    },
  ];
  for (const month of ['2026-07', '2026-08', '2026-09']) {
    s.coverage[month] = true;
    s.attendance.push(
      ...monthDates(month)
        .slice(0, 26)
        .map((date) => ({
          code: 'E1',
          name: 'Example',
          date,
          role: 'FR_Packer',
          status: 'P',
          payable: 1,
          store: 'A',
          primaryStore: 'A',
        })),
    );
  }
  return s;
}
describe('employee advances', () => {
  it('recovers a 4,000 advance as 2,000 in each of two months', () => {
    let s = saveAdvance(fixture(), advance());
    expect(recovered(s, 'advance-1')).toBe(0);
    expect(calculate(s, '2026-07')[0]).toMatchObject({
      advanceRecovery: 200000,
      net: 1200000,
      deduction: 0,
    });
    expect(recovered(s, 'advance-1')).toBe(0); // merely calculating a draft does not recover it
    s = approve(s, '2026-07');
    expect(recovered(s, 'advance-1')).toBe(200000);
    s = approve(s, '2026-08');
    expect(recovered(s, 'advance-1')).toBe(400000);
    expect(calculate(s, '2026-09')[0].advanceRecovery).toBe(0);
    expect(() => approve(s, '2026-08')).toThrow('already approved');
  });
  it('allows full recovery in one month and keeps other deductions separate', () => {
    const s = saveAdvance(fixture(), {
      ...advance(),
      schedule: [{ month: '2026-07', amount: 400000 }],
    });
    s.adjustments['2026-07'] = [
      { code: 'E1', performance: 0, other: 0, deduction: 50000, note: 'Other deduction' },
    ];
    expect(calculate(s, '2026-07')[0]).toMatchObject({
      deduction: 50000,
      advanceRecovery: 400000,
      net: 950000,
    });
  });
  it('supports unscheduled balances and multiple advances for an employee', () => {
    let s = saveAdvance(fixture(), { ...advance(), schedule: [] });
    s = saveAdvance(s, {
      ...advance(),
      id: 'second',
      reference: 'BANK-A2',
      amount: 50000,
      schedule: [{ month: '2026-07', amount: 50000 }],
    });
    expect(calculate(s, '2026-07')[0].advanceRecovery).toBe(50000);
    expect(recovered(s, 'advance-1')).toBe(0);
  });
  it('rejects duplicate disbursements, excessive installments and repeated months', () => {
    const s = saveAdvance(fixture(), advance());
    expect(() => saveAdvance(s, { ...advance(), id: 'duplicate' })).toThrow('already exists');
    expect(() =>
      saveAdvance(fixture(), { ...advance(), schedule: [{ month: '2026-07', amount: 500000 }] }),
    ).toThrow('exceed');
    expect(() =>
      saveAdvance(fixture(), {
        ...advance(),
        schedule: [
          { month: '2026-07', amount: 100000 },
          { month: '2026-07', amount: 100000 },
        ],
      }),
    ).toThrow('one installment');
  });
  it('locks issued details and approved recoveries but permits rescheduling the remainder', () => {
    let s = approve(saveAdvance(fixture(), advance()), '2026-07');
    expect(() => saveAdvance(s, { ...advance(), amount: 500000 })).toThrow('issued advance');
    expect(() =>
      saveAdvance(s, { ...advance(), schedule: [{ month: '2026-08', amount: 400000 }] }),
    ).toThrow('locked');
    s = saveAdvance(s, {
      ...advance(),
      schedule: [
        { month: '2026-07', amount: 200000 },
        { month: '2026-09', amount: 200000 },
      ],
    });
    expect(recovered(s, 'advance-1')).toBe(200000);
    expect(calculate(s, '2026-08')[0].advanceRecovery).toBe(0);
    expect(calculate(s, '2026-09')[0].advanceRecovery).toBe(200000);
    expect(s.runs[0].lines[0].advanceRecovery).toBe(200000);
  });
  it('blocks approval when recovery exceeds earnings', () => {
    const s = saveAdvance(fixture(), {
      ...advance(),
      amount: 2000000,
      schedule: [{ month: '2026-07', amount: 2000000 }],
    });
    expect(calculate(s, '2026-07')[0].issues).toContain('Deductions exceed earnings');
    expect(() => approve(s, '2026-07')).toThrow('Resolve payroll issues');
  });
  it('blocks a scheduled recovery without eligible payroll instead of losing it', () => {
    const s = saveAdvance(fixture(), advance());
    s.attendance = s.attendance.filter((a) => !a.date.startsWith('2026-07'));
    expect(() => approve(s, '2026-07')).toThrow('no eligible payroll');
    expect(recovered(s, 'advance-1')).toBe(0);
  });
  it('cannot schedule a new recovery into an already approved month', () => {
    const s = approve(fixture(), '2026-07');
    expect(() => saveAdvance(s, advance())).toThrow('approved payroll');
  });
  it('reads legacy records without advances or recovery snapshot fields', () => {
    const s = fixture();
    delete s.advances;
    s.runs.push({
      month: '2026-06',
      due: '2026-07-08',
      approvedAt: '2026-07-01',
      sourceRevision: 0,
      rules: 'v1',
      lines: [],
    });
    expect(recovered(s, 'missing')).toBe(0);
    expect(calculate(s, '2026-07')[0].advanceRecovery).toBe(0);
  });
  it('rejects invalid payment dates and a recovery before disbursement', () => {
    expect(() => saveAdvance(fixture(), { ...advance(), paidOn: '2026-02-30' })).toThrow(
      'valid advance payment date',
    );
    expect(() =>
      saveAdvance(fixture(), { ...advance(), schedule: [{ month: '2026-05', amount: 400000 }] }),
    ).toThrow('on or after');
  });
});
