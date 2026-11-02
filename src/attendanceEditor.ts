import { mergeAttendance, monthDates, type State, type Attendance } from './domain';
export const attendanceLabels: Record<string, string> = {
  P: 'Present',
  A: 'Absent',
  WO: 'Week off',
  HD: 'Half-day',
  L: 'Leave',
  F: 'Failed',
  'A-R': 'A-R',
  Pending: 'Pending',
};
export function attendanceCounts(rows: Attendance[], month: string) {
  const selected = rows.filter((r) => r.date.startsWith(month));
  const counts: Record<string, number> = Object.fromEntries(
    Object.keys(attendanceLabels).map((s) => [s, 0]),
  );
  for (const row of selected) counts[row.status] = (counts[row.status] ?? 0) + 1;
  return {
    counts,
    unrecorded: monthDates(month).length - new Set(selected.map((r) => r.date)).size,
    payable: selected.reduce((n, r) => n + r.payable, 0),
  };
}
export function correctAttendance(
  state: State,
  code: string,
  date: string,
  status: string,
  payable: number,
  reason: string,
  role: string,
  release = false,
): State {
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
    throw new Error('Choose a valid date on or before today.');
  if (!reason.trim()) throw new Error('Enter a reason for this attendance change.');
  const employee = state.employees.find((e) => e.code === code);
  const old = state.attendance.find((r) => r.code === code && r.date === date);
  const reportPerson = state.attendance.find((r) => r.code === code);
  if (!employee && !reportPerson) throw new Error('Employee not found.');
  if (!role.trim()) throw new Error('Enter the role applicable on this date.');
  if (!Object.hasOwn(attendanceLabels, status))
    throw new Error('Choose a supported attendance status.');
  if (!Number.isFinite(payable) || payable < 0 || payable > 1)
    throw new Error('Payable days must be between 0 and 1.');
  if (status === 'F' && payable !== 0)
    throw new Error('Failed attendance must have zero payable days.');
  const { manualCorrection: previousCorrection, ...original } = old ?? ({} as Attendance);
  const row: Attendance = {
    ...original,
    code,
    date,
    name: old?.name ?? employee?.name ?? reportPerson!.name,
    role: role.trim(),
    status,
    payable,
    store: old?.store ?? 'Manual',
    primaryStore: old?.primaryStore ?? 'Manual',
    ...(!release
      ? { manualCorrection: { reason: reason.trim(), at: new Date().toISOString() } }
      : {}),
  };
  const next = mergeAttendance(state, [row], 'Manual attendance');
  next.imports[next.imports.length - 1].name =
    `${release ? 'Allow future imports' : 'Attendance correction'} · ${code} · ${date} · ${reason.trim()}`;
  return next;
}
