import { useState } from 'react';
import { money, type Employee, type State } from './domain';
import { markInactive, reactivateEmployee } from './employment';
import { recovered } from './advances';
export default function EmployeeStatusForm({
  employee,
  state,
  busy,
  onSave,
}: {
  employee: Employee;
  state: State;
  busy: boolean;
  onSave: (employee: Employee) => Promise<unknown>;
}) {
  const [date, setDate] = useState(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Kolkata',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date()),
  );
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const [amount, setAmount] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const fixed =
    [...employee.rates].sort((a, b) => b.from.localeCompare(a.from)).find((r) => r.from <= date)
      ?.fixedMonthlyMinor !== undefined;
  const advances = (state.advances ?? [])
    .filter((a) => a.code === employee.code)
    .reduce((n, a) => n + a.amount - recovered(state, a.id), 0);
  const paid = state.payments
    .filter((p) => p.code === employee.code && !p.voidedAt)
    .reduce((n, p) => n + p.amount, 0);
  const due =
    state.runs.reduce(
      (n, r) => n + r.lines.filter((l) => l.code === employee.code).reduce((v, l) => v + l.net, 0),
      0,
    ) - paid;
  return (
    <form
      className="employee-status-form"
      onSubmit={async (e) => {
        e.preventDefault();
        setError('');
        setSaving(true);
        try {
          if (reason === 'Other' && !note.trim())
            throw new Error('Describe the reason for leaving.');
          const detail = reason + (note.trim() ? ` — ${note.trim()}` : '');
          const updated = employee.active
            ? markInactive(
                employee,
                date,
                detail,
                amount.trim() ? Math.round(Number(amount) * 100) : undefined,
              )
            : reactivateEmployee(employee, date, note);
          await onSave(updated);
        } catch (e) {
          setError((e as Error).message);
        } finally {
          setSaving(false);
        }
      }}
    >
      <div className="employee-status-identity">
        <strong>{employee.name}</strong>
        <span>
          {employee.code} · {employee.active ? 'Active' : 'Inactive'}
        </span>
      </div>
      <p className="employee-status-help">
        {employee.active
          ? 'Keep this employee’s complete history while ending their active employment.'
          : 'Start a new active employment period using the same employee record. Previous exit details are retained.'}
      </p>
      <div className="form-grid">
        <label>
          {employee.active ? 'Last working day' : 'Rejoining date'}
          <input
            type="date"
            required
            value={date}
            disabled={busy || saving}
            onChange={(e) => setDate(e.target.value)}
          />
        </label>
        {employee.active && (
          <label>
            Reason for leaving
            <select
              required
              value={reason}
              disabled={busy || saving}
              onChange={(e) => setReason(e.target.value)}
            >
              <option value="">Select a reason</option>
              {[
                'Resigned',
                'Employment ended by company',
                'Contract ended',
                'Transferred out',
                'Other',
              ].map((r) => (
                <option key={r}>{r}</option>
              ))}
            </select>
          </label>
        )}
      </div>
      <label>
        {employee.active ? 'Notes' : 'Reason for reactivation'}
        <textarea
          rows={3}
          required={!employee.active || reason === 'Other'}
          value={note}
          disabled={busy || saving}
          onChange={(e) => setNote(e.target.value)}
          placeholder={
            employee.active ? 'Add context for your records…' : 'e.g. Rejoined after a break'
          }
        />
      </label>
      {employee.active && fixed && (
        <label>
          Final month base salary (₹)
          <input
            type="number"
            min="0"
            step="0.01"
            required
            value={amount}
            disabled={busy || saving}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="Enter final salary amount"
          />
          <small>
            Enter the base salary for the leaving month. Bonuses, deductions and advance recovery
            are applied separately. No automatic proration.
          </small>
        </label>
      )}
      <div className="employee-status-note">
        Attendance, documents, payslips and payments are kept. Approved payroll is unchanged; use a
        payroll revision for any corrections.
        {employee.active &&
          ' Attendance-based pay stops after the last working day; later months exclude this employee.'}
      </div>
      {(advances > 0 || due !== 0) && (
        <div className="employee-status-balances">
          <strong>Balances to follow up</strong>
          {due !== 0 && (
            <span>
              {due > 0 ? 'Unpaid approved salary' : 'Overpayment'}: {money(Math.abs(due))}
            </span>
          )}
          {advances > 0 && (
            <span>
              Outstanding advance: {money(advances)}. Review future recovery installments; they are
              not cancelled automatically.
            </span>
          )}
        </div>
      )}
      {error && (
        <p role="alert" className="issue">
          {error}
        </p>
      )}
      <div className="employee-status-actions">
        <button className="primary" disabled={busy || saving}>
          {saving ? 'Saving…' : employee.active ? 'Mark inactive' : 'Reactivate employee'}
        </button>
      </div>
    </form>
  );
}
