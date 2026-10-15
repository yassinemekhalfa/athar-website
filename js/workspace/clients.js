import {canCreate,canManageRole} from '../core/permissions.js';
import { db } from "../dataClient.js";
import { getState } from "../core/state.js";
import { AppCore } from "../core/appCore.js";
import { inviteMember } from "../auth/invitations.js?v=emailjs-2";
import { workspaceIcon } from "../views/workspaceIcons.js";
import { loadFolders, selectFolder, moveFolder } from "./folders.js";
import { loadResources, openResource } from "./resources.js";
import { openWorkspaceActionMenu } from "./actionMenu.js";
import { attachWorkspaceDropTarget, startWorkspaceDrag } from "./dragDrop.js";
import { openFolderSharing } from "./folderPermissions.js";
import { openWorkspaceItemActions } from "./itemActions.js";

export async function listClients(){const s=getState();const {data,error}=await db.from("clients").select("*").eq("agency_id",s.agency.id).is("archived_at",null).order("created_at",{ascending:false});if(error)throw error;return data||[];}
export async function createClientCompany({name,email,notes,title,language='en-US',password}){
 const s=getState();
 if(password){const {data,error}=await db.functions.invoke('create-client',{body:{agency_id:s.agency.id,name,email,title,language,password}});if(error||data?.error)throw Object.assign(new Error(data?.error||error?.message||'Could not create the local client login.'),{userMessage:true});return data.client;}
 const {data,error}=await db.from('clients').insert({agency_id:s.agency.id,name:name.trim(),contact_email:email?.trim()||null,notes:notes?.trim()||null,title:title?.trim()||null,language,created_by:s.user.id}).select().single();if(error)throw error;return data;
}

async function ensureClientWorkspace(client,{canUpload}={}){
 const s=getState();let folder=s.folders.find(f=>f.id===client.workspace_folder_id)||s.folders.find(f=>f.client_id===client.id&&!f.parent_id&&!f.trashed_at);
 if(!folder){const result=await db.from('folders').insert({agency_id:s.agency.id,parent_id:null,client_id:client.id,name:client.name,description:`Workspace for ${client.name}`,privacy:'shared',internal_role:'viewer',client_visible:true,color:'#8b5cf6',position:100,created_by:s.user.id}).select().single();if(result.error)throw result.error;folder=result.data;}
 const grants=await db.from('folder_permissions').select('*').eq('folder_id',folder.id).eq('client_id',client.id);if(grants.error)throw grants.error;
 if(!grants.data?.length){const grant=await db.from('folder_permissions').insert({agency_id:s.agency.id,folder_id:folder.id,client_id:client.id,can_upload:canUpload??true,created_by:s.user.id});if(grant.error)throw grant.error;}else if(typeof canUpload==='boolean'&&grants.data[0].can_upload!==canUpload){const grant=await db.from('folder_permissions').update({can_upload:canUpload}).eq('id',grants.data[0].id);if(grant.error)throw grant.error;}
 if(client.workspace_folder_id!==folder.id){const update=await db.from('clients').update({workspace_folder_id:folder.id}).eq('id',client.id);if(update.error)throw update.error;client.workspace_folder_id=folder.id;}
 await loadFolders();return folder;
}

async function openClientWorkspace(client){try{const folder=await ensureClientWorkspace(client);await selectFolder(folder.id,{force:true});renderClientSpaces();}catch(error){AppCore.ui.toast(AppCore.ui.describeError(error),'error');}}

