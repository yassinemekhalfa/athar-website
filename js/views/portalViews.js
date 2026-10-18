import {createTaskColorControl,applyTaskColor} from '../modules/taskAppearance.js';
import { renderWorkspaceHome, folderCover } from "./workspaceHome.js";
import { workspaceIcon } from "./workspaceIcons.js?v=library-reference-5";
import { db } from "../dataClient.js";
import { AppCore } from "../core/appCore.js";
import { selectFolder, loadFolders, createFolder, ensureUnfiledFolder } from "../workspace/folders.js";
import { openFolderSharing } from "../workspace/folderPermissions.js";
import { openCreateFolder } from "../workspace/folderTree.js";
import { openCreateClient } from "../workspace/clients.js?v=client-stability-1";
import { selectModule } from "../core/moduleRegistry.js";
import { emit, on } from "../core/events.js";
import {getState} from '../core/state.js';
import {openItemSharing} from '../workspace/itemSharing.js';
import {canManageRole} from '../core/permissions.js';
import { uploadFileToFolder } from "../modules/files.js";
import { openUploadMenu } from "../workspace/cloudIntegrations.js";
import { createAccessControl } from "../workspace/accessControl.js";
import { openWorkspaceItemActions } from "../workspace/itemActions.js";
import { hasWorkspaceDrag, moveWorkspaceItem, readWorkspaceDrag, startWorkspaceDrag } from "../workspace/dragDrop.js";
import { fetchAssignableProfiles, profileLabel } from "../modules/tasks.js";

const TYPE_META = {
  folder: { label: "Folder", module: "conversation", icon: "folder" },
  board: { label: "Board", module: "boards", icon: "board" },
  conversation: { label: "Conversation", module: "conversation", icon: "chat" },
  doc: { label: "Document", module: "docs", icon: "doc" },
  file: { label: "File", module: "files", icon: "file" },
  embed: { label: "Embed", module: null, icon: "link" },
  invoice: { label: "Invoice", module: "invoices", icon: "invoice" },
  task: { label: "Task", module: "boards", icon: "task" }
};
const WORKSPACE_ITEM_TYPES = new Set(["folder", "board", "conversation", "doc", "file", "embed"]);

let activeTaskMenu = null;
document.addEventListener("click", (event) => {
  if (!activeTaskMenu) return;
  if (!activeTaskMenu.root.isConnected) {
    activeTaskMenu = null;
    return;
  }
  if (
    !activeTaskMenu.root.contains(event.target) ||
    (!activeTaskMenu.menu.contains(event.target) &&
      !activeTaskMenu.moreButton.contains(event.target))
  ) {
    activeTaskMenu.menu.hidden = true;
    activeTaskMenu.moreButton.classList.remove("is-active");
  }
});

function el(tag, className = "", text = null) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== null) node.textContent = text;
  return node;
}
function btn(label, className = "ap-btn ap-btn--secondary") {
  const node = el("button", className, label);
  node.type = "button";
  return node;
}
function icon(name) {
  const span = el("span", `ap-line-icon ap-line-icon--${name}`);
  span.setAttribute("aria-hidden", "true");
  return span;
}
function titleBlock(title, subtitle = "") {
  const wrap = el("div", "ap-view-title");
  wrap.append(el("h1", "ap-view-title__heading", title));
  if (subtitle) wrap.append(el("p", "ap-view-title__subtitle", subtitle));
  return wrap;
}
const LIBRARY_ICONS = {
  everything: "everything",
  boards: "board",
  conversations: "conversation",
  docs: "document",
  embeds: "embed",
  files: "imageFile",
  archive: "archive",
  trash: "trash"
};
function libraryBreadcrumb(title) {
  const breadcrumb = el("div", "ap-library-breadcrumb", title);
  breadcrumb.setAttribute("aria-hidden", "true");
  return breadcrumb;
}
function libraryHeading(title, subtitle = "", category = "everything") {
  const heading = el("div", "ap-library-heading");
  const iconName = LIBRARY_ICONS[category] || "library";
  const titleWrap = titleBlock(title, subtitle);
  titleWrap.querySelector("h1").prepend(workspaceIcon(iconName, "ap-library-heading__icon"));
  titleWrap.querySelector("h1").dataset.libraryIcon = iconName;
  heading.append(titleWrap);
  return heading;
}
function appendLibraryEmptyIcon(empty, category) {
  const iconName = LIBRARY_ICONS[category] || "library";
  const iconWrap = el("span", "ap-centered-empty__icon");
  iconWrap.dataset.libraryIcon = iconName;
  iconWrap.append(workspaceIcon(iconName));
  empty.dataset.libraryCategory = category;
  empty.append(iconWrap);
}
function safeDate(value) { return value ? AppCore.utils.formatDate(value, "short") : "—"; }
function visibilityText(row) { return row.privacy === "private" ? "Private" : row.client_visible || row.privacy === "shared" ? "Client" : "Internal"; }
function matchesVisibility(item, value, raw = item.raw || item) {
  if (!value) return true;
  const visibility = item.visibility || visibilityText(raw);
  return value === "client" ? visibility === "Client"
    || visibility === "Shared with clients"
    : value === "private" ? visibility === "Private"
      : visibility === "Internal";
}

async function fetchActiveRows(table, filterColumn, filterValue, order = "updated_at") {
  let result = await db.from(table).select("*").eq(filterColumn, filterValue).is("archived_at", null).is("trashed_at", null).order(order, { ascending: false });
  if (result.error) result = await db.from(table).select("*").eq(filterColumn, filterValue);
  if (result.error) throw result.error;
  return (result.data || []).filter(row => !row.archived_at && !row.trashed_at);
}

function sortableDate(value) {
  if (!value) return 0;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : 0;
}

function sortCollection(rows, mode = "newest", { getTitle = row => row.title || row.name || "", getDate = row => row.created_at || row.updated_at || null } = {}) {
  return [...rows].sort((a, b) => {
    if (mode === "oldest") return sortableDate(getDate(a)) - sortableDate(getDate(b));
    if (mode === "az") return String(getTitle(a)).localeCompare(String(getTitle(b)), undefined, { sensitivity: "base" });
    if (mode === "za") return String(getTitle(b)).localeCompare(String(getTitle(a)), undefined, { sensitivity: "base" });
    return sortableDate(getDate(b)) - sortableDate(getDate(a));
  });
}

function dateKey(value) {
  if (!value) return null;
  const simple = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (simple) return `${simple[1]}-${simple[2]}-${simple[3]}`;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join("-");
}

function todayKey() { return dateKey(new Date()); }

function taskCalendarDate(task) {
  return dateKey(task.due_date) || dateKey(task.start_date) || dateKey(task.created_at);
}

async function navigateItem(item) {
  if (item.type === "folder") return selectFolder(item.id);
  if (item.id && ["board", "conversation", "doc", "embed", "file"].includes(item.type)) {
    location.hash = `#/resource/${item.type}/${item.id}`;
    return;
  }
  await selectFolder(item.folder_id, { skipOverview: true,refreshModule:false });
  const moduleName = TYPE_META[item.type]?.module || "conversation";
  let resourceId=item.id||null;if(item.type==='task'&&item.id){const {data,error}=await db.from('tasks').select('board_id').eq('id',item.id).single();if(error)throw error;resourceId=data.board_id;}await selectModule(moduleName,resourceId);if(item.type==='task'&&item.id)document.dispatchEvent(new CustomEvent('task:open',{detail:{taskId:item.id}}));
}

const smartFilterPanelState = new Map();
function buildFilterBar({ placeholder = "Search…", onInput, visibility = false, extra = [], defaultSort = "newest", alwaysOpen = false, sortModes = [["newest", "Newest first"], ["oldest", "Oldest first"], ["az", "Name A–Z"], ["za", "Name Z–A"]] } = {}) {
  const bar = el("div", "ap-smart-toolbar");
  const searchWrap = el("label", "ap-smart-search");
  searchWrap.append(workspaceIcon("search", "ap-smart-search__icon"));
  const search = document.createElement("input");
  search.type = "search";
  search.placeholder = placeholder;
  search.autocomplete = "off";
  search.setAttribute("aria-label", placeholder.replace("…", ""));
  const clear = btn("×", "ap-smart-search__clear");
  clear.hidden = true;
  clear.setAttribute("aria-label", "Clear search");
  searchWrap.append(search, clear);
  const filterButton = btn("Filter", "ap-smart-tool");
  filterButton.title = "Filter";
  filterButton.setAttribute("aria-label", "Filter");
  filterButton.append(workspaceIcon("filter"));
  const sortButton = btn("Created", "ap-smart-tool");
  sortButton.append(workspaceIcon("sort"));
  const filterPanel = el("div", "ap-smart-filter-panel");
  filterPanel.id = `smart-filter-${globalThis.ATHAR_UUID()}`;
  filterPanel.hidden = !(alwaysOpen||smartFilterPanelState.get(placeholder));
  filterPanel.setAttribute("aria-label", "Filter and sort options");
  filterButton.setAttribute("aria-controls", filterPanel.id);
  sortButton.setAttribute("aria-controls", filterPanel.id);
  filterButton.setAttribute("aria-expanded", "false");
  sortButton.setAttribute("aria-expanded", "false");
  const controls = {};
  const addSelect = (key, label, options) => {
    const field = el("label", "ap-smart-filter-field");
    field.append(el("span", "", label || key));
    const select = el("select", "ap-filter-select");
    options.forEach(([value, text]) => { const option = document.createElement("option"); option.value = value; option.textContent = text; option.selected = value === (key === "sort" ? defaultSort : ""); select.append(option); });
    field.append(select);
    controls[key] = select;
    filterPanel.append(field);
  };
  if (visibility) addSelect("visibility", "Visibility", [["", "All visibility"], ["client", "Shared with clients"], ["internal", "Internal"], ["private", "Private"]]);
  extra.forEach(spec => addSelect(spec.key, spec.label, spec.options));
  addSelect("sort", "Sort by", sortModes);
  const run = AppCore.utils.debounce(() => onInput?.(search.value, controls), 120);
  search.addEventListener("input", () => { clear.hidden = !search.value; run(); });
  clear.addEventListener("click", () => { search.value = ""; clear.hidden = true; onInput?.("", controls); search.focus(); });
  Object.values(controls).forEach(control => control?.addEventListener?.("change", () => onInput?.(search.value, controls)));
  const setPanelOpen = (open, focusSort = false) => {
    filterPanel.hidden = !open;
    smartFilterPanelState.set(placeholder,open);
    for (const button of [filterButton, sortButton]) {
      button.classList.toggle("is-active", open);
      button.setAttribute("aria-expanded", String(open));
    }
    if (open && focusSort) controls.sort.focus();
  };
  filterButton.addEventListener("click", () => {if(!alwaysOpen)setPanelOpen(filterPanel.hidden);});
  const updateSortTitle = () => { const label=sortModes.find(item=>item[0]===controls.sort.value)?.[1]||"Sort";sortButton.title=`Sort: ${label}`;sortButton.setAttribute("aria-label",`Sort: ${label}`); };
  updateSortTitle();controls.sort.addEventListener("change",updateSortTitle);
  sortButton.addEventListener("click", () => {if(!alwaysOpen)setPanelOpen(filterPanel.hidden, filterPanel.hidden);else controls.sort.focus();});
  filterPanel.addEventListener("keydown", event => {
    if (event.key === "Escape") {
      setPanelOpen(false);
      filterButton.focus();
    }
  });
  bar.append(searchWrap, filterButton, sortButton);
  bar.append(filterPanel);if(!visibility&&!extra.length)filterButton.hidden=true;
  if(!filterPanel.hidden)for(const button of [filterButton,sortButton]){button.classList.add("is-active");button.setAttribute("aria-expanded","true");}
  return { bar, search, controls, filterButton, sortButton, filterPanel };
}

