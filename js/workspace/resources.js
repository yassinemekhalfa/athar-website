import {db} from '../dataClient.js';
import {getState,setState} from '../core/state.js';
import {selectFolder} from './folders.js';
import {selectModule} from '../core/moduleRegistry.js';
const TYPES={boards:'boards',conversations:'conversation',docs:'docs',embeds:'embeds',invoices:'invoices'};
export async function loadResources(){
 const s=getState();if(!s.agency)return [];
 const results=await Promise.allSettled(Object.entries(TYPES).map(async([table,module])=>{let q=db.from(table).select('*').eq('agency_id',s.agency.id);if(table!=='invoices')q=q.is('archived_at',null).is('trashed_at',null);const {data,error}=await q;if(error)throw Object.assign(new Error(error.message||`Could not load ${table}`),{code:error.code,table});return(data||[]).map(r=>({...r,title:r.title||r.invoice_number,module}));}));
 const resources=[];for(const result of results){if(result.status==='fulfilled')resources.push(...result.value);else if(result.reason?.code==='42501'||/permission|access denied/i.test(result.reason?.message||''))console.warn(`Skipped restricted ${result.reason?.table||'workspace'} resources.`);else throw result.reason;}
 setState({resources});document.dispatchEvent(new CustomEvent('resources:loaded'));return resources;
}
export async function openResource(resource){await selectFolder(resource.folder_id,{skipOverview:true,refreshModule:false});await selectModule(resource.module,resource.id);}