const expandedClients=new Set();
function clientMark(client){if(client.avatar_url){const img=el('img','k-client-space-avatar');img.src=client.avatar_url;img.alt='';return img;}return el('span','k-client-space-emoji',client.icon_emoji||'👤');}
export async function renderClientSpaces(){
 const host=document.getElementById('client-space-tree');if(!host)return;host.replaceChildren();
 try{const clients=await listClients();if(!clients.length){host.append(el('p','ap-sidebar-empty','No clients yet.'));return;}
  const folders=getState().folders,resources=getState().resources||[];
  for(const client of clients){const root=folders.find(f=>f.id===client.workspace_folder_id)||folders.find(f=>f.client_id===client.id&&!f.trashed_at);const open=expandedClients.has(client.id);const wrap=el('div','k-client-space');const row=el('div','k-client-space-row');
   const toggle=button('','ap-folder-tree__toggle');toggle.append(workspaceIcon(open?'chevronDown':'chevronRight'));toggle.setAttribute('aria-label',`${open?'Collapse':'Expand'} ${client.name}`);toggle.setAttribute('aria-expanded',String(open));toggle.addEventListener('click',async()=>{open?expandedClients.delete(client.id):expandedClients.add(client.id);if(!open)await loadResources();await renderClientSpaces();});
   const enter=button('','k-client-space-link');enter.append(clientMark(client),el('span','',client.name));enter.addEventListener('click',()=>openClientWorkspace(client));row.append(toggle,enter);
   if(root&&canManageRole(getState().role)){
    row.draggable=true;
    row.addEventListener('dragstart',event=>startWorkspaceDrag(event,{type:'client',id:client.id,workspaceFolderId:root.id}));
    attachWorkspaceDropTarget(row,root.id,{onDrop:()=>renderClientSpaces()});
    const menu=button('','k-client-space-menu');menu.append(workspaceIcon('more'));menu.setAttribute('aria-label',`Actions for ${client.name}`);
    menu.addEventListener('click',event=>{event.stopPropagation();openWorkspaceActionMenu(menu,[
     [
      {icon:'folder',label:'Open workspace',run:()=>openClientWorkspace(client)},
      {icon:'edit',label:'Edit client...',run:()=>openClientForm(client,async()=>{await renderClientsView(document.querySelector('#module-content'));await renderClientSpaces();})},
      {icon:'folder',label:'Move workspace...',run:()=>openMoveClientWorkspace(client,root,async()=>{await renderClientsView(document.querySelector('#module-content'));await renderClientSpaces();})}
     ],
     [
      {icon:'link',label:'Copy Link',run:async()=>{await navigator.clipboard.writeText(`${location.origin}${location.pathname}#/folder/${root.id}`);AppCore.ui.toast('Link copied.','success');}},
      {icon:'clients',label:'Share...',run:()=>openFolderSharing(root.id)}
     ],
     [
      {icon:'archive',label:'Archive client',run:async()=>{if(!await AppCore.ui.confirm({title:'Archive client?',message:'Client portal access will stop immediately.',confirmLabel:'Archive',danger:true}))return;const {error}=await db.from('clients').update({archived_at:new Date().toISOString()}).eq('id',client.id);if(error)throw error;await renderClientsView(document.querySelector('#module-content'));await renderClientSpaces();}}
     ]
    ]);});
    row.append(menu);
   }
   wrap.append(row);
   if(open&&root){
    const list=el('div','k-client-space-children');
    for(const folder of folders.filter(f=>f.parent_id===root.id&&!f.archived_at&&!f.trashed_at)){
     const childRow=el('div','k-client-space-child-row'),item=button('','k-client-space-child');
     item.append(workspaceIcon('folder'),el('span','',folder.name));
     item.addEventListener('click',()=>selectFolder(folder.id,{force:true}));
     if(canCreate(getState().role)){item.draggable=true;item.addEventListener('dragstart',event=>startWorkspaceDrag(event,{type:'folder',id:folder.id}));attachWorkspaceDropTarget(item,folder.id,{onDrop:()=>renderClientSpaces()});}
     childRow.append(item);
     if(canCreate(getState().role)){const action=button('','k-client-space-menu');action.append(workspaceIcon('more'));action.setAttribute('aria-label',`Actions for ${folder.name}`);action.addEventListener('click',event=>{event.stopPropagation();openWorkspaceItemActions(action,{...folder,type:'folder',title:folder.name},AppCore.getModuleContext(),()=>renderClientSpaces());});childRow.append(action);}
     list.append(childRow);
    }
    for(const resource of resources.filter(r=>r.folder_id===root.id)){
     const type={boards:'board',conversation:'conversation',docs:'doc',embeds:'embed',files:'file'}[resource.module];
     const childRow=el('div','k-client-space-child-row'),item=button('','k-client-space-child');
     item.append(workspaceIcon(resource.module==='conversation'?'conversation':resource.module==='boards'?'board':resource.module==='embeds'?'embed':'document'),el('span','',resource.title));
     item.addEventListener('click',()=>openResource(resource));
     if(canCreate(getState().role)&&type){item.draggable=true;item.addEventListener('dragstart',event=>startWorkspaceDrag(event,{type,id:resource.id}));}
     childRow.append(item);
     if(canCreate(getState().role)&&type){const action=button('','k-client-space-menu');action.append(workspaceIcon('more'));action.setAttribute('aria-label',`Actions for ${resource.title}`);action.addEventListener('click',event=>{event.stopPropagation();openWorkspaceItemActions(action,{...resource,type,raw:resource},AppCore.getModuleContext(),()=>renderClientSpaces());});childRow.append(action);}
     list.append(childRow);
    }
    if(!list.childElementCount)list.append(el('small','','Empty client workspace'));
    attachWorkspaceDropTarget(list,root.id,{onDrop:()=>renderClientSpaces()});
    wrap.append(list);
   }
   host.append(wrap);
  }

 }catch(error){host.append(el('p','ap-sidebar-empty',AppCore.ui.describeError(error)));}
}