function renderDataTable(host, items, { showVisibility = true, onOpen = navigateItem, actions = null, canMove = false } = {}) {
  host.replaceChildren();
  const table = el("div", "ap-library-table");
  const head = el("div", "ap-library-table__row ap-library-table__row--head");
  head.append(el("span", "", "Name"), el("span", "", "Kind"));
  if (showVisibility) head.append(el("span", "", "Visibility"));
  head.append(el("span", "", "Created"), el("span", "", ""));
  table.append(head);
  for (const item of items) {
    const row = el("div", "ap-library-table__row");
    row.dataset.itemId = item.id;
    if (canMove && WORKSPACE_ITEM_TYPES.has(item.type)) {
      row.draggable = true;
      row.addEventListener("dragstart", event => startWorkspaceDrag(event, { type: item.type, id: item.id }));
    }
    const nameCell = el("div", "ap-library-name");
    const iconWrap = el("span", "ap-library-name__icon"); iconWrap.append(workspaceIcon(TYPE_META[item.type]?.icon || "file"));
    const text = el("div"); text.append(el("strong", "", item.title));
    if (item.subtitle) text.append(el("small", "", item.subtitle));
    nameCell.append(iconWrap, text);
    const open = btn("", "ap-library-row-button");
    open.setAttribute("aria-label", `Open ${item.title}`);
    open.addEventListener("click", () => onOpen(item));
    nameCell.append(open);
    row.append(nameCell, el("span", "ap-library-muted", TYPE_META[item.type]?.label || item.type));
    if (showVisibility) row.append(el("span", "ap-library-muted", item.visibility === "Client" ? "Shared with clients" : item.visibility === "Internal" ? "--" : (item.visibility || "--")));
    row.append(el("span", "ap-library-muted", safeDate(item.created_at)));
    const actionCell = el("div", "ap-library-actions");
    if (actions) actions(item, actionCell);
    else { const arrow = btn("›", "ap-icon-button"); arrow.addEventListener("click", () => onOpen(item)); actionCell.append(arrow); }
    row.append(actionCell);
    table.append(row);
  }
  host.append(table);
}

export const renderHome = renderWorkspaceHome;

function renderFolderTable(host,items,context){
  host.replaceChildren();const table=el('div','v-folder-table');
  const head=el('div','v-folder-table-row v-folder-table-head');for(const title of ['Item','Size','Owners','Created',''])head.append(el('span','',title));table.append(head);
  for(const item of items){
    const row=el('div','v-folder-table-row');row.setAttribute('role','button');row.tabIndex=0;row.setAttribute('aria-label',`Open ${item.title}`);row.addEventListener('click',event=>{if(!event.target.closest('button'))navigateItem(item);});row.addEventListener('keydown',event=>{if(event.target===row&&(event.key==='Enter'||event.key===' ')){event.preventDefault();navigateItem(item);}});
    if(context.canCreate){row.draggable=true;row.addEventListener('dragstart',event=>{startWorkspaceDrag(event,{type:item.type,id:item.id});row.classList.add('is-dragging');});row.addEventListener('dragend',()=>row.classList.remove('is-dragging'));}
    const name=el('span','v-folder-table-name');name.append(workspaceIcon(item.type==='conversation'?'chat':item.type==='doc'?'doc':item.type==='file'?'folder':'shared'),el('span','',item.title));
    if(item.visibility==='Internal')name.append(el('small','v-internal-tag','Internal'));
    const owner=el('span');if(item.owner_id===context.user?.id){const avatar=el('span','v-owner-avatar',AppCore.utils.initials(context.profile?.full_name||context.user.email));avatar.title=context.profile?.full_name||context.user.email;owner.append(avatar);}else owner.textContent='—';
    row.append(name,el('span','',item.type==='file'?item.subtitle||'—':'—'),owner,el('time','',item.created_at?new Date(item.created_at).toLocaleDateString('en-US',{month:'short',day:'numeric'}):'—'));
    if(context.canCreate&&WORKSPACE_ITEM_TYPES.has(item.type)){const actions=btn('','ap-icon-button v-folder-item-menu');actions.append(workspaceIcon('more'));actions.setAttribute('aria-label',`Actions for ${item.title}`);actions.addEventListener('click',event=>{event.stopPropagation();openWorkspaceItemActions(actions,item,context,()=>renderFolderOverview(document.getElementById('module-content'),context,context.folderId));});row.append(actions);}else row.append(el('span'));table.append(row);
  }host.append(table);
}

async function uploadDroppedFiles(files,folderId,context){
  for(const file of files)await uploadFileToFolder(context,folderId,file,false);
  AppCore.ui.toast(files.length===1?'File uploaded.':`${files.length} files uploaded.`,'success');
  await renderFolderOverview(document.getElementById('module-content'),context,context.folderId);
}

function makeFolderDropTarget(target,folderId,context){
  if(!context.canCreate&&!context.canUpload)return;
  target.addEventListener('dragover',event=>{if(hasWorkspaceDrag(event.dataTransfer)||event.dataTransfer.files?.length){event.preventDefault();event.dataTransfer.dropEffect=hasWorkspaceDrag(event.dataTransfer)?'move':'copy';target.classList.add('is-drop-target');}});
  target.addEventListener('dragleave',event=>{if(!target.contains(event.relatedTarget))target.classList.remove('is-drop-target');});
  target.addEventListener('drop',async event=>{event.preventDefault();target.classList.remove('is-drop-target');try{const item=readWorkspaceDrag(event.dataTransfer);if(item){await moveWorkspaceItem(item,folderId);await renderFolderOverview(document.getElementById('module-content'),context,context.folderId);}else if(event.dataTransfer.files?.length){await uploadDroppedFiles([...event.dataTransfer.files],folderId,context);}}catch(error){AppCore.ui.toast(AppCore.ui.describeError(error),'error');}});
}

function buildFolderEmptyState(folderId,context){
  const empty=el('section','v-folder-empty');
  const icon=el('span','v-folder-empty__icon');icon.append(workspaceIcon('folder'));
  const title=el('h2','','Empty folder');
  const message=el('p','','Nothing has been added yet');
  const actions=el('div','v-folder-empty__actions');
  const create=btn('+ Create','ap-btn ap-btn--secondary');create.setAttribute('aria-haspopup','dialog');create.addEventListener('click',()=>openFolderCreateMenu(context,folderId,create));
  const upload=btn('↑ Upload or Drag','ap-btn ap-btn--secondary');upload.addEventListener('click',()=>openUploadMenu(context,folderId,()=>fileInput.click(),()=>renderFolderOverview(document.getElementById('module-content'),context,folderId)));
  const fileInput=el('input');fileInput.type='file';fileInput.multiple=true;fileInput.hidden=true;fileInput.accept='image/*,application/pdf,text/*,application/zip,.doc,.docx,.xls,.xlsx,.ppt,.pptx';
  fileInput.addEventListener('change',async()=>{const files=[...fileInput.files||[]];if(!files.length)return;upload.disabled=true;try{await uploadDroppedFiles(files,folderId,context);}catch(error){AppCore.ui.toast(AppCore.ui.describeError(error),'error');}finally{upload.disabled=false;fileInput.value='';}});
  actions.append(create,upload);empty.append(icon,title,message,actions,fileInput);
  empty.addEventListener('dragover',event=>{if(event.dataTransfer.files?.length){event.preventDefault();empty.classList.add('is-drop-target');}});
  empty.addEventListener('dragleave',event=>{if(!empty.contains(event.relatedTarget))empty.classList.remove('is-drop-target');});
  empty.addEventListener('drop',async event=>{if(!event.dataTransfer.files?.length)return;event.preventDefault();empty.classList.remove('is-drop-target');upload.disabled=true;try{await uploadDroppedFiles([...event.dataTransfer.files],folderId,context);}catch(error){AppCore.ui.toast(AppCore.ui.describeError(error),'error');}finally{upload.disabled=false;}});
  return empty;
}

export async function renderFolderOverview(container, context, folderId = context.folderId) {
  const folder = AppCore.getFolders().find((f) => f.id === folderId);
  if (!folder) return AppCore.ui.renderEmpty(container, { title: "Folder not found", message: "This folder is not available." });
  AppCore.ui.renderLoading(container, "Loading folder…");
  try {
    const settled = await Promise.allSettled([
      fetchActiveRows("boards", "folder_id", folderId),
      fetchActiveRows("conversations", "folder_id", folderId),
      fetchActiveRows("docs", "folder_id", folderId),
      fetchActiveRows("files", "folder_id", folderId, "created_at"),
      fetchActiveRows("embeds", "folder_id", folderId)
    ]);
    const [boards, conversations, docs, files, embeds] = settled.map(result => result.status === "fulfilled" ? { data: result.value } : { data: [] });
    const items = [
      ...(boards.data || []).map((r) => ({ id:r.id,type:"board",folder_id:folderId,title:r.title,visibility:visibilityText(r),created_at:r.created_at,owner_id:r.created_by })),
      ...(conversations.data || []).map((r) => ({ id:r.id,type:"conversation",folder_id:folderId,title:r.title,visibility:visibilityText(r),created_at:r.created_at,owner_id:r.created_by })),
      ...(docs.data || []).map((r) => ({ id:r.id,type:"doc",folder_id:folderId,title:r.title,visibility:visibilityText(r),created_at:r.created_at,owner_id:r.created_by })),
      ...(files.data || []).map((r) => ({ id:r.id,type:"file",folder_id:folderId,title:r.original_name,subtitle:AppCore.utils.formatBytes(r.size_bytes),visibility:visibilityText(r),created_at:r.created_at,owner_id:r.created_by })),
      ...(embeds.data || []).map((r) => ({ id:r.id,type:"embed",folder_id:folderId,title:r.title,subtitle:r.url,url:r.url,visibility:visibilityText(r),created_at:r.created_at,owner_id:r.created_by }))
    ].sort((a,b)=>new Date(b.created_at)-new Date(a.created_at));
    container.replaceChildren();
    const root=el("section","ap-hub-view ap-folder-overview");
    const heading=el("div","ap-library-heading");
    const headingText=titleBlock(folder.name,`${items.length} item${items.length===1?"":"s"}`);
    heading.append(headingText);
    if(context.canShare||context.canCreate){const actions=el("div","ap-invoice-global-actions");if(context.canShare){const share=btn("Share","ap-btn ap-btn--secondary ap-btn--sm");share.addEventListener("click",()=>openFolderSharing(folderId).catch(error=>AppCore.ui.toast(AppCore.ui.describeError(error),"error")));actions.append(share);}if(context.canCreate){const create=btn("+ Create","ap-btn ap-btn--primary ap-btn--sm");create.addEventListener("click",()=>openFolderCreateMenu(context,folderId,create));actions.append(create);}heading.append(actions);}
    folderCover(root,folder,heading.querySelector(".ap-invoice-global-actions"));
    const children=AppCore.getFolders().filter(f=>f.parent_id===folderId&&!f.archived_at&&!f.trashed_at);
    if(children.length){const childList=el("div","v-home-table");for(const child of children){const b=el("div","v-home-row");b.setAttribute("role","button");b.tabIndex=0;b.append(workspaceIcon("folder","v-folder-symbol"),el("span","",child.name));b.style.setProperty("--folder-color",child.color||"#ffbd0a");b.addEventListener("click",event=>{if(!event.target.closest("button"))selectFolder(child.id);});b.addEventListener("keydown",event=>{if(event.target===b&&(event.key==="Enter"||event.key===" ")){event.preventDefault();selectFolder(child.id);}});if(context.canCreate){b.draggable=true;b.addEventListener("dragstart",event=>startWorkspaceDrag(event,{type:"folder",id:child.id}));const menu=btn("","ap-icon-button v-folder-item-menu");menu.append(workspaceIcon("more"));menu.setAttribute("aria-label",`Actions for ${child.name}`);menu.addEventListener("click",event=>{event.stopPropagation();openWorkspaceItemActions(menu,{...child,type:"folder",title:child.name},context,()=>renderFolderOverview(document.getElementById("module-content"),context,folderId));});b.append(menu);}b.style.gridTemplateColumns="28px minmax(0,1fr) 34px";makeFolderDropTarget(b,child.id,context);childList.append(b);}root.append(childList);}
    let filtered=items;const host=el("div");
      const apply=(q,controls)=>{const text=q.trim().toLowerCase();const vis=controls.visibility?.value||"";filtered=items.filter(item=>(!text||`${item.title} ${item.subtitle||""}`.toLowerCase().includes(text))&&matchesVisibility(item,vis));filtered=sortCollection(filtered,controls.sort?.value||"newest");if(!filtered.length){host.replaceChildren();if(!items.length&&!children.length&&!text&&!vis){host.append(buildFolderEmptyState(folderId,context));}else{const empty=el("div","ap-centered-empty");const emptyMessage=text&&vis?"No items match your search and filters.":text?"Try another search.":vis?"No items match this visibility filter.":"This folder is empty.";empty.append(icon("folder"),el("h3","","No matching items"),el("p","",emptyMessage));host.append(empty);}}else renderFolderTable(host,filtered,context);};
    const {bar,search,controls}=buildFilterBar({placeholder:"Search this folder…",visibility:true,onInput:apply});
    root.append(bar,host);container.append(root);apply(search.value,controls);
  } catch(error) {
    if(String(error?.message||error).includes("embeds")){container.replaceChildren();const root=el("section","ap-hub-view");root.append(titleBlock(folder.name,"Run migration 0300_portal_experience.sql to enable the complete folder view."));container.append(root);return;}
    AppCore.ui.renderError(container,error,()=>renderFolderOverview(container,context,folderId));
  }
}

