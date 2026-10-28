import {expect,it} from 'vitest';
import {emptyState,type FileRecord} from './domain';
import {linkDocument,validateDocument,activeDocuments,requestDocumentDeletion,completeDocumentDeletion} from './documents';
function fixture(){const s=emptyState();s.employees=['E1','E2'].map(code=>({code,name:code,active:true,rates:[],aadhaar:false,bank:false,offerSent:false,offerReceived:false}));return s;}
const letter=(id:string,date:string):FileRecord=>({id,code:'E1',name:'offer.pdf',url:`https://drive.google.com/file/d/${id}/view`,uploadedAt:'2026-10-24',documentType:'signed-offer-letter',effectiveDate:date,note:'Promotion'});
it('keeps multiple signed letters for the same employee and filename',()=>{let s=linkDocument(fixture(),letter('original','2026-01-01'));s=linkDocument(s,letter('promotion','2026-10-15'));expect(s.files).toHaveLength(2);expect(s.files.map(f=>f.effectiveDate)).toEqual(['2026-01-01','2026-10-15']);expect(s.employees[0].offerReceived).toBe(true);expect(s.employees[1].offerReceived).toBe(false);expect(s.employees[0].rates).toEqual([]);});
it('requires an effective date for signed offer letters',()=>{expect(()=>validateDocument({documentType:'signed-offer-letter',effectiveDate:'',note:''})).toThrow('effective date');expect(()=>validateDocument({documentType:'signed-offer-letter',effectiveDate:'2026-02-30',note:''})).toThrow('valid');});
it('updates only the linked employee document checklist',()=>{const s=linkDocument(fixture(),{...letter('aadhaar',''),documentType:'aadhaar'});expect(s.employees[0].aadhaar).toBe(true);expect(s.employees[0].bank).toBe(false);expect(s.employees[1].aadhaar).toBe(false);});
it('rejects an unknown employee or duplicate file link',()=>{const s=linkDocument(fixture(),letter('original','2026-01-01'));expect(()=>linkDocument(s,letter('original','2026-01-01'))).toThrow('already linked');expect(()=>linkDocument(s,{...letter('another','2026-01-01'),code:'missing'})).toThrow('Employee no longer exists');});
it('preserves earlier unclassified uploads without guessing their type',()=>{const s=fixture();s.files=[{id:'old',name:'unknown.pdf',code:'E1',url:'https://drive.google.com/file/d/old/view',uploadedAt:'2026-01-01'}];const next=linkDocument(s,letter('new','2026-10-15'));expect(next.files[0]).toEqual(s.files[0]);expect(next.files[0].documentType).toBeUndefined();});
it('clears Aadhaar status after removing its last active document',()=>{
  const s=linkDocument(fixture(),{...letter('aadhaar',''),documentType:'aadhaar'});
  const removed=requestDocumentDeletion(s,'aadhaar');
  expect(removed.employees[0].aadhaar).toBe(false);expect(activeDocuments(removed)).toHaveLength(0);
  expect(removed.files).toHaveLength(1);expect(removed.fileDeletions?.[0].status).toBe('pending');
  const complete=completeDocumentDeletion(removed,'aadhaar');expect(complete.fileDeletions?.[0].status).toBe('trashed');expect(complete.employees[0].aadhaar).toBe(false);
});
it('preserves remaining signed letters and other employees documents',()=>{
  let s=linkDocument(fixture(),letter('old','2026-01-01'));s=linkDocument(s,letter('new','2026-10-01'));
  s=linkDocument(s,{...letter('other','2026-10-01'),code:'E2'});
  s=requestDocumentDeletion(s,'old');expect(s.employees[0].offerReceived).toBe(true);expect(activeDocuments(s).map(f=>f.id)).toEqual(['new','other']);
  s=requestDocumentDeletion(s,'new');expect(s.employees[0].offerReceived).toBe(false);expect(s.employees[1].offerReceived).toBe(true);
});
it('does not clear a newly uploaded replacement when pending cleanup completes',()=>{
  let s=linkDocument(fixture(),{...letter('wrong',''),documentType:'bank'});s=requestDocumentDeletion(s,'wrong');
  expect(s.employees[0].bank).toBe(false);
  s=linkDocument(s,{...letter('replacement',''),documentType:'bank'});s=completeDocumentDeletion(s,'wrong');
  expect(s.employees[0].bank).toBe(true);expect(activeDocuments(s).map(f=>f.id)).toEqual(['replacement']);
});
it('keeps deletion requests idempotent and leaves unclassified checklist flags unchanged',()=>{
  const s=fixture();s.employees[0].aadhaar=true;s.files=[{id:'old',code:'E1',name:'old',url:'url',uploadedAt:'2026-01-01'}];
  const removed=requestDocumentDeletion(s,'old');expect(requestDocumentDeletion(removed,'old')).toBe(removed);expect(removed.employees[0].aadhaar).toBe(true);
  expect(()=>requestDocumentDeletion(s,'missing')).toThrow('not found');expect(()=>completeDocumentDeletion(s,'old')).toThrow('Save the document removal request');
});
