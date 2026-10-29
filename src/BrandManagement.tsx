import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Building2, Tags, Plus, Pencil } from 'lucide-react';
import {
  brandRegistration,
  saveBrand,
  saveBusinessRegistration,
  type Brand,
  type Business,
  type Registration,
} from './expenses';

type Props = {
  business: Business;
  busy: boolean;
  persist: (next: Business, message: string) => Promise<void>;
  task: (fn: () => Promise<unknown>) => Promise<void>;
};
export default function BrandManagement({ business: b, busy, persist, task }: Props) {
  const [section, setSection] = useState<'brands' | 'businesses'>('brands');
  const [brand, setBrand] = useState<Brand | null>(null),
    [registration, setRegistration] = useState<Registration | null>(null),
    [error, setError] = useState('');
  const [selection, setSelection] = useState('');
  function editBrand(item?: Brand) {
    setError('');
    setSelection(item ? brandRegistration(b, item.id) : (b.registrations[0]?.id ?? 'new'));
    setBrand(item ?? { id: crypto.randomUUID(), name: '' });
  }
  function run(fn: () => Promise<void>) {
    void task(async () => {
      setError('');
      try {
        await fn();
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    });
  }
  return (
    <>
      <section className="panel brand-management">
        <div className="section-heading">
          <div>
            <div className="eyebrow">BUSINESS SETUP</div>
            <h2>Brands & legal businesses</h2>
            <p>One legal business and GSTIN can be shared by multiple brands.</p>
          </div>
          <button
            className="primary"
            disabled={busy}
            onClick={() =>
              section === 'brands'
                ? editBrand()
                : (setError(''), setRegistration({ id: crypto.randomUUID(), name: '', gstin: '' }))
            }
          >
            <Plus size={16} />
            {section === 'brands' ? 'Add brand' : 'Add legal business'}
          </button>
        </div>
        <div className="brand-section-tabs" role="tablist" aria-label="Business setup">
          <button
            role="tab"
            aria-selected={section === 'brands'}
            onClick={() => setSection('brands')}
          >
            <Tags size={16} />
            Brands <span>{b.brands.length}</span>
          </button>
          <button
            role="tab"
            aria-selected={section === 'businesses'}
            onClick={() => setSection('businesses')}
          >
            <Building2 size={16} />
            Legal businesses <span>{b.registrations.length}</span>
          </button>
        </div>
        {section === 'brands' ? (
          <div className="brand-card-grid">
            {b.brands.map((item) => {
              const r = b.registrations.find((r) => r.id === brandRegistration(b, item.id));
              return (
                <article className="brand-detail-card" key={item.id}>
                  <div className="brand-card-heading">
                    <span className="brand-mark">{item.name.slice(0, 2).toUpperCase()}</span>
                    <h3>{item.name}</h3>
                    <button
                      className="icon-button"
                      aria-label={`Edit ${item.name}`}
                      disabled={busy}
                      onClick={() => editBrand(item)}
                    >
                      <Pencil size={16} />
                    </button>
                  </div>
                  <dl>
                    <dt>Legal business</dt>
                    <dd>{r?.name ?? 'Assign a legal business'}</dd>
                    <dt>GSTIN</dt>
                    <dd>{r ? r.gstin || 'Not registered' : '—'}</dd>
                  </dl>
                  {r && (
                    <small>
                      Shared with{' '}
                      {b.brands
                        .filter(
                          (other) =>
                            other.id !== item.id && brandRegistration(b, other.id) === r.id,
                        )
                        .map((x) => x.name)
                        .join(', ') || 'no other brands'}
                    </small>
                  )}
                </article>
              );
            })}
            {!b.brands.length && (
              <div className="brand-empty">
                <Tags size={28} />
                <h3>Add your first brand</h3>
                <p>
                  Create Basickwear or another brand and choose its legal business. You can reuse
                  that business for every brand it owns.
                </p>
                <button className="primary" disabled={busy} onClick={() => editBrand()}>
                  Add brand
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="brand-card-grid">
            {b.registrations.map((r) => (
              <article className="brand-detail-card" key={r.id}>
                <div className="brand-card-heading">
                  <Building2 size={22} />
                  <h3>{r.name}</h3>
                  <button
                    className="icon-button"
                    aria-label={`Edit ${r.name}`}
                    disabled={busy}
                    onClick={() => {
                      setError('');
                      setRegistration(r);
                    }}
                  >
                    <Pencil size={16} />
                  </button>
                </div>
                <dl>
                  <dt>GSTIN</dt>
                  <dd>{r.gstin || 'Not registered'}</dd>
                  <dt>Brands</dt>
                  <dd>
                    {b.brands
                      .filter((item) => brandRegistration(b, item.id) === r.id)
                      .map((x) => x.name)
                      .join(', ') || 'No brands assigned yet'}
                  </dd>
                </dl>
              </article>
            ))}
            {!b.registrations.length && (
              <div className="brand-empty">
                <Building2 size={28} />
                <h3>No legal businesses yet</h3>
                <p>Add one here, or create it while adding your first brand.</p>
              </div>
            )}
          </div>
        )}
      </section>
      {brand && (
        <SetupDialog
          title={b.brands.some((x) => x.id === brand.id) ? 'Edit brand' : 'Add brand'}
          busy={busy}
          close={() => setBrand(null)}
        >
          <p className="setup-intro">
            Choose an existing legal business to share its legal name and GSTIN with this brand.
          </p>
          {error && (
            <div className="message error" role="alert">
              {error}
            </div>
          )}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              run(async () => {
                let next = b;
                let registrationId = selection;
                if (selection === 'new') {
                  const newRegistration = {
                    id: crypto.randomUUID(),
                    name: String(f.get('legalName')),
                    gstin: String(f.get('gstin')),
                  };
                  next = saveBusinessRegistration(next, newRegistration);
                  registrationId = newRegistration.id;
                }
                next = saveBrand(next, {
                  ...brand,
                  name: String(f.get('brandName')),
                  registrationId,
                });
                await persist(next, 'Brand saved.');
                setBrand(null);
              });
            }}
          >
            <fieldset disabled={busy}>
              <label>
                Brand name
                <input
                  name="brandName"
                  required
                  maxLength={100}
                  defaultValue={brand.name}
                  placeholder="e.g. Basickwear"
                  autoFocus
                />
              </label>
              <label>
                Owned by
                <select value={selection} onChange={(e) => setSelection(e.target.value)} required>
                  <option value="" disabled>
                    Select legal business
                  </option>
                  {b.registrations.map((r) => (
                    <option value={r.id} key={r.id}>
                      {r.name}
                      {r.gstin ? ` · ${r.gstin}` : ' · Not registered'}
                    </option>
                  ))}
                  <option value="new">+ Add a new legal business</option>
                </select>
              </label>
              {selection === 'new' ? (
                <div className="setup-registration-fields">
                  <label>
                    Legal business name
                    <input name="legalName" required placeholder="Name on your GST registration" />
                  </label>
                  <label>
                    GSTIN (optional if unregistered)
                    <input name="gstin" maxLength={15} placeholder="15-character GSTIN" />
                  </label>
                </div>
              ) : (
                selection && (
                  <div className="registration-preview">
                    <Building2 size={20} />
                    <div>
                      <strong>{b.registrations.find((r) => r.id === selection)?.name}</strong>
                      <small>
                        {b.registrations.find((r) => r.id === selection)?.gstin ||
                          'Not registered for GST'}
                      </small>
                      <small>These details are shared by all brands owned by this business.</small>
                    </div>
                  </div>
                )
              )}
              <div className="setup-dialog-actions">
                <button type="button" className="secondary" onClick={() => setBrand(null)}>
                  Cancel
                </button>
                <button className="primary">Save brand</button>
              </div>
            </fieldset>
          </form>
        </SetupDialog>
      )}
      {registration && (
        <SetupDialog
          title={
            b.registrations.some((r) => r.id === registration.id)
              ? 'Edit legal business'
              : 'Add legal business'
          }
          busy={busy}
          close={() => setRegistration(null)}
        >
          <p className="setup-intro">
            Keep one record for each legal business and GSTIN. Multiple brands can use the same
            record.
          </p>
          {error && (
            <div className="message error" role="alert">
              {error}
            </div>
          )}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              run(async () => {
                const next = saveBusinessRegistration(b, {
                  ...registration,
                  name: String(f.get('name')),
                  gstin: String(f.get('gstin')),
                });
                await persist(next, 'Legal business saved.');
                setRegistration(null);
              });
            }}
          >
            <fieldset disabled={busy}>
              <label>
                Legal business name
                <input name="name" required defaultValue={registration.name} autoFocus />
              </label>
              <label>
                GSTIN (optional if unregistered)
                <input name="gstin" maxLength={15} defaultValue={registration.gstin} />
              </label>
              {b.registrations.some((r) => r.id === registration.id) && (
                <p className="setup-intro">
                  Updating these details applies to every brand linked to this business.
                </p>
              )}
              <div className="setup-dialog-actions">
                <button type="button" className="secondary" onClick={() => setRegistration(null)}>
                  Cancel
                </button>
                <button className="primary">Save legal business</button>
              </div>
            </fieldset>
          </form>
        </SetupDialog>
      )}
    </>
  );
}
function SetupDialog({
  title,
  busy,
  close,
  children,
}: {
  title: string;
  busy: boolean;
  close: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  return (
    <dialog
      ref={ref}
      className="modal setup-dialog"
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
          disabled={busy}
          onClick={close}
          aria-label="Close dialog"
        >
          ×
        </button>
      </div>
      {children}
    </dialog>
  );
}