export function openFolderCreateMenu(context,folderId=null,anchorElement=null){
  const wrap=el("div","ap-create-menu ap-create-menu--modern");
  const makeItem=({title,subtitle,icon:iconName,action})=>{const item=btn("","ap-create-menu__item ap-create-menu__item--modern");item.setAttribute("aria-label",title);const iconCircle=el("span","ap-create-menu__icon");iconCircle.append(workspaceIcon(iconName));const copy=el("span","ap-create-menu__copy");copy.append(el("strong","",title),el("small","",subtitle));item.append(iconCircle,copy);item.addEventListener("click",async()=>{try{await action();}catch(error){AppCore.ui.toast(AppCore.ui.describeError(error),"error");}});return item;};
  const withFolder=async(handler)=>handler(folderId||(await ensureUnfiledFolder()).id);
  const createResource=(title,subtitle,iconName,moduleName,openForm)=>makeItem({title,subtitle,icon:iconName,action:async()=>{AppCore.ui.closeModal();await withFolder(async id=>{await selectFolder(id,{skipOverview:true,refreshModule:false});await selectModule(moduleName);await openForm();});}});
  wrap.append(makeItem({title:"Folder",subtitle:"Organize everything",icon:"folder",action:async()=>{AppCore.ui.closeModal();openCreateFolder(folderId);}}));
  wrap.append(createResource("Board","Track and manage projects","board","boards",async()=>{(await import("../modules/boards.js?v=task-access-1")).openBoardForm();}));
  wrap.append(createResource("Conversation","Discuss anything with clients","conversation","conversation",async()=>{(await import("../modules/conversation.js?v=client-conversation-1")).openCreateConversation();}));
  wrap.append(makeItem({title:"Embed",subtitle:"Add third-party apps",icon:"embed",action:async()=>{AppCore.ui.closeModal();await withFolder(id=>openEmbedForm({...context,folderId:id}));}}));
  wrap.append(makeItem({title:"Link",subtitle:"Share external resources",icon:"link",action:async()=>{AppCore.ui.closeModal();await withFolder(id=>openLinkForm({...context,folderId:id}));}}));
  wrap.append(createResource("Document","Curate content","document","docs",async()=>{await(await import("../modules/docs.js")).createDocument();}));
  wrap.append(createResource("File","Upload and share files","file","files",async()=>{(await import("../modules/files.js")).openUploadModal();}));
  wrap.append(makeItem({title:"Proposal or Contract",subtitle:"Prepare offers for clients",icon:"proposal",action:async()=>{AppCore.ui.closeModal();document.dispatchEvent(new CustomEvent("athar:create-proposal",{detail:{folderId}}));}}));
  if(context.isAdmin)wrap.append(makeItem({title:"Client",subtitle:"Invite clients to your workspace",icon:"user",action:async()=>{AppCore.ui.closeModal();openCreateClient();}}));
  const more=document.createElement("details");more.className="ap-create-menu__more";more.open=true;const summary=document.createElement("summary");summary.append(el("span","","More"),workspaceIcon("chevronDown","ap-create-menu__chevron"));const moreContent=el("div","ap-create-menu__more-content");moreContent.append(makeItem({title:"Milestone",subtitle:"Break projects into phases",icon:"milestone",action:async()=>{AppCore.ui.closeModal();await withFolder(async id=>{await selectFolder(id,{skipOverview:true});await selectModule("boards");AppCore.ui.toast("Open a board to manage project milestones.","info");});}}));more.append(summary,moreContent);wrap.append(more);
  const currentModule=context.createType||getState().selectedModule;
  const currentItem={boards:"Board",conversations:"Conversation",conversation:"Conversation",docs:"Document",documents:"Document",embeds:"Embed",files:"File"}[currentModule];
  if(currentItem){
    const item=[...wrap.querySelectorAll(":scope > .ap-create-menu__item")].find(node=>node.getAttribute("aria-label")===currentItem);
    if(item)wrap.replaceChildren(item);
  }
  AppCore.ui.openModal({title:"Create",content:wrap,actions:[]});
  document.querySelector("#modal-root .ap-modal")?.classList.add("ap-resource-launcher");
  if(anchorElement && window.innerWidth > 900){
    const rect=anchorElement.getBoundingClientRect(),dialog=document.querySelector("#modal-root .ap-modal"),dialogRect=dialog?.getBoundingClientRect();
    const left=Math.max(16,Math.min(rect.left,window.innerWidth-(dialogRect?.width||470)-16));
    let top=rect.bottom+10;
    if(window.innerHeight-top<340)top=Math.max(16,rect.top-Math.min(dialogRect?.height||760,window.innerHeight*.9)-10);
    const backdrop=dialog?.closest(".ap-modal-backdrop");
    backdrop?.classList.add("ap-modal-backdrop--anchored");
    backdrop?.style.setProperty("--ap-create-menu-left",`${left}px`);
    backdrop?.style.setProperty("--ap-create-menu-top",`${top}px`);
    backdrop?.style.setProperty("--ap-create-menu-height",`${window.innerHeight-top-16}px`);
  }
}

function openLinkForm(context){
  const form=el("form","ap-stack k-create-link-form");const title=el("input","ap-input");title.placeholder="Link title";title.required=true;title.maxLength=200;const url=el("input","ap-input");url.type="url";url.placeholder="https://example.com";url.required=true;const visibleLabel=el("label","ap-checkbox-label");const visible=document.createElement("input");visible.type="checkbox";visibleLabel.append(visible,document.createTextNode(" Visible to clients"));const actions=el("div","k-modal-actions");const cancel=btn("Cancel","ap-btn ap-btn--secondary");const create=btn("Create link","ap-btn ap-btn--primary");create.type="submit";cancel.addEventListener("click",()=>AppCore.ui.closeModal());actions.append(cancel,create);form.append(title,url,visibleLabel,actions);
  form.addEventListener("submit",async event=>{event.preventDefault();create.disabled=true;try{const result=await db.from("embeds").insert({agency_id:context.agencyId,folder_id:context.folderId,title:title.value.trim(),url:url.value.trim(),description:"External link",client_visible:visible.checked,privacy:visible.checked?"shared":"private",created_by:context.user.id}).select().single();if(result.error)throw result.error;AppCore.ui.closeModal();AppCore.ui.toast("Link created.","success");emit("data:changed",{entity:"embed",entityId:result.data.id,folderId:result.data.folder_id,action:"created"});}catch(error){AppCore.ui.toast(AppCore.ui.describeError(error),"error");}finally{create.disabled=false;}});
  AppCore.ui.openModal({title:"New Link",content:form,actions:[]});title.focus();
}

async function chooseFolder(title, callback) {
  const folders = AppCore.getFolders().filter((f) => !f.system_key && !f.archived_at && !f.trashed_at);
  const unfiled = await ensureUnfiledFolder();
  const wrap = el("div", "ap-folder-picker");
  const none = btn("", "ap-folder-picker__item"); none.append(icon("library"), el("span", "", "No folder"));
  none.addEventListener("click", async () => { AppCore.ui.closeModal(); await callback(unfiled.id); }); wrap.append(none);
  for (const folder of folders) {
    const item = btn("", "ap-folder-picker__item"); item.append(icon("folder"), el("span", "", folder.name));
    item.addEventListener("click", async () => { AppCore.ui.closeModal(); await callback(folder.id); });
    wrap.append(item);
  }
  AppCore.ui.openModal({ title, content: wrap, actions: [] });
}

export function openEmbedForm(context, existing = null, onDone = null) {
  const availableFolders=AppCore.getFolders().filter(folder=>!folder.archived_at&&!folder.trashed_at);
  if(!availableFolders.length){AppCore.ui.toast("Create a folder first.","warning");openCreateFolder();return;}
  const form = el("form", "ap-stack ap-resource-create-form");
  const field=(labelText,control)=>{const label=el("label","ap-resource-create-field");label.append(el("span","ap-resource-create-field__label",labelText),control);return label;};
  const title = el("input", "ap-input"); title.placeholder = "Embed"; title.setAttribute("aria-label","Embed name");title.required = true; title.maxLength = 200; title.value = existing?.title || "";
  const url = el("input", "ap-input"); url.type = "url"; url.placeholder = "https://";url.setAttribute("aria-label","URL"); url.required = true; url.value = existing?.url || "";
  const description = el("textarea", "ap-textarea"); description.rows = 2; description.placeholder = "Enter description…";description.setAttribute("aria-label","Description (optional)"); description.value = existing?.description || "";
  const titleField=field("EMBED NAME",title),urlField=field("URL",url),descriptionField=field("DESCRIPTION (optional)",description);descriptionField.append(el("small","","Displayed in folder view"));
  const folder = el("select", "ap-select");
  folder.setAttribute("aria-label","Folder");folder.required=true;
  for (const f of availableFolders) { const o = document.createElement("option"); o.value = f.id; o.textContent = f.name; o.selected = f.id === (existing?.folder_id || context.folderId); folder.append(o); }
  const folderField=field("FOLDER",folder);
  const openWindowLabel=el("label","ap-checkbox-label");const openWindow=document.createElement("input");openWindow.type="checkbox";openWindow.checked=Boolean(existing?.open_in_new_window);openWindowLabel.append(openWindow,document.createTextNode(' Show "Open in new window" button'));
  const access=createAccessControl({name:"embed-access",privacy:existing?.privacy||(existing?.client_visible?"shared":"private"),internalRole:existing?.internal_role||"viewer"});
  const submit = btn(existing ? "Save embed" : "Create embed", "ap-btn ap-btn--primary"); submit.type = "submit";
  form.append(titleField,urlField,descriptionField,folderField,openWindowLabel,access.element,submit);
  form.addEventListener("submit", async (event) => {
    event.preventDefault(); submit.disabled = true;
    try {
      const payload = { agency_id: context.agencyId, folder_id: folder.value, title: title.value.trim(), url: url.value.trim(), description: description.value.trim() || null, privacy:access.privacy, internal_role:access.internalRole, client_visible: access.privacy==="shared", open_in_new_window: openWindow.checked };
      let result;
      if (existing) result = await db.from("embeds").update(payload).eq("id", existing.id).select().single();
      else result = await db.from("embeds").insert({ ...payload, created_by: context.user.id }).select().single();
      if (result.error) throw result.error;
      AppCore.ui.closeModal(); AppCore.ui.toast(existing ? "Embed updated." : "Embed created.", "success"); emit("data:changed", { entity: "embed", entityId: result.data.id, folderId: result.data.folder_id, action: existing ? "updated" : "created" }); await onDone?.(result.data);
    } catch (error) { AppCore.ui.toast(AppCore.ui.describeError(error), "error"); }
    finally { submit.disabled = false; }
  });
  AppCore.ui.openModal({ title: existing ? "Edit embed" : "New embed", content: form, actions: [] });
}

async function fetchLibraryItems(context, category) {
  const agencyId = context.agencyId;
  const activeRows = (table, order = "updated_at") => fetchActiveRows(table, "agency_id", agencyId, order);
  const fetchers = {
    boards: async () => (await activeRows("boards")).map((r) => ({ id: r.id, type: "board", folder_id: r.folder_id, title: r.title, visibility: visibilityText(r), created_at: r.created_at, raw: r })),
    conversations: async () => (await activeRows("conversations")).map((r) => ({ id: r.id, type: "conversation", folder_id: r.folder_id, title: r.title, visibility: visibilityText(r), created_at: r.created_at, raw: r })),
    favorites: async () => {const result=await Promise.all([activeRows('conversations'),activeRows('boards')]);return result.flatMap((rows,i)=>rows.filter(row=>row.pinned).map(row=>({id:row.id,type:i?'board':'conversation',folder_id:row.folder_id,title:row.title,visibility:visibilityText(row),created_at:row.created_at,raw:row})));},
    docs: async () => (await activeRows("docs")).map((r) => ({ id: r.id, type: "doc", folder_id: r.folder_id, title: r.title, visibility: visibilityText(r), created_at: r.created_at, raw: r })),
    files: async () => (await activeRows("files", "created_at")).map((r) => ({ id: r.id, type: "file", folder_id: r.folder_id, title: r.original_name, subtitle: AppCore.utils.formatBytes(r.size_bytes), visibility: visibilityText(r), created_at: r.created_at, raw: r })),
    embeds: async () => (await activeRows("embeds")).map((r) => ({ id: r.id, type: "embed", folder_id: r.folder_id, title: r.title, subtitle: r.url, url: r.url, visibility: visibilityText(r), created_at: r.created_at, raw: r }))
  };
  if (category === "everything") {
    const results = await Promise.allSettled(Object.entries(fetchers).filter(([key]) => key !== "favorites").map(([, fn]) => fn()));
    const chunks = results.filter((result) => result.status === "fulfilled").map((result) => result.value);
    if (!chunks.length) throw results.find((result) => result.status === "rejected")?.reason || new Error("Library unavailable");
    return chunks.flat().sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  }
  return fetchers[category]?.() || [];
}

