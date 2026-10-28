import {useState} from 'react';
import {mergeAttendance,monthDates,type State,type Attendance} from './domain';
export function saveManualAttendance(state:State,code:string,month:string,statuses:Record<string,string>):State{
  const employee=state.employees.find(e=>e.code===code&&e.manualPayroll);
  if(!employee)throw new Error('Select an employee enabled for manual payroll.');
  if(state.runs.some(r=>r.month===month))throw new Error('This month is already approved.');
  const rows:Attendance[]=monthDates(month).map(date=>{
    const status=statuses[date];
    if(!['P','HD','A','WO','L'].includes(status))throw new Error('Select attendance for every day before saving.');
    const rate=[...employee.rates].sort((a,b)=>b.from.localeCompare(a.from)).find(r=>r.from<=date);
    if(!rate)throw new Error('Add a wage effective on or before the first day of this month.');
    return {code,name:employee.name,date,role:rate.role,status,payable:status==='P'?1:status==='HD'?0.5:0,store:'Manual',primaryStore:'Manual'};
  });
  return mergeAttendance(state,rows,'Manual attendance');
}
export default function ManualAttendance({state,month,busy,save}:{state:State;month:string;busy:boolean;save:(next:State)=>Promise<unknown>}){
 const [code,setCode]=useState(''),[statuses,setStatuses]=useState<Record<string,string>>({}),[error,setError]=useState('');
 return <section className="panel"><div className="settings-body"><h2>Manual attendance</h2><p>For employees missing from the report: enable manual payroll in their profile. P = full day; HD = half-day; A, WO and L = unpaid. Fixed monthly salary is unaffected.</p><label>Employee<select disabled={busy} value={code} onChange={e=>{setCode(e.target.value);setStatuses(Object.fromEntries(state.attendance.filter(a=>a.code===e.target.value&&a.date.startsWith(month)).map(a=>[a.date,a.status])));setError('');}}><option value="">Select employee</option>{state.employees.filter(e=>e.active&&e.manualPayroll).map(e=><option key={e.code} value={e.code}>{e.name} · {e.code}</option>)}</select></label>{code&&<form onSubmit={e=>{e.preventDefault();setError('');try{void save(saveManualAttendance(state,code,month,statuses)).catch(e=>setError(String(e)));}catch(e){setError(e instanceof Error?e.message:String(e));}}}><div className="form-grid">{monthDates(month).map(date=><label key={date}>{date}<select disabled={busy||state.runs.some(r=>r.month===month)} value={statuses[date]??''} onChange={e=>setStatuses({...statuses,[date]:e.target.value})} required><option value="">Choose</option>{['P','HD','A','WO','L'].map(s=><option key={s}>{s}</option>)}</select></label>)}</div>{error&&<p role="alert">{error}</p>}<button className="primary" disabled={busy||state.runs.some(r=>r.month===month)}>Save manual attendance</button></form>}</div></section>;
}
