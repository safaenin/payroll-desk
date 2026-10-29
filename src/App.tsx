import ExpensesPanel from './ExpensesPanel';
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import {
  LayoutDashboard,
  Users,
  CalendarCheck,
  Wallet,
  SlidersHorizontal,
  ArrowUpRight,
  ArrowDownToLine,
  Plus,
  Search,
  ChevronRight,
  Check,
  Cloud,
  FileUp,
  CircleHelp,
  X,
  LogOut,
  FileText,
  RefreshCw,
} from 'lucide-react';
import { onAuthStateChanged } from 'firebase/auth';
import {
  addPayment,
  approve,
  bonusRole,
  calculate,
  dueDate,
  emptyState,
  included,
  mergeAttendance,
  money,
  monthDates,
  rateLabel,
  type Attendance,
  type Employee,
  type Line,
  type State,
} from './domain';
import {
  auth,
  configured,
  firebaseConfigured,
  loadCloud,
  loadWorkspace,
  login,
  logout,
  saveCloud,
  connectDrive,
  startEmployeeDeletion,
  finishEmployeeDeletion,
} from './storage';
import { parseAttendance } from './importer';
import ManualAttendance from './ManualAttendance';
import DocumentsPanel from './DocumentsPanel';
import Advances from './AdvancesPanel';
import { deletionSummary } from './employeeDeletion';
import { COMPANY } from './config/company';
import { watchWorkspace } from './session';

type Page =
  | 'Overview'
  | 'Employees'
  | 'Attendance'
  | 'Payroll'
  | 'Documents'
  | 'Advances'
  | 'Settings'
  | 'Expenses';
const pages: { name: Page; icon: typeof Users }[] = [
  { name: 'Overview', icon: LayoutDashboard },
  { name: 'Employees', icon: Users },
  { name: 'Attendance', icon: CalendarCheck },
  { name: 'Payroll', icon: Wallet },
  { name: 'Advances', icon: Wallet },
  { name: 'Documents', icon: FileText },
  { name: 'Expenses', icon: Wallet },
  { name: 'Settings', icon: SlidersHorizontal },
];
const monthLabel = (month: string) =>
  new Date(`${month}-02T12:00:00`).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
