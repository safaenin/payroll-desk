import { useState } from 'react';
import { Plus, X } from 'lucide-react';
import { money, type State } from './domain';
import { recovered, saveAdvance, type Advance, type Installment } from './advances';

type Props={state:State;busy:boolean;month:string;save:(next:State,message:string)=>Promise<void>};
export default function Advances({state,busy,month,save}:Props){
  const [editing,setEditing]=useState<Advance|null|undefined>(),[error,setError]=useState('');
  const advances=state.advances??[];
  const issued=advances.reduce((n,a)=>n+a.amount,0),collected=advances.reduce((n,a)=>n+recovered(state,a.id),0);
  const outstanding=issued-collected;
  const scheduled=advances.reduce((n,a)=>n+a.schedule.filter(i=>!state.runs.some(r=>r.month===i.month)).reduce((s,i)=>s+i.amount,0),0);
  return <>
    <div className="stats-grid">{[['Total advances issued',issued],['Recovered through payroll',collected],['Outstanding balance',outstanding],['Not yet scheduled',outstanding-scheduled]].map(([label,amount])=><section className="stat" key={label}><div className="stat-label">{label}</div><strong>{money(Number(amount))}</strong><small>All employees · all months</small></section>)}</div>
    <section className="panel"><div className="section-heading"><div><h2>Employee advances</h2><p>Record money already paid. Plan partial or full recovery from future salaries.</p></div><button className="primary" disabled={busy||!state.employees.length} onClick={()=>{setError('');setEditing(null);}}><Plus size={16}/> Record advance</button></div>
      <div className="advance-explainer">Example: ₹4,000 issued → ₹2,000 from next month’s salary → ₹2,000 from the following month. Recovery reduces the balance when payroll is approved, not when a draft is viewed. Salary-month labels refer to the work month, paid on the following month’s 8th.</div>
      <div className="table-wrap"><table><thead><tr><th>EMPLOYEE / REFERENCE</th><th>PAID ON</th><th>ADVANCE</th><th>RECOVERED</th><th>OUTSTANDING</th><th>RECOVERY SCHEDULE</th><th/></tr></thead><tbody>{advances.slice().sort((a,b)=>b.paidOn.localeCompare(a.paidOn)).map(a=>{
        const settled=recovered(state,a.id),remaining=a.amount-settled;
        const future=a.schedule.filter(i=>!state.runs.some(r=>r.month===i.month)).reduce((n,i)=>n+i.amount,0);
        return <tr key={a.id}><td><strong>{state.employees.find(e=>e.code===a.code)?.name??a.code}</strong><small>{a.code} · {a.reference}</small><small>{a.note}</small></td><td>{a.paidOn}</td><td className="numeric">{money(a.amount)}</td><td className="numeric">{money(settled)}</td><td className="numeric strong">{money(remaining)}{remaining===0&&<small>Fully recovered</small>}{remaining>future&&<small className="issue">{money(remaining-future)} not scheduled</small>}</td><td>{a.schedule.map(i=>{
          const run=state.runs.find(r=>r.month===i.month);
          const done=run?.lines.some(l=>l.advanceRecoveries?.some(r=>r.advanceId===a.id));
          return <div className="installment-status" key={i.month}><span>{i.month} · {money(i.amount)}</span><span className={`badge ${done?'green':i.month<month?'amber':'gray'}`}>{done?'Recovered':i.month<month?'Past month · review':'Scheduled'}</span></div>;
        })}{!a.schedule.length&&<span className="issue">Add a recovery schedule</span>}</td><td><button className="text-button" disabled={busy||remaining===0} onClick={()=>{setError('');setEditing(a);}}>Edit schedule</button></td></tr>;
      })}</tbody></table></div>{!advances.length&&<div className="empty"><h3>No advances recorded</h3><p>Once you pay an advance, record its amount, payment reference, and monthly installments here.</p>{!state.employees.length&&<p>Add an employee profile first.</p>}</div>}
    </section>
    {editing!==undefined&&<section className="panel advance-editor" aria-label={editing?'Edit advance schedule':'Record advance'}><div className="section-heading"><h2>{editing?'Edit recovery schedule':'Record a paid advance'}</h2><button className="icon-button" aria-label="Close advance form" onClick={()=>setEditing(undefined)}><X size={18}/></button></div><AdvanceForm key={editing?.id??'new'} advance={editing} state={state} busy={busy} error={error} submit={async a=>{try{setError('');const next=saveAdvance(state,a);await save(next,editing?'Recovery schedule saved.':'Advance recorded with its recovery schedule.');setEditing(undefined);}catch(e){setError(e instanceof Error?e.message:String(e));}}}/></section>}
  </>;
}
function AdvanceForm({advance,state,busy,error,submit}:{advance:Advance|null;state:State;busy:boolean;error:string;submit:(a:Advance)=>Promise<void>}){
  const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  const [schedule,setSchedule]=useState<Installment[]>(advance?.schedule??[]),[amount,setAmount]=useState((advance?.amount??0)/100);
  const [installmentMonth,setInstallmentMonth]=useState(''),[installmentAmount,setInstallmentAmount]=useState(''),[scheduleError,setScheduleError]=useState('');
  const total=schedule.reduce((n,i)=>n+i.amount,0);
  return <form className="settings-body" onSubmit={e=>{e.preventDefault();const data=new FormData(e.currentTarget);void submit(advance?{...advance,schedule}:{id:crypto.randomUUID(),code:String(data.get('employee')),amount:Math.round(amount*100),paidOn:String(data.get('paidOn')),reference:String(data.get('reference')).trim(),note:String(data.get('note')).trim(),createdAt:new Date().toISOString(),schedule});}}>
    <div className="form-grid"><label>Employee<select name="employee" required disabled={Boolean(advance)} defaultValue={advance?.code??''}><option value="">Select employee</option>{state.employees.map(e=><option value={e.code} key={e.code}>{e.name} · {e.code}</option>)}</select></label><label>Advance paid (₹)<input aria-label="Advance paid (₹)" type="number" min="0.01" step="0.01" required readOnly={Boolean(advance)} value={amount||''} onChange={e=>setAmount(Number(e.target.value))}/></label><label>Paid on<input type="date" name="paidOn" required max={today} readOnly={Boolean(advance)} defaultValue={advance?.paidOn??today}/></label><label>Payment reference<input name="reference" required readOnly={Boolean(advance)} defaultValue={advance?.reference}/></label></div>
    <label>Notes<input name="note" readOnly={Boolean(advance)} defaultValue={advance?.note} placeholder="Reason or manager reference (optional)"/></label>
    <h3>Recovery installments</h3><p>Enter the salary month and amount to deduct. You can leave part unscheduled and allocate it later. Approved installments are locked.</p>
    {schedule.map((i,index)=><div className="schedule-row" key={i.month}><strong>{i.month}</strong><span>{money(i.amount)}</span>{state.runs.some(r=>r.month===i.month)?<span className="badge green">Locked · approved payroll</span>:<button className="text-button" type="button" onClick={()=>setSchedule(schedule.filter((_,n)=>n!==index))}>Remove installment {i.month}</button>}</div>)}
    <div className="installment-entry"><label>Salary month<input type="month" aria-label="Installment salary month" value={installmentMonth} onChange={e=>setInstallmentMonth(e.target.value)}/></label><label>Recovery amount (₹)<input aria-label="Recovery amount (₹)" type="number" min="0.01" step="0.01" value={installmentAmount} onChange={e=>setInstallmentAmount(e.target.value)}/></label><button type="button" className="secondary" onClick={()=>{const minor=Math.round(Number(installmentAmount)*100);if(!installmentMonth||!Number.isSafeInteger(minor)||minor<=0){setScheduleError('Enter a salary month and a positive amount.');return;}if(schedule.some(i=>i.month===installmentMonth)){setScheduleError('This salary month is already scheduled. Remove its installment first to replace it.');return;}if(state.runs.some(r=>r.month===installmentMonth)){setScheduleError('This payroll month is already approved. Choose an unapproved month.');return;}setSchedule([...schedule,{month:installmentMonth,amount:minor}].sort((a,b)=>a.month.localeCompare(b.month)));setInstallmentAmount('');setScheduleError('');}}>Add installment</button></div>
    <p>Scheduled: <strong>{money(total)}</strong> · Not allocated: <strong>{money(Math.round(amount*100)-total)}</strong></p>
    {(error||scheduleError)&&<div className="message error" role="alert">{error||scheduleError}</div>}
    <button className="primary" disabled={busy}>{advance?'Save recovery schedule':'Save advance'}</button>
  </form>;
}
