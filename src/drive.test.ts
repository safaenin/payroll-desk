import { beforeEach,afterEach,expect,it,vi } from 'vitest';
const mocks=vi.hoisted(()=>({reauth:vi.fn(),provider:vi.fn(),fetch:vi.fn()}));
vi.mock('firebase/app',()=>({initializeApp:()=>({})}));
vi.mock('firebase/auth',()=>({
  getAuth:()=>({currentUser:{uid:'owner',email:'owner@example.com'}}),
  GoogleAuthProvider:class {static credentialFromResult(){return {accessToken:'test-token'};}addScope(scope:string){mocks.provider(scope);}setCustomParameters(){}},
  reauthenticateWithPopup:mocks.reauth,signInWithPopup:vi.fn(),signOut:vi.fn(),setPersistence:vi.fn(),browserLocalPersistence:{},
}));
vi.mock('firebase/firestore',()=>({getFirestore:()=>({}),collection:vi.fn(),doc:vi.fn(),getDoc:vi.fn(),getDocs:vi.fn(),runTransaction:vi.fn()}));
beforeEach(()=>{
  vi.resetModules();vi.clearAllMocks();
  for(const key of ['VITE_FIREBASE_API_KEY','VITE_FIREBASE_AUTH_DOMAIN','VITE_FIREBASE_PROJECT_ID','VITE_FIREBASE_APP_ID'])vi.stubEnv(key,'test');
  vi.stubEnv('VITE_OWNER_UID','owner');vi.stubGlobal('fetch',mocks.fetch);
  mocks.reauth.mockResolvedValue({user:{uid:'owner'}});
});
afterEach(()=>{vi.unstubAllEnvs();vi.unstubAllGlobals();});
it('requests only drive.file and verifies access before uploading',async()=>{
  const storage=await import('./storage');
  mocks.fetch.mockResolvedValueOnce(new Response('{"files":[]}')).mockResolvedValueOnce(new Response('{"files":[]}')).mockResolvedValueOnce(new Response('{"id":"root-folder"}')).mockResolvedValueOnce(new Response('{"files":[]}')).mockResolvedValueOnce(new Response('{"id":"employee-folder"}')).mockResolvedValueOnce(new Response('{"id":"file-1","name":"test.txt"}'));
  await storage.connectDrive();expect(mocks.provider).toHaveBeenCalledWith('https://www.googleapis.com/auth/drive.file');
  const result=await storage.uploadDrive(new File(['sample'],'test.txt',{type:'text/plain'}),'E1',{documentType:'signed-offer-letter',effectiveDate:'2026-10-15',note:'Promotion'});
  expect(result).toMatchObject({id:'file-1',name:'test.txt',code:'E1',url:'https://drive.google.com/file/d/file-1/view',documentType:'signed-offer-letter',effectiveDate:'2026-10-15',note:'Promotion'});
  const [,request]=mocks.fetch.mock.calls[5];const multipart=await request.body.text();expect(multipart).toContain('"employeeCode":"E1"');expect(multipart).toContain('sample');expect(multipart).toContain('"parents":["employee-folder"]');expect(multipart).not.toContain('permissions');
});
it('requires a connection before an upload',async()=>{const s=await import('./storage');await expect(s.uploadDrive(new File(['x'],'x.txt'),'E1')).rejects.toThrow('Connect Google Drive');expect(mocks.fetch).not.toHaveBeenCalled();});
it('explains how to enable a disabled Drive API',async()=>{
  const s=await import('./storage');mocks.fetch.mockResolvedValue(new Response(JSON.stringify({error:{errors:[{reason:'accessNotConfigured'}]}}),{status:403}));
  await expect(s.connectDrive()).rejects.toThrow('Enable Google Drive API');
  await expect(s.uploadDrive(new File(['x'],'x.txt'),'E1')).rejects.toThrow('Connect Google Drive');
});
it('clears an expired upload token and requests reconnection',async()=>{
  const s=await import('./storage');mocks.fetch.mockResolvedValueOnce(new Response('{"files":[]}')).mockResolvedValueOnce(new Response('{}',{status:401}));
  await s.connectDrive();await expect(s.uploadDrive(new File(['x'],'x.txt'),'E1')).rejects.toThrow('expired');
  await expect(s.uploadDrive(new File(['x'],'x.txt'),'E1')).rejects.toThrow('Connect Google Drive');
});
it('reports insufficient Drive permission without claiming connection success',async()=>{
  const s=await import('./storage');mocks.fetch.mockResolvedValue(new Response('{}',{status:403}));await expect(s.connectDrive()).rejects.toThrow('denied access');
});
it('moves a document to Trash without permanently deleting it',async()=>{
  const s=await import('./storage');mocks.fetch.mockResolvedValueOnce(new Response('{"files":[]}')).mockResolvedValueOnce(new Response('{"id":"file-1","trashed":true}'));
  await s.connectDrive();await s.trashDriveFile('file-1');
  const [url,request]=mocks.fetch.mock.calls[1];expect(url).toContain('/files/file-1?');expect(request.method).toBe('PATCH');expect(JSON.parse(request.body)).toEqual({trashed:true});
});
it('does not claim success for a failed or unconfirmed trash operation',async()=>{
  const s=await import('./storage');mocks.fetch.mockResolvedValueOnce(new Response('{"files":[]}')).mockResolvedValueOnce(new Response('{}',{status:403})).mockResolvedValueOnce(new Response('{"id":"file-1","trashed":false}'));
  await s.connectDrive();await expect(s.trashDriveFile('file-1')).rejects.toThrow('denied access');await expect(s.trashDriveFile('file-1')).rejects.toThrow('did not confirm');
});