export async function renderLibrary(
  container,
  context,
  category = "everything"
) {
  const labels = {
    everything:
      "Everything",

    boards:
      "Boards",

    conversations:
      "Conversations",

    favorites:
      "Favorites",

    docs:
      "Documents",

    embeds:
      "Embeds",

    files:
      "Files",

    archive:
      "Archive",

    trash:
      "Trash"
  };

  AppCore.ui.renderLoading(
    container,
    `Loading ${
      labels[category] ||
      "library"
    }…`
  );

  try {

    /* staff-only views */

    if (
      category ===
      "archive"
    ) {
      return renderArchive(
        container,
        context
      );
    }

    if (
      category ===
      "trash"
    ) {
      return renderTrash(
        container,
        context
      );
    }

    const items =
      await fetchLibraryItems(
        context,
        category
      );

    container.replaceChildren();

    const root =
      el(
        "section",
        "ap-hub-view ap-library-view"
      );

    root.dataset.view =
      `library-${category}`;

    if (
      context.isClient
    ) {
      root.classList.add(
        "ap-library-view--client"
      );
    }

    const top = libraryHeading(
      labels[category] || "Library",
      "",
      category
    );

    if (context.canCreate && ["everything", "boards", "conversations", "docs", "embeds", "files"].includes(category)) {
      const create = btn(
        `+ Create${category === "everything" ? "" : ` ${category === "docs" ? "Document" : labels[category].replace(/s$/, "")}`}`,
        "ap-btn ap-btn--secondary ap-btn--sm ap-library-create"
      );
      create.setAttribute("aria-haspopup", "dialog");
      create.append(workspaceIcon("chevronDown", "ap-library-create__chevron"));
      create.addEventListener("click", () => openFolderCreateMenu({ ...context, createType: category }, null, create));
      top.append(create);
    }

    root.append(libraryBreadcrumb(labels[category] || "Library"));
    root.append(top);

    const listHost =
      el("div");

    function apply(
      query,
      controls
    ) {
      const q =
        query
          .trim()
          .toLowerCase();

      const visibility =
        controls.visibility
          ?.value ||
        "";

      const type = controls.type?.value || "";

      let filtered =
        items.filter(
          item => {
            const searchMatch =
              !q ||
              `${
                item.title ||
                ""
              } ${
                item.subtitle ||
                ""
              }`
                .toLowerCase()
                .includes(q);

            if (
              !searchMatch
            ) {
              return false;
            }

            if (type && item.type !== type) return false;

            if (
              context.isClient
            ) {
              return true;
            }

            if (
              !visibility
            ) {
              return true;
            }

            return (
              visibility ===
              "client"

                ? matchesVisibility(item, visibility)
                : matchesVisibility(item, visibility)
            );
          }
        );

      filtered = sortCollection(filtered, controls.sort?.value || "newest");

      if (
        !filtered.length
      ) {
        listHost.replaceChildren();

        const empty =
          el(
            "div",
            "ap-centered-empty"
          );

        let emptyTitle;
        let emptyText;

        if (
          context.isClient
        ) {
          if (
            q
          ) {
            emptyTitle =
              "No results found";

            emptyText =
              "Try another search.";
          }

          else if (
            category ===
            "everything"
          ) {
            emptyTitle =
              "No shared work yet";

            emptyText =
              "Work shared with you will appear here.";
          }

          else {
            emptyTitle =
              `No ${
                labels[
                  category
                ].toLowerCase()
              } shared yet`;

            emptyText =
              `Shared ${
                labels[
                  category
                ].toLowerCase()
              } will appear here.`;
          }
        }

        else {
          emptyTitle =
            `No ${
              labels[
                category
              ].toLowerCase()
            } yet`;

          emptyText =
            "New work will appear here as your team creates it.";
        }

        appendLibraryEmptyIcon(empty, category);
        empty.append(
          el(
            "h3",
            "",
            emptyTitle
          ),

          el(
            "p",
            "",
            emptyText
          )
        );

        const emptyCopy = {
          everything: ["Nothing here yet. Let’s get started.", "Create a folder, kick off a project board, or start a conversation with a client."],
          boards: ["No boards yet. Let’s go.", "Organize, track and manage projects with ease."],
          conversations: ["No conversations yet. Let’s get talking.", "Start the first conversation with your clients and team."],
          docs: ["No documents—yet", "Create and share knowledge with your clients and team."],
          embeds: ["No embeds—for now", "Add your favorite tools to collaborate with your clients and team."],
          files: ["No files yet", "Any files shared in folders, conversations or tasks will show up here."],
          favorites: ["No favorites yet", "Favorite a board or conversation to keep it close at hand."]
        }[category];
        if (emptyCopy && !context.isClient && !q) {
          empty.querySelector("h3").textContent = emptyCopy[0];
          empty.querySelector("p").textContent = emptyCopy[1];
        }

        if (context.canCreate && emptyCopy && !q && category !== "files") {
          const create = btn(
            `+ Create${category === "everything" ? "" : ` ${category === "docs" ? "Document" : labels[category].replace(/s$/, "")}`}`,
            "ap-btn ap-btn--primary ap-btn--sm ap-library-empty-create"
          );
          create.setAttribute("aria-haspopup", "dialog");
          create.append(workspaceIcon("chevronDown", "ap-library-create__chevron"));
          create.addEventListener("click", () => openFolderCreateMenu({...context,createType:category}, null, create));
          empty.append(create);
        }

        listHost.append(
          empty
        );

        return;
      }

      renderDataTable(
        listHost,
        filtered,
        {
          canMove: context.canCreate,
          showVisibility:
            !context.isClient,

          actions:
            (
              item,
              cell
            ) => {
              if (context.canCreate && WORKSPACE_ITEM_TYPES.has(item.type)) {
                const menu = btn("", "ap-icon-button ap-library-item-menu");
                menu.setAttribute("aria-label", `Actions for ${item.title}`);
                menu.append(workspaceIcon("more"));
                menu.addEventListener("click", event => {
                  event.stopPropagation();
                  openWorkspaceItemActions(menu, item, context, () => renderLibrary(container, context, category));
                });
                cell.append(menu);
              }
              if (
                item.type ===
                  "embed" &&
                context.isStaff
              ) {
                const edit =
                  btn(
                    "•••",
                    "ap-icon-button"
                  );

                edit.addEventListener(
                  "click",
                  () =>
                    openEmbedActions(
                      context,
                      item.raw,
                      () =>
                        renderLibrary(
                          container,
                          context,
                          category
                        )
                    )
                );

                cell.append(
                  edit
                );

              }

              if(context.canShare&&canManageRole(context.role)&&["board","conversation","doc","file","embed"].includes(item.type)){
                const share=btn("","ap-icon-button");share.setAttribute("aria-label",`Share ${item.title}`);share.title="Share with teammates";share.append(workspaceIcon("share"));                share.addEventListener("click",()=>openItemSharing(item,context).catch(error=>AppCore.ui.toast(AppCore.ui.describeError(error),"error")));cell.append(share);
              }

              const open =
                btn(
                  "",
                  "ap-icon-button"
                );

              open.setAttribute(
                "aria-label",
                `Open ${item.title}`
              );

              open.append(
                workspaceIcon(
                  "arrowRight"
                )
              );

              open.addEventListener(
                "click",
                () =>
                  navigateItem(
                    item
                  )
              );

              cell.append(
                open
              );
            }
        }
      );
    }

    const {
      bar,
      search,
      controls
    } =
      buildFilterBar({
        placeholder:
          category ===
          "everything"

            ? "Search shared work…"

            : `Search ${
                labels[
                  category
                ].toLowerCase()
              }…`,

        visibility:
          !context.isClient,

        extra: category === "everything" ? [{
          key: "type",
          label: "Item type",
          options: [["", "All item types"], ["folder", "Folders"], ["board", "Boards"], ["conversation", "Conversations"], ["doc", "Documents"], ["embed", "Embeds"], ["file", "Files"]]
        }] : [],

        onInput:
          apply
      });

    const createButton = top.querySelector(".ap-library-create");
    if (createButton) bar.append(createButton);

    root.append(
      bar,
      listHost
    );

    container.append(
      root
    );

    apply(
      search.value,
      controls
    );

  } catch (error) {

    if (
      String(
        error?.message ||
        error
      ).includes(
        "embeds"
      )
    ) {
      container.replaceChildren();

      const root =
        el(
          "section",
          "ap-hub-view"
        );

      root.append(
        titleBlock(
          "Embeds",
          context.isClient
            ? "No embeds are available."
            : "Run migration 0300_portal_experience.sql to enable this view."
        )
      );

      container.append(
        root
      );

      return;
    }

    AppCore.ui.renderError(
      container,
      error,
      () =>
        renderLibrary(
          container,
          context,
          category
        )
    );
  }
}

function openEmbedActions(context, embed, onDone) {
  const wrap = el("div", "ap-menu-list");
  const open = btn("Open link", "ap-menu-list__item"); open.addEventListener("click", () => window.open(embed.url, "_blank", "noopener,noreferrer"));
  const edit = btn("Edit", "ap-menu-list__item"); edit.addEventListener("click", () => { AppCore.ui.closeModal(); openEmbedForm(context, embed, onDone); });
  const archive = btn("Archive", "ap-menu-list__item"); archive.addEventListener("click", async () => { const { error } = await db.from("embeds").update({ archived_at: new Date().toISOString() }).eq("id", embed.id); if (error) return AppCore.ui.toast(AppCore.ui.describeError(error), "error"); AppCore.ui.closeModal(); onDone?.(); });
  const trash = btn("Move to Trash", "ap-menu-list__item ap-menu-list__item--danger"); trash.addEventListener("click", async () => { const { error } = await db.from("embeds").update({ trashed_at: new Date().toISOString() }).eq("id", embed.id); if (error) return AppCore.ui.toast(AppCore.ui.describeError(error), "error"); AppCore.ui.closeModal(); onDone?.(); });
  wrap.append(open, edit, archive, trash); AppCore.ui.openModal({ title: embed.title, content: wrap, actions: [] });
}

