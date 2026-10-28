import {expect,it} from 'vitest';
import {calculate,emptyState,monthDates,approve,mergeAttendance} from './domain';
import {saveManualAttendance} from './ManualAttendance';
function fixture(fixed=false){
 const s=emptyState();
 s.employees.push({code:'SE-1',name:'Staff',active:true,manualPayroll:true,rates:[{from:'2026-09-01',role:'Assistant',dailyMinor:50000,bonusEligible:!fixed,...(fixed?{fixedMonthlyMinor:1000000}:{})}],aadhaar:false,bank:false,offerSent:false,offerReceived:false});
 return s;
}
it('pays 10000 without attendance, with deductions and advance recoveries',()=>{
 const s=fixture(true);
 s.adjustments['2026-09']=[{code:'SE-1',performance:50000,other:0,deduction:10000,note:''}];
 s.advances=[{id:'a',code:'SE-1',amount:200000,paidOn:'2026-08-01',createdAt:'now',reference:'',note:'',schedule:[{month:'2026-09',amount:100000}]}];
 const line=calculate(s,'2026-09')[0];
 expect(line).toMatchObject({base:1000000,attendanceBonus:0,net:940000,advanceRecovery:100000,issues:[]});
 expect(calculate(s,'2026-08')).toEqual([]);
 s.coverage['2026-09']=true;expect(approve(s,'2026-09').runs[0].lines[0]).toEqual(line);
});
it('pays manually entered non-FR days, counts half-days only toward base',()=>{
 const s=saveManualAttendance(fixture(),'SE-1','2026-09',Object.fromEntries(monthDates('2026-09').map((d,i)=>[d,i<26?'P':i===26?'HD':'A'])));
 expect(calculate(s,'2026-09')[0]).toMatchObject({base:1325000,fullDays:26,days:26.5,attendanceBonus:100000,issues:[]});
 expect(s.coverage['2026-09']).toBe(false);
 expect(()=>mergeAttendance(s,[s.attendance[0]],'report.xlsx')).toThrow('manual payroll');
});
it('blocks incomplete manual attendance and approved-month edits',()=>{
 const s=fixture();expect(calculate(s,'2026-09')[0].issues).toContain('Complete manual attendance for every day of this month');
 expect(()=>saveManualAttendance(s,'SE-1','2026-09',{})).toThrow('every day');
 let complete=saveManualAttendance(s,'SE-1','2026-09',Object.fromEntries(monthDates('2026-09').map(d=>[d,'P'])));
 complete.coverage['2026-09']=true;complete=approve(complete,'2026-09');
 expect(()=>saveManualAttendance(complete,'SE-1','2026-09',{})).toThrow('approved');
});
it('fixed salary remains full with absences and disables attendance bonus',()=>{
 const s=saveManualAttendance(fixture(true),'SE-1','2026-09',Object.fromEntries(monthDates('2026-09').map(d=>[d,'A'])));
 expect(calculate(s,'2026-09')[0]).toMatchObject({base:1000000,attendanceBonus:0,net:1000000,issues:[]});
 s.employees[0].active=false;expect(calculate({...s,attendance:[]},'2026-09')).toEqual([]);
});
it('blocks mid-month changes involving fixed pay',()=>{
 const s=fixture(true);s.employees[0].rates.push({from:'2026-09-15',role:'Assistant',dailyMinor:100,bonusEligible:false});
 expect(calculate(s,'2026-09')[0].issues).toContain('Fixed monthly wage changes must start on the first day of a month');
});
