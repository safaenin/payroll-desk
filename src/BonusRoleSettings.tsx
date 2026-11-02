import { useState } from 'react';
import { Plus, Pencil, Trash2, ShieldCheck } from 'lucide-react';
import {
  DEFAULT_BONUS_EXCLUSIONS,
  exactBonusRole,
  roleEarnsBonus,
  validateBonusExclusions,
} from './bonusRoles';
export default function BonusRoleSettings({
  roles,
  exact,
  knownRoles,
  busy,
  save,
}: {
  roles?: string[];
  exact?: boolean;
  knownRoles: string[];
  busy: boolean;
  save: (roles: string[]) => Promise<unknown>;
}) {
  const known = [
    ...new Map(
      knownRoles.filter((r) => r.trim()).map((r) => [exactBonusRole(r), r.trim()]),
    ).values(),
  ].sort();
  const legacy = roles ?? DEFAULT_BONUS_EXCLUSIONS;
  // Expand existing broad rules into explicit names before the user elects to save.
  const current = exact
    ? legacy
    : [
        ...new Map(
          [...legacy, ...known.filter((r) => !roleEarnsBonus(r, legacy))].map((r) => [
            exactBonusRole(r),
            r,
          ]),
        ).values(),
      ];
  const [draft, setDraft] = useState<string[] | null>(null);
  const [name, setName] = useState('');
  const [editing, setEditing] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [query, setQuery] = useState('');
  const locked = busy || saving;
  const rows = draft ?? current;
  const add = () => {
    try {
      const next =
        editing === null ? [...rows, name] : rows.map((r, i) => (i === editing ? name : r));
      setDraft(validateBonusExclusions(next, true));
      setName('');
      setEditing(null);
      setError('');
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const visible = known.filter((r) => r.toLowerCase().includes(query.toLowerCase()));
  return (
    <section className="panel bonus-role-panel">
      <header className="section-heading">
        <div>
          <span className="bonus-eyebrow">PAYROLL SETTINGS</span>
          <h2>Attendance bonus roles</h2>
          <p>Choose which exact roles are excluded from the attendance bonus.</p>
        </div>
        <span className="bonus-rule-chip">₹1,000 · 26 full days</span>
      </header>
      <div className="bonus-role-content">
        <div className="bonus-role-editor">
          <div className="bonus-subheading">
            <h3>Excluded roles</h3>
            <span>{rows.length} roles</span>
          </div>
          <p className="bonus-help">
            Copy the role from attendance, or select a suggested role. Capitalization and outer
            spaces are ignored; prefixes and punctuation must match.
          </p>
          {!exact && (
            <p className="bonus-migration">
              Existing rules are unchanged until you save. The list below includes known roles
              matched by the old rules. Review it to switch to exact matching.
            </p>
          )}
          <form
            className="bonus-add-row"
            onSubmit={(e) => {
              e.preventDefault();
              add();
            }}
          >
            <label className="bonus-role-input">
              {editing === null ? 'Role name' : 'Update role name'}
              <input
                list="bonus-known-roles"
                value={name}
                maxLength={100}
                disabled={locked}
                placeholder="e.g. FR_Security"
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            <datalist id="bonus-known-roles">
              {known.map((r) => (
                <option key={r} value={r} />
              ))}
            </datalist>
            <button className="secondary" disabled={locked || !name.trim()}>
              <Plus size={16} />
              {editing === null ? 'Add role' : 'Update'}
            </button>
            {editing !== null && (
              <button
                type="button"
                className="secondary"
                disabled={locked}
                onClick={() => {
                  setEditing(null);
                  setName('');
                }}
              >
                Cancel
              </button>
            )}
          </form>
          <div className="bonus-exclusions">
            {rows.map((role, i) => (
              <div className="bonus-role-row" key={role}>
                <div>
                  <strong>{role}</strong>
                  <span>Excluded from attendance bonus</span>
                </div>
                <div className="bonus-row-actions">
                  <button
                    type="button"
                    className="secondary"
                    disabled={locked}
                    aria-label={`Edit ${role}`}
                    onClick={() => {
                      setEditing(i);
                      setName(role);
                    }}
                  >
                    <Pencil size={15} />
                  </button>
                  <button
                    type="button"
                    className="secondary"
                    disabled={locked}
                    aria-label={`Remove ${role}`}
                    onClick={() => {
                      setDraft(rows.filter((_, n) => n !== i));
                      setEditing(null);
                      setName('');
                    }}
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            ))}
          </div>
          {!rows.length && (
            <p className="bonus-empty">
              No role exclusions. All roles can qualify under the employee and attendance
              requirements.
            </p>
          )}
        </div>
        <aside className="bonus-role-preview">
          <div className="bonus-subheading">
            <h3>Role preview</h3>
            <ShieldCheck size={18} />
          </div>
          <p className="bonus-help">
            Roles found in employee wage profiles and attendance. Preview includes unsaved changes.
          </p>
          <input
            aria-label="Search role preview"
            placeholder="Search roles…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <div className="bonus-preview-list">
            {visible.map((role) => (
              <div key={role}>
                <span>{role}</span>
                <span className={`badge ${roleEarnsBonus(role, rows, true) ? 'green' : 'gray'}`}>
                  {roleEarnsBonus(role, rows, true) ? 'Can qualify' : 'Excluded'}
                </span>
              </div>
            ))}
            {!visible.length && <p className="bonus-help">No matching roles found.</p>}
          </div>
          <p className="bonus-help">
            “Can qualify” also requires the employee’s eligibility checkbox and 26 full present
            days. Half-days do not count. Fixed monthly pay is excluded.
          </p>
        </aside>
      </div>
      <footer className="bonus-save-bar">
        <div>
          {error && (
            <p role="alert" className="issue">
              {error}
            </p>
          )}
          <p>Approved payroll stays unchanged. New, unlisted roles can qualify.</p>
          {name.trim() && <small>Add or cancel the role being edited before saving.</small>}
        </div>
        <div className="bonus-save-actions">
          <button
            className="secondary"
            disabled={locked || (draft === null && !name)}
            onClick={() => {
              setDraft(null);
              setName('');
              setEditing(null);
              setError('');
            }}
          >
            Discard
          </button>
          <button
            className="primary"
            disabled={locked || !!name.trim() || (draft === null && !!exact)}
            onClick={async () => {
              setSaving(true);
              setError('');
              try {
                await save(validateBonusExclusions(rows, true));
                setDraft(null);
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setSaving(false);
              }
            }}
          >
            {saving ? 'Saving…' : 'Save role settings'}
          </button>
        </div>
      </footer>
    </section>
  );
}
