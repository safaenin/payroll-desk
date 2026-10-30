import { expect, it } from 'vitest';
import { calculate, emptyState, monthDates, approve, mergeAttendance } from './domain';
import { saveManualAttendance } from './ManualAttendance';
function fixture(fixed = false) {
  const s = emptyState();
  s.employees.push({
    code: 'SE-1',
    name: 'Staff',
    active: true,
    manualPayroll: true,
    rates: [
      {
        from: '2026-09-01',
        role: 'Assistant',
        dailyMinor: 50000,
        bonusEligible: !fixed,
        ...(fixed ? { fixedMonthlyMinor: 1000000 } : {}),
      },
    ],
    aadhaar: false,
    bank: false,
    offerSent: false,
    offerReceived: false,
  });
  return s;
}
it('pays 10000 without attendance, with deductions and advance recoveries', () => {
  const s = fixture(true);
  s.adjustments['2026-09'] = [
    { code: 'SE-1', performance: 50000, other: 0, deduction: 10000, note: '' },
  ];
  s.advances = [
    {
      id: 'a',
      code: 'SE-1',
      amount: 200000,
      paidOn: '2026-08-01',
      createdAt: 'now',
      reference: '',
      note: '',
      schedule: [{ month: '2026-09', amount: 100000 }],
    },
  ];
  const line = calculate(s, '2026-09')[0];
  expect(line).toMatchObject({
    base: 1000000,
    attendanceBonus: 0,
    net: 940000,
    advanceRecovery: 100000,
    issues: [],
  });
  expect(calculate(s, '2026-08')).toEqual([]);
  s.coverage['2026-09'] = true;
  expect(approve(s, '2026-09').runs[0].lines[0]).toEqual({ ...line, brandAllocations: [] });
});
it('pays manually entered non-FR days, counts half-days only toward base', () => {
  const s = saveManualAttendance(
    fixture(),
    'SE-1',
    '2026-09',
    Object.fromEntries(
      monthDates('2026-09').map((d, i) => [d, i < 26 ? 'P' : i === 26 ? 'HD' : 'A']),
    ),
  );
  expect(calculate(s, '2026-09')[0]).toMatchObject({
    base: 1325000,
    fullDays: 26,
    days: 26.5,
    attendanceBonus: 100000,
    issues: [],
  });
  expect(s.coverage['2026-09']).toBe(false);
  expect(() => mergeAttendance(s, [s.attendance[0]], 'report.xlsx')).toThrow('manual payroll');
});
it('blocks incomplete manual attendance and approved-month edits', () => {
  const s = fixture();
  expect(calculate(s, '2026-09')[0].issues).toContain(
    'Complete manual attendance for every day of this month',
  );
  expect(() => saveManualAttendance(s, 'SE-1', '2026-09', {})).toThrow('every day');
  let complete = saveManualAttendance(
    s,
    'SE-1',
    '2026-09',
    Object.fromEntries(monthDates('2026-09').map((d) => [d, 'P'])),
  );
  complete.coverage['2026-09'] = true;
  complete = approve(complete, '2026-09');
  expect(() => saveManualAttendance(complete, 'SE-1', '2026-09', {})).toThrow('approved');
});
it('fixed salary remains full with absences and disables attendance bonus', () => {
  const s = saveManualAttendance(
    fixture(true),
    'SE-1',
    '2026-09',
    Object.fromEntries(monthDates('2026-09').map((d) => [d, 'A'])),
  );
  expect(calculate(s, '2026-09')[0]).toMatchObject({
    base: 1000000,
    attendanceBonus: 0,
    net: 1000000,
    issues: [],
  });
  s.employees[0].active = false;
  expect(calculate({ ...s, attendance: [] }, '2026-09')).toEqual([]);
});
it('blocks mid-month changes involving fixed pay', () => {
  const s = fixture(true);
  s.employees[0].rates.push({
    from: '2026-09-15',
    role: 'Assistant',
    dailyMinor: 100,
    bonusEligible: false,
  });
  expect(calculate(s, '2026-09')[0].issues).toContain(
    'Fixed monthly wage changes must start on the first day of a month',
  );
});

