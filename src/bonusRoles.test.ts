import { expect, it } from 'vitest';
import { roleEarnsBonus, validateBonusExclusions } from './bonusRoles';
import { approve, calculate, promotionReviewKey } from './domain';
import { sampleState } from './test-fixtures/payroll';
it('preserves defaults and accepts configurable exclusions including an empty list', () => {
  expect(roleEarnsBonus('FR_Shift Incharge')).toBe(false);
  expect(roleEarnsBonus('FR_Securiity')).toBe(false);
  expect(roleEarnsBonus('FR_House-Keeping')).toBe(false);
  expect(roleEarnsBonus('FR_Packer')).toBe(true);
  expect(roleEarnsBonus('FR_Packer', ['packer'])).toBe(false);
  expect(roleEarnsBonus('FR_Security', [])).toBe(true);
  expect(() => validateBonusExclusions(['Security', 'FR_security'])).toThrow('already listed');
  expect(() => validateBonusExclusions(['---'])).toThrow('role name');
});
it('changes draft bonuses without changing approved snapshots or bypassing employee eligibility', () => {
  const state = sampleState();
  const original = approve(state, '2026-09');
  const before = original.runs[0].lines.find((l) => l.code === 'DEMO001')!;
  expect(before.attendanceBonus).toBe(100000);
  const changed = { ...original, attendanceBonusExclusions: ['Packer'] };
  expect(calculate(changed, '2026-09').find((l) => l.code === 'DEMO001')!.attendanceBonus).toBe(0);
  expect(changed.runs[0].lines.find((l) => l.code === 'DEMO001')!.attendanceBonus).toBe(100000);
  expect(promotionReviewKey(changed, '2026-09', 'DEMO001')).not.toBe(
    promotionReviewKey(original, '2026-09', 'DEMO001'),
  );
  const restored = { ...changed, attendanceBonusExclusions: [] };
  expect(calculate(restored, '2026-09').find((l) => l.code === 'DEMO001')!.attendanceBonus).toBe(
    100000,
  );
  restored.employees[0].rates[0].bonusEligible = false;
  expect(calculate(restored, '2026-09').find((l) => l.code === 'DEMO001')!.attendanceBonus).toBe(0);
});
it('matches complete role names in exact mode without merging prefixes or punctuation', () => {
  expect(roleEarnsBonus(' FR_SECURITY ', ['FR_Security'], true)).toBe(false);
  expect(roleEarnsBonus('FR_Security Guard', ['FR_Security'], true)).toBe(true);
  expect(roleEarnsBonus('Security', ['FR_Security'], true)).toBe(true);
  expect(roleEarnsBonus('FR_Shift Incharge', ['FR_Shift-Incharge'], true)).toBe(true);
  expect(validateBonusExclusions(['Security', 'FR_Security'], true)).toHaveLength(2);
  expect(() => validateBonusExclusions(['FR_Security', ' fr_security '], true)).toThrow(
    'already listed',
  );
});
