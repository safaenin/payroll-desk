import type { Business } from './expenses';
import { PAYROLL_ROLE_INCLUSIONS } from './config/payroll';
import { recovered, recoveriesFor, type Advance, type Recovery } from './advances';
import type { EmployeeDeletion } from './employeeDeletion';

export type Rate = {
  fixedMonthlyMinor?: number;
  from: string;
  role: string;
  dailyMinor: number;
  bonusEligible: boolean;
  monthlyMinor?: number;
  divisor?: number;
};
export type Employee = {
  manualPayroll?: boolean;
  code: string;
  name: string;
  active: boolean;
  rates: Rate[];
  aadhaar: boolean;
  bank: boolean;
  offerSent: boolean;
  offerReceived: boolean;
};
export type Attendance = {
  code: string;
  name: string;
  date: string;
  role: string;
  status: string;
  payable: number;
  store: string;
  primaryStore: string;
};
export type Adjustment = {
  code: string;
  performance: number;
  other: number;
  deduction: number;
  note: string;
};
export type Line = {
  code: string;
  name: string;
  role: string;
  days: number;
  fullDays: number;
  base: number;
  attendanceBonus: number;
  performance: number;
  other: number;
  deduction: number;
  advanceRecovery?: number;
  advanceRecoveries?: Recovery[];
  net: number;
  issues: string[];
  segments: string[];
};
export type Run = {
  month: string;
  approvedAt: string;
  due: string;
  lines: Line[];
  sourceRevision: number;
  rules: string;
};
export type Payment = {
  id: string;
  month: string;
  code: string;
  amount: number;
  date: string;
  reference: string;
};
export type FileRecord = {
  id: string;
  name: string;
  url: string;
  code: string;
  uploadedAt: string;
  documentType?: string;
  effectiveDate?: string;
  note?: string;
};
export type FileDeletion = {
  id: string;
  requestedAt: string;
  status: 'pending' | 'trashed';
  completedAt?: string;
};
export type ImportLog = {
  id: string;
  name: string;
  at: string;
  added: number;
  updated: number;
  unchanged: number;
  revisions: { before: Attendance; after: Attendance }[];
};
export type State = {
  revision: number;
  business?: Business;
  employees: Employee[];
  attendance: Attendance[];
  adjustments: Record<string, Adjustment[]>;
  runs: Run[];
  payments: Payment[];
  files: FileRecord[];
  imports: ImportLog[];
  coverage: Record<string, boolean>;
  advances?: Advance[];
  fileDeletions?: FileDeletion[];
  employeeDeletion?: EmployeeDeletion | null;
};
export const emptyState = (): State => ({
  revision: 0,
  employees: [],
  attendance: [],
  adjustments: {},
  runs: [],
  payments: [],
  files: [],
  imports: [],
  coverage: {},
  advances: [],
});
export const money = (minor: number) =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2,
  }).format(minor / 100);
export const included = (role: string) =>
  PAYROLL_ROLE_INCLUSIONS.prefixes.some((p) => role.trim().startsWith(p)) ||
  PAYROLL_ROLE_INCLUSIONS.exactRoles.includes(role.trim());
export const key = (r: Attendance) => `${r.code}|${r.date}`;
export const bonusRole = (role: string) =>
  !/shift[ _-]*incharge|security|securiity|house[ _-]*keeping/i.test(role);
export const rateValue = (rate: Rate) =>
  rate.monthlyMinor !== undefined && rate.divisor
    ? rate.monthlyMinor / rate.divisor
    : rate.dailyMinor;
export const rateLabel = (rate: Rate) =>
  rate.fixedMonthlyMinor !== undefined
    ? `${money(rate.fixedMonthlyMinor)}/month fixed`
    : rate.monthlyMinor !== undefined && rate.divisor
      ? `${money(rate.monthlyMinor)} ÷ ${rate.divisor}`
      : money(rate.dailyMinor);
