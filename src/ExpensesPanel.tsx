import { brandPayrollSummary } from './brandPayroll';
import InvoiceItemsEditor, {
  blankInvoiceItem,
  draftItemTotals,
  parseInvoiceItems,
  type InvoiceItemDraft,
} from './InvoiceItemsEditor';
import BrandManagement from './BrandManagement';
import { Check, LoaderCircle, CloudUpload, FileCheck2 } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { State } from './domain';
import { money } from './domain';
import {
  brandRegistration,
  registrationForBrands,
  invoiceItemTotals,
  allocated,
  allocatedOutstanding,
  advanceDate,
  businessToday,
  categories,
  emptyBusiness,
  expenseSummary,
  generateRecurring,
  minor,
  paid,
  validDate,
  recordExpensePayment,
  validateExpense,
  type Allocation,
  type Business,
  type Expense,
  type Recurrence,
} from './expenses';
import { uploadExpenseInvoice } from './storage';

type Props = {
  state: State;
  busy: boolean;
  remove: (id: string, progress: (message: string) => void) => Promise<void>;
  connected: boolean;
  connect: () => Promise<void>;
  save: (state: State, message: string) => Promise<unknown>;
  task: (fn: () => Promise<unknown>) => Promise<void>;
};
const invoiceLabels = {
  awaiting: 'Awaiting invoice',
  attached: 'Attached',
  none: 'No invoice expected',
};
const gstLabels = {
  pending: 'Awaiting GSTR-2B',
  appeared: 'Appeared in GSTR-2B',
  'not-applicable': 'Not applicable',
};
const newExpense = (b: Business, brandId = b.brands[0]?.id): Expense => ({
  id: crypto.randomUUID(),
  description: '',
  supplier: '',
  invoiceNumber: '',
  date: businessToday(),
  category: 'Goods',
  registrationId: brandRegistration(b, brandId ?? ''),
  amount: 0,
  gst: 0,
  allocations: brandId ? [{ brandId, amount: 0 }] : [],
  invoiceStatus: 'awaiting',
  invoices: [],
  gstStatus: 'not-applicable',
  gstPeriod: '',
  payments: [],
  employeeCode: '',
  notes: '',
  review: false,
});
export default function ExpensesPanel({
  state,
  busy,
  connected,
  connect,
  save,
  task,
  remove,
}: Props) {
  const b = state.business ?? emptyBusiness();
  const [activeView, setActiveView] = useState<'expenses' | 'brands'>('expenses');
  const [brand, setBrand] = useState(''),
    [from, setFrom] = useState(''),
    [to, setTo] = useState(''),
    [search, setSearch] = useState(''),
    [status, setStatus] = useState('all');
  const [editing, setEditing] = useState<Expense | null>(null),
    [schedule, setSchedule] = useState<Recurrence | null>(null),
    [paying, setPaying] = useState<Expense | null>(null),
    [view, setView] = useState<Expense | null>(null);
  const paymentTask = useDialogTask(task);
  const deletionTask = useDialogTask(task);
  const [deleting, setDeleting] = useState<Expense | null>(null);
  const [deleteConfirmation, setDeleteConfirmation] = useState('');
  const [deleteProgress, setDeleteProgress] = useState('');
  const result = expenseSummary(b, brand, from, to);
  const salaries = brandPayrollSummary(state, brand, from, to);
  const brandExpenses = b.expenses.filter(
    (e) => !brand || e.allocations.some((a) => a.brandId === brand),
  );
  const outsideDates = brandExpenses.length - result.purchases.length;
  function allDates() {
    setFrom('');
    setTo('');
  }
  function clearFilters() {
    allDates();
    setSearch('');
    setStatus('all');
  }
  const rows = result.purchases.filter(
    (e) =>
      `${e.description} ${e.supplier} ${e.invoiceNumber}`
        .toLowerCase()
        .includes(search.toLowerCase()) &&
      (status === 'all' ||
        (status === 'invoice' && e.invoiceStatus === 'awaiting') ||
        (status === 'gst' && e.gstStatus === 'pending') ||
        (status === 'unpaid' && paid(e) < e.amount) ||
        (status === 'review' && e.review)),
  );
  async function persist(next: Business, message: string) {
    await save({ ...state, business: next }, message);
  }
  function openNew() {
    setSchedule(null);
    setEditing(newExpense(b, brand || undefined));
  }
  return (
    <div className="expenses-module">
      {b.expenses.some((e) => e.deletion) && (
        <div className="message error" role="status">
          <span>An expense deletion needs to be completed before other changes can be saved.</span>
          <button
            className="text-button"
            disabled={busy}
            onClick={() => {
              deletionTask.clear();
              setDeleteConfirmation('');
              setDeleting(b.expenses.find((e) => e.deletion)!);
            }}
          >
            Continue deletion
          </button>
        </div>
      )}
      <div className="expense-view-tabs" role="tablist" aria-label="Expense workspace">
        <button
          role="tab"
          aria-selected={activeView === 'expenses'}
          onClick={() => setActiveView('expenses')}
        >
          Dashboard & expenses
        </button>
        <button
          role="tab"
          aria-selected={activeView === 'brands'}
          onClick={() => setActiveView('brands')}
        >
          Brands & businesses
        </button>
      </div>
      {activeView === 'expenses' && (
        <>
          <section className="panel expense-filters">
            <label>
              Brand
              <select value={brand} onChange={(e) => setBrand(e.target.value)}>
                <option value="">All brands</option>
                {b.brands.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              From
              <input
                type="date"
                value={from}
                max={to || undefined}
                onChange={(e) => setFrom(e.target.value)}
              />
            </label>
            <label>
              To
              <input
                type="date"
                min={from || undefined}
                value={to}
                onChange={(e) => setTo(e.target.value)}
              />
            </label>
            <button className="secondary" onClick={allDates} disabled={!from && !to}>
              All dates
            </button>
            <button
              className="secondary"
              onClick={() => {
                setFrom(businessToday().slice(0, 7) + '-01');
                setTo(businessToday());
              }}
            >
              This month
            </button>
            <button
              className="primary"
              disabled={busy || !b.brands.length || !b.registrations.length}
              onClick={openNew}
            >
              Add expense / invoice
            </button>
            <button className="secondary" disabled={busy} onClick={() => void task(connect)}>
              {connected ? 'Reconnect Drive' : 'Connect Google Drive'}
            </button>
          </section>
          {(!b.brands.length || !b.registrations.length) && (
            <p className="document-help">
              Start by adding a brand and its legal business.
              <button className="text-button" onClick={() => setActiveView('brands')}>
                Set up brands
              </button>
            </p>
          )}
          <div className="expense-date-context" role="status">
            <span>
              {!from && !to
                ? 'Showing purchases from all dates.'
                : `Showing purchases ${from ? `from ${from}` : 'from the beginning'} ${to ? `through ${to}` : 'onwards'}.`}
            </span>
            {outsideDates > 0 && (
              <span>
                {outsideDates} {outsideDates === 1 ? 'purchase is' : 'purchases are'} outside this
                date range.{' '}
                <button className="text-button" onClick={allDates}>
                  Show all dates
                </button>
              </span>
            )}
          </div>
          <div className="stats-grid">
            {[
              ['Business expenses', money(result.purchased), 'By purchase date · GST inclusive'],
              [
                'Approved salaries',
                money(salaries.cost),
                'By payroll month end · includes advance recovery',
              ],
              [
                'Combined cost',
                money(result.purchased + salaries.cost),
                'Purchases + approved salaries',
              ],
              [
                'Total cash paid',
                money(result.paid + salaries.paid),
                'Expense + salary payments by payment date',
              ],
              [
                'Combined outstanding',
                money(result.outstanding + salaries.outstanding),
                'Selected purchases and payroll months',
              ],
              [
                'Expense cash paid',
                money(result.paid),
                'By payment date, including older purchases',
              ],
              [
                'Expense outstanding',
                money(result.outstanding),
                'Balance on purchases in this date range',
              ],
              ['Missing invoices', String(result.missing), 'Purchases awaiting a document'],
              ['Awaiting GSTR-2B', money(result.pendingGST), 'GST on purchases in this date range'],
              [
                'Appeared in GSTR-2B',
                money(result.appearedGST),
                'GST on purchases in this date range',
              ],
            ].map(([label, value, detail]) => (
              <section className="stat" key={label}>
                <div className="stat-label">{label}</div>
                <strong>{value}</strong>
                <small>{detail}</small>
              </section>
            ))}
          </div>
          <section className="panel">
            <div className="section-heading">
              <div>
                <h2>Purchases & expenses</h2>
                <p>
                  Amounts follow the selected brand’s share. Open a record for its full details.
                </p>
              </div>
            </div>
            <div className="expense-filters">
              <label>
                Search
                <input
                  placeholder="Supplier, description or invoice number"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </label>
              <label>
                Show
                <select value={status} onChange={(e) => setStatus(e.target.value)}>
                  <option value="all">All expenses</option>
                  <option value="invoice">Missing invoice</option>
                  <option value="gst">Awaiting GSTR-2B</option>
                  <option value="unpaid">Outstanding payment</option>
                  <option value="review">Recurring: needs review</option>
                </select>
              </label>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>PURCHASE / BRAND</th>
                    <th>PURCHASE DATE</th>
                    <th>TOTAL / OUTSTANDING</th>
                    <th>INVOICE</th>
                    <th>GST</th>
                    <th>ACTIONS</th>
                  </tr>
                </thead>
                <tbody>
                  {rows
                    .sort((a, b) => b.date.localeCompare(a.date))
                    .map((e) => (
                      <tr key={e.id}>
                        <td>
                          <strong>{e.description}</strong>
                          <small>
                            {e.supplier} · {e.category}
                          </small>
                          <small>
                            {e.allocations
                              .map((a) => b.brands.find((r) => r.id === a.brandId)?.name)
                              .join(', ')}
                          </small>
                          {e.review && <span className="badge amber">Needs review</span>}
                        </td>
                        <td>{e.date}</td>
                        <td>
                          {money(allocated(e, e.amount, brand))}
                          <small>Due {money(allocatedOutstanding(e, brand))}</small>
                        </td>
                        <td>
                          {invoiceLabels[e.invoiceStatus]}
                          <small>{e.invoiceNumber}</small>
                        </td>
                        <td>
                          {gstLabels[e.gstStatus]}
                          <small>
                            {money(allocated(e, e.gst, brand))} {e.gstPeriod}
                          </small>
                        </td>
                        <td>
                          <div className="row-actions">
                            <button
                              className="text-button"
                              disabled={busy}
                              onClick={() => setView(e)}
                            >
                              Details
                            </button>
                            <button
                              className="text-button"
                              disabled={busy || Boolean(e.deletion)}
                              onClick={() => {
                                if (e.deletion) return;
                                setSchedule(null);
                                setEditing(e);
                              }}
                            >
                              Edit / attach invoice
                            </button>
                            <button
                              className="text-button"
                              disabled={busy || Boolean(e.deletion) || paid(e) >= e.amount}
                              onClick={() => {
                                paymentTask.clear();
                                setPaying(e);
                              }}
                            >
                              Record payment
                            </button>
                            <button
                              className="text-button"
                              disabled={busy || Boolean(e.deletion)}
                              onClick={() => {
                                if (e.deletion) return;
                                setSchedule({
                                  id: crypto.randomUUID(),
                                  template: e,
                                  frequency: 'monthly',
                                  nextDate: advanceDate(e.date, 'monthly', Number(e.date.slice(8))),
                                  anchorDay: Number(e.date.slice(8)),
                                  status: 'active',
                                });
                                setEditing(e);
                              }}
                            >
                              Make recurring
                            </button>
                            <button
                              className="text-button expense-delete-action"
                              disabled={busy}
                              onClick={() => {
                                deletionTask.clear();
                                setDeleteConfirmation('');
                                setDeleteProgress('');
                                setDeleting(e);
                              }}
                            >
                              {e.deletion ? 'Continue deletion' : 'Delete expense'}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
            {!rows.length && (
              <div className="empty-inline">
                <p>
                  {brandExpenses.length
                    ? 'No expenses match these filters.'
                    : 'No expenses recorded for this brand yet.'}
                </p>
                {brandExpenses.length > 0 && (
                  <button className="text-button" onClick={clearFilters}>
                    Clear date, search and status filters
                  </button>
                )}
              </div>
            )}
          </section>
          <section className="panel">
            <div className="section-heading">
              <div>
                <h2>Brand salaries</h2>
                <p>
                  Approved payroll only. Salary costs use the last day of each payroll month; cash
                  paid uses the actual payment date.
                </p>
                {salaries.unassigned > 0 && (
                  <p>
                    {salaries.unassigned} payroll entries have no brand allocation. Assign salary
                    brands in the employee profile; approved snapshots remain fixed.
                  </p>
                )}
              </div>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>EMPLOYEE</th>
                    <th>PAYROLL MONTH</th>
                    <th>SALARY COST</th>
                    <th>PAID</th>
                    <th>OUTSTANDING</th>
                  </tr>
                </thead>
                <tbody>
                  {salaries.rows.map((row) => (
                    <tr key={row.month + row.code}>
                      <td>
                        {row.name}
                        <small>{row.code}</small>
                      </td>
                      <td>{row.month}</td>
                      <td>{money(row.cost)}</td>
                      <td>{money(row.paid)}</td>
                      <td>{money(row.outstanding)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!salaries.rows.length && (
              <p className="empty-inline">
                No approved salaries for this brand and date range. Set salary brands on employees,
                then approve monthly payroll.
              </p>
            )}
          </section>
          <section className="panel history">
            <div className="section-heading">
              <div>
                <h2>Recurring expenses & subscriptions</h2>
                <p>
                  Due records are created when you open the workspace or check the schedule. Review
                  the amount before paying.
                </p>
              </div>
              <button
                className="secondary"
                disabled={busy}
                onClick={() =>
                  void task(() =>
                    persist(
                      generateRecurring(b),
                      'Due recurring expenses created. Large backlogs may need another check.',
                    ),
                  )
                }
              >
                Check schedule
              </button>
              <button
                className="primary"
                disabled={busy || !b.brands.length || !b.registrations.length}
                onClick={() => {
                  const template = { ...newExpense(b, brand || undefined), category: 'Software' };
                  setSchedule({
                    id: crypto.randomUUID(),
                    template,
                    frequency: 'monthly',
                    nextDate: businessToday(),
                    anchorDay: Number(businessToday().slice(8)),
                    status: 'active',
                  });
                  setEditing(template);
                }}
              >
                Add subscription
              </button>
            </div>
            {b.recurrences.map((r) => (
              <div className="history-row" key={r.id}>
                <div>
                  <strong>
                    {r.template.description} · {money(r.template.amount)}
                  </strong>
                  <small>
                    {r.frequency} · {r.status} · Next {r.nextDate}
                  </small>
                </div>
                <div className="expense-actions">
                  <button
                    className="text-button"
                    disabled={busy || r.status === 'cancelled'}
                    onClick={() => {
                      setSchedule(r);
                      setEditing(r.template);
                    }}
                  >
                    Edit future expenses
                  </button>
                  {r.status !== 'cancelled' && (
                    <>
                      <button
                        className="text-button"
                        disabled={busy}
                        onClick={() =>
                          void task(() =>
                            persist(
                              {
                                ...b,
                                recurrences: b.recurrences.map((x) =>
                                  x.id === r.id
                                    ? {
                                        ...x,
                                        status: r.status === 'active' ? 'paused' : 'active',
                                        ...(r.status === 'paused'
                                          ? { nextDate: businessToday() }
                                          : {}),
                                      }
                                    : x,
                                ),
                              },
                              r.status === 'active'
                                ? 'Schedule paused.'
                                : 'Schedule resumed from today; paused dates skipped.',
                            ),
                          )
                        }
                      >
                        {r.status === 'active' ? 'Pause' : 'Resume today'}
                      </button>
                      <button
                        className="text-button"
                        disabled={busy}
                        onClick={() =>
                          void task(() =>
                            persist(
                              {
                                ...b,
                                recurrences: b.recurrences.map((x) =>
                                  x.id === r.id ? { ...x, status: 'cancelled' } : x,
                                ),
                              },
                              'Future recurring expenses cancelled.',
                            ),
                          )
                        }
                      >
                        Cancel future expenses
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
            {!b.recurrences.length && (
              <p className="empty-inline">
                Use “Add subscription” to create a schedule, or “Make recurring” on an existing
                expense.
              </p>
            )}
          </section>
        </>
      )}
      {activeView === 'brands' && (
        <BrandManagement business={b} busy={busy} persist={persist} task={task} />
      )}
      {deleting && (
        <Dialog
          title="Delete this expense?"
          busy={busy}
          error={deletionTask.error}
          close={() => {
            if (!busy) setDeleting(null);
          }}
        >
          <p>
            <strong>{deleting.description}</strong> · {money(deleting.amount)}
          </p>
          <p>
            This permanently removes this expense, its item breakdown, GST details, brand
            allocations and {deleting.payments.length} payment records. Its{' '}
            {deleting.invoices.length} attached files move to Google Drive Trash. Recurring
            schedules and other expenses are kept.
          </p>
          {deleting.recurrenceId && (
            <p>
              You can pause or cancel the recurring schedule separately to stop future expenses.
            </p>
          )}
          <p>
            Once deletion starts, other saves are blocked until cleanup finishes. If interrupted,
            use Continue deletion.
          </p>
          {deleteProgress && (
            <p role="status">
              <LoaderCircle className="expense-save-spinner" size={16} /> {deleteProgress}
            </p>
          )}
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void deletionTask.run(async () => {
                try {
                  await remove(deleting.id, setDeleteProgress);
                  setDeleting(null);
                } finally {
                  setDeleteProgress('');
                }
              });
            }}
          >
            <fieldset disabled={busy}>
              <label>
                Type DELETE to confirm
                <input
                  value={deleteConfirmation}
                  onChange={(e) => setDeleteConfirmation(e.target.value)}
                  required
                  pattern="DELETE"
                  autoComplete="off"
                />
              </label>
              {!!deleting.invoices.length && (
                <button
                  type="button"
                  className="secondary"
                  onClick={() => void deletionTask.run(connect)}
                >
                  Connect Google Drive
                </button>
              )}
              <button className="primary danger" disabled={busy || deleteConfirmation !== 'DELETE'}>
                {busy
                  ? 'Deleting…'
                  : deleting.deletion
                    ? 'Continue deletion'
                    : 'Delete expense and files'}
              </button>
            </fieldset>
          </form>
        </Dialog>
      )}
      {editing && (
        <ExpenseEditor
          key={`${editing.id}-${schedule?.id ?? 'expense'}`}
          expense={editing}
          schedule={schedule}
          b={b}
          state={state}
          busy={busy}
          task={task}
          connected={connected}
          connect={connect}
          close={() => {
            if (!busy) {
              setEditing(null);
              setSchedule(null);
            }
          }}
          persist={persist}
        />
      )}
      {paying && (
        <Dialog
          title="Record completed payment"
          error={paymentTask.error}
          close={() => {
            if (!busy) setPaying(null);
          }}
        >
          <p>
            {paying.description} · Outstanding {money(paying.amount - paid(paying))}
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              void paymentTask.run(async () => {
                const updated = recordExpensePayment(paying, {
                  id: crypto.randomUUID(),
                  date: String(f.get('date')),
                  amount: minor(String(f.get('amount'))),
                  method: String(f.get('method')),
                  reference: String(f.get('reference')).trim(),
                });
                await persist(
                  { ...b, expenses: b.expenses.map((x) => (x.id === updated.id ? updated : x)) },
                  'Expense payment recorded.',
                );
                setPaying(null);
              });
            }}
          >
            <label>
              Amount paid (₹)
              <input
                name="amount"
                type="number"
                min="0.01"
                step="0.01"
                max={(paying.amount - paid(paying)) / 100}
                required
                defaultValue={(paying.amount - paid(paying)) / 100}
              />
            </label>
            <label>
              Payment date
              <input
                name="date"
                type="date"
                required
                max={businessToday()}
                defaultValue={businessToday()}
              />
            </label>
            <label>
              Method
              <select name="method">
                {['Bank transfer', 'UPI', 'Cash', 'Card', 'Other'].map((m) => (
                  <option key={m}>{m}</option>
                ))}
              </select>
            </label>
            <label>
              Reference / note
              <input name="reference" />
            </label>
            <p>This records a payment already made; it does not transfer money.</p>
            <button className="primary" disabled={busy}>
              Record payment
            </button>
          </form>
        </Dialog>
      )}
      {view && (
        <Dialog title={view.description} close={() => setView(null)}>
          <p>
            {view.supplier} · {view.category} · Purchased {view.date}
          </p>
          <p>
            {b.registrations.find((r) => r.id === view.registrationId)?.name} · Invoice{' '}
            {view.invoiceNumber || 'not specified'}
          </p>
          <p>
            Total {money(view.amount)} including GST {money(view.gst)} · Outstanding{' '}
            {money(view.amount - paid(view))}
          </p>
          <p>
            {gstLabels[view.gstStatus]} {view.gstPeriod}
          </p>
          {view.items && (
            <section className="invoice-detail-items">
              <h3>Invoice items</h3>
              {view.items.map((item) => (
                <div key={item.id} className="invoice-detail-item">
                  <strong>{item.description}</strong>
                  <small>
                    {item.quantity} × {money(item.unitPrice)} before GST · GST {money(item.gst)}
                  </small>
                  <span>{money(invoiceItemTotals([item]).amount)}</span>
                </div>
              ))}
            </section>
          )}

          {view.allocations.map((a) => (
            <p key={a.brandId}>
              {b.brands.find((r) => r.id === a.brandId)?.name}: {money(a.amount)}
            </p>
          ))}
          <p>
            Assigned employee:{' '}
            {state.employees.find((e) => e.code === view.employeeCode)?.name ||
              view.employeeCode ||
              'None'}
          </p>
          <p>{view.notes}</p>
          <h3>Invoices</h3>
          {view.invoices.map((i) => (
            <p key={i.id}>
              <a href={i.url} target="_blank" rel="noreferrer">
                {i.name}
              </a>
            </p>
          ))}
          {!view.invoices.length && <p>{invoiceLabels[view.invoiceStatus]}</p>}
          <h3>Payment history</h3>
          {view.payments.map((p) => (
            <p key={p.id}>
              {p.date} · {money(p.amount)} · {p.method} · {p.reference}
            </p>
          ))}
          {!view.payments.length && <p>No payments recorded.</p>}
        </Dialog>
      )}
    </div>
  );
}
/** Catch failures inside the global busy-state wrapper so they stay in the active dialog. */
function useDialogTask(task: Props['task']) {
  const [error, setError] = useState('');
  return {
    error,
    clear: () => setError(''),
    run: (fn: () => Promise<unknown>) =>
      task(async () => {
        setError('');
        try {
          await fn();
        } catch (error) {
          setError(error instanceof Error ? error.message : String(error));
        }
      }),
  };
}
function DialogError({ message }: { message: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.focus();
    ref.current?.scrollIntoView({ block: 'nearest' });
  }, [message]);
  return (
    <div ref={ref} className="message error dialog-error" role="alert" tabIndex={-1}>
      {message}
    </div>
  );
}
function Dialog({
  title,
  children,
  close,
  error = '',
  busy = false,
}: {
  error?: string;
  busy?: boolean;
  title: string;
  children: ReactNode;
  close: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  return (
    <dialog
      className="modal expense-modal"
      ref={(el) => {
        ref.current = el;
        if (el && !el.open) el.showModal();
      }}
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) close();
      }}
    >
      <div className="modal-heading">
        <h2>{title}</h2>
        <button
          type="button"
          className="icon-button"
          aria-label="Close dialog"
          disabled={busy}
          onClick={close}
        >
          ×
        </button>
      </div>
      {error && <DialogError message={error} />}
      {children}
    </dialog>
  );
}
type ExpenseSaveStage = 'checking' | 'uploading' | 'saving';
function ExpenseSaveProgress({
  stage,
  invoice,
  schedule,
}: {
  stage: ExpenseSaveStage;
  invoice: string;
  schedule: boolean;
}) {
  const steps = [
    { key: 'checking', label: 'Check expense details' },
    { key: 'uploading', label: 'Upload invoice to Google Drive' },
    { key: 'saving', label: schedule ? 'Save recurring schedule' : 'Save expense details' },
  ].filter((step) => step.key !== 'uploading' || Boolean(invoice));
  const active = steps.findIndex((step) => step.key === stage);
  return (
    <section className="expense-save-progress" role="status" aria-live="polite" aria-atomic="true">
      <div className="expense-save-symbol">
        <LoaderCircle className="expense-save-spinner" size={34} />
      </div>
      <h3>
        {stage === 'uploading'
          ? 'Uploading your invoice'
          : stage === 'saving'
            ? schedule
              ? 'Saving your schedule'
              : 'Saving your expense'
            : 'Preparing to save'}
      </h3>
      <p>
        {stage === 'uploading'
          ? 'Your invoice is being securely uploaded to your connected Google Drive. Larger files or a slow connection can take a little longer.'
          : 'Please keep this window open while we finish saving your details.'}
      </p>
      {invoice && (
        <div className="expense-save-file">
          <CloudUpload size={18} />
          <span>{invoice}</span>
        </div>
      )}
      <ol>
        {steps.map((step, index) => (
          <li
            key={step.key}
            className={index < active ? 'complete' : index === active ? 'current' : 'pending'}
          >
            {index < active ? (
              <Check size={17} />
            ) : index === active ? (
              <LoaderCircle className="expense-save-spinner" size={17} />
            ) : (
              <FileCheck2 size={17} />
            )}
            <span>{step.label}</span>
            {index < active && <small>Done</small>}
          </li>
        ))}
      </ol>
      <small>You can continue as soon as saving is complete.</small>
    </section>
  );
}
function ExpenseEditor({
  expense,
  schedule,
  b,
  state,
  busy,
  task,
  connected,
  connect,
  close,
  persist,
}: {
  expense: Expense;
  schedule: Recurrence | null;
  b: Business;
  state: State;
  busy: boolean;
  task: Props['task'];
  connected: boolean;
  connect: Props['connect'];
  close: () => void;
  persist: (b: Business, message: string) => Promise<void>;
}) {
  const [itemDrafts, setItemDrafts] = useState<InvoiceItemDraft[] | null>(() =>
    expense.items
      ? expense.items.map((item) => ({
          ...item,
          quantity: String(item.quantity),
          unitPrice: String(item.unitPrice / 100),
          gst: String(item.gst / 100),
        }))
      : !expense.description && expense.amount === 0
        ? [blankInvoiceItem()]
        : null,
  );
  const [amount, setAmount] = useState(String(expense.amount / 100)),
    [splitMode, setSplitMode] = useState<'amount' | 'percentage'>('amount'),
    [splits, setSplits] = useState(
      expense.allocations.map((a) => ({ brandId: a.brandId, value: String(a.amount / 100) })),
    ),
    [invoices, setInvoices] = useState(expense.invoices),
    [file, setFile] = useState<File | null>(null),
    [invoiceStatus, setInvoiceStatus] = useState<Expense['invoiceStatus']>(expense.invoiceStatus),
    [gstStatus, setGSTStatus] = useState<Expense['gstStatus']>(expense.gstStatus);
  const dialogTask = useDialogTask(task);
  const [saveStage, setSaveStage] = useState<ExpenseSaveStage | null>(null);
  const saveLock = useRef(false);
  const [needsDrive, setNeedsDrive] = useState(false);
  const [connectingDrive, setConnectingDrive] = useState(false);
  const [driveNotice, setDriveNotice] = useState(false);
  const driveAccess = useRef(false);
  useEffect(() => {
    if (
      dialogTask.error &&
      /connect google drive|access expired|connect again/i.test(dialogTask.error)
    ) {
      driveAccess.current = false;
      setNeedsDrive(true);
    }
  }, [dialogTask.error]);
  const [uploadName, setUploadName] = useState('');
  const [registrationId, setRegistrationId] = useState(expense.registrationId);
  function changeItems(next: InvoiceItemDraft[]) {
    setItemDrafts(next);
    const totals = draftItemTotals(next);
    if (totals) {
      setAmount(String(totals.amount / 100));
      if (splits.length === 1 && splitMode === 'amount')
        setSplits([{ ...splits[0], value: String(totals.amount / 100) }]);
    }
  }
  function changeBrands(next: typeof splits) {
    setSplits(next);
    setRegistrationId(
      registrationForBrands(
        b,
        next.map((a) => a.brandId),
      ),
    );
  }
  return (
    <Dialog
      title={
        schedule
          ? 'Recurring expense schedule'
          : expense.description
            ? 'Edit expense'
            : 'Add expense / upload invoice'
      }
      close={close}
      error={dialogTask.error}
      busy={busy || Boolean(saveStage) || connectingDrive}
    >
      {saveStage && (
        <ExpenseSaveProgress stage={saveStage} invoice={uploadName} schedule={Boolean(schedule)} />
      )}
      {needsDrive && (
        <section className="drive-connect-prompt" role="region" aria-label="Connect Google Drive">
          <div className="expense-save-symbol">
            <CloudUpload size={32} />
          </div>
          <h3>
            {connectingDrive
              ? 'Connecting to Google Drive…'
              : 'Connect Google Drive to upload this invoice'}
          </h3>
          <p>
            Your expense details, invoice items and selected file are kept in this form. Connect
            your account, then continue saving.
          </p>
          {file && (
            <div className="expense-save-file">
              <FileCheck2 size={18} />
              <span>{file.name}</span>
            </div>
          )}
          {connectingDrive && (
            <p role="status">
              <LoaderCircle className="expense-save-spinner" size={18} /> Complete the Google
              sign-in window to continue.
            </p>
          )}
          <div className="setup-dialog-actions">
            <button
              type="button"
              className="secondary"
              disabled={busy || connectingDrive}
              onClick={() => {
                dialogTask.clear();
                setNeedsDrive(false);
              }}
            >
              Back to expense
            </button>
            <button
              type="button"
              className="primary"
              disabled={busy || connectingDrive}
              onClick={() =>
                void dialogTask.run(async () => {
                  setConnectingDrive(true);
                  try {
                    await connect();
                    driveAccess.current = true;
                    setDriveNotice(true);
                    setNeedsDrive(false);
                  } finally {
                    setConnectingDrive(false);
                  }
                })
              }
            >
              {connectingDrive ? (
                <>
                  <LoaderCircle className="expense-save-spinner" size={16} />
                  Connecting…
                </>
              ) : (
                'Connect Google Drive'
              )}
            </button>
          </div>
        </section>
      )}
      {driveNotice && !needsDrive && !saveStage && (
        <p className="drive-ready-notice" role="status">
          Google Drive connected. Your details and selected file are ready—press Save to finish.
        </p>
      )}
      <form
        hidden={Boolean(saveStage) || needsDrive}
        aria-busy={Boolean(saveStage)}
        onSubmit={(ev) => {
          ev.preventDefault();
          if (saveLock.current || busy) return;
          if (file && !schedule && !connected && !driveAccess.current) {
            dialogTask.clear();
            setNeedsDrive(true);
            return;
          }
          setDriveNotice(false);
          const f = new FormData(ev.currentTarget);
          saveLock.current = true;
          setUploadName(!schedule && file ? file.name : '');
          setSaveStage('checking');
          void dialogTask
            .run(async () => {
              const items = itemDrafts ? parseInvoiceItems(itemDrafts) : undefined;
              const itemTotals = items ? invoiceItemTotals(items) : null;
              const total = itemTotals?.amount ?? minor(amount);
              let remaining = total;
              let allocations: Allocation[];
              if (splitMode === 'percentage') {
                const weights = splits.map((a) => minor(a.value));
                if (weights.reduce((n, w) => n + w, 0) !== 10000)
                  throw new Error('Percentages must add up to 100%.');
                allocations = splits.map((a, i) => {
                  const value =
                    i === splits.length - 1 ? remaining : Math.round((total * weights[i]) / 10000);
                  remaining -= value;
                  return { brandId: a.brandId, amount: value };
                });
              } else
                allocations = splits.map((a) => ({ brandId: a.brandId, amount: minor(a.value) }));
              let next: Expense = {
                ...expense,
                ...(items ? { items } : {}),
                description: String(f.get('description')).trim(),
                supplier: String(f.get('supplier')).trim(),
                date: String(f.get('date')),
                category: String(f.get('category')),
                registrationId: String(f.get('registration')),
                amount: total,
                gst: itemTotals?.gst ?? minor(String(f.get('gst'))),
                allocations,
                invoiceNumber: String(f.get('invoiceNumber')).trim(),
                invoiceStatus: invoices.length || file ? 'attached' : invoiceStatus,
                invoices,
                gstStatus,
                gstPeriod: gstStatus === 'appeared' ? String(f.get('gstPeriod')) : '',
                employeeCode: String(f.get('employee')),
                notes: String(f.get('notes')).trim(),
                review: false,
              };
              if (schedule)
                next = {
                  ...next,
                  payments: [],
                  invoices: [],
                  invoiceStatus: expense.invoiceStatus === 'none' ? 'none' : 'awaiting',
                  gstStatus: next.gst ? 'pending' : 'not-applicable',
                  gstPeriod: '',
                  invoiceNumber: '',
                };
              // Check the full record before uploading. A placeholder is used solely for validation.
              validateExpense(
                schedule
                  ? next
                  : {
                      ...next,
                      invoices: file
                        ? [...invoices, { id: 'pending', name: file.name, url: '', uploadedAt: '' }]
                        : invoices,
                    },
                b,
              );
              if (schedule) {
                const nextDate = String(f.get('nextDate'));
                if (!validDate(nextDate)) throw new Error('Select the next occurrence date.');
                const r: Recurrence = {
                  ...schedule,
                  template: {
                    ...next,
                    payments: [],
                    invoices: [],
                    invoiceStatus: next.invoiceStatus === 'none' ? 'none' : 'awaiting',
                    gstStatus: next.gst ? 'pending' : 'not-applicable',
                    gstPeriod: '',
                  },
                  frequency: String(f.get('frequency')) as Recurrence['frequency'],
                  nextDate,
                  anchorDay: Number(nextDate.slice(8)),
                };
                setSaveStage('saving');
                await persist(
                  generateRecurring({
                    ...b,
                    recurrences: [...b.recurrences.filter((x) => x.id !== r.id), r],
                  }),
                  'Recurring schedule saved. Due expenses are unpaid and ready for review.',
                );
              } else {
                if (file) {
                  setSaveStage('uploading');
                  const uploaded = await uploadExpenseInvoice(
                    file,
                    next.id,
                    next.allocations.map((a) => b.brands.find((brand) => brand.id === a.brandId)!),
                  );
                  next = { ...next, invoices: [...invoices, uploaded], invoiceStatus: 'attached' };
                  setInvoices(next.invoices);
                  setInvoiceStatus('attached');
                  setFile(null);
                }
                validateExpense(next, b);
                setSaveStage('saving');
                await persist(
                  { ...b, expenses: [...b.expenses.filter((x) => x.id !== next.id), next] },
                  'Expense saved.',
                );
              }
              close();
            })
            .finally(() => {
              saveLock.current = false;
              setSaveStage(null);
            });
        }}
      >
        <fieldset disabled={busy}>
          {!schedule && (
            <>
              <label>
                Invoice PDF or image (optional, up to 5 MB)
                <input
                  type="file"
                  accept="application/pdf,image/jpeg,image/png,image/webp"
                  onChange={(e) => {
                    setFile(e.target.files?.[0] ?? null);
                    if (e.target.files?.length) setInvoiceStatus('attached');
                  }}
                />
              </label>
              {file && (
                <div className="expense-save-file">
                  <FileCheck2 size={18} />
                  <span>Selected invoice: {file.name}</span>
                </div>
              )}
              {invoices.map((i) => (
                <p key={i.id}>
                  <a href={i.url} target="_blank" rel="noreferrer">
                    {i.name}
                  </a>
                </p>
              ))}
            </>
          )}
          <label>
            Description
            <input name="description" required defaultValue={expense.description} maxLength={250} />
          </label>
          <div className="form-grid">
            <label>
              Supplier / payee
              <input name="supplier" required defaultValue={expense.supplier} />
            </label>
            <label>
              Category
              <select name="category" defaultValue={expense.category}>
                {categories.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </label>
            {schedule ? (
              <input type="hidden" name="date" value={expense.date} />
            ) : (
              <label>
                Purchase date
                <input name="date" type="date" required defaultValue={expense.date} />
              </label>
            )}
            <label>
              Legal business / GST registration
              <select
                name="registration"
                value={registrationId}
                onChange={(e) => setRegistrationId(e.target.value)}
                required
              >
                <option value="">Select registration</option>
                {b.registrations.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name} {r.gstin}
                  </option>
                ))}
              </select>
            </label>
            {!itemDrafts && (
              <>
                <label>
                  Total including GST (₹)
                  <input
                    type="number"
                    min="0.01"
                    step="0.01"
                    required
                    value={amount}
                    onChange={(e) => {
                      setAmount(e.target.value);
                      if (splits.length === 1 && splitMode === 'amount')
                        setSplits([{ ...splits[0], value: e.target.value }]);
                    }}
                  />
                </label>
                <label>
                  Included GST (₹)
                  <input
                    name="gst"
                    type="number"
                    min="0"
                    step="0.01"
                    defaultValue={expense.gst / 100}
                    required
                  />
                </label>
              </>
            )}
          </div>
          {itemDrafts ? (
            <InvoiceItemsEditor items={itemDrafts} onChange={changeItems} />
          ) : (
            <button
              type="button"
              className="secondary"
              onClick={() =>
                setItemDrafts([
                  {
                    id: crypto.randomUUID(),
                    description: expense.description,
                    quantity: '1',
                    unitPrice: String((expense.amount - expense.gst) / 100),
                    gst: String(expense.gst / 100),
                  },
                ])
              }
            >
              Add item breakdown
            </button>
          )}
          <h3>Brand allocation</h3>
          <label>
            Split using
            <select
              value={splitMode}
              onChange={(e) => {
                setSplitMode(e.target.value as 'amount' | 'percentage');
                setSplits(splits.map((a) => ({ ...a, value: '' })));
              }}
            >
              <option value="amount">Amounts (₹)</option>
              <option value="percentage">Percentages (%)</option>
            </select>
          </label>
          {splits.map((a, i) => (
            <div className="expense-split" key={i}>
              <select
                aria-label={`Brand ${i + 1}`}
                value={a.brandId}
                onChange={(e) =>
                  changeBrands(
                    splits.map((x, j) => (j === i ? { ...x, brandId: e.target.value } : x)),
                  )
                }
              >
                {b.brands.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
              <input
                aria-label={`Brand ${i + 1} ${splitMode}`}
                type="number"
                min="0.01"
                step="0.01"
                required
                value={a.value}
                onChange={(e) =>
                  setSplits(splits.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))
                }
              />
              <button
                className="text-button"
                type="button"
                disabled={splits.length <= 1}
                onClick={() => changeBrands(splits.filter((_, j) => j !== i))}
              >
                Remove
              </button>
            </div>
          ))}
          <button
            className="secondary"
            type="button"
            disabled={splits.length >= b.brands.length}
            onClick={() => {
              const brand = b.brands.find((r) => !splits.some((a) => a.brandId === r.id));
              if (brand) changeBrands([...splits, { brandId: brand.id, value: '' }]);
            }}
          >
            Add brand share
          </button>
          {!schedule && (
            <>
              <div className="form-grid">
                <label>
                  Invoice number
                  <input name="invoiceNumber" defaultValue={expense.invoiceNumber} />
                </label>
                <label>
                  Invoice status
                  <select
                    value={invoices.length || file ? 'attached' : invoiceStatus}
                    onChange={(e) => setInvoiceStatus(e.target.value as Expense['invoiceStatus'])}
                    disabled={Boolean(invoices.length || file)}
                  >
                    {Object.entries(invoiceLabels).map(([k, v]) => (
                      <option value={k} key={k}>
                        {v}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  GST tracking
                  <select
                    value={gstStatus}
                    onChange={(e) => setGSTStatus(e.target.value as Expense['gstStatus'])}
                  >
                    {Object.entries(gstLabels).map(([k, v]) => (
                      <option value={k} key={k}>
                        {v}
                      </option>
                    ))}
                  </select>
                </label>
                {gstStatus === 'appeared' && (
                  <label>
                    GSTR-2B period
                    <input
                      name="gstPeriod"
                      type="month"
                      required
                      defaultValue={expense.gstPeriod}
                    />
                  </label>
                )}
              </div>
            </>
          )}
          <label>
            Assigned employee (optional)
            <select name="employee" defaultValue={expense.employeeCode}>
              <option value="">None</option>
              {expense.employeeCode &&
                !state.employees.some((e) => e.code === expense.employeeCode) && (
                  <option value={expense.employeeCode}>{expense.employeeCode}</option>
                )}
              {state.employees.map((e) => (
                <option key={e.code} value={e.code}>
                  {e.name} · {e.code}
                </option>
              ))}
            </select>
          </label>
          <label>
            Notes
            <textarea name="notes" defaultValue={expense.notes} />
          </label>
          {schedule && (
            <div className="form-grid">
              <label>
                Frequency
                <select name="frequency" defaultValue={schedule.frequency}>
                  <option value="monthly">Monthly</option>
                  <option value="yearly">Yearly</option>
                </select>
              </label>
              <label>
                Next occurrence
                <input name="nextDate" type="date" required defaultValue={schedule.nextDate} />
              </label>
            </div>
          )}
          <button className="primary" disabled={busy}>
            {schedule ? 'Save future schedule' : 'Save expense'}
          </button>
        </fieldset>
      </form>
    </Dialog>
  );
}
