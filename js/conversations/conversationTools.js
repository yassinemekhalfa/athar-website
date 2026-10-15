import {db} from '../dataClient.js';
import {AppCore} from '../core/appCore.js';
import {createTask} from '../modules/tasks.js';
const el=(t,c='',text='')=>{const n=document.createElement(t);n.className=c;n.textContent=text;return n;};
export function openMessageTask(message,context){
 const form=el('form','ap-stack'),board=el('select','ap-input'),title=el('input','ap-input'),description=el('textarea','ap-textarea');title.value=message.body.slice(0,100);title.required=true;description.value=message.body;
 const label=(text,node)=>{const l=el('label','k-form-field',text);l.append(node);return l;};const save=el('button','ap-btn ap-btn--primary','Save');save.type='submit';save.disabled=true;form.append(label('Task Board',board),label('Title',title),label('Description',description),save);
 db.from('boards').select('*').eq('folder_id',context.folderId).is('archived_at',null).then(({data,error})=>{if(error)throw error;for(const r of data||[]){const o=el('option','',r.title);o.value=r.id;board.append(o);}save.disabled=!board.options.length;if(!board.options.length)form.prepend(el('p','','Create a board in this folder first.'));}).catch(e=>AppCore.ui.toast(AppCore.ui.describeError(e),'error'));
 form.addEventListener('submit',async e=>{e.preventDefault();save.disabled=true;try{const {data,error}=await db.from('board_columns').select('*').eq('board_id',board.value).order('position').limit(1);if(error)throw error;let column=data?.[0];if(!column){const r=await db.from('board_columns').insert({agency_id:context.agencyId,board_id:board.value,name:'No section',position:100}).select().single();if(r.error)throw r.error;column=r.data;}await createTask({context,boardId:board.value,columnId:column.id,title:title.value,description:description.value,clientVisible:message.client_visible,siblings:[]});AppCore.ui.closeModal();AppCore.ui.toast('Task created.','success');}catch(error){AppCore.ui.toast(AppCore.ui.describeError(error),'error');}finally{save.disabled=false;}});AppCore.ui.openModal({title:'New Task',content:form});
}
export async function toggleReaction(messageId,emoji,context){
 const {data,error}=await db.from('message_reactions').select('id').eq('message_id',messageId).eq('profile_id',context.user.id).eq('emoji',emoji).maybeSingle();if(error)throw error;
 const result=data?await db.from('message_reactions').delete().eq('id',data.id):await db.from('message_reactions').insert({message_id:messageId,profile_id:context.user.id,emoji});if(result.error)throw result.error;
 return !data;
}
export async function showReaders(messageId){
 const {data,error}=await db.from('message_reads').select('profile_id,read_at').eq('message_id',messageId);if(error)throw error;const ids=(data||[]).map(r=>r.profile_id);const result=ids.length?await db.from('profiles').select('id,full_name,email').in('id',ids):{data:[]};if(result.error)throw result.error;
 const content=el('div','ap-stack');for(const r of data||[]){const p=result.data.find(p=>p.id===r.profile_id);content.append(el('p','',`${p?.full_name||p?.email||'Member'} · ${new Date(r.read_at).toLocaleString()}`));}if(!ids.length)content.append(el('p','','No read receipts yet.'));AppCore.ui.openModal({title:'Seen by',content});
}
