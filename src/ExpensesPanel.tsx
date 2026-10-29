import BrandManagement from './BrandManagement';
import { useRef, useState, type ReactNode } from 'react';
import type { State } from './domain';
import { money } from './domain';
import {
  brandRegistration,
  registrationForBrands,
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
export default function ExpensesPanel({ state, busy, connected, connect, save, task }: Props) {
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
  const result = expenseSummary(b, brand, from, to);
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
              ['Purchases', money(result.purchased), 'By purchase date · GST inclusive'],
              ['Cash paid', money(result.paid), 'By payment date, including older purchases'],
              ['Outstanding', money(result.outstanding), 'Balance on purchases in this date range'],
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
                              disabled={busy}
                              onClick={() => {
                                setSchedule(null);
                                setEditing(e);
                              }}
                            >
                              Edit / attach invoice
                            </button>
                            <button
                              className="text-button"
                              disabled={busy || paid(e) >= e.amount}
                              onClick={() => setPaying(e)}
                            >
                              Record payment
                            </button>
                            <button
                              className="text-button"
                              disabled={busy}
                              onClick={() => {
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
          <section className="panel history">
            <div className="section-heading">
              <div>
                <h2>Recurring expenses</h2>
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
                Choose “Make recurring” on an expense to create a schedule.
              </p>
            )}
          </section>
        </>
      )}
      {activeView === 'brands' && (
        <BrandManagement business={b} busy={busy} persist={persist} task={task} />
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
              void task(async () => {
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
function Dialog({
  title,
  children,
  close,
}: {
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
        close();
      }}
    >
      <div className="modal-heading">
        <h2>{title}</h2>
        <button type="button" className="icon-button" aria-label="Close dialog" onClick={close}>
          ×
        </button>
      </div>
      {children}
    </dialog>
  );
}
function ExpenseEditor({
  expense,
  schedule,
  b,
  state,
  busy,
  task,
  close,
  persist,
}: {
  expense: Expense;
  schedule: Recurrence | null;
  b: Business;
  state: State;
  busy: boolean;
  task: Props['task'];
  close: () => void;
  persist: (b: Business, message: string) => Promise<void>;
}) {
  const [amount, setAmount] = useState(String(expense.amount / 100)),
    [splitMode, setSplitMode] = useState<'amount' | 'percentage'>('amount'),
    [splits, setSplits] = useState(
      expense.allocations.map((a) => ({ brandId: a.brandId, value: String(a.amount / 100) })),
    ),
    [invoices, setInvoices] = useState(expense.invoices),
    [file, setFile] = useState<File | null>(null),
    [invoiceStatus, setInvoiceStatus] = useState<Expense['invoiceStatus']>(expense.invoiceStatus),
    [gstStatus, setGSTStatus] = useState<Expense['gstStatus']>(expense.gstStatus);
  const [registrationId, setRegistrationId] = useState(expense.registrationId);
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
    >
      <form
        onSubmit={(ev) => {
          ev.preventDefault();
          const f = new FormData(ev.currentTarget);
          void task(async () => {
            const total = minor(amount);
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
              description: String(f.get('description')).trim(),
              supplier: String(f.get('supplier')).trim(),
              date: String(f.get('date')),
              category: String(f.get('category')),
              registrationId: String(f.get('registration')),
              amount: total,
              gst: minor(String(f.get('gst'))),
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
              {
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
              await persist(
                { ...b, recurrences: [...b.recurrences.filter((x) => x.id !== r.id), r] },
                'Recurring schedule saved. Existing purchases are unchanged.',
              );
            } else {
              if (file) {
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
              await persist(
                { ...b, expenses: [...b.expenses.filter((x) => x.id !== next.id), next] },
                'Expense saved.',
              );
            }
            close();
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
            <label>
              Purchase date
              <input name="date" type="date" required defaultValue={expense.date} />
            </label>
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
          </div>
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
