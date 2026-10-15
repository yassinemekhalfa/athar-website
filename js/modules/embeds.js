import {workspaceIcon} from '../views/workspaceIcons.js';
import {openItemSharing} from '../workspace/itemSharing.js';
import {openWorkspaceItemActions} from '../workspace/itemActions.js';
import {openEmbedForm} from '../views/portalViews.js';
import {db} from '../dataClient.js';
import {AppCore} from '../core/appCore.js';
export function embedURL(value){
 const u=new URL(value);if(!['https:','http:'].includes(u.protocol))throw new Error('Use an HTTP or HTTPS URL.');
 if(u.hostname==='youtu.be')return `https://www.youtube.com/embed/${encodeURIComponent(u.pathname.slice(1))}`;
 if(['youtube.com','www.youtube.com'].includes(u.hostname)&&u.searchParams.has('v'))return `https://www.youtube.com/embed/${encodeURIComponent(u.searchParams.get('v'))}`;
 if(u.hostname==='vimeo.com'&&/^\/\d+$/.test(u.pathname))return `https://player.vimeo.com/video${u.pathname}`;
 return u.href;
}
export function openEmbedCreation(context,onDone){openEmbedForm(context,null,onDone);}
export default {name:'embeds',async mount(container,context){
 const {data,error}=await db.from('embeds').select('*').eq('agency_id',context.agencyId).eq('folder_id',context.folderId||null).is('archived_at',null).is('trashed_at',null);if(error)throw error;
 const record=(data||[]).find(r=>r.id===context.resourceId)||data?.[0];if(!record){AppCore.ui.renderEmpty(container,{title:'No embedded links yet'});if(context.canCreate){const add=document.createElement('button');add.className='ap-btn ap-btn--primary';add.textContent='Create embedded link';add.onclick=()=>openEmbedForm(context,null,()=>this.mount(container,context));container.append(add);}return;}
 const root=document.createElement('section');root.className='k-embed-page';const head=document.createElement('header');const name=document.createElement('strong');name.textContent=record.title;head.append(name);if(context.canShare){const share=document.createElement('button');share.className='ap-btn ap-btn--dark';share.textContent='Share';share.setAttribute('aria-label','Share embed');share.onclick=()=>openItemSharing({id:record.id,type:'embed',title:record.title},context);head.append(share);}if(context.canCreate){const menu=document.createElement('button');menu.className='ap-icon-button';menu.append(workspaceIcon('more'));menu.setAttribute('aria-label','Embed actions');menu.onclick=()=>openWorkspaceItemActions(menu,{id:record.id,type:'embed',title:record.title},context,()=>this.mount(container,context));head.append(menu);}if(record.open_in_new_window){const link=document.createElement('a');link.href=embedURL(record.url);link.textContent='Open in new window ↗';link.target='_blank';link.rel='noopener noreferrer';head.append(link);}
 const frame=document.createElement('iframe');frame.title=record.title;frame.src=embedURL(record.url);frame.referrerPolicy='strict-origin-when-cross-origin';frame.setAttribute('sandbox','allow-scripts allow-same-origin allow-forms allow-popups allow-presentation');frame.allow='fullscreen';
 const note=document.createElement('p');note.className='k-embed-note';note.textContent=record.open_in_new_window?'If the provider does not allow embedding, open this link in a new window.':'If the provider does not allow embedding, enable the open-in-new-window button in embed settings.';root.append(head,frame,note);container.replaceChildren(root);
 },unmount(){}};
