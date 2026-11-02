import { it, expect } from 'vitest';
import { correctWage } from './wages';
import { sampleState } from './test-fixtures/payroll';
import { approve, calculate } from './domain';
it('corrects an effective wage with a reason and preserves prior approved amounts', () => {
  const state = approve(sampleState(), '2026-09');
  const e = state.employees[0],
    old = e.rates[0];
  const original = structuredClone(state.runs[0]);
  const result = correctWage(
    e.rates,
    old.from,
    { ...old, dailyMinor: old.dailyMinor + 10000 },
    'Original amount mistyped',
  );
  expect(result.correction.before).toEqual(old);
  expect(result.correction.after.dailyMinor).toBe(old.dailyMinor + 10000);
  expect(e.rates[0]).toEqual(old);
  const updated = {
    ...state,
    employees: state.employees.map((x) =>
      x.code === e.code ? { ...x, rates: result.rates, wageCorrections: [result.correction] } : x,
    ),
  };
  expect(updated.runs[0]).toEqual(original);
  expect(calculate(updated, '2026-09').find((l) => l.code === e.code)!.base).toBeGreaterThan(
    original.lines.find((l) => l.code === e.code)!.base,
  );
  expect(approve(updated, '2026-09', 'Correct wage').runs[0].history![0].lines).toEqual(
    original.lines,
  );
});
it('rejects corrections without reasons, missing entries or changed dates', () => {
  const rate = { from: '2026-09-01', role: 'FR_Packer', dailyMinor: 50000, bonusEligible: true };
  expect(() => correctWage([rate], rate.from, rate, ' ')).toThrow('reason');
  expect(() => correctWage([], rate.from, rate, 'reason')).toThrow('no longer exists');
  expect(() => correctWage([rate], rate.from, { ...rate, from: '2026-09-02' }, 'reason')).toThrow(
    'effective date',
  );
  expect(() => correctWage([rate], rate.from, { ...rate, dailyMinor: -1 }, 'reason')).toThrow(
    'positive',
  );
  expect(() =>
    correctWage([rate], rate.from, { ...rate, monthlyMinor: 1000000, divisor: 0 }, 'reason'),
  ).toThrow('divisor');
});