function openMoveClientWorkspace(client,root,onDone){
 const allFolders=getState().folders.filter(folder=>!folder.system_key&&!folder.archived_at&&!folder.trashed_at);
 const descendants=new Set();
 const findChildren=parentId=>{for(const child of allFolders.filter(folder=>folder.parent_id===parentId)){if(descendants.has(child.id))continue;descendants.add(child.id);findChildren(child.id);}};
 findChildren(root.id);
 const folders=allFolders.filter(folder=>folder.id!==root.id&&!descendants.has(folder.id));
 const form=el('form','ap-stack'),select=el('select','ap-input');select.setAttribute('aria-label','Destination folder');
 const addFolder=(parentId,depth,visited)=>{for(const folder of folders.filter(entry=>(entry.parent_id||null)===parentId)){if(visited.has(folder.id))continue;const option=el('option','',`${'— '.repeat(depth)}${folder.name}`);option.value=folder.id;select.append(option);addFolder(folder.id,depth+1,new Set(visited).add(folder.id));}};
 addFolder(null,0,new Set());
 if(!select.options.length)return AppCore.ui.toast('Create a folder before moving this client workspace.','warning');
 const move=button('Move workspace','ap-btn ap-btn--primary');move.type='submit';form.append(select,move);
 form.addEventListener('submit',async event=>{event.preventDefault();move.disabled=true;try{await moveFolder(root.id,select.value);AppCore.ui.closeModal();AppCore.ui.toast(`${client.name} workspace moved.`,'success');await onDone?.();}catch(error){AppCore.ui.toast(AppCore.ui.describeError(error),'error');move.disabled=false;}});
 AppCore.ui.openModal({title:`Move ${client.name} workspace`,content:form,actions:[]});
}

function el(tag,cls="",text=null){const n=document.createElement(tag);if(cls)n.className=cls;if(text!==null)n.textContent=text;return n;}
function button(text,cls){const b=el("button",cls,text);b.type="button";return b;}
function shortDate(value){return value?new Date(value).toLocaleDateString(undefined,{month:"short",day:"numeric"}):"—";}
function initial(name){return String(name||"C").trim()[0]?.toUpperCase()||"C";}

