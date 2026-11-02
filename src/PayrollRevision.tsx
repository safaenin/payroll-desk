import { useState } from 'react';
import { approve, calculate, money, type State } from './domain';
export default function PayrollRevision({
  state,
  month,
  busy,
  save,
  task,
}: {
  state: State;
  month: string;
  busy: boolean;
  save: (next: State) => Promise<unknown>;
  task: (fn: () => Promise<unknown>) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const run = state.runs.find((r) => r.month === month)!;
  const draft = calculate(state, month);
  const codes = [...new Set([...run.lines.map((l) => l.code), ...draft.map((l) => l.code)])];
  return (
    <div className="settings-body">
      <button className="secondary" disabled={busy} onClick={() => setOpen(!open)}>
        {open ? 'Close revision review' : 'Review revision'}
      </button>
      <p>
        Version {(run.history?.length ?? 0) + 1} · {run.revisionReason ?? 'Original approval'}. Edit
        wages, attendance or revision inputs first. Existing payments stay recorded.
      </p>
      {open && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            void task(async () => {
              if (f.get('review') !== 'on') throw new Error('Confirm review of the revised month.');
              await save(
                approve(
                  { ...state, coverage: { ...state.coverage, [month]: true } },
                  month,
                  String(f.get('reason') ?? ''),
                ),
              );
              setOpen(false);
            });
          }}
        >
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>Approved net</th>
                  <th>Revised net</th>
                  <th>Difference</th>
                  <th>Paid</th>
                  <th>Due / overpaid</th>
                </tr>
              </thead>
              <tbody>
                {codes.map((code) => {
                  const old = run.lines.find((l) => l.code === code),
                    next = draft.find((l) => l.code === code);
                  const paid = state.payments
                    .filter((p) => p.month === month && p.code === code && !p.voidedAt)
                    .reduce((n, p) => n + p.amount, 0);
                  const balance = (next?.net ?? 0) - paid;
                  return (
                    <tr key={code}>
                      <td>
                        {next?.name ?? old?.name} · {code}
                        <details>
                          <summary>Compare earnings details</summary>
                          <p>
                            Payable days: {old?.days ?? 0} → {next?.days ?? 0}; full days:{' '}
                            {old?.fullDays ?? 0} → {next?.fullDays ?? 0}
                          </p>
                          {(
                            [
                              'base',
                              'attendanceBonus',
                              'performance',
                              'other',
                              'deduction',
                              'advanceRecovery',
                            ] as const
                          ).map((k) => (
                            <p key={k}>
                              {
                                {
                                  base: 'Base pay',
                                  attendanceBonus: 'Attendance bonus',
                                  performance: 'Performance bonus',
                                  other: 'Other bonus',
                                  deduction: 'Other deductions',
                                  advanceRecovery: 'Advance recovery',
                                }[k]
                              }
                              : {money(old?.[k] ?? 0)} → {money(next?.[k] ?? 0)}
                            </p>
                          ))}
                          <p>Approved wage details</p>
                          {old?.segments.map((s, i) => (
                            <small key={i}>{s}</small>
                          ))}
                          <p>Revised wage details</p>
                          {next?.segments.map((s, i) => (
                            <small key={i}>{s}</small>
                          ))}
                        </details>
                        {next?.issues.map((i) => (
                          <small className="issue" key={i}>
                            {i}
                          </small>
                        ))}
                      </td>
                      <td>{money(old?.net ?? 0)}</td>
                      <td>{money(next?.net ?? 0)}</td>
                      <td>{money((next?.net ?? 0) - (old?.net ?? 0))}</td>
                      <td>{money(paid)}</td>
                      <td>
                        {balance < 0 ? 'Overpaid ' : 'Due '}
                        {money(Math.abs(balance))}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p>
            Overpayments stay visible as credit balances. This does not recover money, void
            payments, or deduct next month's salary automatically.
          </p>
          <label>
            Revision reason
            <textarea name="reason" required disabled={busy} />
          </label>
          <label className="checkbox">
            <input type="checkbox" name="review" required disabled={busy} />I reviewed the full
            revised month, including wages, attendance, bonuses, deductions, advance recoveries and
            overpayments.
          </label>
          <button
            className="primary"
            disabled={busy || !draft.length || draft.some((l) => l.issues.length > 0)}
          >
            Approve revised payroll
          </button>
        </form>
      )}
      {!!run.history?.length && (
        <details>
          <summary>Previous approved versions ({run.history.length})</summary>
          {run.history.map((v, i) => (
            <section key={i}>
              <h3>
                Version {i + 1} · {v.approvedAt.slice(0, 10)}
              </h3>
              <p>
                {v.revisionReason ?? 'Original approval'} · Net{' '}
                {money(v.lines.reduce((n, l) => n + l.net, 0))}
              </p>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Employee</th>
                      <th>Base</th>
                      <th>Bonuses</th>
                      <th>Deductions</th>
                      <th>Advance recovery</th>
                      <th>Net</th>
                    </tr>
                  </thead>
                  <tbody>
                    {v.lines.map((l) => (
                      <tr key={l.code}>
                        <td>
                          {l.name} · {l.code}
                        </td>
                        <td>{money(l.base)}</td>
                        <td>{money(l.attendanceBonus + l.performance + l.other)}</td>
                        <td>{money(l.deduction)}</td>
                        <td>{money(l.advanceRecovery ?? 0)}</td>
                        <td>{money(l.net)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ))}
        </details>
      )}
    </div>
  );
}
