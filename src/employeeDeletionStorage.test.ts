import {beforeEach,afterEach,it,expect,vi} from 'vitest';
const memory=vi.hoisted(()=>({docs:new Map<string,any>(),sizes:[] as number[],fail:false}));
vi.mock('firebase/app',()=>({initializeApp:()=>({})}));
vi.mock('firebase/auth',()=>({
 getAuth:()=>({currentUser:{uid:'owner'}}),GoogleAuthProvider:class{},
 signInWithPopup:vi.fn(),signOut:vi.fn(),setPersistence:vi.fn(),browserLocalPersistence:{},reauthenticateWithPopup:vi.fn(),
}));
vi.mock('firebase/firestore',()=>({
 getFirestore:()=>({}),
 doc:(_:unknown,...parts:string[])=>parts.join('/'),
 collection:(_:unknown,...parts:string[])=>parts.join('/'),
 getDoc:async(path:string)=>({data:()=>structuredClone(memory.docs.get(path))}),
 getDocs:async(path:string)=>({docs:[...memory.docs].filter(([key])=>key.startsWith(path+'/')).map(([key,value])=>({id:key.split('/').at(-1),data:()=>structuredClone(value)}))}),
 runTransaction:async(_:unknown,fn:any)=>{
  const writes:Array<()=>void>=[];
  await fn({get:async(path:string)=>({data:()=>structuredClone(memory.docs.get(path))}),
   set:(path:string,value:any)=>writes.push(()=>memory.docs.set(path,structuredClone(value))),
   delete:(path:string)=>{if(memory.fail)throw new Error('Interrupted cleanup');writes.push(()=>memory.docs.delete(path));}});
  memory.sizes.push(writes.length);writes.forEach(write=>write());
 },
}));
beforeEach(()=>{
 vi.resetModules();memory.docs.clear();memory.sizes=[];memory.fail=false;
 for(const key of ['VITE_FIREBASE_API_KEY','VITE_FIREBASE_AUTH_DOMAIN','VITE_FIREBASE_PROJECT_ID','VITE_FIREBASE_APP_ID'])vi.stubEnv(key,'test');
 vi.stubEnv('VITE_OWNER_UID','owner');
 memory.docs.set('owners/owner/meta/revision',{value:0});
 for(const code of ['target','other'])memory.docs.set('owners/owner/employees/'+code,{code,name:code,active:true,rates:[],aadhaar:false,bank:false,offerSent:false,offerReceived:false});
});
afterEach(()=>vi.unstubAllEnvs());
it('resumes interrupted multi-batch deletion and blocks ordinary writes during cleanup',async()=>{
 const s=await import('./storage');
 for(let i=0;i<405;i++)memory.docs.set('owners/owner/payments/'+i,{id:String(i),code:'target',month:'2026-09',amount:1,date:'2026-10-08',reference:''});
 const initial=await s.loadCloud();
 const locked=await s.startEmployeeDeletion(initial,'target');
 await expect(s.saveCloud(locked,locked)).rejects.toThrow('pending employee deletion');
 memory.fail=true;
 await expect(s.finishEmployeeDeletion(()=>{})).rejects.toThrow('Interrupted cleanup');
 expect((await s.loadCloud()).employeeDeletion?.code).toBe('target');
 expect((await s.loadCloud()).payments).toHaveLength(405);
 memory.fail=false;
 const result=await s.finishEmployeeDeletion(()=>{});
 expect(result.employees.map(e=>e.code)).toEqual(['other']);
 expect(result.payments).toEqual([]);
 expect(result.employeeDeletion).toBeNull();
 expect(Math.max(...memory.sizes)).toBeLessThanOrEqual(401);
 expect(memory.sizes).toContain(401);
});
it('requires Drive access before locking a workspace with documents',async()=>{
 const s=await import('./storage');
 memory.docs.set('owners/owner/files/document',{id:'document',code:'target',name:'Aadhaar',url:'file',uploadedAt:'now'});
 await expect(s.startEmployeeDeletion(await s.loadCloud(),'target')).rejects.toThrow('Connect Google Drive');
 expect((await s.loadCloud()).employeeDeletion).toBeNull();
});
it('rejects stale state before starting deletion',async()=>{
 const s=await import('./storage'); const initial=await s.loadCloud();
 memory.docs.set('owners/owner/meta/revision',{value:1});
 await expect(s.startEmployeeDeletion(initial,'target')).rejects.toThrow();
 expect((await s.loadCloud()).employeeDeletion).toBeNull();
});
