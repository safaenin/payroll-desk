import { useEffect, useRef, useState } from 'react';
import { FileText } from 'lucide-react';
import type { State, FileRecord } from './domain';
import {
  DOCUMENT_TYPES,
  validateDocument,
  linkDocument,
  activeDocuments,
  requestDocumentDeletion,
  completeDocumentDeletion,
} from './documents';
import { uploadDrive, trashDriveFile, organizeEmployeeDocuments } from './storage';

export default function DocumentsPanel({
  state,
  busy,
  cloud,
  connected,
  connect,
  save,
  task,
}: {
  state: State;
  busy: boolean;
  cloud: boolean;
  connected: boolean;
  connect: () => Promise<void>;
  save: (next: State, message: string, previous?: State) => Promise<State>;
  task: (fn: () => Promise<void>) => Promise<void>;
}) {
  const [code, setCode] = useState(''),
    [documentType, setType] = useState('aadhaar'),
    [effectiveDate, setDate] = useState(''),
    [note, setNote] = useState('');
  const [organization, setOrganization] = useState('');
  const [pendingLink, setPendingLink] = useState<FileRecord | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<FileRecord | null>(null);
  const deleteDialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (deleteTarget) deleteDialog.current?.showModal();
  }, [deleteTarget]);
  const input = useRef<HTMLInputElement>(null);
  const employee = state.employees.find((e) => e.code === code);
  const files = activeDocuments(state)
    .filter((f) => !code || f.code === code)
    .slice()
    .sort((a, b) =>
      (b.effectiveDate || b.uploadedAt).localeCompare(a.effectiveDate || a.uploadedAt),
    );
  async function remove(file: FileRecord) {
    let current = state;
    if (!current.fileDeletions?.some((d) => d.id === file.id))
      current = await save(
        requestDocumentDeletion(current, file.id),
        'Document removed from employee checklist. Moving file to Drive Trash…',
        current,
      );
    setDeleteTarget(null);
    try {
      await trashDriveFile(file.id);
      await save(
        completeDocumentDeletion(current, file.id),
        'Document deleted and moved to Google Drive Trash.',
        current,
      );
    } catch (e) {
      throw new Error(
        `The document is removed from the checklist, but Drive cleanup is pending. Use Retry below. ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }
  return (
    <section className="panel">
      <div className="section-heading">
        <div>
          <h2>Employee documents</h2>
          <p>Files belong to an employee code. Every upload is kept as a separate record.</p>
        </div>
        <button className="secondary" disabled={!cloud || busy} onClick={() => void task(connect)}>
          {connected ? 'Reconnect Google Drive' : 'Connect Google Drive'}
        </button>
      </div>
      <div className="settings-body">
        <p>
          Drive folder: employees / name-employeeCode. Employee codes keep same-name employees
          separate.
        </p>
        <button
          className="secondary"
          disabled={!cloud || !connected || busy}
          onClick={() => void task(() => organizeEmployeeDocuments(state, setOrganization))}
        >
          Organize existing documents into folders
        </button>
        {organization && <p role="status">{organization}</p>}
        <label>
          Employee
          <select
            aria-label="Document employee"
            disabled={busy}
            value={code}
            onChange={(e) => {
              setCode(e.target.value);
              setDate('');
              setNote('');
            }}
          >
            <option value="">All employees — select one to upload</option>
            {state.employees.map((e) => (
              <option key={e.code} value={e.code}>
                {e.name} · {e.code}
              </option>
            ))}
          </select>
        </label>
        {employee && (
          <>
            <div className="document-checks">
              {DOCUMENT_TYPES.map((t) => {
                const count = files.filter((f) => f.documentType === t.id).length;
                return (
                  <div key={t.id}>
                    <strong>{t.label}</strong>
                    <span className={`badge ${count ? 'green' : 'amber'}`}>
                      {count ? `${count} file${count === 1 ? '' : 's'}` : 'Not uploaded'}
                    </span>
                  </div>
                );
              })}
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void task(async () => {
                  validateDocument({ documentType, effectiveDate, note });
                  input.current?.click();
                });
              }}
            >
              <div className="form-grid">
                <label>
                  Document type
                  <select
                    value={documentType}
                    disabled={busy}
                    onChange={(e) => {
                      setType(e.target.value);
                      setDate('');
                      setNote('');
                    }}
                  >
                    {DOCUMENT_TYPES.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  {documentType === 'signed-offer-letter'
                    ? 'Offer effective date'
                    : 'Document date (optional)'}
                  <input
                    type="date"
                    required={documentType === 'signed-offer-letter'}
                    disabled={busy}
                    value={effectiveDate}
                    onChange={(e) => setDate(e.target.value)}
                  />
                </label>
              </div>
              <label>
                Role / promotion or document note (optional)
                <input
                  value={note}
                  disabled={busy}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="e.g. Promoted to Shift-Incharge"
                />
              </label>
              <p className="document-help">
                Signed offer letters are kept by effective date. Uploading a promotion letter
                preserves all earlier letters and does not change payroll wages automatically.
              </p>
              <button className="primary" disabled={!cloud || !connected || busy}>
                Choose file and upload
              </button>
              <small>Up to 5 MB per file. Files remain private in Google Drive.</small>
            </form>
          </>
        )}
        {!cloud && <p>Sign in to your Firestore workspace to upload employee documents.</p>}
        {pendingLink && (
          <div className="message error">
            <div>
              <p>
                The file is in Drive but its employee link is not saved yet. Do not upload it again.
              </p>
              <a href={pendingLink.url} target="_blank" rel="noreferrer">
                Open uploaded file
              </a>
              <button
                className="secondary"
                disabled={busy}
                onClick={() =>
                  void task(async () => {
                    await save(linkDocument(state, pendingLink), 'Employee document link saved.');
                    setPendingLink(null);
                  })
                }
              >
                Retry saving employee link
              </button>
            </div>
          </div>
        )}
      </div>
      <input
        ref={input}
        hidden
        type="file"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (!file) return;
          const owner = code,
            details = { documentType, effectiveDate, note: note.trim() };
          void task(async () => {
            const record = await uploadDrive(file, owner, details, employee?.name ?? owner);
            setPendingLink(record);
            try {
              await save(linkDocument(state, record), 'Document uploaded and linked to employee.');
              setPendingLink(null);
            } catch (err) {
              throw new Error(
                `Uploaded to Drive, but saving its employee link failed. Use Retry saving employee link below. ${err instanceof Error ? err.message : String(err)}`,
              );
            }
          });
        }}
      />
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>EMPLOYEE</th>
              <th>TYPE</th>
              <th>FILE</th>
              <th>EFFECTIVE / DOCUMENT DATE</th>
              <th>NOTE</th>
              <th>UPLOADED</th>
              <th>ACTIONS</th>
            </tr>
          </thead>
          <tbody>
            {files.map((f) => (
              <tr key={f.id}>
                <td>
                  <strong>{state.employees.find((e) => e.code === f.code)?.name ?? f.code}</strong>
                  <small>{f.code}</small>
                </td>
                <td>
                  {DOCUMENT_TYPES.find((t) => t.id === f.documentType)?.label ??
                    'Unclassified (earlier upload)'}
                </td>
                <td>
                  <a href={f.url} target="_blank" rel="noreferrer">
                    <FileText size={13} /> {f.name}
                  </a>
                </td>
                <td>{f.effectiveDate || '—'}</td>
                <td>{f.note || '—'}</td>
                <td>{f.uploadedAt.slice(0, 10)}</td>
                <td>
                  <button
                    className="text-button"
                    disabled={!cloud || !connected || busy}
                    onClick={() => setDeleteTarget(f)}
                  >
                    Delete document
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!files.length && (
        <div className="empty">
          <h3>No documents uploaded{employee ? ' for this employee' : ''}</h3>
          <p>Select an employee, choose a document type, and upload the file.</p>
        </div>
      )}
      {deleteTarget && (
        <dialog
          ref={deleteDialog}
          className="modal"
          aria-label="Confirm document deletion"
          onCancel={(e) => {
            e.preventDefault();
            if (!busy) setDeleteTarget(null);
          }}
        >
          <h3>Delete this document?</h3>
          <p>
            <strong>{deleteTarget.name}</strong> ·{' '}
            {state.employees.find((e) => e.code === deleteTarget.code)?.name ?? deleteTarget.code} (
            {deleteTarget.code}) ·{' '}
            {DOCUMENT_TYPES.find((t) => t.id === deleteTarget.documentType)?.label ??
              'Unclassified'}
          </p>
          <p>
            The file will move to Google Drive Trash. If this is the last document of this type, its
            checklist will show Not uploaded. Other documents and offer letters will remain.
          </p>
          <button className="secondary" disabled={busy} onClick={() => setDeleteTarget(null)}>
            Cancel
          </button>
          <button
            className="primary"
            disabled={busy}
            onClick={() => void task(() => remove(deleteTarget))}
          >
            Confirm delete
          </button>
        </dialog>
      )}
      {(state.fileDeletions ?? [])
        .filter((d) => d.status === 'pending')
        .map((d) => {
          const file = state.files.find((f) => f.id === d.id);
          if (!file || (code && file.code !== code)) return null;
          return (
            <div className="history-row" key={d.id}>
              <div>
                <strong>{file.name}</strong>
                <small>
                  {file.code} · Removed from checklist; moving to Drive Trash is pending.
                </small>
                <button
                  className="secondary"
                  disabled={!cloud || !connected || busy}
                  onClick={() => void task(() => remove(file))}
                >
                  Retry Drive cleanup
                </button>
              </div>
            </div>
          );
        })}
    </section>
  );
}
