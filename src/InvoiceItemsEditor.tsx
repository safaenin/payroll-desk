import { money } from './domain';
import { invoiceItemTotals, minor, type ExpenseItem } from './expenses';
export type InvoiceItemDraft = {
  id: string;
  description: string;
  quantity: string;
  unitPrice: string;
  gst: string;
};
export const blankInvoiceItem = (): InvoiceItemDraft => ({
  id: crypto.randomUUID(),
  description: '',
  quantity: '1',
  unitPrice: '',
  gst: '0',
});
export function parseInvoiceItems(drafts: InvoiceItemDraft[]): ExpenseItem[] {
  return drafts.map((draft) => {
    if (!/^\d+(\.\d{1,3})?$/.test(draft.quantity))
      throw new Error('Item quantities must be positive numbers with up to 3 decimal places.');
    return {
      id: draft.id,
      description: draft.description.trim(),
      quantity: Number(draft.quantity),
      unitPrice: minor(draft.unitPrice),
      gst: minor(draft.gst),
    };
  });
}
export function draftItemTotals(drafts: InvoiceItemDraft[]) {
  try {
    return invoiceItemTotals(parseInvoiceItems(drafts));
  } catch {
    return null;
  }
}
export default function InvoiceItemsEditor({
  items,
  onChange,
}: {
  items: InvoiceItemDraft[];
  onChange: (items: InvoiceItemDraft[]) => void;
}) {
  const totals = draftItemTotals(items);
  function update(id: string, key: keyof InvoiceItemDraft, value: string) {
    onChange(items.map((item) => (item.id === id ? { ...item, [key]: value } : item)));
  }
  return (
    <section className="invoice-items">
      <div className="invoice-items-heading">
        <div>
          <h3>Invoice items</h3>
          <p>
            Add every product or service on this invoice. Unit prices exclude GST; GST is the total
            tax for that line.
          </p>
        </div>
      </div>
      {items.map((item, index) => {
        const line = draftItemTotals([item]);
        return (
          <div className="invoice-item" key={item.id}>
            <div className="invoice-item-title">
              <strong>Item {index + 1}</strong>
              <button
                type="button"
                className="text-button"
                disabled={items.length === 1}
                onClick={() => onChange(items.filter((x) => x.id !== item.id))}
                aria-label={`Remove item ${index + 1}`}
              >
                Remove
              </button>
            </div>
            <label>
              Product or service
              <input
                aria-label={`Item ${index + 1} description`}
                required
                value={item.description}
                onChange={(e) => update(item.id, 'description', e.target.value)}
                placeholder="e.g. Laptop, mouse, setup service"
                maxLength={250}
              />
            </label>
            <div className="invoice-item-values">
              <label>
                Quantity
                <input
                  aria-label={`Item ${index + 1} quantity`}
                  type="number"
                  min="0.001"
                  step="0.001"
                  required
                  value={item.quantity}
                  onChange={(e) => update(item.id, 'quantity', e.target.value)}
                />
              </label>
              <label>
                Unit price before GST (₹)
                <input
                  aria-label={`Item ${index + 1} unit price`}
                  type="number"
                  min="0"
                  step="0.01"
                  required
                  value={item.unitPrice}
                  onChange={(e) => update(item.id, 'unitPrice', e.target.value)}
                />
              </label>
              <label>
                Line GST (₹)
                <input
                  aria-label={`Item ${index + 1} GST`}
                  type="number"
                  min="0"
                  step="0.01"
                  required
                  value={item.gst}
                  onChange={(e) => update(item.id, 'gst', e.target.value)}
                />
              </label>
            </div>
            <div className="invoice-line-total">
              Line total including GST <strong>{line ? money(line.amount) : '—'}</strong>
            </div>
          </div>
        );
      })}
      <button
        type="button"
        className="secondary"
        onClick={() => onChange([...items, blankInvoiceItem()])}
      >
        + Add another item
      </button>
      <dl className="invoice-totals">
        <dt>Subtotal before GST</dt>
        <dd>{totals ? money(totals.subtotal) : '—'}</dd>
        <dt>GST</dt>
        <dd>{totals ? money(totals.gst) : '—'}</dd>
        <dt>Invoice total</dt>
        <dd>
          <strong>{totals ? money(totals.amount) : '—'}</strong>
        </dd>
      </dl>
    </section>
  );
}
