import type { Employee } from './domain';
export type EmployeeExit = {
  lastWorkingDay: string;
  reason: string;
  recordedAt: string;
  finalSalaryMinor?: number;
  rejoinedOn?: string;
  reactivationReason?: string;
  reactivatedAt?: string;
};
export function employedOn(employee: Employee, date: string): boolean {
  const exits = employee.exits ?? [];
  if (!exits.length) return employee.active;
  return !exits.some(
    (exit) =>
      (!exit.lastWorkingDay || date > exit.lastWorkingDay) &&
      (!exit.rejoinedOn || date < exit.rejoinedOn),
  );
}
export function employedInMonth(employee: Employee, month: string): boolean {
  const last = new Date(
    Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0),
  ).getUTCDate();
  return Array.from({ length: last }, (_, i) => `${month}-${String(i + 1).padStart(2, '0')}`).some(
    (date) => employedOn(employee, date),
  );
}
function validateDate(date: string) {
  const parsed = new Date(`${date}T00:00:00Z`);
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    !Number.isFinite(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== date ||
    date > today
  )
    throw new Error('Enter a valid date on or before today.');
}
export function markInactive(
  employee: Employee,
  date: string,
  reason: string,
  finalSalaryMinor?: number,
): Employee {
  if (!employee.active) throw new Error('This employee is already inactive.');
  validateDate(date);
  if (!reason.trim()) throw new Error('Enter a reason for leaving.');
  const last = employee.exits?.at(-1);
  if (last?.rejoinedOn && date < last.rejoinedOn)
    throw new Error('Last working day cannot be before the rejoining date.');
  const rate = [...employee.rates]
    .sort((a, b) => b.from.localeCompare(a.from))
    .find((r) => r.from <= date);
  if (!rate) throw new Error('Last working day cannot be before the first wage date.');
  const fixed = rate.fixedMonthlyMinor !== undefined;
  if (
    fixed &&
    (finalSalaryMinor === undefined ||
      !Number.isSafeInteger(finalSalaryMinor) ||
      finalSalaryMinor < 0)
  )
    throw new Error('Enter the final fixed salary amount, including zero if no salary is due.');
  return {
    ...employee,
    active: false,
    exits: [
      ...(employee.exits ?? []),
      {
        lastWorkingDay: date,
        reason: reason.trim(),
        recordedAt: new Date().toISOString(),
        ...(fixed ? { finalSalaryMinor } : {}),
      },
    ],
  };
}
export function reactivateEmployee(employee: Employee, date: string, reason: string): Employee {
  if (employee.active) throw new Error('This employee is already active.');
  validateDate(date);
  if (!reason.trim()) throw new Error('Enter a reason for reactivation.');
  const exits = [...(employee.exits ?? [])];
  if (!exits.length)
    exits.push({
      lastWorkingDay: '',
      reason: 'Previously inactive; leaving date was not recorded.',
      recordedAt: new Date().toISOString(),
    });
  const last = exits.at(-1)!;
  if (last.rejoinedOn || date <= last.lastWorkingDay)
    throw new Error('Rejoining date must be after the last working day.');
  exits[exits.length - 1] = {
    ...last,
    rejoinedOn: date,
    reactivationReason: reason.trim(),
    reactivatedAt: new Date().toISOString(),
  };
  return { ...employee, active: true, exits };
}
