import { useState } from 'react';
import { DEFAULT_BONUS_EXCLUSIONS, validateBonusExclusions } from './bonusRoles';
export default function BonusRoleSettings({
  roles,
  busy,
  save,
}: {
  roles?: string[];
  busy: boolean;
  save: (roles: string[]) => Promise<unknown>;
}) {
  const current = roles ?? DEFAULT_BONUS_EXCLUSIONS;
  const [draft, setDraft] = useState<string[] | null>(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  busy = busy || saving;
  const rows = draft ?? current;
  return (
    <section className="panel">
      <div className="section-heading">
        <h2>Attendance bonus roles</h2>
      </div>
      <div className="settings-body">
        <p>
          Roles listed below are excluded from the ₹1,000 attendance bonus. Other roles can qualify
          with 26 full present days and employee eligibility enabled. Fixed monthly pay remains
          excluded.
        </p>
        <p>
          Names match within the role, ignoring case, spaces, hyphens and the FR_ prefix. For
          example, Security also excludes FR_Security Guard.
        </p>
        <form
          onSubmit={async (event) => {
            event.preventDefault();
            setError('');
            setSaving(true);
            try {
              await save(validateBonusExclusions(rows));
              setDraft(null);
            } catch (e) {
              setError(e instanceof Error ? e.message : String(e));
            } finally {
              setSaving(false);
            }
          }}
        >
          {rows.map((role, index) => (
            <div className="form-grid" key={index}>
              <label>
                Excluded role {index + 1}
                <input
                  value={role}
                  disabled={busy}
                  maxLength={100}
                  onChange={(e) => setDraft(rows.map((r, i) => (i === index ? e.target.value : r)))}
                />
              </label>
              <button
                type="button"
                className="secondary"
                disabled={busy}
                aria-label={`Remove excluded role ${index + 1}`}
                onClick={() => setDraft(rows.filter((_, i) => i !== index))}
              >
                Remove
              </button>
            </div>
          ))}
          {!rows.length && (
            <p>
              No roles are excluded. Employee eligibility and attendance requirements still apply.
            </p>
          )}
          <button
            type="button"
            className="secondary"
            disabled={busy}
            onClick={() => setDraft([...rows, ''])}
          >
            Add excluded role
          </button>
          <p>
            Saving affects draft payroll and future revisions. Approved payroll stays unchanged.
            Removing an exclusion does not enable an employee’s individual bonus setting
            automatically.
          </p>
          {error && (
            <p role="alert" className="issue">
              {error}
            </p>
          )}
          <button className="primary" disabled={busy || draft === null}>
            Save bonus roles
          </button>{' '}
          <button
            type="button"
            className="secondary"
            disabled={busy || draft === null}
            onClick={() => {
              setDraft(null);
              setError('');
            }}
          >
            Cancel changes
          </button>
        </form>
      </div>
    </section>
  );
}