it('defaults unsaved manual dates to Present and preserves existing attendance', async () => {
  const { manualAttendanceStatuses, manualAttendanceOverview } = await import('./ManualAttendance');
  const s = fixture();
  s.attendance = [
    {
      code: 'SE-1',
      name: 'Staff',
      date: '2026-09-02',
      role: 'Assistant',
      status: 'A',
      payable: 0,
      store: 'Manual',
      primaryStore: 'Manual',
    },
  ];
  const defaults = manualAttendanceStatuses(s, 'SE-1', '2026-09');
  expect(defaults['2026-09-01']).toBe('P');
  expect(defaults['2026-09-02']).toBe('A');
  expect(manualAttendanceOverview('2026-09', defaults)).toMatchObject({
    P: 29,
    A: 1,
    total: 30,
    payableDays: 29,
  });
  expect(s.attendance).toHaveLength(1);
});
it('counts every status and half-days in the selected month only', async () => {
  const { manualAttendanceOverview } = await import('./ManualAttendance');
  const statuses = Object.fromEntries(monthDates('2026-02').map((date) => [date, 'P']));
  Object.assign(statuses, {
    '2026-02-01': 'HD',
    '2026-02-02': 'A',
    '2026-02-03': 'WO',
    '2026-02-04': 'L',
    '2026-01-01': 'A',
  });
  expect(manualAttendanceOverview('2026-02', statuses)).toMatchObject({
    P: 24,
    HD: 1,
    A: 1,
    WO: 1,
    L: 1,
    total: 28,
    payableDays: 24.5,
  });
});
it('does not invent Present records for approved months or reuse another employee month', async () => {
  const { manualAttendanceStatuses, manualAttendanceOverview } = await import('./ManualAttendance');
  const s = fixture(true);
  s.coverage['2026-09'] = true;
  const approved = approve(s, '2026-09');
  expect(
    manualAttendanceOverview('2026-09', manualAttendanceStatuses(approved, 'SE-1', '2026-09'))
      .unrecorded,
  ).toBe(30);
  expect(
    Object.values(manualAttendanceStatuses(s, 'other', '2026-10')).filter((v) => v === 'P'),
  ).toHaveLength(31);
});

it('aligns calendar dates with Sunday-first weekdays and complete weeks', async () => {
  const { attendanceCalendarDays } = await import('./ManualAttendance');
  const october = attendanceCalendarDays('2026-10');
  expect(october.slice(0, 4)).toEqual([null, null, null, null]);
  expect(october[4]).toBe('2026-10-01');
  expect(october.filter(Boolean)).toHaveLength(31);
  expect(october.length % 7).toBe(0);
  expect(attendanceCalendarDays('2026-02')[0]).toBe('2026-02-01');
  expect(attendanceCalendarDays('2024-02').filter(Boolean)).toHaveLength(29);
});

it('treats Failed as unpaid and excludes it from full present days and bonus', async () => {
  const { manualAttendanceStatuses, manualAttendanceOverview } = await import('./ManualAttendance');
  const s = fixture();
  const statuses = manualAttendanceStatuses(s, 'SE-1', '2026-09');
  for (const date of monthDates('2026-09').slice(0, 5)) statuses[date] = 'F';
  const result = saveManualAttendance(s, 'SE-1', '2026-09', statuses);
  expect(result.attendance.filter((a) => a.status === 'F').every((a) => a.payable === 0)).toBe(
    true,
  );
  expect(manualAttendanceOverview('2026-09', statuses)).toMatchObject({
    F: 5,
    P: 25,
    payableDays: 25,
  });
  expect(calculate(result, '2026-09')[0]).toMatchObject({
    base: 1250000,
    fullDays: 25,
    attendanceBonus: 0,
    issues: [],
  });
});