export async function renderClientsView(container) {
  AppCore.ui.renderLoading(container, "Loading clients…");
  try {
    const clients = await listClients();
    container.replaceChildren();
    container.className = "ap-module-content k-page-panel k-clients-page";
    const root = el("section", "k-clients-view");
    const header = el("div", "k-client-header");
    const copy = el("div", "k-client-header__copy");
    copy.append(el("h1", "", "Clients"), el("p", "", `${clients.length} client${clients.length === 1 ? "" : "s"}`));
    const create = button("", "k-btn k-btn--primary k-create-client");
    create.append(workspaceIcon("plus"), document.createTextNode("New client"));
    create.setAttribute("aria-label", "+ New client");
    create.addEventListener("click", () => openClientForm(null, () => renderClientsView(container)));
    create.hidden=!canManageRole(getState().role);header.append(copy, create);
    root.append(header);

    const controls = el("div", "k-client-controls");
    const left = el("div", "k-client-controls__left");
    const searchWrap = el("label", "k-client-search");
    searchWrap.append(workspaceIcon("search"));
    const search = el("input");
    search.type = "search";
    search.placeholder = `Search ${clients.length} client${clients.length === 1 ? "" : "s"}...`;
    search.setAttribute("aria-label", "Search clients");
    searchWrap.append(search);
    const filterButton = button("", "ap-smart-tool");
    filterButton.title = "Filter clients";
    filterButton.setAttribute("aria-label", "Filter clients");
    filterButton.append(workspaceIcon("filter"));
    const filterPanel = el("div", "k-client-filter-panel");
    filterPanel.hidden = true;
    const emailFilter = el("select", "ap-filter-select");
    emailFilter.setAttribute("aria-label", "Filter clients by email");
    [["all", "All contacts"], ["email", "Has email"], ["no-email", "No email"]].forEach(([value, label]) => { const option = el("option", "", label); option.value = value; emailFilter.append(option); });
    const languageFilter = el("select", "ap-filter-select");
    languageFilter.setAttribute("aria-label", "Filter clients by language");
    [["", "All languages"], ["en-US", "English"], ["fr", "French"], ["ar", "Arabic"]].forEach(([value, label]) => { const option = el("option", "", label); option.value = value; languageFilter.append(option); });
    filterPanel.append(emailFilter, languageFilter);
    const sort = el("select", "k-client-sort");
    sort.setAttribute("aria-label", "Sort clients");
    [["desc", "Newest"], ["asc", "Oldest"], ["az", "Name A–Z"], ["za", "Name Z–A"]].forEach(([value, label]) => {
      const option = el("option", "", label);
      option.value = value;
      sort.append(option);
    });
    left.append(searchWrap, sort);
    left.append(filterButton);
    controls.append(left);
    root.append(filterPanel);
    root.append(controls);

    const host = el("div", "k-client-table-wrap");
    root.append(host);
    container.append(root);
    const draw = () => {
      const query = search.value.trim().toLowerCase();
      const rows = clients.filter((client) => {
        const matchesSearch = !query || `${client.name} ${client.contact_email || ""} ${client.title || ""}`.toLowerCase().includes(query);
        const matchesEmail = emailFilter.value === "all" || (emailFilter.value === "email" && !!client.contact_email) || (emailFilter.value === "no-email" && !client.contact_email);
        const matchesLanguage = !languageFilter.value || client.language === languageFilter.value;
        return matchesSearch && matchesEmail && matchesLanguage;
      });
      if (sort.value === "asc" || sort.value === "desc") {
        rows.sort((a, b) => (sort.value === "asc" ? 1 : -1) * (new Date(a.created_at) - new Date(b.created_at)));
      } else if (sort.value === "az") {
        rows.sort((a, b) => a.name.localeCompare(b.name));
      } else {
        rows.sort((a, b) => b.name.localeCompare(a.name));
      }
      host.replaceChildren();
      if (!rows.length) {
        const empty = el("div", "k-client-empty");
        empty.append(workspaceIcon("clients"), el("h3", "", "No clients found"), el("p", "", "Try another search or create a client."));
        host.append(empty);
        return;
      }
      const table = el("div", "k-client-table");
      const tableHead = el("div", "k-client-row k-client-row--head");
      ["Name", "Email", "Created", ""].forEach((label) => tableHead.append(el("span", "", label)));
      table.append(tableHead);
      rows.forEach((client) => {
        const row = el("div", "k-client-row");
        row.tabIndex = 0;
        row.setAttribute("role", "button");
        row.setAttribute("aria-label", `Edit ${client.name}`);
        const name = el("div", "k-client-name");
        name.append(clientMark(client), el("strong", "", client.name));
        row.append(name, el("span", "", client.contact_email || "—"), el("span", "", shortDate(client.created_at)));
        const menu = button("", "k-icon-button k-client-menu");
        menu.append(workspaceIcon("more"));
        menu.setAttribute("aria-label", `Actions for ${client.name}`);
        menu.addEventListener("click", (event) => {
          event.stopPropagation();
          openClientActions(client, () => renderClientsView(container));
        });
        row.append(menu);
        row.addEventListener("click", () => openClientWorkspace(client));
        row.addEventListener("keydown", (event) => {
          if ((event.key === "Enter" || event.key === " ") && event.target === row) {
            event.preventDefault();
            openClientWorkspace(client);
          }
        });
        table.append(row);
      });
      host.append(table, el("div", "k-client-count", `${rows.length} of ${clients.length}`));
    };
    search.addEventListener("input", draw);
    sort.addEventListener("change", draw);
    emailFilter.addEventListener("change", draw);
    languageFilter.addEventListener("change", draw);
    filterButton.addEventListener("click", () => { filterPanel.hidden = !filterPanel.hidden; filterButton.classList.toggle("is-active", !filterPanel.hidden); });
    draw();
  } catch (error) {
    AppCore.ui.renderError(container, error, () => renderClientsView(container));
  }
}