function today() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}
function csvDownload(rows: (string | number)[][], name: string) {
  const csv = rows
    .map((r) =>
      r
        .map(
          (v) =>
            `"${String(v)
              .replace(/^[=+@-]/, "'$&")
              .replaceAll('"', '""')}"`,
        )
        .join(','),
    )
    .join('\r\n');
  const url = URL.createObjectURL(new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export default function App() {
  const [page, setPage] = useState<Page>('Overview'),
    [state, setState] = useState<State>(emptyState),
    [mode, setMode] = useState<'signed-out' | 'cloud'>('signed-out');
  const [month, setMonth] = useState(
      () => localStorage.getItem('payroll-selected-month') || today().slice(0, 7),
    ),
    [search, setSearch] = useState(''),
    [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [busy, setBusy] = useState(false),
    [signedIn, setSignedIn] = useState(false);
  const [employee, setEmployee] = useState<Employee | null | undefined>(),
    [adjustCode, setAdjustCode] = useState(''),
    [payCode, setPayCode] = useState(''),
    [slip, setSlip] = useState<Line | null>(null);
  const [preview, setPreview] = useState<{ rows: Attendance[]; name: string } | null>(null),
    [driveReady, setDriveReady] = useState(false);
  const [deleteEmployee, setDeleteEmployee] = useState<Employee | null>(null),
    [deleteCode, setDeleteCode] = useState(''),
    [deleteProgress, setDeleteProgress] = useState('');
  const fileRef = useRef<HTMLInputElement>(null),
    saving = useRef(false);
  const [restoring, setRestoring] = useState(Boolean(auth)),
    [sessionError, setSessionError] = useState(''),
    [sessionRetry, setSessionRetry] = useState(0);
  useEffect(() => {
    localStorage.removeItem('payroll-demo-v1');
    if (!auth) {
      setState(emptyState());
      setRestoring(false);
      return;
    }
    return watchWorkspace({
      subscribe: (next, failed) => onAuthStateChanged(auth!, next, failed),
      load: loadWorkspace,
      loading: () => {
        setRestoring(true);
        setSessionError('');
      },
      ready: (data) => {
        setState(data);
        setMode('cloud');
        setSignedIn(true);
        setRestoring(false);
        setSessionError('');
      },
      signedOut: () => {
        setDriveReady(false);
        setState(emptyState());
        setMode('signed-out');
        setSignedIn(false);
        setRestoring(false);
        setSessionError('');
        setEmployee(undefined);
        setAdjustCode('');
        setPayCode('');
        setSlip(null);
        setPreview(null);
      },
      failed: (err) => {
        setSessionError(err.message);
        setRestoring(false);
      },
    });
  }, [sessionRetry]);
  useEffect(() => {
    localStorage.setItem('payroll-selected-month', month);
  }, [month]);
  const draft = useMemo(() => calculate(state, month), [state, month]);
  const run = state.runs.find((r) => r.month === month),
    lines = run?.lines ?? draft;
  const attendance = state.attendance.filter((a) => a.date.startsWith(month));
  const eligibleRecords = attendance.filter(
    (a) => included(a.role) || state.employees.some((e) => e.code === a.code && e.manualPayroll),
  );
  const total = lines.reduce((n, l) => n + l.net, 0),
    paid = state.payments.filter((p) => p.month === month).reduce((n, p) => n + p.amount, 0);
  const issues = lines.filter((l) => l.issues.length),
    pending = eligibleRecords.filter((a) => a.status === 'Pending').length;
  const totalBonus = lines.reduce((n, l) => n + l.attendanceBonus + l.performance + l.other, 0);
  const balance = (code: string) =>
    (lines.find((l) => l.code === code)?.net ?? 0) -
    state.payments
      .filter((p) => p.code === code && p.month === month)
      .reduce((n, p) => n + p.amount, 0);
  async function task(fn: () => Promise<unknown>) {
    setError('');
    setNotice('');
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }
  async function commit(next: State, message: string, previous: State = state) {
    if (saving.current) throw new Error('A save is already in progress.');
    saving.current = true;
    try {
      if (mode !== 'cloud') throw new Error('Sign in before changing company records.');
      const saved = await saveCloud(previous, next);
      setState(saved);
      setNotice(message);
      return saved;
    } finally {
      saving.current = false;
    }
  }
  async function connect() {
    if (auth?.currentUser && configured) {
      setSessionRetry((n) => n + 1);
      return;
    }
    await login();
  }
  async function authorizeDrive() {
    setDriveReady(false);
    await connectDrive();
    setDriveReady(true);
    setNotice('Google Drive connected. You can upload employee files now.');
  }
  async function resumeEmployeeDeletion() {
    try {
      const updated = await finishEmployeeDeletion(setDeleteProgress);
      setState(updated);
      setNotice(
        'Employee and related company records deleted. Documents moved to Google Drive Trash.',
      );
    } catch (e) {
      try {
        setState(await loadCloud());
      } catch {}
      throw e;
    } finally {
      setDeleteProgress('');
    }
  }
  function exportPayroll() {
    csvDownload(
      [
        [
          'Firm',
          'Employee code',
          'Name',
          'Month',
          'Payable days',
          'Full present days',
          'Base INR',
          'Attendance bonus INR',
          'Performance bonus INR',
          'Other bonus INR',
          'Other deductions INR',
          'Advance recovery INR',
          'Net INR',
          'Outstanding INR',
          'Status',
        ],
        ...lines.map((l) => [
          COMPANY.name,
          l.code,
          l.name,
          month,
          l.days,
          l.fullDays,
          l.base / 100,
          l.attendanceBonus / 100,
          l.performance / 100,
          l.other / 100,
          l.deduction / 100,
          (l.advanceRecovery ?? 0) / 100,
          l.net / 100,
          balance(l.code) / 100,
          run ? 'Approved' : 'Draft',
        ]),
      ],
      `${COMPANY.exportPrefix}-payroll-${month}.csv`,
    );
  }
  const filteredEmployees = state.employees.filter((e) =>
    `${e.name} ${e.code}`.toLowerCase().includes(search.toLowerCase()),
  );
  if (restoring || sessionError)
    return (
      <div className="session-screen">
        <section className="panel">
          <Cloud size={30} />
          <h1>{sessionError ? 'Unable to load your workspace' : 'Restoring your workspace'}</h1>
          <p role={sessionError ? 'alert' : 'status'}>
            {sessionError ||
              'Checking your saved sign-in and loading employee records from Firestore…'}
          </p>
          {sessionError && (
            <div>
              <button className="primary" onClick={() => setSessionRetry((n) => n + 1)}>
                Retry connection
              </button>
              <button
                className="secondary"
                onClick={() => void logout().catch((e) => setSessionError(String(e)))}
              >
                Sign out
              </button>
            </div>
          )}
        </section>
      </div>
    );
  if (!signedIn || mode !== 'cloud')
    return (
      <div className="session-screen">
        <section className="panel">
          <h1>{COMPANY.name}</h1>
          <p>Sign in to your company payroll workspace.</p>
          {!firebaseConfigured && (
            <p>Add Firebase configuration to .env.local to connect your workspace.</p>
          )}
          {error && <p role="alert">{error}</p>}
          <button
            className="primary"
            disabled={!firebaseConfigured || busy}
            onClick={() => void task(connect)}
          >
            Sign in with Google
          </button>
        </section>
      </div>
    );
  if (state.employeeDeletion)
    return (
      <div className="session-screen">
        <section className="panel">
          <h1>Employee deletion in progress</h1>
          <p>
            Employee code: {state.employeeDeletion.code}. Normal changes are locked until cleanup
            finishes.
          </p>
          <p>
            {state.employeeDeletion.completedFileIds.length} of{' '}
            {state.employeeDeletion.fileIds.length} documents moved to Trash.
          </p>
          {deleteProgress && <p role="status">{deleteProgress}</p>}
          {error && <p role="alert">{error}</p>}
          <button className="secondary" disabled={busy} onClick={() => void task(authorizeDrive)}>
            Connect Google Drive
          </button>
          <button
            className="primary"
            disabled={busy}
            onClick={() => void task(resumeEmployeeDeletion)}
          >
            Continue deletion
          </button>
          <button
            className="secondary"
            disabled={busy}
            onClick={() =>
              void task(async () => {
                setState(await loadCloud());
              })
            }
          >
            Reload progress
          </button>
          <button className="text-button" disabled={busy} onClick={() => void task(logout)}>
            Sign out
          </button>
        </section>
      </div>
    );
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-icon">
            <Wallet size={23} />
          </div>
          <span>
            payroll<span className="brand-light">desk</span>
            <small>PEOPLE. PAY. PEACE OF MIND.</small>
          </span>
        </div>
        <div className="workspace">
          <span className="workspace-avatar">DC</span>
          <div>
            Dharampur Chowk<small>Payroll workspace</small>
          </div>
          <ChevronRight size={15} />
        </div>
        <div className="nav-label">WORKSPACE</div>
        <nav>
          {pages.map(({ name, icon: Icon }) => (
            <button
              key={name}
              className={page === name ? 'nav-item active' : 'nav-item'}
              onClick={() => {
                setPage(name);
                setSearch('');
              }}
            >
              <Icon size={19} />
              {name}
              {name === 'Employees' && <span className="nav-count">{state.employees.length}</span>}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="local-note">
            <Cloud size={18} />
            <div>
              Firestore connected
              <small>
                {mode === 'cloud' ? 'Owner account workspace' : 'Connect your account when ready'}
              </small>
            </div>
          </div>
          <button className="profile" onClick={() => setPage('Settings')}>
            <span className="avatar">PA</span>
            <span>
              Payroll administrator
              <small>{mode === 'cloud' ? 'Connected account' : 'Local workspace'}</small>
            </span>
            <SlidersHorizontal size={16} />
          </button>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div>
            Workspace <ChevronRight size={14} /> <strong>{page}</strong>
          </div>
          <div className="topbar-right">
            <span className="connection">
              <i />
              Cloud connected
            </span>
            <button
              className="icon-button"
              aria-label="Open setup help"
              onClick={() => setPage('Settings')}
            >
              <CircleHelp size={19} />
            </button>
            <span className="avatar small">PA</span>
          </div>
        </header>
        <main>
          <div className="page-heading">
            <div>
              <div className="eyebrow">
                {page === 'Expenses' ? 'YOUR BUSINESS, IN VIEW' : 'YOUR PEOPLE, TAKEN CARE OF'}
              </div>
              <h1>
                {page === 'Overview'
                  ? 'Payroll overview'
                  : page === 'Payroll'
                    ? 'Monthly payroll'
                    : page}
              </h1>
              <p>
                {
                  {
                    Overview: 'A clear view of your team, attendance, and monthly payouts.',
                    Employees: 'One employee record. A complete history of roles and wages.',
                    Attendance: 'Turn daily attendance reports into accurate monthly pay.',
                    Payroll: 'Review earnings, add bonuses, and keep track of every payment.',
                    Advances: 'Track money paid early and recover it across monthly salaries.',
                    Documents: 'Employee documents and media, stored in Google Drive.',
                    Expenses: 'Track brand purchases, invoices, GST and payments.',
                    Settings: 'Your payroll rules and connected accounts.',
                  }[page]
                }
              </p>
            </div>
            <div className="heading-actions">
              {page !== 'Expenses' && (
                <label className="month-picker">
                  <CalendarCheck size={17} />
                  <input
                    aria-label="Payroll month"
                    type="month"
                    value={month}
                    onChange={(e) => {
                      if (e.target.value) setMonth(e.target.value);
                    }}
                  />
                </label>
              )}
              {page !== 'Settings' && page !== 'Documents' && page !== 'Expenses' && (
                <button
                  className="primary"
                  onClick={() => fileRef.current?.click()}
                  disabled={busy}
                >
                  <Plus size={17} /> Import attendance
                </button>
              )}
            </div>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f)
                void task(async () => {
                  if (f.size > 10 * 1024 * 1024)
                    throw new Error('Attendance files must be under 10 MB.');
                  setPreview({ rows: await parseAttendance(await f.arrayBuffer()), name: f.name });
                });
              e.target.value = '';
            }}
          />

          {error && (
            <div className="message error" role="alert">
              {error}
              <button aria-label="Dismiss error" onClick={() => setError('')}>
                <X size={15} />
              </button>
            </div>
          )}
          {notice && (
            <div className="message success" role="status">
              <Check size={16} />
              {notice}
              <button aria-label="Dismiss notification" onClick={() => setNotice('')}>
                <X size={15} />
              </button>
            </div>
          )}
          {busy && (
            <div className="saving" role="status">
              Working… Please keep this window open.
            </div>
          )}
          {page === 'Overview' && (
            <>
              <div className="stats-grid">
                <Stat
                  label="Employees in payroll"
                  value={String(lines.length)}
                  detail={`${state.employees.length} employee profiles`}
                  icon={<Users size={20} />}
                />
                <Stat
                  label="Net payroll"
                  value={money(total)}
                  detail={monthLabel(month)}
                  icon={<Wallet size={20} />}
                />
                <Stat
                  label="Bonuses this month"
                  value={money(totalBonus)}
                  detail="Attendance, performance & other"
                  icon={<ArrowUpRight size={20} />}
                />
                <Stat
                  label="Outstanding payment"
                  value={money(total - paid)}
                  detail={run ? 'Approved payroll balance' : 'Draft estimate · not yet approved'}
                  icon={<CalendarCheck size={20} />}
                />
              </div>
              <div className="overview-grid">
                <section className="panel cycle">
                  <div className="section-heading">
                    <div>
                      <h2>{monthLabel(month)} payroll</h2>
                      <p>Your monthly payroll, one step at a time.</p>
                    </div>
                    <Badge tone={run ? 'green' : 'amber'}>
                      {run ? 'Approved' : 'In preparation'}
                    </Badge>
                  </div>
                  <div className="steps">
                    {[
                      [
                        '01',
                        'Import attendance',
                        `${eligibleRecords.length} eligible records`,
                        eligibleRecords.length > 0,
                      ],
                      [
                        '02',
                        'Review wages & bonuses',
                        `${issues.length} employees need attention`,
                        lines.length > 0 && !issues.length,
                      ],
                      [
                        '03',
                        'Approve payroll',
                        run ? 'Snapshot saved' : 'Review before approval',
                        Boolean(run),
                      ],
                      [
                        '04',
                        'Record payments',
                        `Scheduled ${dueDate(month)}`,
                        Boolean(run) && paid >= total,
                      ],
                    ].map(([n, title, sub, done]) => (
                      <div className="step" key={String(n)}>
                        <span className={done ? 'step-number done' : 'step-number'}>
                          {done ? <Check size={15} /> : n}
                        </span>
                        <div>
                          <strong>{title}</strong>
                          <small>{sub}</small>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="panel-footer">
                    <span>
                      Pay period: 1–{monthDates(month).length} {monthLabel(month)}
                    </span>
                    <button className="primary" onClick={() => setPage('Payroll')}>
                      Review payroll <ChevronRight size={16} />
                    </button>
                  </div>
                </section>
                <section className="payday-card">
                  <div className="payday-icon">
                    <CalendarCheck size={25} />
                  </div>
                  <span>NEXT PAYDAY FOR THIS PERIOD</span>
                  <h2>
                    08 <small>{monthLabel(dueDate(month).slice(0, 7))}</small>
                  </h2>
                  <p>
                    Good work deserves on-time pay.
                    <br />
                    Let’s make this month a smooth one.
                  </p>
                  <div>
                    <span>Payroll schedule</span>
                    <strong>8th of the following month</strong>
                  </div>
                </section>
              </div>
              <div className="overview-grid">
                <section className="panel">
                  <div className="section-heading">
                    <div>
                      <h2>Employee snapshot</h2>
                      <p>The people behind every payroll.</p>
                    </div>
                    <button className="text-button" onClick={() => setPage('Employees')}>
                      View all <ArrowUpRight size={16} />
                    </button>
                  </div>
                  {state.employees.length ? (
                    <div className="table-wrap">
                      <table>
                        <thead>
                          <tr>
                            <th>EMPLOYEE</th>
                            <th>ROLE</th>
                            <th>WAGE</th>
                            <th>STATUS</th>
                          </tr>
                        </thead>
                        <tbody>
                          {state.employees.slice(0, 5).map((e) => {
                            const r = [...e.rates].sort((a, b) => b.from.localeCompare(a.from))[0];
                            return (
                              <tr key={e.code}>
                                <td>
                                  <Person name={e.name} code={e.code} />
                                </td>
                                <td>{r?.role ?? 'Not set'}</td>
                                <td className="numeric">{r ? rateLabel(r) : 'Missing wage'}</td>
                                <td>
                                  <Badge tone={e.active ? 'green' : 'gray'}>
                                    {e.active ? 'Active' : 'Archived'}
                                  </Badge>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <Empty
                      title="Your team starts here"
                      text="Add employee profiles or import your attendance report to begin."
                      action={
                        <button className="secondary" onClick={() => setEmployee(null)}>
                          Add employee
                        </button>
                      }
                    />
                  )}
                </section>
                <section className="panel attention">
                  <div className="section-heading">
                    <div>
                      <h2>Needs your attention</h2>
                      <p>A few checks before payday.</p>
                    </div>
                  </div>
                  <Attention
                    value={issues.length}
                    label="Employee records to review"
                    text="Missing wages or attendance exceptions"
                    onClick={() => setPage('Payroll')}
                  />
                  <Attention
                    value={pending}
                    label="Pending attendance"
                    text="Resolve before approving payroll"
                    onClick={() => setPage('Attendance')}
                  />
                  <Attention
                    value={state.employees.filter((e) => !e.bank).length}
                    label="Bank details incomplete"
                    text="Check your employee profiles"
                    onClick={() => setPage('Employees')}
                  />
                  <div className="quiet-note">
                    Imported payroll includes <strong>FR_ roles</strong>. Manual payroll and fixed
                    monthly wages are also supported.
                  </div>
                </section>
              </div>
            </>
          )}
          {page === 'Employees' && (
            <section className="panel">
              <div className="section-heading">
                <div>
                  <h2>
                    Employee directory <span className="count">{state.employees.length}</span>
                  </h2>
                  <p>Wage changes take effect from the date you choose.</p>
                </div>
                <button className="primary" onClick={() => setEmployee(null)}>
                  <Plus size={16} /> Add employee
                </button>
              </div>
              <div className="toolbar">
                <Search size={17} />
                <input
                  aria-label="Search employees"
                  placeholder="Search by name or employee code"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>EMPLOYEE</th>
                      <th>LATEST ROLE</th>
                      <th>WAGE</th>
                      <th>ATTENDANCE BONUS</th>
                      <th>DOCUMENTS</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {filteredEmployees.map((e) => {
                      const r = [...e.rates].sort((a, b) => b.from.localeCompare(a.from))[0];
                      return (
                        <tr key={e.code}>
                          <td>
                            <Person name={e.name} code={e.code} />
                            {!e.active && <Badge tone="gray">Archived</Badge>}
                          </td>
                          <td>
                            {r?.role ?? 'Not set'}
                            <small>{r?.from && `From ${r.from}`}</small>
                          </td>
                          <td className="numeric">{r ? rateLabel(r) : 'Not set'}</td>
                          <td>
                            <Badge tone={r?.bonusEligible && bonusRole(r.role) ? 'green' : 'gray'}>
                              {r?.bonusEligible && bonusRole(r.role) ? 'Eligible' : 'Not eligible'}
                            </Badge>
                          </td>
                          <td>
                            {
                              [e.aadhaar, e.bank, e.offerSent, e.offerReceived].filter(Boolean)
                                .length
                            }
                            /4 complete
                          </td>
                          <td>
                            <button className="text-button" onClick={() => setEmployee(e)}>
                              Edit <ChevronRight size={14} />
                            </button>
                            <button
                              className="text-button danger"
                              disabled={busy}
                              onClick={() => {
                                setDeleteCode('');
                                setDeleteEmployee(e);
                              }}
                            >
                              Delete employee
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {!filteredEmployees.length && (
                <Empty
                  title="No employee profiles yet"
                  text="Add a profile with the employee code used in your attendance report."
                />
              )}
            </section>
          )}
          {page === 'Attendance' && (
            <>
              <ManualAttendance
                key={month}
                state={state}
                month={month}
                busy={busy}
                save={(next) =>
                  task(() =>
                    commit(next, 'Manual attendance saved. Review payroll before approval.'),
                  )
                }
              />
              <div className="stats-grid">
                <Stat
                  label="Attendance records"
                  value={String(attendance.length)}
                  detail={monthLabel(month)}
                />
                <Stat
                  label="Included records"
                  value={String(eligibleRecords.length)}
                  detail="FR_ imports and manual payroll"
                />
                <Stat
                  label="Payable days"
                  value={String(eligibleRecords.reduce((n, a) => n + a.payable, 0))}
                  detail="Includes payable half-days"
                />
                <Stat
                  label="Pending records"
                  value={String(pending)}
                  detail="Resolve in your source report"
                />
              </div>
              <section className="panel">
                <div className="section-heading">
                  <div>
                    <h2>Attendance register</h2>
                    <p>
                      Reimport daily reports safely. Changed attendance is recorded in import
                      history.
                    </p>
                  </div>
                </div>
                <div className="toolbar">
                  <Search size={17} />
                  <input
                    aria-label="Search attendance"
                    placeholder="Search employee name or code"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                  <span>{attendance.length} rows</span>
                </div>
                <div className="table-wrap tall">
                  <table>
                    <thead>
                      <tr>
                        <th>EMPLOYEE</th>
                        <th>DATE</th>
                        <th>ROLE</th>
                        <th>STATUS</th>
                        <th>PAYABLE</th>
                        <th>PAYROLL</th>
                      </tr>
                    </thead>
                    <tbody>
                      {attendance
                        .filter((a) =>
                          `${a.name} ${a.code}`.toLowerCase().includes(search.toLowerCase()),
                        )
                        .map((a) => (
                          <tr key={`${a.code}|${a.date}`}>
                            <td>
                              <Person name={a.name} code={a.code} />
                            </td>
                            <td>{a.date}</td>
                            <td>{a.role}</td>
                            <td>
                              <Badge
                                tone={
                                  a.status === 'P'
                                    ? 'green'
                                    : a.status === 'Pending'
                                      ? 'amber'
                                      : 'gray'
                                }
                              >
                                {a.status}
                              </Badge>
                            </td>
                            <td>{a.payable}</td>
                            <td>
                              {included(a.role) ||
                              state.employees.some((e) => e.code === a.code && e.manualPayroll)
                                ? 'Included'
                                : 'Excluded'}
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
                {!attendance.length && (
                  <Empty
                    title="No attendance for this month"
                    text="Import the daily Attendance .xlsx report to get started."
                    action={
                      <button className="secondary" onClick={() => fileRef.current?.click()}>
                        <FileUp size={16} /> Choose report
                      </button>
                    }
                  />
                )}
              </section>
              <section className="panel history">
                <div className="section-heading">
                  <h2>Import history</h2>
                </div>
                {state.imports
                  .slice()
                  .reverse()
                  .map((i) => (
                    <div className="history-row" key={i.id}>
                      <FileText size={18} />
                      <div>
                        <strong>{i.name}</strong>
                        <small>
                          {new Date(i.at).toLocaleString('en-IN')} · {i.added} added · {i.updated}{' '}
                          updated · {i.unchanged} unchanged
                        </small>
                        {i.revisions.length > 0 && (
                          <details>
                            <summary>View {i.revisions.length} attendance corrections</summary>
                            {i.revisions.map((r, n) => (
                              <p key={n}>
                                {r.after.code} · {r.after.date}: {r.before.status}/
                                {r.before.payable} → {r.after.status}/{r.after.payable}
                              </p>
                            ))}
                          </details>
                        )}
                      </div>
                    </div>
                  ))}
                {!state.imports.length && <p className="empty-inline">No imports yet.</p>}
              </section>
            </>
          )}
          {page === 'Payroll' && (
            <>
              <div className="stats-grid">
                <Stat
                  label="Net salary"
                  value={money(total)}
                  detail={`${lines.length} employees`}
                />
                <Stat label="Paid" value={money(paid)} detail="Recorded payments only" />
                <Stat
                  label="Outstanding"
                  value={money(total - paid)}
                  detail={run ? 'Approved amount' : 'Draft estimate'}
                />
                <Stat
                  label="Scheduled payment"
                  value={`08 ${new Date(dueDate(month)).toLocaleDateString('en-IN', { month: 'short' })}`}
                  detail={monthLabel(month)}
                />
              </div>
              <section className="panel">
                <div className="section-heading">
                  <div>
                    <h2>
                      {monthLabel(month)}{' '}
                      <Badge tone={run ? 'green' : 'amber'}>
                        {run ? 'Approved snapshot' : 'Draft payroll'}
                      </Badge>
                    </h2>
                    <p>
                      {run
                        ? 'Approved earnings are preserved even if attendance or wages change.'
                        : 'Check wages, award manager-selected bonuses, and resolve exceptions.'}
                    </p>
                  </div>
                  <button className="secondary" onClick={exportPayroll} disabled={!lines.length}>
                    <ArrowDownToLine size={16} /> Export CSV
                  </button>
                </div>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>EMPLOYEE</th>
                        <th>PAYABLE / FULL DAYS</th>
                        <th>BASE</th>
                        <th>ATTENDANCE BONUS</th>
                        <th>PERFORMANCE / OTHER</th>
                        <th>DEDUCTIONS</th>
                        <th>NET SALARY</th>
                        <th>ACTIONS</th>
                      </tr>
                    </thead>
                    <tbody>
                      {lines.map((l) => (
                        <tr key={l.code}>
                          <td>
                            <Person name={l.name} code={l.code} />
                            {l.issues.map((i) => (
                              <small className="issue" key={i}>
                                {i}
                              </small>
                            ))}
                            <details>
                              <summary>Wage details</summary>
                              {l.segments.map((s) => (
                                <small key={s}>{s}</small>
                              ))}
                            </details>
                          </td>
                          <td>
                            {l.days} / {l.fullDays}
                          </td>
                          <td className="numeric">{money(l.base)}</td>
                          <td className="numeric">{money(l.attendanceBonus)}</td>
                          <td className="numeric">
                            {money(l.performance)}
                            <small>Other {money(l.other)}</small>
                          </td>
                          <td className="numeric">
                            {money(l.deduction)}
                            <small>Advance {money(l.advanceRecovery ?? 0)}</small>
                          </td>
                          <td className="numeric strong">
                            {money(l.net)}
                            {run && <small>Due {money(balance(l.code))}</small>}
                          </td>
                          <td>
                            <div className="row-actions">
                              {!run ? (
                                <button
                                  className="text-button"
                                  onClick={() => setAdjustCode(l.code)}
                                >
                                  Adjust
                                </button>
                              ) : (
                                <>
                                  <button
                                    className="text-button"
                                    onClick={() => setPayCode(l.code)}
                                    disabled={balance(l.code) <= 0}
                                  >
                                    Record payment
                                  </button>
                                  <button className="text-button" onClick={() => setSlip(l)}>
                                    Payslip
                                  </button>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {!lines.length && (
                  <Empty
                    title="No payroll entries yet"
                    text="Import attendance, enter manual attendance, or add a fixed monthly wage effective for this month."
                  />
                )}
                {!run && lines.length > 0 && (
                  <div className="approval">
                    <label className="checkbox">
                      <input
                        type="checkbox"
                        checked={Boolean(state.coverage[month])}
                        disabled={busy}
                        onChange={(e) =>
                          void task(() =>
                            commit(
                              {
                                ...state,
                                coverage: { ...state.coverage, [month]: e.target.checked },
                              },
                              'Attendance coverage confirmation saved.',
                            ),
                          )
                        }
                      />
                      <span>
                        I have reviewed the whole month, including missing dates and all attendance
                        corrections.
                      </span>
                    </label>
                    <button
                      className="primary"
                      disabled={busy || issues.length > 0 || !state.coverage[month]}
                      onClick={() =>
                        void task(() =>
                          commit(
                            approve(state, month),
                            'Payroll approved. Earnings are now locked.',
                          ),
                        )
                      }
                    >
                      <Check size={16} /> Approve payroll
                    </button>
                  </div>
                )}
              </section>
              {run && (
                <section className="panel history">
                  <div className="section-heading">
                    <h2>Payment ledger</h2>
                    <span>No bank transfers are initiated by this app.</span>
                  </div>
                  {state.payments
                    .filter((p) => p.month === month)
                    .map((p) => (
                      <div className="history-row" key={p.id}>
                        <Check size={18} />
                        <div>
                          <strong>
                            {p.code} · {money(p.amount)}
                          </strong>
                          <small>
                            {p.date} · {p.reference}
                          </small>
                        </div>
                      </div>
                    ))}
                  {!state.payments.some((p) => p.month === month) && (
                    <p className="empty-inline">No payments recorded.</p>
                  )}
                </section>
              )}
            </>
          )}
          {page === 'Advances' && (
            <Advances
              state={state}
              busy={busy}
              month={month}
              save={async (next, message) => {
                setBusy(true);
                try {
                  await commit(next, message);
                } finally {
                  setBusy(false);
                }
              }}
            />
          )}
          {page === 'Documents' && (
            <DocumentsPanel
              state={state}
              busy={busy}
              cloud={mode === 'cloud'}
              connected={driveReady}
              connect={authorizeDrive}
              save={commit}
              task={task}
            />
          )}
          {page === 'Expenses' && (
            <ExpensesPanel
              state={state}
              busy={busy}
              connected={driveReady}
              connect={authorizeDrive}
              save={commit}
              task={task}
            />
          )}
          {page === 'Settings' && (
            <div className="settings-grid">
              <section className="panel">
                <div className="section-heading">
                  <div>
                    <h2>Connected accounts</h2>
                    <p>Your app runs locally. Your company records live in Firestore.</p>
                  </div>
                </div>
                <div className="settings-body">
                  <div className="integration">
                    <span className="integration-icon">F</span>
                    <div>
                      <strong>Firebase Firestore</strong>
                      <small>
                        {configured
                          ? 'Configuration available'
                          : firebaseConfigured
                            ? 'Owner setup required'
                            : 'Configuration required'}
                      </small>
                    </div>
                    <Badge tone={mode === 'cloud' ? 'green' : 'amber'}>
                      {mode === 'cloud' ? 'Connected' : 'Not connected'}
                    </Badge>
                  </div>
                  <p>
                    Copy <code>.env.example</code> to <code>.env.local</code>, add your Firebase web
                    app configuration and owner UID, then restart the local server. Follow the setup
                    steps in README.md and deploy the owner-only Firestore rules.
                  </p>
                  <button
                    className="primary"
                    disabled={!firebaseConfigured || busy}
                    onClick={() => void task(connect)}
                  >
                    <Cloud size={16} />
                    {signedIn ? 'Load Firestore workspace' : 'Sign in with Google'}
                  </button>
                  {mode === 'cloud' && (
                    <button
                      className="secondary"
                      disabled={busy}
                      onClick={() =>
                        void task(async () => {
                          await logout();
                          setMode('signed-out');
                          setState(emptyState());
                        })
                      }
                    >
                      <LogOut size={16} /> Sign out
                    </button>
                  )}
                  <div className="integration">
                    <span className="integration-icon drive">G</span>
                    <div>
                      <strong>Google Drive</strong>
                      <small>
                        {driveReady
                          ? 'Connected for this browser session'
                          : 'Connect to authorize employee file uploads'}
                      </small>
                    </div>
                  </div>
                  <p>
                    Enable the Google Drive API in the same Google Cloud project. Files remain
                    private in your Google Drive; this app uses the limited drive.file scope.
                  </p>
                  <a
                    href="https://console.cloud.google.com/apis/library/drive.googleapis.com?project=payroll-desk"
                    target="_blank"
                    rel="noreferrer"
                  >
                    Open Google Drive API setup
                  </a>
                  <div>
                    <button
                      className="primary"
                      disabled={mode !== 'cloud' || busy}
                      onClick={() => void task(authorizeDrive)}
                    >
                      {driveReady ? 'Reconnect Google Drive' : 'Connect Google Drive'}
                    </button>
                  </div>
                </div>
              </section>
              <section className="panel">
                <div className="section-heading">
                  <h2>Payroll rules</h2>
                </div>
                <dl className="rules">
                  <dt>Country & currency</dt>
                  <dd>India · INR (₹)</dd>
                  <dt>Pay period</dt>
                  <dd>1st to last day of month</dd>
                  <dt>Payment date</dt>
                  <dd>8th of following month</dd>
                  <dt>Included roles</dt>
                  <dd>FR_ imports; explicit manual payroll and fixed monthly wages</dd>
                  <dt>Base earnings</dt>
                  <dd>muster_payable × dated daily wage</dd>
                  <dt>Attendance bonus</dt>
                  <dd>₹1,000 at 26+ full present days</dd>
                  <dt>Half-days</dt>
                  <dd>Paid at 0.5; do not count toward bonus</dd>
                  <dt>Bonus exclusions</dt>
                  <dd>Shift-Incharge, Security, Housekeeping, and employee-specific exceptions</dd>
                  <dt>Performance awards</dt>
                  <dd>Variable amount for manager-selected employees</dd>
                </dl>
              </section>
              <section className="panel">
                <div className="section-heading">
                  <h2>Company workspace</h2>
                </div>
                <div className="settings-body">
                  <p>Reload records if another session has made changes.</p>
                  <button
                    className="secondary"
                    disabled={busy}
                    onClick={() =>
                      void task(async () => {
                        setState(await loadWorkspace());
                        setNotice('Loaded latest Firestore records.');
                      })
                    }
                  >
                    <RefreshCw size={16} /> Reload Firestore
                  </button>
                </div>
              </section>
            </div>
          )}
          <footer>
            Payroll Desk <span>Built for your team. Kept in your control.</span>
            <span>India · INR · Asia/Kolkata</span>
          </footer>
        </main>
      </div>
      {deleteEmployee && (
        <Modal
          title="Delete employee and all records?"
          onClose={() => {
            if (!busy) setDeleteEmployee(null);
          }}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void task(async () => {
                if (deleteCode !== deleteEmployee.code)
                  throw new Error('Enter the exact employee code to confirm.');
                const started = await startEmployeeDeletion(state, deleteEmployee.code);
                setState(started);
                setDeleteEmployee(null);
                await resumeEmployeeDeletion();
              });
            }}
          >
            <p>
              <strong>
                {deleteEmployee.name} · {deleteEmployee.code}
              </strong>
            </p>
            <p>
              This permanently removes their profile, wages, attendance, bonuses, deductions,
              approved payroll entries, payments, advances, and document links. Documents move to
              Google Drive Trash. Other employees are preserved.
            </p>
            <ul>
              {Object.entries(deletionSummary(state, deleteEmployee.code)).map(([label, count]) => (
                <li key={label}>
                  {count} {label}
                </li>
              ))}
            </ul>
            <p>
              Outstanding salary and advance balances will also be removed. This cannot be undone in
              the app. Reimporting an old attendance file can recreate the employee.
            </p>
            <label>
              Type {deleteEmployee.code} to confirm
              <input
                value={deleteCode}
                onChange={(e) => setDeleteCode(e.target.value)}
                autoComplete="off"
                required
              />
            </label>
            <button
              className="secondary"
              type="button"
              onClick={() => void task(authorizeDrive)}
              disabled={busy}
            >
              Connect Google Drive
            </button>
            <button
              className="primary danger"
              disabled={busy || deleteCode !== deleteEmployee.code}
            >
              Delete employee and all records
            </button>
          </form>
        </Modal>
      )}
      {employee !== undefined && (
        <Modal
          title={employee ? 'Edit employee & wage history' : 'Add employee'}
          onClose={() => setEmployee(undefined)}
        >
          <EmployeeForm
            employee={employee}
            busy={busy}
            onSave={(e) =>
              void task(async () => {
                if (!employee && state.employees.some((x) => x.code === e.code))
                  throw new Error('This employee code already exists.');
                await commit(
                  { ...state, employees: [...state.employees.filter((x) => x.code !== e.code), e] },
                  'Employee profile saved.',
                );
                setEmployee(undefined);
              })
            }
          />
        </Modal>
      )}
      {adjustCode && (
        <Modal title="Bonuses & deductions" onClose={() => setAdjustCode('')}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              void task(async () => {
                const adjustment = {
                  code: adjustCode,
                  performance: Math.round(Number(f.get('performance')) * 100),
                  other: Math.round(Number(f.get('other')) * 100),
                  deduction: Math.round(Number(f.get('deduction')) * 100),
                  note: String(f.get('note')),
                };
                if (
                  Object.values(adjustment).some(
                    (v) => typeof v === 'number' && (!Number.isSafeInteger(v) || v < 0),
                  )
                )
                  throw new Error('Enter valid nonnegative amounts.');
                await commit(
                  {
                    ...state,
                    adjustments: {
                      ...state.adjustments,
                      [month]: [
                        ...(state.adjustments[month] ?? []).filter((a) => a.code !== adjustCode),
                        adjustment,
                      ],
                    },
                  },
                  'Monthly adjustments saved.',
                );
                setAdjustCode('');
              });
            }}
          >
            <p>
              {lines.find((l) => l.code === adjustCode)?.name} · {monthLabel(month)}
            </p>
            {(['performance', 'other', 'deduction'] as const).map((k) => (
              <label key={k}>
                {k === 'performance'
                  ? 'Manager-selected performance bonus'
                  : k === 'other'
                    ? 'Other bonus'
                    : 'Other deduction (excluding advances)'}{' '}
                (₹)
                <input
                  name={k}
                  type="number"
                  min="0"
                  step="0.01"
                  required
                  defaultValue={
                    (state.adjustments[month]?.find((a) => a.code === adjustCode)?.[k] ?? 0) / 100
                  }
                />
              </label>
            ))}
            <label>
              Reason / manager reference
              <textarea
                name="note"
                required
                defaultValue={state.adjustments[month]?.find((a) => a.code === adjustCode)?.note}
              />
            </label>
            <button className="primary" disabled={busy}>
              Save adjustments
            </button>
          </form>
        </Modal>
      )}
      {payCode && (
        <Modal title="Record a completed payment" onClose={() => setPayCode('')}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              void task(async () => {
                await commit(
                  addPayment(state, {
                    id: crypto.randomUUID(),
                    month,
                    code: payCode,
                    amount: Math.round(Number(f.get('amount')) * 100),
                    date: String(f.get('date')),
                    reference: String(f.get('reference')).trim(),
                  }),
                  'Payment recorded.',
                );
                setPayCode('');
              });
            }}
          >
            <p>
              {lines.find((l) => l.code === payCode)?.name} · Outstanding {money(balance(payCode))}
            </p>
            <label>
              Amount paid (₹)
              <input
                name="amount"
                type="number"
                min="0.01"
                max={balance(payCode) / 100}
                step="0.01"
                required
                defaultValue={balance(payCode) / 100}
              />
            </label>
            <label>
              Payment date
              <input name="date" type="date" required max={today()} defaultValue={today()} />
            </label>
            <label>
              Bank reference / receipt number
              <input name="reference" required />
            </label>
            <p className="muted">
              This records a transfer you have already made. It does not send money.
            </p>
            <button className="primary" disabled={busy}>
              Record payment
            </button>
          </form>
        </Modal>
      )}
      {preview && (
        <Modal title="Review attendance import" onClose={() => setPreview(null)}>
          <p>{preview.name}</p>
          <div className="import-summary">
            <strong>{preview.rows.length} records</strong>
            <span>
              {[...new Set(preview.rows.map((a) => a.date.slice(0, 7)))].sort().join(', ')}
            </span>
            <span>{preview.rows.filter((a) => included(a.role)).length} FR_ records included</span>
            <span>
              {preview.rows.filter((a) => !included(a.role)).length} records excluded from payroll
            </span>
          </div>
          <p>
            Existing employee/date records will be updated, not added twice. Approved payroll
            snapshots stay unchanged.
          </p>
          <div className="role-list">
            {[...new Set(preview.rows.map((a) => a.role))].sort().map((role) => (
              <div key={role}>
                <span>{role}</span>
                <Badge tone={included(role) ? 'green' : 'gray'}>
                  {included(role) ? 'Included' : 'Excluded'}
                </Badge>
              </div>
            ))}
          </div>
          <button
            className="primary"
            disabled={busy}
            onClick={() =>
              void task(async () => {
                const next = mergeAttendance(state, preview.rows, preview.name);
                await commit(
                  next,
                  'Attendance imported. Add wages for any new employees before approval.',
                );
                setMonth(
                  preview.rows
                    .map((a) => a.date.slice(0, 7))
                    .sort()
                    .at(-1)!,
                );
                setPreview(null);
                setPage('Attendance');
              })
            }
          >
            Confirm import
          </button>
        </Modal>
      )}
      {slip && (
        <Modal title="Payslip" onClose={() => setSlip(null)}>
          <div className="payslip">
            <header className="payslip-company">
              <img src={COMPANY.logo} alt={`${COMPANY.name} logo`} />
              <div>
                <strong>{COMPANY.name}</strong>
                <span>Salary payslip</span>
              </div>
            </header>
            <div className="eyebrow">PAY PERIOD · {monthLabel(month)}</div>
            <h2>{slip.name}</h2>
            <p>
              {slip.code} · {slip.role}
            </p>
            <dl className="rules">
              <dt>Payable days / full present days</dt>
              <dd>
                {slip.days} / {slip.fullDays}
              </dd>
              {[
                ['Base earnings', slip.base],
                ['Attendance bonus', slip.attendanceBonus],
                ['Performance bonus', slip.performance],
                ['Other bonus', slip.other],
                ['Other deductions', slip.deduction],
                ['Advance recovery', slip.advanceRecovery ?? 0],
                ['Net salary', slip.net],
                ['Outstanding', balance(slip.code)],
              ].map(([label, value]) => (
                <div className="dl-row" key={label}>
                  <dt>{label}</dt>
                  <dd>{money(Number(value))}</dd>
                </div>
              ))}
            </dl>
            <p>
              Scheduled payment: {dueDate(month)}
              <br />
              Approved: {run?.approvedAt.slice(0, 10)}
            </p>
          </div>
          <button className="primary no-print" onClick={() => window.print()}>
            Print / save as PDF
          </button>
        </Modal>
      )}
    </div>
  );
}
function Stat({
  label,
  value,
  detail,
  icon,
}: {
  label: string;
  value: string;
  detail: string;
  icon?: React.ReactNode;
}) {
  return (
    <section className="stat">
      <div className="stat-label">
        {label}
        <span>{icon}</span>
      </div>
      <strong>{value}</strong>
      <small>{detail}</small>
    </section>
  );
}
function Badge({
  children,
  tone,
}: {
  children: React.ReactNode;
  tone: 'green' | 'amber' | 'gray';
}) {
  return <span className={`badge ${tone}`}>{children}</span>;
}
function Person({ name, code }: { name: string; code: string }) {
  return (
    <div className="person">
      <span className="person-avatar">
        {name
          .split(' ')
          .slice(0, 2)
          .map((s) => s[0])
          .join('')}
      </span>
      <span>
        <strong>{name}</strong>
        <small>{code}</small>
      </span>
    </div>
  );
}
function Empty({ title, text, action }: { title: string; text: string; action?: React.ReactNode }) {
  return (
    <div className="empty">
      <Users size={30} />
      <h3>{title}</h3>
      <p>{text}</p>
      {action}
    </div>
  );
}
function Attention({
  value,
  label,
  text,
  onClick,
}: {
  value: number;
  label: string;
  text: string;
  onClick: () => void;
}) {
  return (
    <button className="attention-row" onClick={onClick}>
      <span className={value ? 'attention-value' : 'attention-value zero'}>{value}</span>
      <span>
        <strong>{label}</strong>
        <small>{text}</small>
      </span>
      <ChevronRight size={16} />
    </button>
  );
}
function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  return (
    <dialog ref={ref} className="modal" onCancel={onClose}>
      <div className="modal-heading">
        <h2>{title}</h2>
        <button className="icon-button" aria-label="Close dialog" onClick={onClose}>
          <X size={20} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
function EmployeeForm({
  employee,
  busy,
  onSave,
}: {
  employee: Employee | null;
  busy: boolean;
  onSave: (e: Employee) => void;
}) {
  const [rates, setRates] = useState(employee?.rates ?? []),
    [role, setRole] = useState('FR_Associate'),
    [eligible, setEligible] = useState(true),
    [rateError, setRateError] = useState(''),
    [rateMode, setRateMode] = useState('daily');
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    if (!rates.length) {
      setRateError('Add at least one dated wage before saving.');
      return;
    }
    onSave({
      code: String(f.get('code')).trim(),
      name: String(f.get('name')).trim(),
      active: f.get('active') === 'on',
      manualPayroll: f.get('manualPayroll') === 'on',
      aadhaar: f.get('aadhaar') === 'on',
      bank: f.get('bank') === 'on',
      offerSent: f.get('offerSent') === 'on',
      offerReceived: f.get('offerReceived') === 'on',
      rates,
    });
  }
  return (
    <form onSubmit={submit}>
      <div className="form-grid">
        <label>
          Employee code
          <input
            name="code"
            required
            readOnly={Boolean(employee)}
            pattern="[A-Za-z0-9_-]+"
            defaultValue={employee?.code ?? 'SE-' + crypto.randomUUID().slice(0, 8).toUpperCase()}
          />
        </label>
        <label>
          Full name
          <input name="name" required defaultValue={employee?.name} />
        </label>
      </div>
      <label className="checkbox">
        <input type="checkbox" name="active" defaultChecked={employee?.active ?? true} />
        Active employee
      </label>
      <label className="checkbox">
        <input
          type="checkbox"
          name="manualPayroll"
          defaultChecked={employee?.manualPayroll ?? false}
        />
        Manual payroll — employee is missing from imported attendance (allows non-FR roles)
      </label>
      <p>Use the generated internal code if no official employee code exists.</p>
      <h3>Wage history</h3>
      {rates.map((r) => (
        <div className="wage-row" key={r.from}>
          <span>
            <strong>
              {rateLabel(r)}
              {r.fixedMonthlyMinor === undefined ? '/day' : ''} · {r.role}
            </strong>
            <small>
              Effective {r.from} · Bonus{' '}
              {r.bonusEligible && bonusRole(r.role) ? 'eligible' : 'excluded'}
            </small>
          </span>
        </div>
      ))}
      <div className="rate-entry">
        <div className="form-grid">
          <label>
            Effective from
            <input type="date" id="rate-date" />
          </label>
          <label>
            {rateMode === 'daily' ? 'Daily wage (₹)' : 'Monthly base (₹)'}
            <input type="number" id="rate-amount" min="0.01" step="0.01" />
          </label>
        </div>
        <div className="form-grid">
          <label>
            Rate calculation
            <select value={rateMode} onChange={(e) => setRateMode(e.target.value)}>
              <option value="daily">Daily wage</option>
              <option value="monthly">Monthly base ÷ days</option>
              <option value="fixed">Fixed monthly — regardless of attendance</option>
            </select>
          </label>
          {rateMode === 'monthly' && (
            <label>
              Divisor (days)
              <input id="rate-divisor" type="number" min="1" max="31" defaultValue="26" />
            </label>
          )}
        </div>
        <label>
          Role
          <input
            value={role}
            onChange={(e) => {
              setRole(e.target.value);
              setEligible(bonusRole(e.target.value));
            }}
          />
        </label>
        <label className="checkbox">
          <input
            type="checkbox"
            checked={rateMode !== 'fixed' && eligible && bonusRole(role)}
            disabled={rateMode === 'fixed' || !bonusRole(role)}
            onChange={(e) => setEligible(e.target.checked)}
          />
          Eligible for attendance bonus
        </label>
        <button
          className="secondary"
          type="button"
          onClick={() => {
            const date = (document.getElementById('rate-date') as HTMLInputElement).value;
            const amount = Math.round(
              Number((document.getElementById('rate-amount') as HTMLInputElement).value) * 100,
            );
            if (!date || !Number.isSafeInteger(amount) || amount <= 0 || !role.trim()) {
              setRateError('Enter an effective date, role, and positive daily wage.');
              return;
            }
            if (
              (rateMode === 'fixed' || rates.some((r) => r.fixedMonthlyMinor !== undefined)) &&
              !date.endsWith('-01')
            ) {
              setRateError(
                'Fixed monthly salary and changes to it must start on the first day of a month.',
              );
              return;
            }
            if (rates.some((r) => r.from === date)) {
              setRateError('A wage already starts on this date. Choose a new effective date.');
              return;
            }
            const divisor =
              rateMode === 'monthly'
                ? Number((document.getElementById('rate-divisor') as HTMLInputElement).value)
                : 1;
            if (!Number.isInteger(divisor) || divisor < 1 || divisor > 31) {
              setRateError('Use a divisor between 1 and 31.');
              return;
            }
            setRates([
              ...rates,
              {
                from: date,
                role: role.trim(),
                dailyMinor: amount,
                bonusEligible: rateMode !== 'fixed' && eligible && bonusRole(role),
                ...(rateMode === 'fixed' ? { fixedMonthlyMinor: amount } : {}),
                ...(rateMode === 'monthly' ? { monthlyMinor: amount, divisor } : {}),
              },
            ]);
            setRateError('');
          }}
        >
          Add dated wage
        </button>
        {rateError && (
          <p className="issue" role="alert">
            {rateError}
          </p>
        )}
      </div>
      <h3>Document checklist</h3>
      <div className="checklist">
        {(
          [
            ['aadhaar', 'Aadhaar added'],
            ['bank', 'Bank details added'],
            ['offerSent', 'Offer letter sent'],
            ['offerReceived', 'Offer letter received'],
          ] as const
        ).map(([k, label]) => (
          <label className="checkbox" key={k}>
            <input type="checkbox" name={k} defaultChecked={employee?.[k] ?? false} />
            {label}
          </label>
        ))}
      </div>
      <button className="primary" disabled={busy}>
        Save employee
      </button>
    </form>
  );
}
