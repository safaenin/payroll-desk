import BulkAttendanceEditor from './BulkAttendanceEditor';
import { useState, useRef, useEffect } from 'react';
import { ArrowLeft, ChevronLeft, ChevronRight, Search, X, CalendarDays } from 'lucide-react';
import { attendanceCalendarDays } from './ManualAttendance';
import { attendanceCounts, attendanceLabels, correctAttendance } from './attendanceEditor';
import { type State, type Attendance } from './domain';
import { employedOn } from './employment';
const labelMonth = (month: string) =>
  new Date(`${month}-01T12:00:00Z`).toLocaleDateString('en-IN', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
export default function AttendanceRegister({
  state,
  month,
  busy,
  save,
}: {
  state: State;
  month: string;
  busy: boolean;
  save: (state: State) => Promise<unknown>;
}) {
  const [bulk, setBulk] = useState(false);
  const [selectedDates, setSelectedDates] = useState<string[]>([]);
  const [code, setCode] = useState('');
  const panelRef = useRef<HTMLElement>(null);
  const editorRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (code) panelRef.current?.scrollIntoView({ block: 'start' });
  }, [code]);
  const [calendarMonth, setCalendarMonth] = useState(month);
  const [search, setSearch] = useState('');
  const [date, setDate] = useState('');
  const [status, setStatus] = useState('P');
  const [payable, setPayable] = useState('1');
  const [role, setRole] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState('');
  useEffect(() => {
    if (date && window.innerWidth < 700) editorRef.current?.scrollIntoView({ block: 'start' });
  }, [date]);
  const locked = busy || saving;
  const people = new Map(state.employees.map((e) => [e.code, { code: e.code, name: e.name }]));
  state.attendance
    .filter((a) => a.date.startsWith(month))
    .forEach((a) => {
      if (!people.has(a.code)) people.set(a.code, { code: a.code, name: a.name });
    });
  const employees = [...people.values()]
    .filter((e) => `${e.name} ${e.code}`.toLowerCase().includes(search.trim().toLowerCase()))
    .sort((a, b) => a.name.localeCompare(b.name));
  const person = people.get(code) ?? state.attendance.find((a) => a.code === code);
  const employee = state.employees.find((e) => e.code === code);
  const rows = state.attendance.filter((a) => a.code === code && a.date.startsWith(calendarMonth));
  const overview = attendanceCounts(rows, calendarMonth);
  const selected = rows.find((r) => r.date === date);
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
  function openDay(day: string) {
    const row = rows.find((r) => r.date === day);
    setDate(day);
    setStatus(row?.status ?? 'P');
    setPayable(String(row?.payable ?? 1));
    setReason('');
    setError('');
    setSaved('');
    setRole(
      row?.role ??
        [...(employee?.rates ?? [])]
          .sort((a, b) => b.from.localeCompare(a.from))
          .find((r) => r.from <= day)?.role ??
        '',
    );
  }
  function moveMonth(delta: number) {
    const d = new Date(`${calendarMonth}-01T12:00:00Z`);
    d.setUTCMonth(d.getUTCMonth() + delta);
    setCalendarMonth(d.toISOString().slice(0, 7));
    setSelectedDates([]);
    setDate('');
    setSaved('');
  }
  async function submit(release = false) {
    setError('');
    setSaving(true);
    try {
      await save(
        correctAttendance(state, code, date, status, Number(payable), reason, role, release),
      );
      setSaved('Attendance saved.');
      setDate('');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }
  return (
    <section ref={panelRef} className="panel attendance-register">
      {!code ? (
        <>
          <div className="section-heading">
            <div>
              <h2>Employee attendance</h2>
              <p>{labelMonth(month)} · Select an employee to view or update their calendar.</p>
            </div>
            <span className="attendance-month-chip">
              <CalendarDays size={16} />
              {people.size} employees
            </span>
          </div>
          <div className="attendance-card-toolbar">
            <div className="employee-search-control">
              <Search size={17} />
              <input
                aria-label="Search attendance employees"
                placeholder="Search name or employee code"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              {search && (
                <button aria-label="Clear attendance search" onClick={() => setSearch('')}>
                  <X size={15} />
                </button>
              )}
            </div>
            <span>{employees.length} results</span>
          </div>
          <div className="employee-attendance-cards">
            {employees.map((e) => {
              const summary = attendanceCounts(
                state.attendance.filter((a) => a.code === e.code),
                month,
              );
              return (
                <button
                  className="employee-attendance-card"
                  key={e.code}
                  onClick={() => {
                    setCode(e.code);
                    setCalendarMonth(month);
                    setDate('');
                    setSaved('');
                  }}
                  aria-label={`View attendance for ${e.name}, ${e.code}`}
                >
                  <div className="attendance-card-person">
                    <span className="attendance-card-avatar">
                      {e.name
                        .split(' ')
                        .map((s) => s[0])
                        .slice(0, 2)
                        .join('')}
                    </span>
                    <div>
                      <strong>{e.name}</strong>
                      <small>{e.code}</small>
                    </div>
                    <ChevronRight size={17} />
                  </div>
                  <div className="attendance-card-counts">
                    {['P', 'A', 'WO', 'HD', 'L', 'F', 'A-R', 'Pending'].map((s) => (
                      <div key={s}>
                        <span title={attendanceLabels[s]}>{s}</span>
                        <strong>{summary.counts[s]}</strong>
                      </div>
                    ))}
                  </div>
                  <div className="attendance-card-footer">
                    <span>
                      <strong>{summary.payable}</strong> payable days
                    </span>
                    <span>{summary.unrecorded} unrecorded</span>
                  </div>
                </button>
              );
            })}
          </div>
          {!employees.length && (
            <div className="attendance-empty">
              <CalendarDays size={28} />
              <h3>{people.size ? 'No matching employees' : 'No employee records yet'}</h3>
              <p>
                {people.size
                  ? 'Try another name or code.'
                  : 'Add employees or import an attendance report to start.'}
              </p>
            </div>
          )}
        </>
      ) : (
        <>
          <div className="section-heading attendance-detail-heading">
            <div>
              <button
                className="text-button"
                disabled={locked}
                onClick={() => {
                  setCode('');
                  setBulk(false);
                  setSelectedDates([]);
                  setDate('');
                }}
              >
                <ArrowLeft size={15} />
                All employees
              </button>
              <h2>{person?.name}</h2>
              <p>{code} · Monthly attendance history</p>
            </div>
            <div className="attendance-month-nav">
              <button
                className="icon-button"
                disabled={locked}
                aria-label="Previous attendance month"
                onClick={() => moveMonth(-1)}
              >
                <ChevronLeft size={18} />
              </button>
              <strong>{labelMonth(calendarMonth)}</strong>
              <button
                className="icon-button"
                disabled={locked}
                aria-label="Next attendance month"
                onClick={() => moveMonth(1)}
              >
                <ChevronRight size={18} />
              </button>
            </div>
          </div>
          <div className="attendance-detail-body">
            <div className="attendance-detail-counts">
              {Object.entries(attendanceLabels).map(([s, label]) => (
                <div key={s}>
                  <span>
                    {label} ({s})
                  </span>
                  <strong>{overview.counts[s]}</strong>
                </div>
              ))}
              <div>
                <span>Unrecorded</span>
                <strong>{overview.unrecorded}</strong>
              </div>
              <div>
                <span>Payable days</span>
                <strong>{overview.payable}</strong>
              </div>
            </div>
            {state.runs.some((r) => r.month === calendarMonth) && (
              <p className="attendance-notice">
                This month has approved payroll. Attendance corrections affect it only after you
                approve a payroll revision.
              </p>
            )}
            <div className="bulk-attendance-toolbar">
              <div>
                <strong>{bulk ? 'Select days to update together' : 'Update attendance'}</strong>
                <p>
                  {bulk
                    ? `${selectedDates.length} days selected · One save for all changes`
                    : 'Edit one date, or select multiple days and save once.'}
                </p>
              </div>
              <div className="bulk-attendance-actions">
                {bulk && (
                  <button
                    className="text-button"
                    disabled={locked || !selectedDates.length}
                    onClick={() => setSelectedDates([])}
                  >
                    Clear selection
                  </button>
                )}
                <button
                  className="secondary"
                  disabled={locked}
                  onClick={() => {
                    setBulk(!bulk);
                    setSelectedDates([]);
                    setDate('');
                    setSaved('');
                  }}
                >
                  {bulk ? 'Cancel bulk edit' : 'Edit multiple days'}
                </button>
              </div>
            </div>
            <div className="attendance-calendar-layout">
              <section
                className="attendance-calendar"
                aria-label="Employee monthly attendance calendar"
              >
                <div className="attendance-calendar-heading">
                  <h3>{labelMonth(calendarMonth)}</h3>
                  <span>
                    {bulk ? 'Tap dates to select or deselect' : 'Select a date to add or edit'}
                  </span>
                </div>
                <div className="attendance-weekdays" aria-hidden="true">
                  {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
                    <span key={d}>{d}</span>
                  ))}
                </div>
                <div className="attendance-calendar-days">
                  {attendanceCalendarDays(calendarMonth).map((day, index) => {
                    const row = rows.find((r) => r.date === day);
                    return day ? (
                      <div className="attendance-day-cell" key={day}>
                        <button
                          className={`attendance-date attendance-status-${row?.status ?? 'empty'}`}
                          disabled={locked || day > today}
                          aria-label={`${day}, ${row ? (attendanceLabels[row.status] ?? row.status) : 'Unrecorded'}`}
                          aria-pressed={bulk ? selectedDates.includes(day) : day === date}
                          onClick={() =>
                            bulk
                              ? setSelectedDates((dates) =>
                                  dates.includes(day)
                                    ? dates.filter((d) => d !== day)
                                    : [...dates, day],
                                )
                              : openDay(day)
                          }
                        >
                          <span>
                            {Number(day.slice(8))}
                            {row?.manualCorrection && <sup title="Manual correction">*</sup>}
                          </span>
                          <small>{row?.status ?? '—'}</small>
                        </button>
                      </div>
                    ) : (
                      <div key={index} aria-hidden="true" />
                    );
                  })}
                </div>
                <div className="attendance-calendar-legend">
                  {Object.entries(attendanceLabels).map(([s, label]) => (
                    <span key={s}>
                      <i className={`attendance-status-${s}`} />
                      {s} · {label}
                    </span>
                  ))}
                  <span>— Unrecorded</span>
                  <span>* Manual correction</span>
                </div>
              </section>
              {bulk ? (
                <BulkAttendanceEditor
                  state={state}
                  code={code}
                  dates={selectedDates}
                  locked={locked}
                  save={async (next) => {
                    setSaving(true);
                    try {
                      return await save(next);
                    } finally {
                      setSaving(false);
                    }
                  }}
                  onSaved={() => {
                    setSaved(`${selectedDates.length} attendance days saved together.`);
                    setSelectedDates([]);
                    setBulk(false);
                  }}
                />
              ) : date ? (
                <form
                  ref={editorRef}
                  className="attendance-day-editor"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void submit();
                  }}
                >
                  <div className="attendance-editor-heading">
                    <div>
                      <span>{selected ? 'EDIT ATTENDANCE' : 'ADD ATTENDANCE'}</span>
                      <h3>
                        {new Date(`${date}T12:00:00Z`).toLocaleDateString('en-IN', {
                          day: 'numeric',
                          month: 'long',
                          weekday: 'short',
                          timeZone: 'UTC',
                        })}
                      </h3>
                    </div>
                    <button
                      type="button"
                      className="icon-button"
                      disabled={locked}
                      aria-label="Close attendance editor"
                      onClick={() => setDate('')}
                    >
                      <X size={17} />
                    </button>
                  </div>
                  {selected && (
                    <p>
                      Saved: {selected.status} · {selected.payable} payable · {selected.role}
                    </p>
                  )}
                  <label>
                    Status
                    <select
                      aria-label="Attendance status"
                      disabled={locked}
                      value={status}
                      onChange={(e) => {
                        setStatus(e.target.value);
                        setPayable(
                          e.target.value === 'P' ? '1' : e.target.value === 'HD' ? '0.5' : '0',
                        );
                      }}
                    >
                      {Object.entries(attendanceLabels).map(([s, l]) => (
                        <option key={s} value={s}>
                          {s} — {l}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Payable days
                    <input
                      aria-label="Attendance payable days"
                      type="number"
                      min="0"
                      max="1"
                      step="0.01"
                      required
                      disabled={locked}
                      value={payable}
                      onChange={(e) => setPayable(e.target.value)}
                    />
                  </label>
                  <label>
                    Role on this date
                    <input
                      required
                      disabled={locked}
                      value={role}
                      onChange={(e) => setRole(e.target.value)}
                    />
                  </label>
                  <label>
                    Reason for change
                    <textarea
                      required
                      rows={2}
                      disabled={locked}
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      placeholder="e.g. Attendance confirmed by manager"
                    />
                  </label>
                  {employee && !employedOn(employee, date) && (
                    <p className="attendance-notice">
                      This date is outside active employment. The record will be kept but excluded
                      from payroll.
                    </p>
                  )}
                  {selected?.manualCorrection && (
                    <p>Last correction: {selected.manualCorrection.reason}</p>
                  )}
                  <p>
                    Manual corrections are kept on later imports. Payable values come from
                    muster_payable; review before saving.
                  </p>
                  {error && (
                    <p className="issue" role="alert">
                      {error}
                    </p>
                  )}
                  <button className="primary" disabled={locked}>
                    {saving ? 'Saving…' : 'Save attendance'}
                  </button>
                  {selected?.manualCorrection && (
                    <button
                      type="button"
                      className="secondary"
                      disabled={locked || !reason.trim()}
                      onClick={() => void submit(true)}
                    >
                      Allow future imports for this date
                    </button>
                  )}
                </form>
              ) : (
                <aside className="attendance-select-day">
                  <CalendarDays size={28} />
                  <h3>Select a date</h3>
                  <p>
                    View its saved attendance or add a missing record. Nothing changes until you
                    save.
                  </p>
                </aside>
              )}
            </div>
            {saved && (
              <p role="status" className="attendance-saved">
                {saved}
              </p>
            )}
          </div>
        </>
      )}
    </section>
  );
}
