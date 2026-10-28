import type { State } from './domain';

export type Installment = { month: string; amount: number };
export type Advance = { id: string; code: string; amount: number; paidOn: string; reference: string; note: string; createdAt: string; schedule: Installment[] };
export type Recovery = { advanceId: string; amount: number };
export function recovered(state: State, id: string) {
  return state.runs.reduce((total,run)=>total+run.lines.reduce((n,line)=>n+(line.advanceRecoveries??[]).filter(r=>r.advanceId===id).reduce((s,r)=>s+r.amount,0),0),0);
}
export function recoveriesFor(state: State, code: string, month: string): Recovery[] {
  return (state.advances??[]).filter(a=>a.code===code).flatMap(a=>a.schedule.filter(i=>i.month===month).map(i=>({advanceId:a.id,amount:i.amount})));
}
export function saveAdvance(state: State, advance: Advance): State {
  if(!state.employees.some(e=>e.code===advance.code)) throw new Error('Select an existing employee.');
  if(!Number.isSafeInteger(advance.amount)||advance.amount<=0) throw new Error('Advance amount must be positive.');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(advance.paidOn)||!Number.isFinite(Date.parse(advance.paidOn))||new Date(advance.paidOn).toISOString().slice(0,10)!==advance.paidOn||new Date(`${advance.paidOn}T00:00:00+05:30`).getTime()>Date.now()) throw new Error('Enter a valid advance payment date, not in the future.');
  if(!advance.reference.trim()) throw new Error('A payment reference is required.');
  const existing=(state.advances??[]).find(a=>a.id===advance.id);
  if(existing && ['code','amount','paidOn','reference','note','createdAt'].some(k=>existing[k as keyof Advance]!==advance[k as keyof Advance])) throw new Error('An issued advance cannot be changed; only its unrecovered schedule can be edited.');
  if((state.advances??[]).some(a=>a.id!==advance.id&&a.code===advance.code&&a.reference.trim()===advance.reference.trim())) throw new Error('An advance with this employee and payment reference already exists.');
  const months=new Set<string>();
  for(const i of advance.schedule) {
    if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(i.month)||i.month<advance.paidOn.slice(0,7)) throw new Error('Choose a recovery salary month on or after the advance month.');
    if(!Number.isSafeInteger(i.amount)||i.amount<=0) throw new Error('Each installment must have a positive amount.');
    if(months.has(i.month)) throw new Error('Use one installment per salary month for this advance.');
    months.add(i.month);
    if(state.runs.some(r=>r.month===i.month)&&existing?.schedule.find(s=>s.month===i.month)?.amount!==i.amount) throw new Error('Cannot add or change recovery in an approved payroll month.');
  }
  for(const old of existing?.schedule??[]) if(state.runs.some(r=>r.month===old.month)&&advance.schedule.find(i=>i.month===old.month)?.amount!==old.amount) throw new Error('Approved recovery installments are locked.');
  const scheduled=advance.schedule.reduce((n,i)=>n+i.amount,0);
  if(!Number.isSafeInteger(scheduled)||scheduled>advance.amount) throw new Error('Scheduled recoveries cannot exceed the advance amount.');
  const upcoming=advance.schedule.filter(i=>!state.runs.some(r=>r.month===i.month)).reduce((n,i)=>n+i.amount,0);
  if(recovered(state,advance.id)+upcoming>advance.amount) throw new Error('Recoveries exceed the remaining advance balance.');
  return {...state,advances:[...(state.advances??[]).filter(a=>a.id!==advance.id),{...advance,schedule:[...advance.schedule].sort((a,b)=>a.month.localeCompare(b.month))}]};
}
