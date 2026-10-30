import { useEffect, useRef, useState } from 'react';
import { mergeAttendance, monthDates, type State, type Attendance } from './domain';
export const manualStatusLabels: Record<string, string> = {
  P: 'Present',
  HD: 'Half-day',
  A: 'Absent',
  WO: 'Week off',
  L: 'Leave',
  F: 'Failed',
};
export function manualAttendanceStatuses(
  state: State,
  code: string,
  month: string,
): Record<string, string> {
  const recorded = new Map(
    state.attendance
      .filter((a) => a.code === code && a.date.startsWith(month))
      .map((a) => [a.date, a.status]),
  );
  const locked = state.runs.some((run) => run.month === month);
  return Object.fromEntries(
    monthDates(month).map((date) => [date, recorded.get(date) ?? (locked ? '' : 'P')]),
  );
}
export function manualAttendanceOverview(
  month: string,
  statuses: Record<string, string>,
): Record<string, number> {
  const counts: Record<string, number> = { P: 0, HD: 0, A: 0, WO: 0, L: 0, F: 0, unrecorded: 0 };
  for (const date of monthDates(month)) {
    const status = statuses[date];
    if (Object.hasOwn(manualStatusLabels, status)) counts[status]++;
    else counts.unrecorded++;
  }
  return { ...counts, total: monthDates(month).length, payableDays: counts.P + counts.HD * 0.5 };
}
export function saveManualAttendance(
  state: State,
  code: string,
  month: string,
  statuses: Record<string, string>,
): State {
  const employee = state.employees.find((e) => e.code === code && e.manualPayroll);
  if (!employee) throw new Error('Select an employee enabled for manual payroll.');
  if (state.runs.some((r) => r.month === month)) throw new Error('This month is already approved.');
  const rows: Attendance[] = monthDates(month).map((date) => {
    const status = statuses[date];
    if (!['P', 'HD', 'A', 'WO', 'L', 'F'].includes(status))
      throw new Error('Select attendance for every day before saving.');
    const rate = [...employee.rates]
      .sort((a, b) => b.from.localeCompare(a.from))
      .find((r) => r.from <= date);
    if (!rate) throw new Error('Add a wage effective on or before the first day of this month.');
    return {
      code,
      name: employee.name,
      date,
      role: rate.role,
      status,
      payable: status === 'P' ? 1 : status === 'HD' ? 0.5 : 0,
      store: 'Manual',
      primaryStore: 'Manual',
    };
  });
  return mergeAttendance(state, rows, 'Manual attendance');
}
export function attendanceCalendarDays(month: string): (string | null)[] {
  const dates = monthDates(month);
  const offset = new Date(`${month}-01T12:00:00Z`).getUTCDay();
  const cells: (string | null)[] = [...Array(offset).fill(null), ...dates];
  while (cells.length % 7) cells.push(null);
  return cells;
}
export default function ManualAttendance({
  state,
  month,
  busy,
  save,
}: {
  state: State;
  month: string;
  busy: boolean;
  save: (next: State) => Promise<unknown>;
}) {
  const [code, setCode] = useState(''),
    [drafts, setDrafts] = useState<Record<string, Record<string, string>>>({}),
    [error, setError] = useState(''),
    [selectedDate, setSelectedDate] = useState('');
  const dateEditor = useRef<HTMLElement>(null);
  useEffect(() => {
    if (selectedDate) dateEditor.current?.focus({ preventScroll: true });
  }, [selectedDate]);
  const draftKey = JSON.stringify([code, month]);
  const statuses = { ...manualAttendanceStatuses(state, code, month), ...(drafts[draftKey] ?? {}) };
  const overview = manualAttendanceOverview(month, statuses);
  const locked = state.runs.some((r) => r.month === month);
  return (
    <section className="panel">
      <div className="settings-body">
        <h2>Manual attendance</h2>
        <p>
          For employees missing from the report: enable manual payroll in their profile. P = full
          day; HD = half-day; A, WO, L and F (Failed) = unpaid. Fixed monthly salary is unaffected.
        </p>
        <label>
          Employee
          <select
            disabled={busy}
            value={code}
            onChange={(e) => {
              setCode(e.target.value);
              setSelectedDate('');
              setError('');
            }}
          >
            <option value="">Select employee</option>
            {state.employees
              .filter((e) => e.active && e.manualPayroll)
              .map((e) => (
                <option key={e.code} value={e.code}>
                  {e.name} · {e.code}
                </option>
              ))}
          </select>
        </label>
        {code && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setError('');
              try {
                void save(saveManualAttendance(state, code, month, statuses))
                  .then(() => {
                    setDrafts((current) => {
                      const next = { ...current };
                      delete next[draftKey];
                      return next;
                    });
                  })
                  .catch((e) => setError(e instanceof Error ? e.message : String(e)));
              } catch (e) {
                setError(e instanceof Error ? e.message : String(e));
              }
            }}
          >
            <div
              className="manual-attendance-summary"
              role="region"
              aria-label="Selected employee attendance overview"
            >
              <div className="manual-attendance-summary-heading">
                <strong>
                  {state.employees.find((e) => e.code === code)?.name} · {month}
                </strong>
                <span>{overview.total} days</span>
              </div>
              <div className="manual-attendance-counts" aria-live="polite">
                {Object.entries(manualStatusLabels).map(([status, label]) => (
                  <div key={status}>
                    <span>
                      {label} ({status})
                    </span>
                    <strong>{overview[status]}</strong>
                  </div>
                ))}
                <div>
                  <span>Payable days (P + ½ HD)</span>
                  <strong>{overview.payableDays}</strong>
                </div>
                {overview.unrecorded > 0 && (
                  <div>
                    <span>Unrecorded / needs review</span>
                    <strong>{overview.unrecorded}</strong>
                  </div>
                )}
              </div>
              <p>
                {locked
                  ? 'This month is approved. Attendance is locked.'
                  : 'Unrecorded dates default to P. Review absences, leave and week offs before saving. Changes are saved only when you press Save.'}
              </p>
            </div>
            <div className="attendance-calendar-layout">
              <section className="attendance-calendar" aria-label="Monthly attendance calendar">
                <div className="attendance-calendar-heading">
                  <h3>
                    {new Date(`${month}-01T12:00:00Z`).toLocaleDateString('en-IN', {
                      month: 'long',
                      year: 'numeric',
                      timeZone: 'UTC',
                    })}
                  </h3>
                  <span>{locked ? 'Approved · locked' : 'Tap a day to edit'}</span>
                </div>
                <div className="attendance-weekdays" aria-hidden="true">
                  {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
                    <span key={day}>{day}</span>
                  ))}
                </div>
                <div className="attendance-calendar-days">
                  {attendanceCalendarDays(month).map((date, index) =>
                    date ? (
                      <div className="attendance-day-cell" key={date}>
                        <button
                          type="button"
                          className={`attendance-date attendance-status-${statuses[date] || 'empty'}`}
                          disabled={busy || locked}
                          aria-label={`${date}, ${manualStatusLabels[statuses[date]] ?? 'Unrecorded'}`}
                          aria-pressed={selectedDate === date}
                          onClick={() => setSelectedDate(date)}
                        >
                          <span>{Number(date.slice(8))}</span>
                          <small>{statuses[date] || '—'}</small>
                        </button>
                      </div>
                    ) : (
                      <div key={`blank-${index}`} aria-hidden="true" />
                    ),
                  )}
                </div>
                <div className="attendance-calendar-legend">
                  {Object.entries(manualStatusLabels).map(([status, label]) => (
                    <span key={status}>
                      <i className={`attendance-status-${status}`} />
                      {status} · {label}
                    </span>
                  ))}
                  <span>
                    <i className="attendance-status-empty" />
                    Unrecorded
                  </span>
                </div>
              </section>
              {selectedDate && !locked && (
                <section
                  ref={dateEditor}
                  tabIndex={-1}
                  className="attendance-day-editor"
                  aria-label="Edit selected date attendance"
                >
                  <div className="attendance-editor-heading">
                    <div>
                      <span>EDIT ATTENDANCE</span>
                      <h3>
                        {new Date(selectedDate + 'T12:00:00Z').toLocaleDateString('en-IN', {
                          weekday: 'long',
                          day: 'numeric',
                          month: 'long',
                          timeZone: 'UTC',
                        })}
                      </h3>
                    </div>
                    <button
                      type="button"
                      className="icon-button"
                      disabled={busy}
                      aria-label="Close date editor"
                      onClick={() => setSelectedDate('')}
                    >
                      ×
                    </button>
                  </div>
                  <div className="attendance-status-options">
                    {Object.entries(manualStatusLabels).map(([status, label]) => (
                      <button
                        type="button"
                        key={status}
                        disabled={busy}
                        aria-pressed={statuses[selectedDate] === status}
                        onClick={() =>
                          setDrafts((current) => ({
                            ...current,
                            [draftKey]: { ...(current[draftKey] ?? {}), [selectedDate]: status },
                          }))
                        }
                      >
                        <i className={`attendance-status-${status}`} />
                        <span>
                          {label}
                          <small>{status}</small>
                        </span>
                        {statuses[selectedDate] === status && <strong aria-hidden="true">✓</strong>}
                      </button>
                    ))}
                  </div>
                  <p>
                    Choose a status, then tap another date. Press Save manual attendance when you
                    finish.
                  </p>
                </section>
              )}
            </div>
            {error && <p role="alert">{error}</p>}
            <button
              className="primary"
              disabled={busy || state.runs.some((r) => r.month === month)}
            >
              Save manual attendance
            </button>
          </form>
        )}
      </div>
    </section>
  );
}