export function openCreateClient(done){openClientForm(null,done); }

function openClientActions(client,done){
  if(!canManageRole(getState().role))return AppCore.ui.toast("Only an Owner or Admin can manage clients.","info");
  const wrap=el("div","ap-stack");
  const invite=button("Invite contact","ap-btn ap-btn--secondary");invite.addEventListener("click",()=>{AppCore.ui.closeModal();openInvite(client);});
  const edit=button("Edit client","ap-btn ap-btn--secondary");edit.addEventListener("click",()=>{AppCore.ui.closeModal();openClientForm(client,done);});
  const archive=button("Archive","ap-btn ap-btn--danger");archive.addEventListener("click",async()=>{if(!await AppCore.ui.confirm({title:"Archive client?",message:"Client portal access will stop immediately.",confirmLabel:"Archive",danger:true}))return;try{const {error}=await db.from("clients").update({archived_at:new Date().toISOString()}).eq("id",client.id);if(error)throw error;AppCore.ui.closeModal();await renderClientSpaces();await done?.();}catch(err){AppCore.ui.toast(AppCore.ui.describeError(err),"error");}});
  wrap.append(invite,edit,archive);
  if(getState().role==="owner"){
    const remove=button("Delete permanently","ap-btn ap-btn--danger");
    remove.addEventListener("click",async()=>{if(!await AppCore.ui.confirm({title:"Delete client permanently?",message:"This permanently removes the client, their login when it is used only here, invitations, portal access, folder permissions, and invoices. You can create the client again later. This cannot be undone.",confirmLabel:"Delete permanently",danger:true}))return;remove.disabled=true;try{const {data,error}=await db.functions.invoke('delete-client',{body:{client_id:client.id}});if(error||data?.error)throw Object.assign(new Error(data?.error||error?.message||"Could not delete the client."),{userMessage:true});AppCore.ui.closeModal();AppCore.ui.toast("Client and portal access permanently deleted.","success");await loadFolders();await renderClientSpaces();await done?.();}catch(err){remove.disabled=false;AppCore.ui.toast(AppCore.ui.describeError(err),"error");}});
    wrap.append(remove);
  }
  AppCore.ui.openModal({title:client.name,content:wrap,actions:[]});
}

