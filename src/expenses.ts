/** Business records are independent of payroll; all money is stored as integer paise. */
export type Brand = { id: string; name: string; registrationId?: string };
export type Registration = { id: string; name: string; gstin: string };
export type Allocation = { brandId: string; amount: number };
export type ExpensePayment = {
  id: string;
  date: string;
  amount: number;
  method: string;
  reference: string;
};
export type Invoice = { id: string; name: string; url: string; uploadedAt: string };
export type ExpenseItem = {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
  gst: number;
};
export function invoiceItemTotals(items: ExpenseItem[]) {
  if (!items.length || new Set(items.map((item) => item.id)).size !== items.length)
    throw new Error('Add at least one invoice item with a unique ID.');
  let subtotal = 0,
    gst = 0;
  for (const item of items) {
    const units = Math.round(item.quantity * 1000);
    if (
      !item.description.trim() ||
      !Number.isSafeInteger(units) ||
      units <= 0 ||
      Math.abs(item.quantity * 1000 - units) > 0.000001 ||
      !Number.isSafeInteger(item.unitPrice) ||
      item.unitPrice < 0 ||
      !Number.isSafeInteger(item.gst) ||
      item.gst < 0 ||
      !Number.isSafeInteger(item.unitPrice * units)
    )
      throw new Error(
        'Each item needs a description, positive quantity (up to 3 decimals), and valid nonnegative unit price and GST.',
      );
    subtotal += Math.round((item.unitPrice * units) / 1000);
    gst += item.gst;
    if (!Number.isSafeInteger(subtotal + gst)) throw new Error('Invoice total is too large.');
  }
  return { subtotal, gst, amount: subtotal + gst };
}
export type Expense = {
  items?: ExpenseItem[];
  id: string;
  description: string;
  supplier: string;
  invoiceNumber: string;
  date: string;
  category: string;
  registrationId: string;
  amount: number;
  gst: number;
  allocations: Allocation[];
  invoiceStatus: 'awaiting' | 'attached' | 'none';
  invoices: Invoice[];
  gstStatus: 'pending' | 'appeared' | 'not-applicable';
  gstPeriod: string;
  payments: ExpensePayment[];
  employeeCode: string;
  notes: string;
  recurrenceId?: string;
  review: boolean;
};
export type Recurrence = {
  id: string;
  template: Expense;
  frequency: 'monthly' | 'yearly';
  nextDate: string;
  anchorDay: number;
  status: 'active' | 'paused' | 'cancelled';
};
export type Business = {
  brands: Brand[];
  registrations: Registration[];
  expenses: Expense[];
  recurrences: Recurrence[];
};
export const emptyBusiness = (): Business => ({
  brands: [],
  registrations: [],
  expenses: [],
  recurrences: [],
});
export const categories = [
  'Goods',
  'Services',
  'Setup costs',
  'Equipment',
  'Software',
  'Rent',
  'Utilities',
  'Other',
];
export const businessToday = () =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
export function validDate(value: string) {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(Date.parse(value)) &&
    new Date(value + 'T12:00:00Z').toISOString().slice(0, 10) === value
  );
}
export function minor(value: string) {
  if (!/^\d+(\.\d{1,2})?$/.test(value))
    throw new Error('Enter a valid amount with at most two decimal places.');
  const n = Math.round(Number(value) * 100);
  if (!Number.isSafeInteger(n)) throw new Error('Amount is too large.');
  return n;
}
export const paid = (e: Expense) => e.payments.reduce((sum, p) => sum + p.amount, 0);
export function validateExpense(e: Expense, b: Business) {
  if (e.items) {
    const totals = invoiceItemTotals(e.items);
    if (totals.amount !== e.amount || totals.gst !== e.gst)
      throw new Error('Invoice items must match the total and GST amount.');
  }
  if (!e.description.trim() || !e.supplier.trim() || !validDate(e.date))
    throw new Error('Description, supplier and a valid purchase date are required.');
  if (
    !Number.isSafeInteger(e.amount) ||
    e.amount <= 0 ||
    !Number.isSafeInteger(e.gst) ||
    e.gst < 0 ||
    e.gst > e.amount
  )
    throw new Error('Total must be positive and include the GST amount.');
  if (!b.registrations.some((r) => r.id === e.registrationId))
    throw new Error('Select a business / GST registration.');
  if (
    !e.allocations.length ||
    new Set(e.allocations.map((a) => a.brandId)).size !== e.allocations.length ||
    e.allocations.some(
      (a) =>
        !b.brands.some((b) => b.id === a.brandId) ||
        !Number.isSafeInteger(a.amount) ||
        a.amount <= 0,
    ) ||
    e.allocations.reduce((s, a) => s + a.amount, 0) !== e.amount
  )
    throw new Error('Brand allocations must be positive and add up exactly to the total.');
  if (
    (e.invoiceStatus === 'attached' && !e.invoices.length) ||
    (e.invoiceStatus !== 'attached' && e.invoices.length)
  )
    throw new Error('Attached invoices require the Attached status.');
  if (
    e.gstStatus === 'appeared' &&
    (!/^\d{4}-(0[1-9]|1[0-2])$/.test(e.gstPeriod) ||
      e.invoiceStatus !== 'attached' ||
      !e.gst ||
      !b.registrations.find((r) => r.id === e.registrationId)?.gstin)
  )
    throw new Error('GSTR-2B confirmation requires an invoice, GST amount, GSTIN and period.');
  if (paid(e) > e.amount) throw new Error('Total cannot be less than payments already recorded.');
}
export function recordExpensePayment(
  e: Expense,
  p: ExpensePayment,
  today = businessToday(),
): Expense {
  if (
    !validDate(p.date) ||
    p.date > today ||
    !p.method.trim() ||
    !Number.isSafeInteger(p.amount) ||
    p.amount <= 0 ||
    p.amount > e.amount - paid(e)
  )
    throw new Error(
      'Enter a completed payment with a valid date, method and amount within the outstanding balance.',
    );
  return { ...e, payments: [...e.payments, p] };
}
export function advanceDate(date: string, frequency: Recurrence['frequency'], anchorDay: number) {
  const [y, m] = date.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + (frequency === 'yearly' ? 12 : 1), 1));
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(Math.min(anchorDay, last)).padStart(2, '0')}`;
}
/** Deterministic occurrence IDs make retries and concurrent sessions safe. Bounded to fit a Firestore transaction. */
export function generateRecurring(b: Business, today = businessToday()): Business {
  let count = 0;
  const expenses = [...b.expenses];
  const recurrences = b.recurrences.map((r) => {
    let nextDate = r.nextDate;
    if (!validDate(nextDate)) throw new Error('Invalid recurring schedule date.');
    while (r.status === 'active' && nextDate <= today && count < 150) {
      const id = `${r.id}_${nextDate}`;
      if (!expenses.some((e) => e.id === id)) {
        const e: Expense = {
          ...r.template,
          id,
          date: nextDate,
          payments: [],
          invoices: [],
          invoiceStatus: r.template.invoiceStatus === 'none' ? 'none' : 'awaiting',
          gstStatus: r.template.gst > 0 ? 'pending' : 'not-applicable',
          gstPeriod: '',
          recurrenceId: r.id,
          review: true,
        };
        validateExpense(e, b);
        expenses.push(e);
      }
      nextDate = advanceDate(nextDate, r.frequency, r.anchorDay);
      count++;
    }
    return { ...r, nextDate };
  });
  return { ...b, expenses, recurrences };
}
/** Allocate each metric in paise; the final brand receives the rounding remainder. */
export function allocated(e: Expense, value: number, brandId: string) {
  if (!brandId) return value;
  let remaining = value;
  for (let i = 0; i < e.allocations.length; i++) {
    const a = e.allocations[i];
    const share =
      i === e.allocations.length - 1 ? remaining : Math.round((value * a.amount) / e.amount);
    remaining -= share;
    if (a.brandId === brandId) return share;
  }
  return 0;
}
export function allocatedOutstanding(e: Expense, brand: string) {
  return allocated(e, e.amount, brand) - allocated(e, paid(e), brand);
}
export function allocatedPayments(e: Expense, brand: string, inRange: (date: string) => boolean) {
  let cumulative = 0,
    total = 0;
  for (const payment of e.payments) {
    const before = allocated(e, cumulative, brand);
    cumulative += payment.amount;
    if (inRange(payment.date)) total += allocated(e, cumulative, brand) - before;
  }
  return total;
}
export function expenseSummary(b: Business, brand: string, from: string, to: string) {
  const inRange = (d: string) => (!from || d >= from) && (!to || d <= to);
  const relevant = b.expenses.filter(
    (e) => !brand || e.allocations.some((a) => a.brandId === brand),
  );
  const purchases = relevant.filter((e) => inRange(e.date));
  return {
    purchases,
    purchased: purchases.reduce((s, e) => s + allocated(e, e.amount, brand), 0),
    paid: relevant.reduce((s, e) => s + allocatedPayments(e, brand, inRange), 0),
    outstanding: purchases.reduce((s, e) => s + allocatedOutstanding(e, brand), 0),
    missing: purchases.filter((e) => e.invoiceStatus === 'awaiting').length,
    pendingGST: purchases
      .filter((e) => e.gstStatus === 'pending')
      .reduce((s, e) => s + allocated(e, e.gst, brand), 0),
    appearedGST: purchases
      .filter((e) => e.gstStatus === 'appeared')
      .reduce((s, e) => s + allocated(e, e.gst, brand), 0),
  };
}

/** Older brands inherit the sole registration until explicitly assigned. */
export function brandRegistration(b: Business, brandId: string) {
  const brand = b.brands.find((item) => item.id === brandId);
  if (!brand) return '';
  return brand.registrationId ?? (b.registrations.length === 1 ? b.registrations[0].id : '');
}
export function registrationForBrands(b: Business, brandIds: string[]) {
  const ids = brandIds.map((id) => brandRegistration(b, id));
  return ids.length && ids.every((id) => id && id === ids[0]) ? ids[0] : '';
}
export function saveBusinessRegistration(b: Business, registration: Registration): Business {
  const name = registration.name.trim();
  const gstin = registration.gstin.trim().toUpperCase();
  if (!name) throw new Error('Enter the legal business name.');
  if (gstin && !/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(gstin))
    throw new Error('Enter a valid 15-character GSTIN, or leave it empty if unregistered.');
  if (
    gstin &&
    b.registrations.some((r) => r.id !== registration.id && r.gstin.toUpperCase() === gstin)
  )
    throw new Error('This GSTIN already exists. Select its legal business for the brand.');
  const brands =
    b.registrations.length === 1 && !b.registrations.some((r) => r.id === registration.id)
      ? b.brands.map((brand) => ({
          ...brand,
          registrationId: brand.registrationId ?? b.registrations[0].id,
        }))
      : b.brands;
  return {
    ...b,
    brands,
    registrations: [
      ...b.registrations.filter((r) => r.id !== registration.id),
      { ...registration, name, gstin },
    ],
  };
}
export function saveBrand(b: Business, brand: Brand): Business {
  const name = brand.name.trim();
  if (
    !name ||
    b.brands.some((r) => r.id !== brand.id && r.name.toLowerCase() === name.toLowerCase())
  )
    throw new Error('Enter a unique brand name.');
  if (!b.registrations.some((r) => r.id === brand.registrationId))
    throw new Error('Choose the legal business that owns this brand.');
  return { ...b, brands: [...b.brands.filter((r) => r.id !== brand.id), { ...brand, name }] };
}
