import { useState } from 'react';
import { attendanceLabels, correctAttendanceDays } from './attendanceEditor';
import type { State } from './domain';
import { employedOn } from './employment';
export default function BulkAttendanceEditor({
  state,
  code,
  dates,
  locked,
  save,
  onSaved,
}: {
  state: State;
  code: string;
  dates: string[];
  locked: boolean;
  save: (state: State) => Promise<unknown>;
  onSaved: () => void;
}) {
  const [status, setStatus] = useState('P');
  const [payable, setPayable] = useState('1');
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const employee = state.employees.find((e) => e.code === code);
  return (
    <form
      className="attendance-day-editor"
      aria-label="Update selected attendance days"
      onSubmit={async (e) => {
        e.preventDefault();
        setError('');
        setSaving(true);
        try {
          await save(correctAttendanceDays(state, code, dates, status, Number(payable), reason));
          onSaved();
        } catch (error) {
          setError((error as Error).message);
        } finally {
          setSaving(false);
        }
      }}
    >
      <div className="attendance-editor-heading">
        <div>
          <span>BULK ATTENDANCE</span>
          <h3>{dates.length} days selected</h3>
        </div>
      </div>
      <p>
        Select dates in the calendar. The status and payable value below apply to every selected
        day.
      </p>
      {dates.length > 0 && (
        <p className="bulk-attendance-dates">
          Dates:{' '}
          {[...dates]
            .sort()
            .map((d) => Number(d.slice(-2)))
            .join(', ')}
        </p>
      )}
      <label>
        Status
        <select
          aria-label="Bulk attendance status"
          disabled={locked || saving}
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPayable(e.target.value === 'P' ? '1' : e.target.value === 'HD' ? '0.5' : '0');
          }}
        >
          {Object.entries(attendanceLabels).map(([s, label]) => (
            <option key={s} value={s}>
              {s} — {label}
            </option>
          ))}
        </select>
      </label>
      <label>
        Payable days per date
        <input
          type="number"
          min="0"
          max="1"
          step="0.01"
          required
          disabled={locked || saving}
          value={payable}
          onChange={(e) => setPayable(e.target.value)}
        />
      </label>
      <label>
        Reason for these changes
        <textarea
          required
          rows={3}
          disabled={locked || saving}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="e.g. Attendance confirmed by manager"
        />
      </label>
      <p>
        Each date keeps its existing role, or uses its dated employee role for a missing record.
        Corrections are protected from later imports.
      </p>
      {employee && dates.some((d) => !employedOn(employee, d)) && (
        <p className="attendance-notice">
          Some selected dates are outside active employment. Those records will be excluded from
          payroll.
        </p>
      )}
      {error && (
        <p className="issue" role="alert">
          {error}
        </p>
      )}
      <button className="primary" disabled={locked || saving || !dates.length}>
        {saving ? 'Saving all changes…' : `Save ${dates.length} days together`}
      </button>
    </form>
  );
}