async function renderArchive(container, context) {
  const q = [
    db.from("tasks").select("*").eq("agency_id",context.agencyId).not("archived_at","is",null).is("trashed_at",null),
    db.from("folders").select("id,name,created_at,archived_at,trashed_at,privacy,client_visible").eq("agency_id", context.agencyId).not("archived_at", "is", null).is("trashed_at", null),
    db.from("boards").select("id,folder_id,title,created_at,archived_at,trashed_at,privacy,client_visible").eq("agency_id", context.agencyId).not("archived_at", "is", null).is("trashed_at", null),
    db.from("conversations").select("id,folder_id,title,created_at,archived_at,trashed_at,privacy,client_visible").eq("agency_id", context.agencyId).not("archived_at", "is", null).is("trashed_at", null),
    db.from("docs").select("id,folder_id,title,created_at,archived_at,trashed_at,privacy,client_visible").eq("agency_id", context.agencyId).not("archived_at", "is", null).is("trashed_at", null),
    db.from("embeds").select("id,folder_id,title,url,created_at,archived_at,trashed_at,privacy,client_visible").eq("agency_id", context.agencyId).not("archived_at", "is", null).is("trashed_at", null),
    db.from("files").select("id,folder_id,original_name,created_at,archived_at,privacy,client_visible").eq("agency_id", context.agencyId).not("archived_at", "is", null).is("trashed_at", null)
  ];
  const rows = (await Promise.allSettled(q)).map(result => result.status === "fulfilled" && !result.value.error ? result.value : { data: [] });
  const archivedTasks=rows.shift().data||[];
  const items = [
    ...archivedTasks.map(r=>({id:r.id,type:"task",folder_id:r.folder_id,title:r.title,created_at:r.archived_at,raw:r})),
    ...(rows[0].data || []).map((r) => ({ id:r.id,type:"folder",folder_id:r.id,title:r.name,created_at:r.archived_at,raw:r })),
    ...(rows[1].data || []).map((r) => ({ id:r.id,type:"board",folder_id:r.folder_id,title:r.title,created_at:r.archived_at,raw:r })),
    ...(rows[2].data || []).map((r) => ({ id:r.id,type:"conversation",folder_id:r.folder_id,title:r.title,created_at:r.archived_at,raw:r })),
    ...(rows[3].data || []).map((r) => ({ id:r.id,type:"doc",folder_id:r.folder_id,title:r.title,created_at:r.archived_at,raw:r })),
    ...(rows[4].data || []).map((r) => ({ id:r.id,type:"embed",folder_id:r.folder_id,title:r.title,url:r.url,created_at:r.archived_at,raw:r })),
    ...(rows[5].data || []).map((r) => ({ id:r.id,type:"file",folder_id:r.folder_id,title:r.original_name,created_at:r.archived_at,raw:r }))
  ].sort((a,b)=>new Date(b.created_at)-new Date(a.created_at));
  container.replaceChildren();
  const root=el("section","ap-hub-view ap-library-view ap-library-view--archive");
  const host=el("div");
  const apply=(query,controls)=>{
    const text=query.trim().toLowerCase(),type=controls.type?.value||"",visibility=controls.visibility?.value||"";
    const filtered=sortCollection(items.filter(item=>
      (!text||`${item.title} ${item.url||""}`.toLowerCase().includes(text))&&
      (!type||item.type===type)&&
      matchesVisibility(item,visibility)
    ),controls.sort?.value||"newest");
    if(!filtered.length){const isEmpty=!text&&!type&&!visibility;const empty=el("div","ap-centered-empty");appendLibraryEmptyIcon(empty,"archive");empty.append(el("h3","",isEmpty?"Archive is empty":"No results found"),el("p","",isEmpty?"Anything you archive will be listed here.":"Try another search or filter."));host.replaceChildren(empty);return;}
    renderDataTable(host,filtered,{showVisibility:false,actions:(item,cell)=>{
      const restore=btn("Restore","ap-btn ap-btn--secondary ap-btn--sm");restore.addEventListener("click",()=>restoreArchived(item,()=>renderArchive(container,context)));
      const trash=btn("Trash","ap-btn ap-btn--ghost ap-btn--sm");trash.addEventListener("click",()=>trashItem(item,()=>renderArchive(container,context)));
      cell.append(restore);if(item.type!=="task")cell.append(trash);
    }});
  };
  const {bar,search,controls}=buildFilterBar({
    placeholder:"Search archive…",
    visibility:true,
    extra:[{key:"type",label:"Kind",options:[["","All kinds"],["folder","Folders"],["board","Boards"],["task","Tasks"],["conversation","Conversations"],["doc","Documents"],["embed","Embeds"],["file","Files"]]}],
    onInput:apply,alwaysOpen:true
  });
  root.append(libraryBreadcrumb("Archive"),libraryHeading("Archive","Archived items don’t appear in folders or the sidebar. Clients can’t access them.","archive"),bar,host);
  container.append(root);
  apply(search.value,controls);
}

async function restoreArchived(item, done) {
  const table = ({task:"tasks",folder:"folders",board:"boards",conversation:"conversations",doc:"docs",embed:"embeds",file:"files"})[item.type];
  const {error}=await db.from(table).update({archived_at:null}).eq("id",item.id); if(error)return AppCore.ui.toast(AppCore.ui.describeError(error),"error"); if(item.type==="folder")await loadFolders(); AppCore.ui.toast("Restored.","success"); done?.();
}
async function trashItem(item, done) {
  const table=({folder:"folders",board:"boards",conversation:"conversations",doc:"docs",embed:"embeds",file:"files"})[item.type];
  const {error}=await db.from(table).update({trashed_at:new Date().toISOString()}).eq("id",item.id); if(error)return AppCore.ui.toast(AppCore.ui.describeError(error),"error"); if(item.type==="folder")await loadFolders(); done?.();
}

async function renderTrash(container, context) {
  const qs=[
    db.from("folders").select("id,name,trashed_at,privacy,client_visible").eq("agency_id",context.agencyId).not("trashed_at","is",null),
    db.from("boards").select("id,folder_id,title,trashed_at,privacy,client_visible").eq("agency_id",context.agencyId).not("trashed_at","is",null),
    db.from("conversations").select("id,folder_id,title,trashed_at,privacy,client_visible").eq("agency_id",context.agencyId).not("trashed_at","is",null),
    db.from("docs").select("id,folder_id,title,trashed_at,privacy,client_visible").eq("agency_id",context.agencyId).not("trashed_at","is",null),
    db.from("embeds").select("id,folder_id,title,url,trashed_at,privacy,client_visible").eq("agency_id",context.agencyId).not("trashed_at","is",null),
    db.from("files").select("id,folder_id,original_name,storage_path,bucket_name,trashed_at,privacy,client_visible").eq("agency_id",context.agencyId).not("trashed_at","is",null)
  ];
  const rows=(await Promise.allSettled(qs)).map(result=>result.status==="fulfilled"&&!result.value.error?result.value:{data:[]});
  const items=[...(rows[0].data||[]).map(r=>({id:r.id,type:"folder",folder_id:r.id,title:r.name,created_at:r.trashed_at,raw:r})),...(rows[1].data||[]).map(r=>({id:r.id,type:"board",folder_id:r.folder_id,title:r.title,created_at:r.trashed_at,raw:r})),...(rows[2].data||[]).map(r=>({id:r.id,type:"conversation",folder_id:r.folder_id,title:r.title,created_at:r.trashed_at,raw:r})),...(rows[3].data||[]).map(r=>({id:r.id,type:"doc",folder_id:r.folder_id,title:r.title,created_at:r.trashed_at,raw:r})),...(rows[4].data||[]).map(r=>({id:r.id,type:"embed",folder_id:r.folder_id,title:r.title,url:r.url,created_at:r.trashed_at,raw:r})),...(rows[5].data||[]).map(r=>({id:r.id,type:"file",folder_id:r.folder_id,title:r.original_name,created_at:r.trashed_at,raw:r}))].sort((a,b)=>new Date(b.created_at)-new Date(a.created_at));
  container.replaceChildren();
  const root=el("section","ap-hub-view ap-library-view ap-library-view--trash");
  const heading=libraryHeading("Trash","Items older than 30 days will be automatically removed.","trash");
  if(context.canManageAll&&items.length){const empty=btn("Empty Trash","ap-btn ap-btn--danger ap-btn--sm");empty.addEventListener("click",async()=>{empty.disabled=true;try{await emptyTrash(items,()=>renderTrash(container,context));}catch(error){AppCore.ui.toast(AppCore.ui.describeError(error),"error");empty.disabled=false;}});heading.append(empty);}
  const host=el("div");
  const apply=(query,controls)=>{
    const text=query.trim().toLowerCase(),visibility=controls.visibility?.value||"",type=controls.type?.value||"";
    const filtered=sortCollection(items.filter(item=>
      (!text||`${item.title} ${item.url||""}`.toLowerCase().includes(text))&&
      (!type||item.type===type)&&matchesVisibility(item,visibility)
    ),controls.sort?.value||"newest");
    if(!filtered.length){const isEmpty=!text&&!type&&!visibility;const empty=el("div","ap-centered-empty");appendLibraryEmptyIcon(empty,"trash");empty.append(el("h3","",isEmpty?"Trash is empty":"No results found"),el("p","",isEmpty?"Anything you delete will appear here.":"Try another search or filter."));host.replaceChildren(empty);return;}
    renderDataTable(host,filtered,{showVisibility:false,actions:(item,cell)=>{const restore=btn("Restore","ap-btn ap-btn--secondary ap-btn--sm");restore.addEventListener("click",()=>restoreTrash(item,()=>renderTrash(container,context)));cell.append(restore);}});
  };
  const {bar,search,controls}=buildFilterBar({placeholder:"Search trash…",visibility:true,extra:[{key:"type",label:"Kind",options:[["","All kinds"],["folder","Folders"],["board","Boards"],["conversation","Conversations"],["doc","Documents"],["embed","Embeds"],["file","Files"]]}],onInput:apply,alwaysOpen:true});
  root.append(libraryBreadcrumb("Trash"),heading,bar,host);
  container.append(root);
  apply(search.value,controls);
}
async function restoreTrash(item,done){const table=({folder:"folders",board:"boards",conversation:"conversations",doc:"docs",embed:"embeds",file:"files"})[item.type];const {error}=await db.from(table).update({trashed_at:null}).eq("id",item.id);if(error)return AppCore.ui.toast(AppCore.ui.describeError(error),"error");if(item.type==="folder")await loadFolders();await done?.();}
async function emptyTrash(items,done){if(!await AppCore.ui.confirm({title:"Empty Trash?",message:"This permanently deletes every item currently in Trash. This cannot be undone.",confirmLabel:"Empty Trash",danger:true}))return;for(const item of items){const table=({folder:"folders",board:"boards",conversation:"conversations",doc:"docs",embed:"embeds",file:"files"})[item.type];if(item.type==="file"){if(!item.raw.storage_path)throw new Error(`The stored path for ${item.title} is missing; it was not permanently deleted.`);const {error:storageError}=await db.storage.from(item.raw.bucket_name||"project-files").remove([item.raw.storage_path]);if(storageError)throw storageError;}const {error}=await db.from(table).delete().eq("id",item.id);if(error)throw error;}await loadFolders();AppCore.ui.toast("Trash emptied.","success");await done?.();}

async function loadTasks(context, mineOnly = false) {
  let query=db.from("tasks").select("*").eq("agency_id",context.agencyId).is("archived_at",null).is("trashed_at",null).order("due_date",{ascending:true,nullsFirst:false}).order("updated_at",{ascending:false});
  if(mineOnly)query=query.eq("assignee_id",context.user.id);
  const {data,error}=await query;if(error)throw error;return data||[];
}

