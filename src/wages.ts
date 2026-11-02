import type { Rate } from './domain';
export type WageCorrection = { at: string; reason: string; before: Rate; after: Rate };
export function correctWage(rates: Rate[], from: string, next: Rate, reason: string) {
  const before = rates.find((r) => r.from === from);
  if (!before) throw new Error('Wage entry no longer exists.');
  if (!reason.trim()) throw new Error('Enter a wage correction reason.');
  if (next.from !== from)
    throw new Error(
      'A correction keeps the original effective date. Add a dated wage for a promotion.',
    );
  const amount = next.fixedMonthlyMinor ?? next.monthlyMinor ?? next.dailyMinor;
  if (!Number.isSafeInteger(amount) || amount <= 0 || !next.role.trim())
    throw new Error('Enter a positive wage and role.');
  if (
    next.monthlyMinor !== undefined &&
    (!Number.isInteger(next.divisor) || next.divisor! < 1 || next.divisor! > 31)
  )
    throw new Error('Use a divisor between 1 and 31.');
  if (next.fixedMonthlyMinor !== undefined && !next.from.endsWith('-01'))
    throw new Error('Fixed monthly wages must begin on the first day.');
  if (next.cappedMonthly && (next.monthlyMinor === undefined || !next.from.endsWith('-01')))
    throw new Error(
      'Capped monthly wages require a monthly amount and must begin on the first day.',
    );
  const correction: WageCorrection = {
    at: new Date().toISOString(),
    reason: reason.trim(),
    before: { ...before },
    after: { ...next },
  };
  return { rates: rates.map((r) => (r.from === from ? { ...next } : r)), correction };
}
