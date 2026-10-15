import {db} from '../dataClient.js';
import {selectFolder} from './folders.js';
import {selectModule} from '../core/moduleRegistry.js';

export async function openResourceRoute(hash){
  const match=hash.match(/^#\/resource\/(board|conversation|doc|embed|file)\/([0-9a-f-]+)$/i);
  if(!match)return false;
  const module={board:'boards',conversation:'conversation',doc:'docs',embed:'embeds',file:'files'}[match[1]];
  const table=module==='conversation'?'conversations':module;
  const {data,error}=await db.from(table).select('*').eq('id',match[2]).is('archived_at',null).is('trashed_at',null).maybeSingle();
  if(error)throw error;if(!data)throw new Error('This item is unavailable or you no longer have access.');
  await selectFolder(data.folder_id||null,{skipOverview:true,refreshModule:false});
  await selectModule(module,data.id);return true;
}
