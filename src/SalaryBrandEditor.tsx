import { useState } from 'react';
import { salaryShares, validateSalaryAssignment, type SalaryBrandAssignment } from './brandPayroll';
import type { Employee } from './domain';
import type { Brand } from './expenses';
export default function SalaryBrandEditor({
  employee,
  brands,
  onChange,
  onError,
}: {
  employee: Employee | null;
  brands: Brand[];
  onChange: (value: SalaryBrandAssignment | null) => void;
  onError: (error: string) => void;
}) {
  const [from, setFrom] = useState(''),
    [shares, setShares] = useState<{ brandId: string; percentage: string }[]>([]),
    [error, setError] = useState('');
  function update(date: string, rows: typeof shares) {
    setFrom(date);
    setShares(rows);
    try {
      const value = {
        from: date,
        shares: rows.map((r) => ({
          brandId: r.brandId,
          basisPoints: Math.round(Number(r.percentage) * 100),
        })),
      };
      validateSalaryAssignment(
        value,
        brands.map((b) => b.id),
      );
      setError('');
      onError('');
      onChange(value);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setError(message);
      onError(message);
      onChange(null);
    }
  }
  return (
    <section className="salary-brand-editor">
      <h3>Salary brands</h3>
      <p>
        Assign 100% to one brand, or split the salary. New allocations take effect from the selected
        payroll month.
      </p>
      {employee?.brandHistory?.map((a) => (
        <p key={a.from}>
          <strong>{a.from}</strong> ·{' '}
          {a.shares
            .map(
              (s) =>
                `${brands.find((b) => b.id === s.brandId)?.name ?? 'Unknown brand'} ${s.basisPoints / 100}%`,
            )
            .join(' / ')}
        </p>
      ))}
      {!brands.length ? (
        <p>Add brands in Expenses → Brands & businesses first.</p>
      ) : (
        <>
          <label>
            Allocation effective from
            <input
              type="month"
              value={from}
              onChange={(e) => {
                const date = e.target.value;
                const current = salaryShares(employee ?? undefined, date);
                update(
                  date,
                  shares.length
                    ? shares
                    : current.length
                      ? current.map((s) => ({
                          brandId: s.brandId,
                          percentage: String(s.basisPoints / 100),
                        }))
                      : [{ brandId: brands[0].id, percentage: '100' }],
                );
              }}
            />
          </label>
          {shares.map((s, i) => (
            <div className="expense-split" key={i}>
              <select
                aria-label={`Salary brand ${i + 1}`}
                value={s.brandId}
                onChange={(e) =>
                  update(
                    from,
                    shares.map((r, j) => (i === j ? { ...r, brandId: e.target.value } : r)),
                  )
                }
              >
                {brands.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
              <input
                aria-label={`Salary percentage ${i + 1}`}
                type="number"
                min="0.01"
                max="100"
                step="0.01"
                value={s.percentage}
                onChange={(e) =>
                  update(
                    from,
                    shares.map((r, j) => (i === j ? { ...r, percentage: e.target.value } : r)),
                  )
                }
              />
              <span>%</span>
              <button
                type="button"
                className="text-button"
                disabled={shares.length === 1}
                onClick={() =>
                  update(
                    from,
                    shares.filter((_, j) => i !== j),
                  )
                }
              >
                Remove
              </button>
            </div>
          ))}
          <button
            type="button"
            className="secondary"
            disabled={!from || shares.length >= brands.length}
            onClick={() => {
              const next = brands.find((b) => !shares.some((s) => s.brandId === b.id));
              if (next) update(from, [...shares, { brandId: next.id, percentage: '0' }]);
            }}
          >
            Split across another brand
          </button>
          {from && (
            <button
              type="button"
              className="text-button"
              onClick={() => {
                setFrom('');
                setShares([]);
                setError('');
                onError('');
                onChange(null);
              }}
            >
              Discard allocation change
            </button>
          )}
          {error && (
            <p className="issue" role="alert">
              {error}
            </p>
          )}
        </>
      )}
    </section>
  );
}
