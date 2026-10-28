import { describe, it, expect } from 'vitest';
import { approve } from './domain';
import { sampleState } from './test-fixtures/payroll';
import { deletionSummary, purgeEmployee } from './employeeDeletion';

function fixture(){
  const state=approve(sampleState(),'2026-09');
  const [target,other]=state.employees;
  for(const e of [target,other]){
    state.payments.push({id:e.code,code:e.code,month:'2026-09',amount:100,date:'2026-10-08',reference:'paid'});
    state.files.push({id:e.code,code:e.code,name:'Aadhaar',url:'file',uploadedAt:'2026-10-01'});
    (state.fileDeletions??=[]).push({id:e.code,status:'pending',requestedAt:'2026-10-01'});
    (state.advances??=[]).push({id:e.code,code:e.code,amount:400000,paidOn:'2026-09-01',reference:'',note:'',createdAt:'2026-09-01',schedule:[{month:'2026-10',amount:200000}]});
    const row=state.attendance.find(a=>a.code===e.code)!;
    state.imports.push({id:e.code,name:'attendance.xlsx',at:'2026-10-01',added:0,updated:1,unchanged:0,revisions:[{before:row,after:{...row,status:'A'}}]});
  }
  state.adjustments['2026-09']=[target,other].map(e=>({code:e.code,performance:100,other:0,deduction:10,note:'adjustment'}));
  return {state,target,other};
}
describe('employee deletion',()=>{
  it('purges all linked records and preserves other employees and shared month metadata',()=>{
    const {state,target,other}=fixture(); const before=structuredClone(state);
    const result=purgeEmployee(state,target.code);
    for(const rows of [result.employees,result.attendance,result.payments,result.files,result.advances!,result.adjustments['2026-09'],result.runs[0].lines]){
      expect(rows.some(r=>r.code===target.code)).toBe(false);
      expect(rows.filter(r=>r.code===other.code).length).toBeGreaterThan(0);
    }
    expect(result.fileDeletions).toEqual(state.fileDeletions!.filter(d=>d.id!==target.code));
    expect(result.imports.find(i=>i.id===target.code)?.revisions).toEqual([]);
    expect(result.imports.find(i=>i.id===other.code)).toEqual(state.imports.find(i=>i.id===other.code));
    expect(result.runs[0].approvedAt).toBe(state.runs[0].approvedAt);
    expect(state).toEqual(before);
    expect(purgeEmployee(result,target.code)).toEqual(result);
  });
  it('uses the persistent job to remove deletion metadata after file records are gone',()=>{
    const {state,target}=fixture();
    state.files=state.files.filter(f=>f.code!==target.code);
    state.employeeDeletion={id:'job',code:target.code,requestedAt:'now',fileIds:[target.code],completedFileIds:[target.code]};
    expect(purgeEmployee(state,target.code).fileDeletions!.some(d=>d.id===target.code)).toBe(false);
  });
  it('reports affected records before confirmation',()=>{
    const {state,target}=fixture();
    expect(deletionSummary(state,target.code)).toEqual({attendance:30,payrolls:1,payments:1,advances:1,documents:1});
  });
});