function openClientForm(client,done){
  if(!canManageRole(getState().role))return AppCore.ui.toast("Only an Owner or Admin can manage clients.","info");
  const form=el("form","ap-stack k-new-client-form");
  const field=(label,node,optional=false)=>{const w=el("label","k-form-field");const t=el("span","k-form-label",label);if(optional)t.append(el("small","","  optional"));w.append(t,node);return w;};
  const name=input("Alan Malone"),email=input("alanmalone@example.com","email",false),title=input("E.g. CEO, CTO, etc.","text",false);
  const emoji=input("👤","text",false);emoji.maxLength=8;emoji.setAttribute('aria-label','Client emoji');emoji.value=client?.icon_emoji||'👤';
  const avatar=input('',"file",false);avatar.accept='image/png,image/jpeg,image/webp,image/gif';avatar.setAttribute('aria-label','Client photo');let avatarData=client?.avatar_url||null;
  const identity=el('div','k-client-identity-editor');let preview=clientMark(client||{name:name.value,icon_emoji:emoji.value});preview.classList.add('k-client-identity-preview');const identityCopy=el('div');identityCopy.append(field('Emoji',emoji,true),field('Upload photo',avatar,true));identity.append(preview,identityCopy);
  const upload=el('label','k-client-upload-permission');const uploadCheck=el('input');uploadCheck.type='checkbox';uploadCheck.checked=true;upload.append(uploadCheck,document.createTextNode(' Client can upload files'));
  const readAvatar=file=>new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(reader.error);reader.readAsDataURL(file);});
  const paintPreview=()=>{const next=clientMark({name:name.value,icon_emoji:emoji.value||'👤',avatar_url:avatarData});next.classList.add('k-client-identity-preview');preview.replaceWith(next);preview=next;};
  emoji.addEventListener('input',()=>{if(!avatarData)paintPreview();});avatar.addEventListener('change',async()=>{const file=avatar.files?.[0];if(!file)return;if(file.size>2*1024*1024){avatar.value='';return AppCore.ui.toast('Client photos must be smaller than 2 MB.','warning');}avatarData=await readAvatar(file);paintPreview();});
  const language=el("select","ap-input");[["en-US","Default – English (United States)"],["fr","French"],["ar","Arabic"]].forEach(([v,t])=>{const o=el("option","",t);o.value=v;language.append(o);});
  const passWrap=el("details","k-password-option");const summary=el("summary","","Set a password");summary.append(el("small","","  optional"));const password=input("Optional client password","password",false);password.minLength=8;password.maxLength=128;password.autocomplete="new-password";const hint=el("p","","Use this only for a brand-new email. If the email already has an account, leave this empty and send that person an invitation.");passWrap.append(summary,hint,field("Password",password),el("small","","Min length: 8 characters"));
  name.value=client?.name||"";email.value=client?.contact_email||"";title.value=client?.title||client?.notes?.match(/Title: (.*)/)?.[1]||"";language.value=client?.language||getState().agency?.settings?.language||"en-US";name.maxLength=120;title.maxLength=120;if(client){passWrap.hidden=true;const root=getState().folders.find(folder=>folder.id===client.workspace_folder_id)||getState().folders.find(folder=>folder.client_id===client.id&&!folder.parent_id);if(root)db.from('folder_permissions').select('can_upload').eq('folder_id',root.id).eq('client_id',client.id).maybeSingle().then(({data})=>{if(data)uploadCheck.checked=!!data.can_upload;});}
  const actions=el("div","k-modal-actions");const cancel=button("Cancel","ap-btn ap-btn--secondary");cancel.addEventListener("click",()=>AppCore.ui.closeModal());const save=button(client?"Save client":"Create client","ap-btn ap-btn--primary");save.type="submit";actions.append(cancel,save);
  form.append(field("Name",name),field("Email",email),field("Title",title,true),identity,field("Language",language),upload,passWrap,actions);
  form.addEventListener("submit",async e=>{e.preventDefault();save.disabled=true;try{const metadata=[title.value&&`Title: ${title.value}`,`Language: ${language.value}`].filter(Boolean).join("\n");let saved=client;if(!name.value.trim()){name.setCustomValidity("Enter a client name.");name.reportValidity();save.disabled=false;return;}name.setCustomValidity("");if(password.value&&!email.value){email.required=true;email.reportValidity();save.disabled=false;return;}const appearance={name:name.value.trim(),contact_email:email.value||null,notes:metadata||client?.notes||null,title:title.value.trim()||null,language:language.value,icon_emoji:emoji.value.trim()||'👤',avatar_url:avatarData};if(client){const {data,error}=await db.from("clients").update(appearance).eq("id",client.id).select().single();if(error)throw error;saved=data;}else{saved=await createClientCompany({name:name.value,email:email.value,notes:metadata,title:title.value,language:language.value,password:password.value});const {data,error}=await db.from('clients').update({icon_emoji:appearance.icon_emoji,avatar_url:appearance.avatar_url}).eq('id',saved.id).select().single();if(error)throw error;saved=data;}const root=await ensureClientWorkspace(saved,{canUpload:uploadCheck.checked});await db.from('folders').update({name:saved.name,icon_emoji:saved.icon_emoji,avatar_url:saved.avatar_url,client_id:saved.id}).eq('id',root.id);await loadFolders();AppCore.ui.closeModal();await renderClientSpaces();await done?.(saved);}catch(err){const duplicate=/account with this email already exists/i.test(err?.message||"");AppCore.ui.toast(duplicate?"This email already has an account. Leave the password empty, create the client, then send an invitation link.":AppCore.ui.describeError(err),"error");}finally{save.disabled=false;}});
  AppCore.ui.openModal({title:client?"Edit client":"New client",content:form,actions:[]});name.addEventListener("input",()=>name.setCustomValidity(""));name.focus();
}
function openInvite(client){const form=el("form","ap-stack");const email=input("Client email","email");email.value=client.contact_email||"";const submit=button("Create invitation link","ap-btn ap-btn--primary");submit.type="submit";const result=el("div","ap-invite-result");form.append(email,submit,result);form.addEventListener("submit",async e=>{e.preventDefault();submit.disabled=true;try{const inv=await inviteMember({email:email.value,role:"client",clientId:client.id});result.replaceChildren();const explanation=inv.passwordRequired?"Send this link with the password you assigned when creating the client.":"This secure link signs the client in directly. It can be used once.";result.append(el("p","ap-inline-message ap-inline-message--success",`Invitation ready for ${email.value.trim()}.`),el("p","",explanation),el("code","",inv.link));const copy=button("Copy secure link","ap-btn ap-btn--secondary");copy.type="button";copy.addEventListener("click",async()=>{try{await navigator.clipboard.writeText(inv.link);AppCore.ui.toast("Invitation link copied.","success");}catch{AppCore.ui.toast("Could not copy the invitation link.","error");}});result.append(copy);}catch(err){AppCore.ui.toast(AppCore.ui.describeError(err),"error");}finally{submit.disabled=false;}});AppCore.ui.openModal({title:`Invite to ${client.name}`,content:form,actions:[]});}
function input(placeholder,type="text",required=true){const x=el("input","ap-input");x.placeholder=placeholder;x.type=type;x.required=required;return x;}
