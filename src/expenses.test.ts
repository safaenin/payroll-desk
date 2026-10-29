import { describe, it, expect } from 'vitest';
import {
  allocated,
  advanceDate,
  emptyBusiness,
  expenseSummary,
  generateRecurring,
  minor,
  recordExpensePayment,
  validateExpense,
  type Business,
  type Expense,
} from './expenses';
const expense = (): Expense => ({
  id: 'e',
  description: 'Laptop',
  supplier: 'Store',
  invoiceNumber: 'INV1',
  date: '2026-01-31',
  category: 'Equipment',
  registrationId: 'gst',
  amount: 10001,
  gst: 1800,
  allocations: [
    { brandId: 'a', amount: 6001 },
    { brandId: 'b', amount: 4000 },
  ],
  invoiceStatus: 'awaiting',
  invoices: [],
  gstStatus: 'pending',
  gstPeriod: '',
  payments: [],
  employeeCode: '',
  notes: '',
  review: false,
});
const business = (): Business => ({
  ...emptyBusiness(),
  brands: [
    { id: 'a', name: 'Basickwear' },
    { id: 'b', name: 'Other' },
  ],
  registrations: [{ id: 'gst', name: 'Business', gstin: '27ABCDE1234F1Z5' }],
  expenses: [expense()],
});
describe('expense accounting', () => {
  it('stores exact paise and rejects excess precision and unsafe values', () => {
    expect(minor('123.45')).toBe(12345);
    for (const value of ['1.234', '-1', 'NaN', '', '999999999999999999'])
      expect(() => minor(value)).toThrow();
  });
  it('requires exact and unique brand allocations', () => {
    const b = business();
    expect(() => validateExpense(expense(), b)).not.toThrow();
    expect(() =>
      validateExpense({ ...expense(), allocations: [{ brandId: 'a', amount: 10000 }] }, b),
    ).toThrow('allocations');
    expect(() =>
      validateExpense(
        {
          ...expense(),
          allocations: [
            { brandId: 'a', amount: 6001 },
            { brandId: 'a', amount: 4000 },
          ],
        },
        b,
      ),
    ).toThrow('allocations');
  });
  it('validates GST, invoice evidence and period together', () => {
    const b = business(),
      e = { ...expense(), gstStatus: 'appeared' as const, gstPeriod: '2026-02' };
    expect(() => validateExpense(e, b)).toThrow('confirmation');
    const attached = {
      ...e,
      invoiceStatus: 'attached' as const,
      invoices: [
        {
          id: 'i',
          name: 'invoice.pdf',
          url: 'https://drive.google.com/file/d/i/view',
          uploadedAt: 'now',
        },
      ],
    };
    expect(() => validateExpense(attached, b)).not.toThrow();
    expect(() => validateExpense({ ...attached, gstPeriod: '2026-13' }, b)).toThrow();
    expect(() => validateExpense({ ...attached, gst: attached.amount + 1 }, b)).toThrow();
  });
  it('rejects invalid calendar dates', () =>
    expect(() => validateExpense({ ...expense(), date: '2026-02-30' }, business())).toThrow(
      'date',
    ));
  it('records partial payments and prevents overpayments and future dates', () => {
    let e = recordExpensePayment(
      expense(),
      { id: 'p', amount: 6000, date: '2026-02-01', method: 'UPI', reference: 'a' },
      '2026-02-03',
    );
    expect(e.payments).toHaveLength(1);
    expect(() =>
      recordExpensePayment(
        e,
        { id: 'q', amount: 4002, date: '2026-02-02', method: 'Cash', reference: '' },
        '2026-02-03',
      ),
    ).toThrow();
    expect(() =>
      recordExpensePayment(
        e,
        { id: 'q', amount: 1, date: '2026-02-04', method: 'Cash', reference: '' },
        '2026-02-03',
      ),
    ).toThrow();
    expect(() =>
      validateExpense(
        { ...e, amount: 5000, allocations: [{ brandId: 'a', amount: 5000 }] },
        business(),
      ),
    ).toThrow('payments');
  });
  it('distinguishes purchase dates from payment dates, even for older purchases', () => {
    const b = business();
    b.expenses[0].payments = [
      { id: 'p', amount: 5000, date: '2026-02-05', method: 'Bank', reference: '' },
    ];
    const s = expenseSummary(b, 'a', '2026-02-01', '2026-02-28');
    expect(s.purchased).toBe(0);
    expect(s.paid).toBe(3000);
    expect(s.missing).toBe(0);
  });
  it('keeps brand metric totals exact through rounding', () => {
    const e = expense();
    for (const n of [1, 2, 199, 10001]) expect(allocated(e, n, 'a') + allocated(e, n, 'b')).toBe(n);
  });
  it('preserves brand totals across many small partial payments', () => {
    const b = business();
    b.expenses[0].amount = 100;
    b.expenses[0].allocations = [
      { brandId: 'a', amount: 60 },
      { brandId: 'b', amount: 40 },
    ];
    b.expenses[0].payments = Array.from({ length: 100 }, (_, i) => ({
      id: String(i),
      amount: 1,
      date: '2026-02-01',
      method: 'Cash',
      reference: '',
    }));
    expect(expenseSummary(b, 'a', '', '').paid).toBe(60);
    expect(expenseSummary(b, 'a', '', '').outstanding).toBe(0);
  });
  it('separates invoice followups from no-invoice cash purchases', () => {
    const b = business();
    b.expenses[0].invoiceStatus = 'none';
    expect(expenseSummary(b, '', '', '').missing).toBe(0);
  });
});
describe('recurring expense schedules', () => {
  function recurring() {
    const b = business();
    b.recurrences = [
      {
        id: 'r',
        template: expense(),
        frequency: 'monthly',
        nextDate: '2026-01-31',
        anchorDay: 31,
        status: 'active',
      },
    ];
    return b;
  }
  it('clamps month ends and restores the original day', () => {
    expect(advanceDate('2026-01-31', 'monthly', 31)).toBe('2026-02-28');
    expect(advanceDate('2026-02-28', 'monthly', 31)).toBe('2026-03-31');
    expect(advanceDate('2024-02-29', 'yearly', 29)).toBe('2025-02-28');
  });
  it('catches up exactly once and resets invoices, GST confirmations and payments', () => {
    const b = recurring();
    b.recurrences[0].template.payments = [
      { id: 'p', date: '2026-01-31', amount: 100, method: 'Cash', reference: '' },
    ];
    const next = generateRecurring(b, '2026-03-31');
    expect(next.expenses).toHaveLength(4);
    expect(next.expenses.at(-1)).toMatchObject({
      date: '2026-03-31',
      payments: [],
      invoices: [],
      gstStatus: 'pending',
      review: true,
    });
    expect(generateRecurring(next, '2026-03-31')).toEqual(next);
  });
  it('does not generate paused or cancelled occurrences', () => {
    for (const status of ['paused', 'cancelled'] as const) {
      const b = recurring();
      b.recurrences[0].status = status;
      expect(generateRecurring(b, '2026-03-31').expenses).toHaveLength(1);
    }
  });
  it('preserves existing purchases when future prices change', () => {
    let b = generateRecurring(recurring(), '2026-01-31');
    const existing = structuredClone(b.expenses);
    b.recurrences[0].template = {
      ...expense(),
      amount: 20000,
      allocations: [{ brandId: 'a', amount: 20000 }],
    };
    b = generateRecurring(b, '2026-02-28');
    expect(b.expenses.slice(0, 2)).toEqual(existing);
    expect(b.expenses.at(-1)?.amount).toBe(20000);
  });
  it('bounds a large backlog to transaction limits', () => {
    const b = recurring();
    b.recurrences[0].nextDate = '2000-01-31';
    const next = generateRecurring(b, '2026-10-28');
    expect(next.expenses.length - b.expenses.length).toBe(150);
    expect(generateRecurring(next, '2026-10-28').expenses.length).toBeGreaterThan(
      next.expenses.length,
    );
  });
});

