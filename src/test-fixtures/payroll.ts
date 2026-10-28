import { emptyState, monthDates, type State } from '../domain';
export function sampleState():State {
  const state=emptyState();
  const names=['Aarav Sharma','Diya Mehta','Kabir Verma','Meera Joshi','Rohan Shah','Anaya Kapoor','Vivaan Rao','Ishita Sen','Arjun Das','Sana Khan','Dev Patel','Tara Singh','Neil Kumar','Riya Nair','Advik Jain','Priya Roy','Kunal Sethi','Nisha Bhat','Yash Gupta','Aditi Rao','Samar Bose','Pooja Shah','Varun Lal','Kavya Das','Ishan Sen','Simran Gill','Manav Roy','Neha Paul','Om Sinha','Zoya Ali','Ankit Shah','Ritu Jain','Vikram Rao','Sonia Mehta','Dhruv Kapoor'];
  const month='2026-09';
  names.forEach((name,i)=> {
    const code=`DEMO${String(i+1).padStart(3,'0')}`,role=i===34?'FR_Shift Incharge':i%3===0?'FR_Packer':'FR_Associate';
    state.employees.push({code,name,active:true,rates:[{from:'2026-01-01',role,dailyMinor:i===34?80000:50000+i%3*2500,bonusEligible:i!==34}],aadhaar:i%5!==0,bank:true,offerSent:true,offerReceived:i%4!==0});
    monthDates(month).forEach((date,day)=>state.attendance.push({code,name,date,role,status:day<26-(i%4)?'P':'WO',payable:day<26-(i%4)?1:0,store:'Sample · Dharampur Chowk',primaryStore:'Sample · Dharampur Chowk'}));
  });
  state.adjustments[month]=[{code:'DEMO001',performance:150000,other:0,deduction:0,note:'Manager-selected performance award'},{code:'DEMO003',performance:75000,other:0,deduction:50000,note:'Performance award and recorded advance recovery'}];
  state.coverage[month]=true;
  return state;
}