export function dueDate(month: string) {
  const [y, m] = month.split('-').map(Number);
  return `${m === 12 ? y + 1 : y}-${String(m === 12 ? 1 : m + 1).padStart(2, '0')}-08`;
}
export function monthDates(month: string) {
  const [y, m] = month.split('-').map(Number);
  return Array.from(
    { length: new Date(Date.UTC(y, m, 0)).getUTCDate() },
    (_, i) => `${month}-${String(i + 1).padStart(2, '0')}`,
  );
}
export function calculate(state: State, month: string): Line[] {
  const records = state.attendance.filter(
    (a) =>
      a.date.startsWith(month) &&
      !state.employees.some(
        (e) =>
          e.code === a.code && !e.active && e.rates.some((r) => r.fixedMonthlyMinor !== undefined),
      ) &&
      (included(a.role) || state.employees.some((e) => e.code === a.code && e.manualPayroll)),
  );
  const fixedEmployees = state.employees.filter(
    (e) =>
      e.active &&
      [...e.rates]
        .sort((a, b) => b.from.localeCompare(a.from))
        .find((r) => r.from <= monthDates(month).at(-1)!)?.fixedMonthlyMinor !== undefined,
  );
  return [
    ...new Set([
      ...records.map((a) => a.code),
      ...fixedEmployees.map((e) => e.code),
      ...state.employees
        .filter(
          (e) =>
            e.active && e.manualPayroll && e.rates.some((r) => r.from <= monthDates(month).at(-1)!),
        )
        .map((e) => e.code),
    ]),
  ]
    .sort()
    .map((code) => {
      const rows = records.filter((a) => a.code === code);
      const employee = state.employees.find((e) => e.code === code);
      const rates = [...(employee?.rates ?? [])].sort((a, b) => b.from.localeCompare(a.from));
      const issues: string[] = [];
      if (!employee) issues.push('Employee wage profile missing');
      const monthRate = rates.find((r) => r.from <= month + '-01');
      const fixed = monthRate?.fixedMonthlyMinor;
      const monthChanges = rates.filter(
        (r) => r.from > month + '-01' && r.from <= monthDates(month).at(-1)!,
      );
      if (
        monthChanges.some((r) => r.fixedMonthlyMinor !== undefined) ||
        (fixed !== undefined && monthChanges.length)
      )
        issues.push('Fixed monthly wage changes must start on the first day of a month');
      if (fixed === undefined && employee?.manualPayroll && rows.length < monthDates(month).length)
        issues.push('Complete manual attendance for every day of this month');
      let base = 0;
      let eligible = true;
      const segments = new Set<string>();
      for (const row of fixed !== undefined ? [] : rows) {
        const rate = rates.find((r) => r.from <= row.date);
        if (!rate) issues.push(`Wage missing on ${row.date}`);
        else {
          base += row.payable * rateValue(rate);
          eligible &&= rate.bonusEligible && bonusRole(rate.role) && bonusRole(row.role);
          segments.add(`${rate.from}: ${rateLabel(rate)}/day · ${rate.role}`);
        }
        if (row.status === 'Pending') issues.push('Pending attendance');
        if (!['P', 'HD', 'A', 'WO', 'F', 'L', 'A-R', 'Pending'].includes(row.status))
          issues.push(`Unmapped status ${row.status}`);
      }
      const roleKinds = new Set(rows.map((r) => bonusRole(r.role)));
      if (roleKinds.size > 1) issues.push('Review attendance-bonus eligibility across promotion');
      const fullDays = rows.filter((r) => r.status === 'P' && r.payable === 1).length;
      if (fixed !== undefined) {
        base = fixed;
        eligible = false;
        segments.add(
          `${monthRate!.from}: ${money(fixed)}/month fixed — attendance does not reduce salary`,
        );
      }
      const attendanceBonus = eligible && fullDays >= 26 ? 100000 : 0;
      const adj = state.adjustments[month]?.find((a) => a.code === code);
      const performance = adj?.performance ?? 0,
        other = adj?.other ?? 0,
        deduction = adj?.deduction ?? 0;
      base = Math.round(base);
      const advanceRecoveries = recoveriesFor(state, code, month);
      const advanceRecovery = advanceRecoveries.reduce((n, r) => n + r.amount, 0);
      for (const recovery of advanceRecoveries) {
        const advance = state.advances?.find((a) => a.id === recovery.advanceId);
        const alreadyInThisMonth =
          state.runs
            .find((r) => r.month === month)
            ?.lines.flatMap((l) => l.advanceRecoveries ?? [])
            .filter((r) => r.advanceId === recovery.advanceId)
            .reduce((n, r) => n + r.amount, 0) ?? 0;
        if (
          !advance ||
          recovered(state, recovery.advanceId) - alreadyInThisMonth + recovery.amount >
            advance.amount
        )
          issues.push('Advance recovery exceeds outstanding balance');
      }
      const net = base + attendanceBonus + performance + other - deduction - advanceRecovery;
      if (net < 0) issues.push('Deductions exceed earnings');
      return {
        code,
        name: employee?.name ?? rows[0].name,
        role: fixed !== undefined ? monthRate!.role : (rows.at(-1)?.role ?? rates[0]?.role ?? ''),
        days: rows.reduce((n, r) => n + r.payable, 0),
        fullDays,
        base,
        attendanceBonus,
        performance,
        other,
        deduction,
        advanceRecovery,
        advanceRecoveries,
        net,
        issues: [...new Set(issues)],
        segments: [...segments],
      };
    });
}
export function mergeAttendance(state: State, incoming: Attendance[], name: string): State {
  const seen = new Set<string>();
  for (const row of incoming) {
    if (
      state.employees.some((e) => e.code === row.code && e.manualPayroll) &&
      name !== 'Manual attendance'
    )
      throw new Error(
        `${row.code} uses manual payroll. Review its profile before importing attendance for this employee.`,
      );
    if (seen.has(key(row)))
      throw new Error(`Duplicate employee/date in report: ${key(row)}. Resolve before importing.`);
    seen.add(key(row));
  }
  const map = new Map(state.attendance.map((a) => [key(a), a]));
  let added = 0,
    updated = 0,
    unchanged = 0;
  const revisions: ImportLog['revisions'] = [];
  for (const row of incoming) {
    const old = map.get(key(row));
    if (!old) added++;
    else if (JSON.stringify(old) === JSON.stringify(row)) {
      unchanged++;
      continue;
    } else {
      if (old.store !== row.store)
        throw new Error(
          `Conflicting store for ${row.code} on ${row.date}. Review the source before replacing attendance.`,
        );
      updated++;
      revisions.push({ before: old, after: row });
    }
    map.set(key(row), row);
  }
  const coverage = { ...state.coverage };
  for (const row of incoming)
    if (
      !state.attendance.some(
        (a) => key(a) === key(row) && JSON.stringify(a) === JSON.stringify(row),
      )
    )
      coverage[row.date.slice(0, 7)] = false;
  const employees = [...state.employees];
  for (const row of incoming)
    if (included(row.role) && !employees.some((e) => e.code === row.code))
      employees.push({
        code: row.code,
        name: row.name,
        active: true,
        rates: [],
        aadhaar: false,
        bank: false,
        offerSent: false,
        offerReceived: false,
      });
  return {
    ...state,
    employees,
    coverage,
    attendance: [...map.values()].sort(
      (a, b) => a.date.localeCompare(b.date) || a.code.localeCompare(b.code),
    ),
    imports: [
      ...state.imports,
      {
        id: crypto.randomUUID(),
        name,
        at: new Date().toISOString(),
        added,
        updated,
        unchanged,
        revisions,
      },
    ],
  };
}
export function approve(state: State, month: string): State {
  if (state.runs.some((r) => r.month === month))
    throw new Error('This month is already approved. Its snapshot is preserved.');
  const lines = calculate(state, month);
  const missingRecovery = (state.advances ?? []).find(
    (a) => a.schedule.some((i) => i.month === month) && !lines.some((l) => l.code === a.code),
  );
  if (missingRecovery)
    throw new Error(
      `Advance recovery scheduled for ${missingRecovery.code}, but no eligible payroll exists. Reschedule the installment before approval.`,
    );
  if (!lines.length || lines.some((l) => l.issues.length))
    throw new Error('Resolve payroll issues before approval.');
  if (!state.coverage[month]) throw new Error('Confirm month-end attendance coverage first.');
  if (new Date(`${monthDates(month).at(-1)}T23:59:59+05:30`).getTime() >= Date.now())
    throw new Error('The payroll month has not ended yet.');
  return {
    ...state,
    runs: [
      ...state.runs,
      {
        month,
        lines,
        approvedAt: new Date().toISOString(),
        due: dueDate(month),
        sourceRevision: state.revision,
        rules:
          'v2: FR_ imports or explicit manual payroll; payable days × dated wage; fixed monthly wages independent of attendance with no attendance bonus; 26+ full P days = ₹1,000 for eligible attendance-based staff.',
      },
    ],
  };
}
export function addPayment(state: State, payment: Payment): State {
  const line = state.runs
    .find((r) => r.month === payment.month)
    ?.lines.find((l) => l.code === payment.code);
  if (!line) throw new Error('Approve payroll before recording payments.');
  if (!payment.reference.trim() || !payment.date)
    throw new Error('Payment date and reference are required.');
  if (
    state.payments.some(
      (p) =>
        p.id === payment.id ||
        (p.reference.trim() === payment.reference.trim() &&
          p.code === payment.code &&
          p.month === payment.month),
    )
  )
    throw new Error('This payment is already recorded.');
  const paid = state.payments
    .filter((p) => p.code === payment.code && p.month === payment.month)
    .reduce((n, p) => n + p.amount, 0);
  if (
    !Number.isSafeInteger(payment.amount) ||
    payment.amount <= 0 ||
    payment.amount > line.net - paid
  )
    throw new Error('Enter a positive amount no greater than the outstanding balance.');
  return { ...state, payments: [...state.payments, payment] };
}