export async function renderTasksHub(container, context, { mineOnly = false, initialMode = "table", initialCalendarDate = null } = {}) {
  AppCore.ui.renderLoading(container, "Loading tasks…");
  try {
    const taskResults = await Promise.allSettled([
      loadTasks(context, mineOnly),
      db.from("boards").select("id,title,folder_id").eq("agency_id", context.agencyId),
      fetchAssignableProfiles(context.agencyId)
    ]);
    const tasks = taskResults[0].status === "fulfilled" ? taskResults[0].value : [];
    const boardResult = taskResults[1].status === "fulfilled" && !taskResults[1].value.error ? taskResults[1].value : { data: [] };
    const boards = boardResult.data || [];
    const members = taskResults[2].status === "fulfilled" ? taskResults[2].value : [];

    const boardMap = new Map((boards || []).map((board) => [board.id, board.title]));
    const memberMap = new Map((members || []).map((member) => [member.id, profileLabel(member)]));
    container.replaceChildren();
    container.className = "ap-module-content k-page-panel k-tasks-page";
    const root = el("section", "ap-hub-view ap-tasks-hub");
    const top = el("div", "k-task-top");
    const statusTabs = el("div", "k-task-status-tabs");
    const openTab = btn("", "k-task-status-tab k-task-status-tab--active");
    const openCount = tasks.filter((task) => !task.completed_at).length;
    openTab.append(document.createTextNode("All Tasks "), el("small", "", String(openCount)));
    const completedTab = btn("", "k-task-status-tab");
    completedTab.append(document.createTextNode("Completed "), el("small", "", String(tasks.filter((task) => task.completed_at).length)));
    statusTabs.append(openTab, completedTab);

    const actions = el("div", "k-task-actions");
    const filterButton = btn("", "k-task-action");
    filterButton.append(workspaceIcon("filter"));
    filterButton.title = "Filter tasks";
    filterButton.setAttribute("aria-label", "Filter tasks");
    const sortButton = btn("", "k-task-action");
    sortButton.append(workspaceIcon("sort"));
    const updateSortLabel = () => {
      const direction = sortDirection === "asc" ? "earliest first" : "latest first";
      sortButton.title = `Due date: ${direction}`;
      sortButton.setAttribute("aria-label", `Sort tasks by due date: ${direction}`);
      sortButton.setAttribute("aria-pressed", String(sortDirection === "desc"));
    };
    const listButton = btn("", "k-task-action");
    listButton.append(workspaceIcon("list"));
    listButton.title = "Switch table and calendar view";
    listButton.setAttribute("aria-label", "Switch table and calendar view");
    const moreButton = btn("", "k-task-action");
    moreButton.append(workspaceIcon("more"));
    moreButton.title = "More options";
    moreButton.setAttribute("aria-label", "More task options");
    actions.append(filterButton, sortButton, listButton, moreButton);
    top.append(statusTabs, actions);
    root.append(top);

    const filterArea = el("div", "k-task-filter-area");
    filterArea.hidden = true;
    const searchWrap = el("label", "k-task-search");
    searchWrap.append(workspaceIcon("search"));
    const search = el("input");
    search.type = "search";
    search.placeholder = "Search tasks...";
    search.setAttribute("aria-label", "Search tasks");
    searchWrap.append(search);
    filterArea.append(searchWrap);
    const boardSelect = el("select", "ap-filter-select");
    boardSelect.setAttribute("aria-label", "Filter by board");
    boardSelect.append(el("option", "", "All boards"));
    (boards || []).forEach((board) => { const option = el("option", "", board.title); option.value = board.id; boardSelect.append(option); });
    const dateSelect = el("select", "ap-filter-select");
    dateSelect.setAttribute("aria-label", "Filter by due date");
    [["all", "All dates"], ["today", "Today"], ["overdue", "Overdue"], ["unscheduled", "No due date"]].forEach(([value, label]) => { const option = el("option", "", label); option.value = value; dateSelect.append(option); });
    filterArea.append(boardSelect, dateSelect);
    root.append(filterArea);

    const modes = el("div", "k-task-mode-tabs");
    const tableButton = btn("Table", "k-task-mode-tab k-task-mode-tab--active");
    const calendarButton = btn("Calendar", "k-task-mode-tab");
    modes.append(tableButton, calendarButton);
    root.append(modes);
    const host = el("div", "k-task-host");
    root.append(host);
    const taskMenu = el("div", "k-task-more-menu");
    taskMenu.hidden = true;
    const showOpen = btn("Show open tasks", "k-task-more-menu__item");
    const showCompleted = btn("Show completed tasks", "k-task-more-menu__item");
    const tableView = btn("Table view", "k-task-more-menu__item");
    const calendarView = btn("Calendar view", "k-task-more-menu__item");
    taskMenu.append(showOpen, showCompleted, tableView, calendarView);
    actions.append(taskMenu);
    container.append(root);
    activeTaskMenu = { root, menu: taskMenu, moreButton };

    let mode = initialMode === "calendar" ? "calendar" : "table";
    let filter = "open";
    let query = "";
    let boardFilter = "";
    let dateFilter = "all";
    let sortDirection = "asc";
    let calendarDate = initialCalendarDate ? new Date(`${initialCalendarDate}T12:00:00`) : new Date();
    updateSortLabel();

    const currentTasks = () => {
      const visible = tasks.filter((task) => filter === "completed" ? !!task.completed_at : !task.completed_at);
      const searched = query
        ? visible.filter((task) => `${task.title} ${boardMap.get(task.board_id) || ""}`.toLowerCase().includes(query))
        : visible;
      const boardFiltered = boardFilter ? searched.filter((task) => task.board_id === boardFilter) : searched;
      const dateFiltered = dateFilter === "today" ? boardFiltered.filter((task) => taskCalendarDate(task) === todayKey())
        : dateFilter === "overdue" ? boardFiltered.filter((task) => dateKey(task.due_date) && dateKey(task.due_date) < todayKey())
          : dateFilter === "unscheduled" ? boardFiltered.filter((task) => !task.due_date) : boardFiltered;
      return dateFiltered.sort((a, b) => {
        const firstDate = taskCalendarDate(a) || "9999-12-31";
        const secondDate = taskCalendarDate(b) || "9999-12-31";
        return sortDirection === "asc" ? firstDate.localeCompare(secondDate) : secondDate.localeCompare(firstDate);
      });
    };

    const toggleTask = async (task) => {
      const nextCompletedAt = task.completed_at ? null : new Date().toISOString();
      try {
        const { error } = await db.from("tasks").update({ completed_at: nextCompletedAt }).eq("id", task.id);
        if (error) throw error;
        task.completed_at = nextCompletedAt;
        completedTab.querySelector("small").textContent = String(tasks.filter((item) => item.completed_at).length);
        openTab.replaceChildren(document.createTextNode("All Tasks "), el("small", "", String(tasks.filter((item) => !item.completed_at).length)));
        draw();
      } catch (error) {
        AppCore.ui.toast(AppCore.ui.describeError(error), "error");
      }
    };

    const draw = () => {
      const visibleTasks = currentTasks();
      if (mode === "calendar") {
        renderTaskCalendar(host, visibleTasks, calendarDate, (nextDate) => {
          calendarDate = nextDate;
          draw();
        }, context.canCreate ? (date) => openCalendarTaskForm(context, boards || [], members || [], date, () => renderTasksHub(container, context, { mineOnly, initialMode: "calendar", initialCalendarDate: date })) : null, context.canCreate ? (task) => openCalendarTaskForm(context, boards || [], members || [], taskCalendarDate(task), () => renderTasksHub(container, context, { mineOnly, initialMode: "calendar", initialCalendarDate: task.due_date || taskCalendarDate(task) }), task) : null);
      } else {
        renderTaskTable(host, visibleTasks, boardMap, memberMap, toggleTask);
      }
    };

    tableButton.addEventListener("click", () => {
      mode = "table";
      root.classList.remove("k-calendar-mode");
      tableButton.classList.add("k-task-mode-tab--active");
      calendarButton.classList.remove("k-task-mode-tab--active");
      draw();
    });
    calendarButton.addEventListener("click", () => {
      mode = "calendar";
      root.classList.add("k-calendar-mode");
      calendarButton.classList.add("k-task-mode-tab--active");
      tableButton.classList.remove("k-task-mode-tab--active");
      draw();
    });
    showOpen.addEventListener("click", () => {
      taskMenu.hidden = true;
      moreButton.classList.remove("is-active");
      openTab.click();
    });
    showCompleted.addEventListener("click", () => {
      taskMenu.hidden = true;
      moreButton.classList.remove("is-active");
      completedTab.click();
    });
    tableView.addEventListener("click", () => {
      taskMenu.hidden = true;
      moreButton.classList.remove("is-active");
      tableButton.click();
    });
    calendarView.addEventListener("click", () => {
      taskMenu.hidden = true;
      moreButton.classList.remove("is-active");
      calendarButton.click();
    });
    openTab.addEventListener("click", () => {
      filter = "open";
      openTab.classList.add("k-task-status-tab--active");
      completedTab.classList.remove("k-task-status-tab--active");
      draw();
    });
    completedTab.addEventListener("click", () => {
      filter = "completed";
      completedTab.classList.add("k-task-status-tab--active");
      openTab.classList.remove("k-task-status-tab--active");
      draw();
    });
    filterButton.addEventListener("click", () => {
      filterArea.hidden = !filterArea.hidden;
      filterButton.classList.toggle("is-active", !filterArea.hidden);
      if (!filterArea.hidden) search.focus();
    });
    search.addEventListener("input", () => {
      query = search.value.trim().toLowerCase();
      draw();
    });
    boardSelect.addEventListener("change", () => { boardFilter = boardSelect.value; draw(); });
    dateSelect.addEventListener("change", () => { dateFilter = dateSelect.value; draw(); });
    sortButton.addEventListener("click", () => {
      sortDirection = sortDirection === "asc" ? "desc" : "asc";
      sortButton.classList.toggle("is-active", sortDirection === "desc");
      updateSortLabel();
      draw();
    });
    listButton.addEventListener("click", () => {
      (mode === "table" ? calendarButton : tableButton).click();
    });
    moreButton.addEventListener("click", (event) => {
      event.stopPropagation();
      taskMenu.hidden = !taskMenu.hidden;
      moreButton.classList.toggle("is-active", !taskMenu.hidden);
    });
    if (mode === "calendar") {
      root.classList.add("k-calendar-mode");
      calendarButton.classList.add("k-task-mode-tab--active");
      tableButton.classList.remove("k-task-mode-tab--active");
    }
    draw();
  } catch (error) {
    AppCore.ui.renderError(container, error, () => renderTasksHub(container, context, { mineOnly }));
  }
}

function renderTaskTable(host, tasks, boardMap = new Map(), memberMap = new Map(), onToggle) {
  host.replaceChildren();
  const table = el("div", "k-task-table");
  const head = el("div", "k-task-row k-task-row--head");
  ["Task", "Board", "Members", "Due Date"].forEach((label) => head.append(el("span", "", label)));
  table.append(head);
  if (!tasks.length) {
    const empty = el("div", "k-task-empty");
    empty.append(workspaceIcon("checkCircle"), el("h3", "", "No tasks in this view"));
    table.append(empty);
    host.append(table);
    return;
  }
  for (const taskData of tasks) {
    const row = el("div", "k-task-row");
    const task = el("div", "k-task-name");
    const check = btn("", "k-task-check");
    check.setAttribute("aria-label", taskData.completed_at ? "Mark task incomplete" : "Mark task completed");
    if (taskData.completed_at) {
      check.classList.add("is-complete");
      check.append(workspaceIcon("check"));
    }
    check.addEventListener("click", () => onToggle?.(taskData));
    task.append(check, el("strong", "", taskData.title));
    const schedule=taskData.due_date?`${safeDate(taskData.due_date)}${taskData.due_time?` · ${taskData.due_time}`:""}`:"--";
    row.append(task, el("span", "", boardMap.get(taskData.board_id) || "—"), el("span", "k-task-muted", taskData.assignee_id ? memberMap.get(taskData.assignee_id)||"Member" : "Anyone"), el("span", "k-task-muted", schedule));
    row.addEventListener("dblclick", () => navigateItem({ type: "task", folder_id: taskData.folder_id, id: taskData.id }));
    table.append(row);
  }
  host.append(table, el("div", "k-task-count", `${tasks.length} task${tasks.length === 1 ? "" : "s"}`));
}
async function ensureCalendarBoard(context,boards){
  if(boards.length)return boards;
  const folder=await ensureUnfiledFolder();
  const boardResult=await db.from("boards").insert({agency_id:context.agencyId,folder_id:folder.id,title:"Calendar tasks",description:"Tasks created from the workspace calendar",privacy:"private",client_visible:false,position:100,created_by:context.user.id}).select().single();
  if(boardResult.error)throw boardResult.error;
  const columnResult=await db.from("board_columns").insert({agency_id:context.agencyId,board_id:boardResult.data.id,name:"To do",color:"#8A90A6",position:100}).select().single();
  if(columnResult.error){await db.from("boards").delete().eq("id",boardResult.data.id);throw columnResult.error;}
  boards.push(boardResult.data);
  emit("data:changed",{entity:"board",entityId:boardResult.data.id,folderId:folder.id,action:"created"});
  return boards;
}
async function openCalendarTaskForm(context,boards,members,date,onDone,existing=null){
  try{await ensureCalendarBoard(context,boards);}catch(error){AppCore.ui.toast(AppCore.ui.describeError(error),"error");return;}
  const form=el("form","ap-stack ap-calendar-task-form");
  const title=el("input","ap-input");title.required=true;title.maxLength=200;title.placeholder="Task name";title.value=existing?.title||"";title.setAttribute("aria-label","Task name");
  const board=el("select","ap-select");board.setAttribute("aria-label","Board");for(const item of boards){const option=el("option","",item.title);option.value=item.id;board.append(option);}board.value=existing?.board_id||boards[0]?.id||"";
  const due=el("input","ap-input");due.type="date";due.value=existing?.due_date||date;due.required=true;due.setAttribute("aria-label","Due date");
  const time=el("input","ap-input");time.type="time";time.step="60";time.value=existing?.due_time||"";time.setAttribute("aria-label","Time");
  const priority=el("select","ap-select");priority.setAttribute("aria-label","Priority");for(const [value,label] of [["low","Low"],["normal","Normal"],["high","High"],["urgent","Urgent"]]){const option=el("option","",label);option.value=value;priority.append(option);}priority.value=existing?.priority||"normal";
  const color=createTaskColorControl(existing?.task_color);
  const assignee=el("select","ap-select");assignee.setAttribute("aria-label","Assign to");assignee.append(Object.assign(el("option","","Anyone"),{value:""}));for(const member of members){const option=el("option","",profileLabel(member));option.value=member.id;assignee.append(option);}assignee.value=existing?.assignee_id||"";
  const description=el("textarea","ap-textarea");description.rows=3;description.value=existing?.description||"";description.placeholder="Description (optional)";description.setAttribute("aria-label","Description");
  const row=(labelText,control)=>{const label=el("label","ap-field");label.append(el("span","ap-field__label",labelText),control);return label;};
  const save=btn(existing?"Save changes":"Create task","ap-btn ap-btn--primary");save.type="submit";form.append(row("Task",title),row("Board",board),row("Date",due),row("Time",time),row("Assign to",assignee),row("Color",color),row("Priority",priority),row("Description",description),save);
  form.addEventListener("submit",async event=>{event.preventDefault();save.disabled=true;try{const selected=boards.find(item=>item.id===board.value);const {data:columns,error:columnError}=await db.from("board_columns").select("id,position").eq("board_id",board.value).order("position",{ascending:true});if(columnError)throw columnError;if(!columns?.length)throw new Error("This board needs a section before tasks can be added.");const values={folder_id:selected?.folder_id||null,board_id:board.value,column_id:existing?.board_id===board.value?existing.column_id:columns[0].id,title:title.value.trim(),description:description.value.trim()||null,due_date:due.value,due_time:time.value||null,task_color:color.value,priority:priority.value,assignee_id:assignee.value||null};let error;if(existing){({error}=await db.from("tasks").update(values).eq("id",existing.id));if(error)throw error;Object.assign(existing,values);emit("data:changed",{entity:"task",entityId:existing.id,folderId:existing.folder_id,action:"updated"});}else{({error}=await db.from("tasks").insert({...values,agency_id:context.agencyId,board_id:board.value,column_id:columns[0].id,title:title.value.trim(),client_visible:false,position:100,created_by:context.user.id}));if(error)throw error;}AppCore.ui.closeModal();AppCore.ui.toast(existing?"Task updated.":"Task created.","success");await onDone?.();}catch(error){AppCore.ui.toast(AppCore.ui.describeError(error),"error");}finally{save.disabled=false;}});
  const dateLabel=new Date(`${date}T12:00:00`).toLocaleDateString(undefined,{month:"short",day:"numeric",year:"numeric"});
  AppCore.ui.openModal({title:existing?`Customize task · ${existing.title}`:`New task · ${dateLabel}`,content:form,actions:[]});title.focus();
}

