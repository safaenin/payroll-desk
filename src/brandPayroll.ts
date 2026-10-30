import type { Employee, State } from './domain';
export type SalaryBrandShare = { brandId: string; basisPoints: number };
export type SalaryBrandAssignment = { from: string; shares: SalaryBrandShare[] };
export function salaryShares(employee: Employee | undefined, month: string): SalaryBrandShare[] {
  return (
    [...(employee?.brandHistory ?? [])]
      .sort((a, b) => b.from.localeCompare(a.from))
      .find((a) => a.from <= month)?.shares ?? []
  );
}
export function validateSalaryAssignment(assignment: SalaryBrandAssignment, brandIds: string[]) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(assignment.from))
    throw new Error('Choose a valid effective month.');
  const shares = assignment.shares;
  if (
    !shares.length ||
    new Set(shares.map((a) => a.brandId)).size !== shares.length ||
    shares.some(
      (a) =>
        !brandIds.includes(a.brandId) || !Number.isInteger(a.basisPoints) || a.basisPoints <= 0,
    ) ||
    shares.reduce((n, a) => n + a.basisPoints, 0) !== 10000
  )
    throw new Error('Choose unique brands and percentages that add up to 100%.');
}
export function salaryShare(value: number, shares: SalaryBrandShare[], brand: string) {
  if (!brand) return value;
  let cumulative = 0;
  for (const share of shares) {
    const before = Math.round((value * cumulative) / 10000);
    cumulative += share.basisPoints;
    if (share.brandId === brand) return Math.round((value * cumulative) / 10000) - before;
  }
  return 0;
}
export function brandPayrollSummary(state: State, brand: string, from: string, to: string) {
  const within = (date: string) => (!from || date >= from) && (!to || date <= to);
  const rows = state.runs.flatMap((run) =>
    run.lines.map((line) => {
      const shares =
        line.brandAllocations ??
        salaryShares(
          state.employees.find((e) => e.code === line.code),
          run.month,
        );
      const payments = state.payments.filter((p) => p.month === run.month && p.code === line.code);
      const paid = payments.reduce((n, p) => n + p.amount, 0);
      const [year, month] = run.month.split('-').map(Number);
      const date = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
      return {
        month: run.month,
        date,
        code: line.code,
        name: line.name,
        shares,
        cost: salaryShare(line.net + (line.advanceRecovery ?? 0), shares, brand),
        net: salaryShare(line.net, shares, brand),
        paid: salaryShare(paid, shares, brand),
        outstanding: salaryShare(line.net, shares, brand) - salaryShare(paid, shares, brand),
        payments,
      };
    }),
  );
  const selected = rows.filter(
    (r) => within(r.date) && (!brand || r.shares.some((a) => a.brandId === brand)),
  );
  let paid = 0;
  for (const row of rows) {
    let cumulative = 0;
    for (const p of row.payments) {
      const before = salaryShare(cumulative, row.shares, brand);
      cumulative += p.amount;
      if (within(p.date)) paid += salaryShare(cumulative, row.shares, brand) - before;
    }
  }
  return {
    rows: selected,
    cost: selected.reduce((n, r) => n + r.cost, 0),
    paid,
    outstanding: selected.reduce((n, r) => n + r.outstanding, 0),
    unassigned: rows.filter((r) => within(r.date) && !r.shares.length).length,
  };
}
