import { AlertTriangle, CheckCircle2, FileText } from 'lucide-react';
import { type Employee, type State, monthDates, rateLabel } from './domain';
import { activeDocuments, DOCUMENT_TYPES } from './documents';
import { attendanceCounts, attendanceLabels } from './attendanceEditor';

export default function EmployeeDetail({ employee, state }: { employee: Employee; state: State }) {
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
  const month = today.slice(0, 7);
  const title = new Intl.DateTimeFormat('en-IN', {
    month: 'long',
    year: 'numeric',
    timeZone: 'Asia/Kolkata',
  }).format(new Date(`${month}-01T00:00:00Z`));
  const rate = [...employee.rates]
    .sort((a, b) => b.from.localeCompare(a.from))
    .find((r) => r.from <= today);
  const rows = state.attendance.filter((r) => r.code === employee.code && r.date.startsWith(month));
  const { counts, payable } = attendanceCounts(rows, month);
  const files = activeDocuments(state).filter((f) => f.code === employee.code);
  const missingFields = [
    !employee.name.trim() && 'Full name',
    !employee.code.trim() && 'Employee code',
    !rate?.role.trim() && 'Current role',
    !rate && 'Current wage',
    !employee.offerSent && 'Offer letter not marked as sent',
  ].filter(Boolean);
  const missingDocs = DOCUMENT_TYPES.filter((t) => !files.some((f) => f.documentType === t.id));
  const incomplete = missingFields.length + missingDocs.length;
  const missingDates = monthDates(month).filter(
    (date) => date <= today && !rows.some((r) => r.date === date),
  ).length;
  return (
    <div className="employee-detail">
      <header className="employee-detail-identity">
        <span className="person-avatar">
          {employee.name
            .trim()
            .split(/\s+/)
            .slice(0, 2)
            .map((n) => n[0])
            .join('')}
        </span>
        <div>
          <h3>{employee.name || 'Name not recorded'}</h3>
          <p>
            {employee.code} · {rate?.role || 'Role not set'}
          </p>
        </div>
        <span className={`badge ${employee.active ? 'green' : 'gray'}`}>
          {employee.active ? 'Active' : 'Inactive'}
        </span>
      </header>
      <div className={`employee-detail-notice ${incomplete ? 'incomplete' : ''}`} role="status">
        {incomplete ? <AlertTriangle size={20} /> : <CheckCircle2 size={20} />}
        <div>
          <strong>{incomplete ? `${incomplete} items need attention` : 'Profile complete'}</strong>
          <p>
            {incomplete
              ? 'Missing information is highlighted below.'
              : 'Required details and documents are complete.'}
          </p>
        </div>
      </div>
      <section>
        <h3>Employee details</h3>
        <dl className="employee-detail-fields">
          {[
            ['Full name', employee.name],
            ['Employee code', employee.code],
            ['Bank type', employee.bankType ?? 'NONE'],
            ['Current role', rate?.role],
            ['Current wage', rate ? rateLabel(rate) : ''],
            [
              'Attendance source',
              employee.manualPayroll ? 'Manual attendance' : 'Attendance import',
            ],
            ['Offer letter sent', employee.offerSent ? 'Yes' : 'Not completed'],
          ].map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd className={!value || value === 'Not completed' ? 'detail-missing' : ''}>
                {value || 'Required · not recorded'}
              </dd>
            </div>
          ))}
        </dl>
      </section>
      <section>
        <div className="employee-detail-section-title">
          <h3>Current-month attendance</h3>
          <span>{title}</span>
        </div>
        <div className="employee-detail-counts">
          {Object.entries(attendanceLabels).map(([key, label]) => (
            <div key={key}>
              <strong>{counts[key] || 0}</strong>
              <span>{label}</span>
            </div>
          ))}
        </div>
        <p className="employee-detail-caption">
          {payable} payable days · {missingDates} unrecorded dates through today · ? Pending
        </p>
        {!rows.length && (
          <p className="employee-detail-empty">
            No attendance recorded for {title}. Unrecorded dates are not counted as absent.
          </p>
        )}
        <div className="employee-detail-calendar" aria-label={`Attendance for ${title}`}>
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
            <span className="detail-weekday" key={d}>
              {d}
            </span>
          ))}
          {Array.from({ length: new Date(`${month}-01T00:00:00Z`).getUTCDay() }, (_, i) => (
            <span key={`blank-${i}`} />
          ))}
          {monthDates(month).map((date) => {
            const row = rows.find((r) => r.date === date);
            return (
              <div
                key={date}
                className={`detail-day ${row?.status === 'P' ? 'present' : row?.status === 'A' ? 'absent' : ''} ${date > today ? 'future' : ''}`}
                title={`${date}: ${row ? `${attendanceLabels[row.status] ?? row.status}, ${row.payable} payable days` : date > today ? 'Upcoming' : 'Not recorded'}`}
              >
                <span>{Number(date.slice(-2))}</span>
                <strong>{row?.status === 'Pending' ? '?' : row?.status || '—'}</strong>
              </div>
            );
          })}
        </div>
      </section>
      <section>
        <h3>Documents</h3>
        <p className="employee-detail-caption">Files linked to this employee in Google Drive.</p>
        {DOCUMENT_TYPES.map((type) => {
          const matching = files.filter((f) => f.documentType === type.id);
          return (
            <div className="employee-detail-document" key={type.id}>
              <div className="employee-detail-document-title">
                <FileText size={18} />
                <strong>{type.label}</strong>
                <span className={`badge ${matching.length ? 'green' : 'amber'}`}>
                  {matching.length ? `${matching.length} uploaded` : 'Required · not uploaded'}
                </span>
              </div>
              {matching.map((file) => (
                <div className="employee-detail-file" key={file.id}>
                  <a href={file.url} target="_blank" rel="noreferrer">
                    {file.name}
                  </a>
                  <small>
                    {file.effectiveDate ? `Effective ${file.effectiveDate} · ` : ''}Uploaded{' '}
                    {file.uploadedAt.slice(0, 10)}
                  </small>
                  {file.note && <p>{file.note}</p>}
                </div>
              ))}
            </div>
          );
        })}
        {files
          .filter((f) => !DOCUMENT_TYPES.some((t) => t.id === f.documentType))
          .map((file) => (
            <div className="employee-detail-file" key={file.id}>
              <a href={file.url} target="_blank" rel="noreferrer">
                {file.name}
              </a>
              <small>Other document</small>
            </div>
          ))}
      </section>
    </div>
  );
}