function renderTaskCalendar(host,tasks,focusDate=new Date(),onNavigate,onCreate,onEdit){
  host.replaceChildren();
  const year=focusDate.getFullYear(),month=focusDate.getMonth();
  const first=new Date(year,month,1);
  const start=new Date(first);start.setDate(first.getDate()-((first.getDay()+6)%7));
  const wrap=el("div","k-calendar");const toolbar=el("div","k-calendar-toolbar");
  const prev=btn("","k-calendar-nav"),next=btn("","k-calendar-nav");
  prev.append(workspaceIcon("chevronLeft"));next.append(workspaceIcon("chevronRight"));
  prev.title="Previous month";prev.setAttribute("aria-label","Previous month");next.title="Next month";next.setAttribute("aria-label","Next month");
  prev.addEventListener("click",()=>onNavigate?.(new Date(year,month-1,1)));next.addEventListener("click",()=>onNavigate?.(new Date(year,month+1,1)));
  const title=el("strong","",focusDate.toLocaleDateString(undefined,{month:"long",year:"numeric"}));const todayButton=btn("Today","k-calendar-today");todayButton.addEventListener("click",()=>onNavigate?.(new Date()));toolbar.append(prev,title,next,todayButton);wrap.append(toolbar);
  const week=el("div","k-calendar-weekdays");week.setAttribute("role","row");["Mon","Tue","Wed","Thu","Fri","Sat","Sun"].forEach(d=>{const weekday=el("span","",d);weekday.setAttribute("role","columnheader");week.append(weekday);});wrap.append(week);
  const grid=el("div","k-calendar-grid");grid.setAttribute("role","grid");
  grid.style.gridTemplateRows="repeat(6,minmax(110px,1fr))";
  wrap.append(grid);host.append(wrap);
  const today=new Date();today.setHours(0,0,0,0);
  for(let index=0;index<42;index++){
    const d=new Date(start);d.setDate(start.getDate()+index);
    const date=new Date(d),cell=el("div","k-calendar-cell");if(date.getMonth()!==month)cell.classList.add("k-calendar-cell--muted");
    const num=el("span","k-calendar-date",String(date.getDate()));if(+date===+today)num.classList.add("k-calendar-date--today");cell.append(num);
    const iso=dateKey(date);
    const dayTasks=tasks.filter(t=>taskCalendarDate(t)===iso);
    cell.setAttribute("role","gridcell");
    if(onCreate){cell.tabIndex=0;cell.setAttribute("aria-label",`Add task on ${date.toLocaleDateString()}`);cell.addEventListener("click",event=>{if(event.target===cell||event.target===num)onCreate(iso);});cell.addEventListener("keydown",event=>{if(event.target===cell&&(event.key==="Enter"||event.key===" ")){event.preventDefault();onCreate(iso);}});}
    const visibleTaskCount=Math.max(1,Math.floor((cell.clientHeight-50)/23));
    dayTasks.slice(0,visibleTaskCount).forEach(t=>{const label=`${t.due_time?`${t.due_time} `:""}${t.title}`;const chip=btn(label,"k-calendar-task");applyTaskColor(chip,t);if(!t.due_date)chip.classList.add("k-calendar-task--fallback");chip.title=`${t.title}${t.due_time?` at ${t.due_time}`:""}`;chip.setAttribute("aria-label",`${label}. ${onEdit?"Edit task":"Open task"}`);chip.addEventListener("click",event=>{event.stopPropagation();if(onEdit)onEdit(t);else navigateItem({type:"task",folder_id:t.folder_id,id:t.id});});cell.append(chip);});
    if(dayTasks.length>visibleTaskCount){const more=btn(`+${dayTasks.length-visibleTaskCount} more`,"k-calendar-more");more.setAttribute("aria-label",`Show ${dayTasks.length-visibleTaskCount} more tasks on ${date.toLocaleDateString()}`);more.addEventListener("click",event=>{event.stopPropagation();openCalendarDayTasks(dayTasks,date,onEdit);});cell.append(more);}
    grid.append(cell);
  }
}

function openCalendarDayTasks(tasks,date,onEdit){
  const list=el("div","ap-stack");
  tasks.forEach(task=>{
    const item=btn(`${task.due_time?`${task.due_time} · `:""}${task.title}`,"k-calendar-day-task");
    item.addEventListener("click",()=>{AppCore.ui.closeModal();if(onEdit)onEdit(task);else navigateItem({type:"task",folder_id:task.folder_id,id:task.id});});
    list.append(item);
  });
  AppCore.ui.openModal({title:date.toLocaleDateString(undefined,{weekday:"long",month:"long",day:"numeric",year:"numeric"}),content:list,actions:[]});
}

function priorityColor(priority){return priority==="urgent"?"red":priority==="high"?"orange":priority==="low"?"green":"blue";}

export async function renderInvoicesHub(container,context){AppCore.ui.renderLoading(container,"Loading invoices…");try{const [{data:invoices,error:iErr},{data:clients,error:cErr}]=await Promise.all([db.from("invoices").select("*").eq("agency_id",context.agencyId).order("created_at",{ascending:false}),context.canManageBilling?db.from("clients").select("id,name").eq("agency_id",context.agencyId).is("archived_at",null):Promise.resolve({data:[],error:null})]);if(iErr)throw iErr;if(cErr)throw cErr;const clientMap=new Map((clients||[]).map(c=>[c.id,c.name]));container.replaceChildren();const root=el("section","ap-hub-view ap-global-invoices");const heading=el("div","ap-library-heading");heading.append(titleBlock("Invoices","Create, send and track billing across the whole workspace."));if(context.canManageBilling){const actions=el("div","ap-invoice-global-actions");const upload=btn("Upload Invoice","ap-btn ap-btn--secondary ap-btn--sm");upload.addEventListener("click",()=>openInvoiceUpload(context,clients||[],()=>renderInvoicesHub(container,context)));const create=btn("Create Invoice","ap-btn ap-btn--primary ap-btn--sm");create.addEventListener("click",()=>openInvoiceCreateMenu(context));actions.append(upload,create);heading.append(actions);}root.append(heading);let filtered=invoices||[];const host=el("div");const apply=(q,controls)=>{const text=q.trim().toLowerCase(),status=controls.status?.value||"",client=controls.client?.value||"";filtered=(invoices||[]).filter(inv=>(!text||`${inv.invoice_number} ${clientMap.get(inv.client_id)||""}`.toLowerCase().includes(text))&&(!status||inv.status===status)&&(!client||inv.client_id===client));renderInvoiceRows(host,filtered,clientMap);};const extra=[{key:"status",options:[["","Status"],["draft","Draft"],["sent","Sent"],["overdue","Overdue"],["paid","Paid"],["void","Void"]]}];if(context.canManageBilling)extra.push({key:"client",options:[["","Client"],...(clients||[]).map(c=>[c.id,c.name])]});const {bar,search,controls}=buildFilterBar({placeholder:"Search invoices…",extra,onInput:apply});root.append(bar,host);container.append(root);apply(search.value,controls);}catch(error){AppCore.ui.renderError(container,error,()=>renderInvoicesHub(container,context));}}

function openInvoiceUpload(context,clients,onDone){
 if(!clients.length)return AppCore.ui.toast("Create a client before uploading an invoice.","warning");
 chooseFolder("Choose the invoice project",folderId=>{
  const uploadField=(label,control,hint="")=>{const row=el("label","ap-field");row.append(el("span","ap-field__label",label),control);if(hint)row.append(el("span","ap-field__hint",hint));return row;};const form=el("form","ap-stack");const client=el("select","ap-select");for(const item of clients){const option=el("option","",item.name);option.value=item.id;client.append(option);}const currency=el("select","ap-select");for(const [value,label] of [["USD","USD — US Dollar"],["EUR","EUR — Euro"],["DZD","DZD — Algerian Dinar"]]){const option=el("option","",label);option.value=value;currency.append(option);}currency.value=["USD","EUR","DZD"].includes(context.agency?.settings?.currency)?context.agency.settings.currency:"USD";const amount=el("input","ap-input");amount.type="number";amount.min="0";amount.step="0.01";amount.required=true;amount.placeholder="Invoice total";const file=el("input","ap-input");file.type="file";file.accept="application/pdf,image/png,image/jpeg,image/webp";file.required=true;const submit=btn("Upload invoice","ap-btn ap-btn--primary");submit.type="submit";form.append(uploadField("Client",client),uploadField("Currency",currency),uploadField("Total",amount),uploadField("Invoice file",file,"PDF or image, maximum 25 MiB."),submit);
  form.addEventListener("submit",async event=>{event.preventDefault();const chosen=file.files?.[0],total=Number(amount.value);if(!chosen||chosen.size<=0||chosen.size>26214400||!Number.isFinite(total)||total<0)return AppCore.ui.toast("Choose a valid invoice file and total.","warning");submit.disabled=true;try{const fileId=globalThis.ATHAR_UUID(),safe=AppCore.utils.sanitizeFilename(chosen.name),storagePath=`${context.agencyId}/${folderId}/${fileId}/${safe}`;const {error:fileError}=await db.from("files").insert({id:fileId,agency_id:context.agencyId,folder_id:folderId,uploaded_by:context.user.id,bucket_name:"project-files",storage_path:storagePath,original_name:chosen.name,mime_type:chosen.type||"application/pdf",size_bytes:chosen.size,client_visible:true});if(fileError)throw fileError;const {error:uploadError}=await db.storage.from("project-files").upload(storagePath,chosen,{contentType:chosen.type||"application/pdf",upsert:false});if(uploadError){await db.from("files").delete().eq("id",fileId);throw uploadError;}const {data:invoice,error:invoiceError}=await db.from("invoices").insert({agency_id:context.agencyId,folder_id:folderId,client_id:client.value,currency:currency.value,status:"draft",issue_date:new Date().toISOString().slice(0,10),tax_rate_bp:0,discount_cents:0,notes:`Uploaded invoice: ${chosen.name}`}).select().single();if(invoiceError)throw invoiceError;const {error:lineError}=await db.from("invoice_line_items").insert({agency_id:context.agencyId,invoice_id:invoice.id,description:`Uploaded invoice — ${chosen.name}`,quantity_milli:1000,unit_price_cents:Math.round(total*100),position:100});if(lineError)throw lineError;AppCore.ui.closeModal();AppCore.ui.toast("Invoice uploaded as a draft.","success");onDone?.();}catch(error){AppCore.ui.toast(AppCore.ui.describeError(error),"error");}finally{submit.disabled=false;}});AppCore.ui.openModal({title:"Upload invoice",content:form,actions:[]});
 });
}
function renderInvoiceRows(host,invoices,clientMap){host.replaceChildren();if(!invoices.length){const empty=el("div","ap-centered-empty");empty.append(icon("invoice"),el("h3","","No invoices yet"),el("p","","Create an invoice when a project is ready to bill."));host.append(empty);return;}const table=el("div","ap-library-table ap-invoice-hub-table");const head=el("div","ap-library-table__row ap-library-table__row--head");["Invoice","Client","Status","Amount","Due",""] .forEach(x=>head.append(el("span","",x)));table.append(head);for(const inv of invoices){const row=el("div","ap-library-table__row");row.append(el("strong","",inv.invoice_number),el("span","ap-library-muted",clientMap.get(inv.client_id)||"Client"),el("span",`ap-badge ap-badge--${inv.status==="paid"?"success":inv.status==="overdue"?"danger":inv.status==="sent"?"info":"neutral"}`,inv.status),el("span","",AppCore.utils.formatMoney(inv.total_cents,inv.currency)),el("span","ap-library-muted",safeDate(inv.due_date)));const open=btn("›","ap-icon-button");open.addEventListener("click",async()=>{if(inv.folder_id){await selectFolder(inv.folder_id,{skipOverview:true});await selectModule("invoices");}});row.append(open);table.append(row);}host.append(table);}
function openInvoiceCreateMenu(_context){const wrap=el("div","ap-create-menu");const one=btn("","ap-create-menu__item");one.append(icon("invoice"),el("div","","One-time Invoice"));one.addEventListener("click",()=>{AppCore.ui.closeModal();chooseFolder("Choose a project",async(folderId)=>{await selectFolder(folderId,{skipOverview:true});await selectModule("invoices");document.dispatchEvent(new CustomEvent("invoice:create-requested"));});});wrap.append(one);AppCore.ui.openModal({title:"Create Invoice",content:wrap,actions:[]});}