it('renames existing folders to name-code and moves documents without changing their IDs',async()=>{
 const s=await import('./storage');
 const {emptyState}=await import('./domain');const state=emptyState();
 state.employees.push({code:'E1',name:'Tarun',active:true,rates:[],aadhaar:false,bank:false,offerSent:false,offerReceived:false});
 state.files.push({id:'old-file',name:'Aadhaar.pdf',code:'E1',url:'unchanged',uploadedAt:'now'});
 mocks.fetch.mockResolvedValueOnce(new Response('{"files":[]}'))
 .mockResolvedValueOnce(new Response('{"files":[{"id":"root-folder","name":"employees"}]}'))
 .mockResolvedValueOnce(new Response('{"files":[{"id":"employee-folder","name":"Tarun"}]}'))
 .mockResolvedValueOnce(new Response('{"id":"employee-folder"}'))
 .mockResolvedValueOnce(new Response('{"parents":["root"],"trashed":false}'))
 .mockResolvedValueOnce(new Response('{"id":"old-file","parents":["employee-folder"]}'));
 await s.connectDrive();const progress=vi.fn();await s.organizeEmployeeDocuments(state,progress);
 const [renameUrl,renameRequest]=mocks.fetch.mock.calls[3];
 expect(renameUrl).toContain('/employee-folder?');expect(renameRequest.method).toBe('PATCH');expect(JSON.parse(renameRequest.body)).toEqual({name:'Tarun-E1'});
 const [url,request]=mocks.fetch.mock.calls[5];
 expect(url).toContain('/old-file?');expect(url).toContain('addParents=employee-folder');expect(url).toContain('removeParents=root');
 expect(request.method).toBe('PATCH');expect(state.files[0].url).toBe('unchanged');
 expect(decodeURIComponent(mocks.fetch.mock.calls[2][0]).replaceAll('+',' ')).toContain("employeeCode");
 expect(progress).toHaveBeenLastCalledWith(expect.stringContaining('Organized 1 documents'));
});
it('skips removed document links during folder organization',async()=>{
 const s=await import('./storage');const {emptyState}=await import('./domain');const state=emptyState();
 state.files.push({id:'gone',code:'E1',name:'old',url:'old',uploadedAt:'now'});
 state.fileDeletions=[{id:'gone',requestedAt:'now',status:'pending'}];
 await s.organizeEmployeeDocuments(state,vi.fn());expect(mocks.fetch).not.toHaveBeenCalled();
});
