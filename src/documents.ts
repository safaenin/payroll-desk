import type { FileRecord, State } from './domain';

/** Add future document types here without changing the employee/file relationship. */
export const DOCUMENT_TYPES = [
  {id:'aadhaar',label:'Aadhaar'},
  {id:'bank',label:'Bank document'},
  {id:'signed-offer-letter',label:'Signed Offer Letter'},
] as const;
export type DocumentDetails = {documentType:string;effectiveDate:string;note:string};
export function activeDocuments(state:State){return state.files.filter(f=>!state.fileDeletions?.some(d=>d.id===f.id));}
export function requestDocumentDeletion(state:State,id:string):State{
  const file=state.files.find(f=>f.id===id);
  if(!file)throw new Error('Document not found. Reload the workspace.');
  if(state.fileDeletions?.some(d=>d.id===id))return state;
  const next={...state,fileDeletions:[...(state.fileDeletions??[]),{id,requestedAt:new Date().toISOString(),status:'pending' as const}]};
  const remaining=activeDocuments(next).filter(f=>f.code===file.code&&f.documentType===file.documentType);
  return {...next,employees:state.employees.map(e=>e.code!==file.code?e:{...e,...(file.documentType==='aadhaar'?{aadhaar:remaining.length>0}:file.documentType==='bank'?{bank:remaining.length>0}:file.documentType==='signed-offer-letter'?{offerReceived:remaining.length>0}:{})})};
}
export function completeDocumentDeletion(state:State,id:string):State{
  if(!state.fileDeletions?.some(d=>d.id===id))throw new Error('Save the document removal request before moving the file to Trash.');
  return {...state,fileDeletions:state.fileDeletions.map(d=>d.id===id?{...d,status:'trashed',completedAt:new Date().toISOString()}:d)};
}
export function validateDocument(details:DocumentDetails){
  if(!DOCUMENT_TYPES.some(t=>t.id===details.documentType))throw new Error('Choose a supported document type.');
  if(details.documentType==='signed-offer-letter'&&!details.effectiveDate)throw new Error('Enter the effective date of the signed offer letter.');
  if(details.effectiveDate&&(!/^\d{4}-\d{2}-\d{2}$/.test(details.effectiveDate)||!Number.isFinite(Date.parse(details.effectiveDate))||new Date(details.effectiveDate).toISOString().slice(0,10)!==details.effectiveDate))throw new Error('Enter a valid document effective date.');
}
export function linkDocument(state:State,file:FileRecord):State{
  if(!state.employees.some(e=>e.code===file.code))throw new Error('Employee no longer exists. The uploaded file has not been linked.');
  if(state.files.some(f=>f.id===file.id))throw new Error('This Drive file is already linked.');
  return {...state,files:[...state.files,file],employees:state.employees.map(e=>e.code!==file.code?e:{...e,...(file.documentType==='aadhaar'?{aadhaar:true}:file.documentType==='bank'?{bank:true}:file.documentType==='signed-offer-letter'?{offerReceived:true}:{})})};
}