export async function renderInbox(panel,context,initialTab="chats"){
  panel.replaceChildren();
  const isPage=panel.id==="module-content"||panel.dataset.page==="true";
  panel.classList.toggle("ap-inbox-page",isPage);
  if(!isPage)panel.classList.add("ap-inbox-panel--open");
  const shell=el("section","ap-inbox-shell");
  const head=el("div","ap-inbox-head");head.append(el("h2","","Inbox"));
  const tools = el("div", "k-inbox-tools");

const filterButton = btn("", "k-inbox-tool");
filterButton.type = "button";
filterButton.title = "Filter";
filterButton.setAttribute("aria-label", "Filter");
filterButton.append(workspaceIcon("filter"));

const moreButton = btn("", "k-inbox-tool");
moreButton.type = "button";
moreButton.title = "More";
moreButton.setAttribute("aria-label", "More options");
moreButton.append(workspaceIcon("more"));

tools.append(
  filterButton,
  moreButton
);

head.append(tools);
shell.append(head);
  const tabs=el("div","ap-inbox-tabs");const body=el("div","ap-inbox-body");
  const labels=[["chats","Chats"],["tasks","Tasks"],["files","Files"],["updates","Updates"]];
  for(const [key,label] of labels){const b=btn(label,"ap-inbox-tab");if(key===initialTab)b.classList.add("ap-inbox-tab--active");b.addEventListener("click",async()=>{tabs.querySelectorAll("button").forEach(x=>x.classList.remove("ap-inbox-tab--active"));b.classList.add("ap-inbox-tab--active");await renderInboxTab(body,context,key);});tabs.append(b);}shell.append(tabs,body);panel.append(shell);await renderInboxTab(body,context,initialTab);
}
async function renderInboxTab(host,context,tab){const preference={chats:'messages',tasks:'tasks',files:'files'}[tab];if(preference&&getState().profile?.notification_preferences?.[preference]===false){host.replaceChildren(el('p','ap-local-notice','These notifications are turned off in your profile.'));return;}AppCore.ui.renderLoading(host,"Loading…");try{let rows=[];if(tab==="chats"){const {data,error}=await db.from("conversations").select("*").eq("agency_id",context.agencyId).is("archived_at",null).is("trashed_at",null).order("last_message_at",{ascending:false,nullsFirst:false}).limit(30);if(error)throw error;rows=(data||[]).map(r=>({title:r.title,sub:"Conversation",date:r.last_message_at||r.created_at,onClick:()=>navigateItem({type:"conversation",id:r.id,folder_id:r.folder_id})}));}else if(tab==="tasks"){const {data,error}=await db.from("tasks").select("*").eq("agency_id",context.agencyId).is("archived_at",null).is("trashed_at",null).order("updated_at",{ascending:false}).limit(30);if(error)throw error;rows=(data||[]).map(r=>({title:r.title,sub:r.completed_at?"Completed task":"Task updated",date:r.updated_at,onClick:()=>navigateItem({type:"task",id:r.id,folder_id:r.folder_id})}));}else if(tab==="files"){const {data,error}=await db.from("files").select("*").eq("agency_id",context.agencyId).order("created_at",{ascending:false}).limit(30);if(error)throw error;rows=(data||[]).map(r=>({title:r.original_name,sub:"File added",date:r.created_at,onClick:()=>navigateItem({type:"file",folder_id:r.folder_id})}));}else{const {data,error}=await db.from("activity_logs").select("*").eq("agency_id",context.agencyId).order("created_at",{ascending:false}).limit(30);if(error)throw error;rows=(data||[]).map(r=>({title:r.action.replaceAll("."," · "),sub:r.entity_type||"Workspace update",date:r.created_at,onClick:null}));}host.replaceChildren();if(!rows.length){const empty=el("div","ap-inbox-empty");empty.append(icon(tab==="chats"?"chat":tab==="tasks"?"task":tab==="files"?"file":"bell"),el("h3","",tab==="chats"?"All quiet in chats.":tab==="tasks"?"No task activity":tab==="files"?"No file activity":"No updates yet"),el("p","",tab==="chats"?"When someone sends you a message, you’ll see it here.":"New activity will show up here."));host.append(empty);return;}for(const row of rows){const item=btn("","ap-inbox-item");const text=el("div");text.append(el("strong","",row.title),el("span","",row.sub),el("small","",AppCore.utils.formatDate(row.date,"relative")));item.append(text);if(row.onClick)item.addEventListener("click",()=>{document.getElementById("inbox-panel")?.classList.remove("ap-inbox-panel--open");row.onClick();});host.append(item);}}catch(error){AppCore.ui.renderError(host,error,()=>renderInboxTab(host,context,tab));}}

const BUILTIN_TEMPLATES=[
  {name:"Client Onboarding",description:"A polished client journey from intake to kickoff.",folders:["01 · Welcome & Contacts","02 · Discovery","03 · Brief & Scope","04 · Kickoff"]},
  {name:"Creative Project",description:"Manage production, approvals and final delivery.",folders:["01 · Brief","02 · Concepts","03 · Production","04 · Client Review","05 · Final Files"]},
  {name:"Website Launch",description:"Plan content, design, development and launch checks.",folders:["01 · Strategy","02 · Content","03 · Design","04 · Development","05 · QA & Launch"]},
  {name:"Marketing Campaign",description:"Run a campaign with clear planning and reporting.",folders:["01 · Strategy","02 · Assets","03 · Approvals","04 · Publishing","05 · Reporting"]},
  {name:"Monthly Retainer",description:"A repeatable workspace for ongoing client work.",folders:["Requests","This Month","Waiting for Client","Completed","Reports"]},
  {name:"Event Production",description:"Coordinate planning, suppliers and event delivery.",folders:["Planning","Venue & Suppliers","Creative Assets","Run of Show","Post Event"]}
];
export function openTemplates(context){const wrap=el("div","ap-template-browser");const intro=el("div","ap-template-browser__intro");intro.append(el("h3","","Professional workspace templates"),el("p","","Start with an organized, numbered folder structure and rename anything for your process."));wrap.append(intro);const grid=el("div","ap-template-grid");for(const template of BUILTIN_TEMPLATES){const card=btn("","ap-template-card");const badge=el("small","ap-template-card__count",`${template.folders.length} sections`);card.append(workspaceIcon("template"),el("strong","",template.name),el("span","",template.description),badge);card.addEventListener("click",()=>openTemplateUse(template,context));grid.append(card);}wrap.append(grid);AppCore.ui.openModal({title:"Templates",content:wrap,actions:[]});}
function openTemplateUse(template,_context){AppCore.ui.closeModal();const form=el("form","ap-stack");const name=el("input","ap-input");name.required=true;name.value=template.name;name.select();const submit=btn("Create from template","ap-btn ap-btn--primary");submit.type="submit";form.append(el("p","ap-muted-text",`This creates ${template.folders.length+1} folders.`),name,submit);form.addEventListener("submit",async e=>{e.preventDefault();submit.disabled=true;try{const root=await createFolder({name:name.value.trim(),color:"#F4B400"});for(const child of template.folders)await createFolder({name:child,parentId:root.id,color:"#F4B400"});AppCore.ui.closeModal();await loadFolders();AppCore.ui.toast("Template created.","success");await selectFolder(root.id);}catch(error){AppCore.ui.toast(AppCore.ui.describeError(error),"error");}finally{submit.disabled=false;}});AppCore.ui.openModal({title:template.name,content:form,actions:[]});}

export function bindViewRefresh(callback){return on("data:changed",()=>callback?.());}

export function renderProfileView(container, context, { onBack, onLogout } = {}) {
  container.replaceChildren();
  const root = el("section", "ap-hub-view ap-profile-view");
  const back = btn("←", "ap-icon-button");
  back.setAttribute("aria-label", "Back to workspace");
  back.addEventListener("click", () => onBack?.());
  const heading = el("div", "ap-profile-view__heading");
  const avatar = el("div", "ap-profile-view__avatar", AppCore.utils.initials(context.profile?.full_name || context.profile?.email || context.user?.email || "U"));
  const identity = el("div");
  identity.append(el("h1", "ap-profile-view__title", context.profile?.full_name || context.profile?.email || context.user?.email || "Profile"));
  identity.append(el("p", "ap-profile-view__meta", context.profile?.email || context.user?.email || ""));
  heading.append(back, avatar, identity);

  const sections = el("div", "ap-profile-view__sections");
  const personal = el("section", "ap-profile-section");
  personal.append(el("h2", "ap-profile-section__title", "Personal Information"));
  personal.append(profileRow("Name", context.profile?.full_name || "Not set"), profileRow("Email", context.profile?.email || context.user?.email || "Not set"), profileRow("Display name", context.profile?.full_name ? `@${context.profile.full_name.toLowerCase().replace(/\\s+/g, "")}` : "Not set"), profileRow("Phone number", "Not set"));
  const localization = el("section", "ap-profile-section");
  localization.append(el("h2", "ap-profile-section__title", "Localization"));
  localization.append(profileRow("Interface Language", "English (United States)"), profileRow("Timezone", "Your local time"), profileRow("Date Format", "Sep 18, 2026 | 12-Hour"), profileRow("First Day of the Week", "Monday"));
  const notifications = el("section", "ap-profile-section");
  notifications.append(el("h2", "ap-profile-section__title", "Notifications"), profileRow("Notifications", "Change your notifications"));
  sections.append(personal, localization, notifications);
  const logout = btn("Log out", "ap-btn ap-btn--ghost ap-profile-view__logout");
  logout.addEventListener("click", () => onLogout?.());
  root.append(heading, sections, logout);
  container.append(root);
}

function profileRow(label, value) {
  const row = el("div", "ap-profile-row");
  row.append(el("span", "ap-profile-row__label", label), el("span", "ap-profile-row__value", value));
  return row;
}