describe('brands sharing legal businesses', () => {
  it('lets multiple brands share the same legal name and GSTIN', async () => {
    const { saveBrand, registrationForBrands } = await import('./expenses');
    let b = business();
    b = saveBrand(b, { ...b.brands[0], registrationId: 'gst' });
    b = saveBrand(b, { ...b.brands[1], registrationId: 'gst' });
    expect(b.registrations).toHaveLength(1);
    expect(registrationForBrands(b, ['a', 'b'])).toBe('gst');
  });
  it('preserves existing brand ownership when another business is added', async () => {
    const { saveBusinessRegistration, brandRegistration } = await import('./expenses');
    const b = saveBusinessRegistration(business(), {
      id: 'other',
      name: 'Second business',
      gstin: '',
    });
    expect(brandRegistration(b, 'a')).toBe('gst');
    expect(brandRegistration(b, 'b')).toBe('gst');
  });
  it('updates shared business details without duplicating registrations', async () => {
    const { saveBusinessRegistration, brandRegistration } = await import('./expenses');
    const b = saveBusinessRegistration(business(), {
      id: 'gst',
      name: 'Updated legal name',
      gstin: '27abcde1234f1z5',
    });
    expect(b.registrations).toEqual([
      { id: 'gst', name: 'Updated legal name', gstin: '27ABCDE1234F1Z5' },
    ]);
    expect(brandRegistration(b, 'a')).toBe('gst');
    expect(brandRegistration(b, 'b')).toBe('gst');
  });
  it('rejects duplicate GSTINs and invalid brand assignments', async () => {
    const { saveBusinessRegistration, saveBrand } = await import('./expenses');
    expect(() =>
      saveBusinessRegistration(business(), {
        id: 'second',
        name: 'Duplicate',
        gstin: '27ABCDE1234F1Z5',
      }),
    ).toThrow('already exists');
    expect(() =>
      saveBrand(business(), { id: 'new', name: 'New', registrationId: 'missing' }),
    ).toThrow('legal business');
    expect(() =>
      saveBrand(business(), { id: 'new', name: ' basickwear ', registrationId: 'gst' }),
    ).toThrow('unique');
  });
  it('leaves registration selection to the user for brands with different owners', async () => {
    const { saveBusinessRegistration, saveBrand, registrationForBrands } =
      await import('./expenses');
    let b = saveBusinessRegistration(business(), { id: 'second', name: 'Second', gstin: '' });
    b = saveBrand(b, { id: 'b', name: 'Other', registrationId: 'second' });
    expect(registrationForBrands(b, ['a', 'b'])).toBe('');
    expect(registrationForBrands(b, ['b'])).toBe('second');
  });
});
