import {inviteMember} from '../auth/invitations.js';
import {db} from '../dataClient.js';
import {AppCore} from '../core/appCore.js';
import {emit} from '../core/events.js';
import {roleLabel,hasCapability} from '../core/permissions.js';
import {workspaceIcon} from '../views/workspaceIcons.js';

const tables={folder:'folders',board:'boards',conversation:'conversations',doc:'docs',embed:'embeds',file:'files'};
const el=(tag,cls='',text='')=>{const n=document.createElement(tag);n.className=cls;n.textContent=text;return n;};

export async function openItemSharing(item,context,onSaved){
  try {
    if(!hasCapability(context.role,'share'))throw new Error('Your role cannot manage sharing.');
    const type=tables[item.type];if(!type)throw new Error('Select a folder or workspace item to share.');
    const permissionTable=type==='folders'?'folder_permissions':'resource_permissions';
    let permissions=db.from(permissionTable).select('*');
    permissions=type==='folders'?permissions.eq('folder_id',item.id):permissions.eq('resource_type',type).eq('resource_id',item.id);
    const results=await Promise.all([
      db.from(type).select('*').eq('id',item.id).single(),
      db.from('agency_members').select('*').eq('agency_id',context.agencyId),
      db.from('clients').select('*').eq('agency_id',context.agencyId).is('archived_at',null).order('name'),permissions
    ]);
    for(const result of results)if(result.error)throw result.error;
    const [resource,members,clients,existing]=results.map(r=>r.data);
    const candidates=members.filter(m=>!['client','owner'].includes(m.role)&&m.profile_id!==context.user.id);
    const {data:profiles,error}=candidates.length?await db.from('profiles').select('*').in('id',candidates.map(m=>m.profile_id)):{data:[]};if(error)throw error;
    const grants=new Map((existing||[]).map(g=>[g.profile_id||g.client_id,{...g}]));
    const form=el('form','ap-stack ap-item-sharing');
    const visibilityLabel=el('label','ap-field','Who can access');
    const visibility=el('select','ap-select');visibility.setAttribute('aria-label','Who can access');
    for(const [value,label] of [['private','Private — invited people only'],['shared','Shared with clients — invited clients and team'],['internal','Internal — workspace team only']]){const o=el('option','',label);o.value=value;visibility.append(o);}
    visibility.value=resource.privacy||'private';visibilityLabel.append(visibility);form.append(visibilityLabel);
    form.append(el('p','ap-muted-text','Workspace managers, admins and owners retain access. Workspace roles still apply. Private notes stay internal.'));
    if(resource.folder_id)form.append(el('p','ap-sharing-inheritance','Shared items can also inherit access from their folder. Choose Private to limit this item to the people selected below.'));
    const search=el('input','ap-input');search.type='search';search.placeholder='Find a teammate or client';search.setAttribute('aria-label','Find people to share with');form.append(search);
    const list=el('div','ap-item-sharing__list');form.append(list);
    function draw(){
      list.replaceChildren();const query=search.value.trim().toLowerCase();
      for(const [heading,people] of [['Internal members',candidates.map(m=>{const p=profiles.find(p=>p.id===m.profile_id);return {id:m.profile_id,name:p?.full_name||p?.email||'Teammate',detail:roleLabel(m.role),kind:'profile'};})],['External clients',clients.map(c=>({id:c.id,name:c.name,detail:c.contact_email||'Client',kind:'client'}))]]){
        list.append(el('h3','ap-item-sharing__heading',heading));
        if(heading==='External clients'&&visibility.value==='internal'){list.append(el('p','ap-muted-text','Clients cannot access internal items.'));continue;}
        const filtered=people.filter(p=>(p.name+' '+p.detail).toLowerCase().includes(query));
        for(const person of filtered){
          const row=el('div','ap-sharing-person'),label=el('label','ap-item-sharing__row'),check=el('input');check.type='checkbox';check.checked=grants.has(person.id);check.dataset.accessKind=person.kind;check.value=person.id;
          const avatar=el('span','ap-sharing-avatar',person.name.slice(0,1).toUpperCase()),copy=el('span','ap-item-sharing__copy');copy.append(el('strong','',person.name),el('small','',person.detail));label.append(check,avatar,copy);row.append(label);
          check.addEventListener('change',()=>{if(check.checked)grants.set(person.id,{[person.kind+'_id']:person.id,can_comment:true,can_upload:false});else grants.delete(person.id);draw();});
          if(person.kind==='client'&&grants.has(person.id)){
            const options=el('div','ap-sharing-options');
            for(const [key,text] of [['can_comment','Allow comments'],...(type==='folders'?[['can_upload','Allow uploads']]:[])]){const option=el('label',''),toggle=el('input');toggle.type='checkbox';toggle.checked=key==='can_comment'?grants.get(person.id)[key]!==false:grants.get(person.id)[key]===true;toggle.addEventListener('change',()=>{grants.get(person.id)[key]=toggle.checked;});option.append(toggle,document.createTextNode(text));options.append(option);}row.append(options);
          }
          list.append(row);
        }
        if(!filtered.length)list.append(el('p','ap-soft-empty',query?'No matching people.':'No people to add yet.'));
      }
    }
    visibility.addEventListener('change',draw);search.addEventListener('input',draw);draw();
    const route=type==='folders'?`#/folder/${item.id}`:`#/resource/${item.type}/${item.id}`;
    const linkLabel=el('label','ap-field','Access link'),link=el('input','ap-input');link.readOnly=true;link.value=new URL(`client-view.html${route}`,location.href).href;link.setAttribute('aria-label','Access link');link.addEventListener('focus',()=>link.select());linkLabel.append(link);form.append(linkLabel);
    form.append(el('small','ap-muted-text','Save access after choosing people. A link alone does not grant access.'));
    const footer=el('div','ap-sharing-footer'),copy=el('button','ap-btn ap-btn--secondary','Copy link');copy.type='button';copy.prepend(workspaceIcon('embed'));
    copy.addEventListener('click',async()=>{try{await navigator.clipboard.writeText(link.value);AppCore.ui.toast('Link copied. Only people with access can open it.','success');}catch{link.focus();link.select();let copied=false;try{copied=document.execCommand('copy');}catch{}AppCore.ui.toast(copied?'Link copied.':'The link is selected. Use Copy on your device.',copied?'success':'info');}});
    if(type==='folders'&&hasCapability(context.role,'invite')){const invite=el('button','ap-btn ap-btn--secondary','Invite selected clients');invite.type='button';invite.addEventListener('click',async()=>{invite.disabled=true;try{const selected=clients.filter(c=>grants.has(c.id)&&c.contact_email);if(!selected.length)throw new Error('Select a client with an email address first.');if(visibility.value==='internal')throw new Error('Choose Private or Shared with clients first.');const {error}=await db.rpc('save_resource_access',{p_type:type,p_id:item.id,p_privacy:visibility.value,p_grants:[...grants.values()]});if(error)throw error;for(const client of selected){await inviteMember({email:client.contact_email,role:'client',clientId:client.id,folderId:item.id});AppCore.ui.toast('Invitation saved for '+client.contact_email+'. Open Local outbox to copy the link.','success');}}catch(error){AppCore.ui.toast(AppCore.ui.describeError(error),'error');}finally{invite.disabled=false;}});footer.append(invite);}
    const save=el('button','ap-btn ap-btn--primary','Save access');save.type='submit';footer.append(copy,save);form.append(footer);
    form.addEventListener('submit',async event=>{
      event.preventDefault();save.disabled=true;
      try{
        const chosen=[...grants.values()].filter(g=>!(g.client_id&&visibility.value==='internal'));
        const {error}=await db.rpc('save_resource_access',{p_type:type,p_id:item.id,p_privacy:visibility.value,p_grants:chosen});if(error)throw error;
        AppCore.ui.closeModal();emit('data:changed',{entity:item.type,entityId:item.id,folderId:type==='folders'?item.id:resource.folder_id,action:'updated'});AppCore.ui.toast('Access updated.','success');await onSaved?.();
      }catch(error){AppCore.ui.toast(AppCore.ui.describeError(error),'error');}finally{save.disabled=false;}
    });
    AppCore.ui.openModal({title:`Share ${resource.title||resource.name||resource.original_name||'item'}`,content:form,actions:[]});
  }catch(error){AppCore.ui.toast(AppCore.ui.describeError(error),'error');}
}
