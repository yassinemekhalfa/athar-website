import {canCreate} from '../core/permissions.js';
import { openResource } from "./resources.js";
import { workspaceIcon } from "../views/workspaceIcons.js";
import { createAccessControl } from "./accessControl.js";
import { getState } from "../core/state.js";
import { selectFolder, createFolder, updateFolder, archiveFolder, trashFolder, moveFolder, reorderFolderRelative } from "./folders.js";
import { AppCore } from "../core/appCore.js";
import { hasWorkspaceDrag, readWorkspaceDrag, startWorkspaceDrag, moveWorkspaceItem } from "./dragDrop.js";
import { openWorkspaceItemActions } from "./itemActions.js?v=folder-icons-1";

const expanded = new Set();
const initializedSelections = new Set();
let searchText='',filterColor='';
export function filterFolderTree(text='',color=''){searchText=text.trim().toLowerCase();filterColor=color;renderFolderTree();}
function matches(folder,seen=new Set()){
 if(seen.has(folder.id))return false;seen.add(folder.id);
 return ((!searchText||folder.name.toLowerCase().includes(searchText))&&(!filterColor||folder.color===filterColor))||childrenOf(folder.id).some(f=>matches(f,seen));
}
function button(text, cls = "") { const b = document.createElement("button"); b.type = "button"; b.className = cls; b.textContent = text; return b; }
function childrenOf(parentId) { return getState().folders.filter((f) => !f.system_key && (f.parent_id || null) === (parentId || null) && !f.archived_at && !f.trashed_at).sort((a,b)=>(a.position-b.position)||a.created_at.localeCompare(b.created_at)); }

export function renderFolderTree() {
  const host = document.getElementById("folder-tree"); if (!host) return; host.replaceChildren();
  const selectedFolderId = getState().selectedFolderId;
  if (selectedFolderId && !initializedSelections.has(selectedFolderId)) { expanded.add(selectedFolderId); initializedSelections.add(selectedFolderId); }
  const folders=getState().folders.filter(f=>!f.system_key&&!f.archived_at&&!f.trashed_at),ids=new Set(folders.map(f=>f.id));
  const roots = folders.filter(f=>!f.client_id&&(!f.parent_id||!ids.has(f.parent_id))&&matches(f)).sort((a,b)=>a.position-b.position);
  if (!roots.length) { const p = document.createElement("p"); p.className = "ap-sidebar-empty"; p.textContent = getState().role === "client" ? "No folders shared yet." : "No folders yet."; host.append(p); return; }
  const ul = document.createElement("ul"); ul.className = "ap-folder-tree"; for (const folder of roots) ul.append(renderNode(folder)); host.append(ul);
}

export function renderNode(folder) {
  const li = document.createElement("li"); li.className = "ap-folder-tree__node"; li.dataset.folderId = folder.id;
  const row = document.createElement("div"); row.className = "ap-folder-tree__row"; if (folder.id === getState().selectedFolderId) row.classList.add("ap-folder-tree__row--active");
  const kids = childrenOf(folder.id).filter(f=>matches(f));
  const resources=(getState().resources||[]).filter(r=>r.folder_id===folder.id&&(!searchText||r.title.toLowerCase().includes(searchText)));
  const hasChildren=kids.length||resources.length;
  const isExpanded = hasChildren && (expanded.has(folder.id) || Boolean(searchText) || Boolean(filterColor));
  const toggle = button("", "ap-folder-tree__toggle");
  if (hasChildren) toggle.append(workspaceIcon(isExpanded ? "chevronDown" : "chevronRight"));
  toggle.disabled = !hasChildren;
  toggle.setAttribute("aria-label", `${isExpanded ? "Collapse" : "Expand"} ${folder.name}`);
  toggle.setAttribute("aria-expanded", String(isExpanded));
  toggle.addEventListener("click", () => { isExpanded ? expanded.delete(folder.id) : expanded.add(folder.id); renderFolderTree(); });
  const folderIcon = document.createElement("span"); folderIcon.className = "ap-folder-mini"; if (folder.avatar_url) { folderIcon.classList.add("ap-folder-mini--image"); const image=document.createElement("img"); image.src=folder.avatar_url; image.alt=""; folderIcon.append(image); } else if (folder.icon_emoji) { folderIcon.classList.add("ap-folder-mini--emoji"); folderIcon.textContent = folder.icon_emoji; } folderIcon.style.setProperty("--folder-color", folder.color || "#F4B400");
  const label = button(folder.name, "ap-folder-tree__label"); label.addEventListener("click", () => { expanded.add(folder.id); selectFolder(folder.id).then(renderFolderTree); }); row.append(toggle, folderIcon, label);
  if (canCreate(getState().role)) {
    row.draggable = true;
    row.addEventListener("dragstart", event => startWorkspaceDrag(event, { type: "folder", id: folder.id }));
    row.addEventListener("dragover", event => { if (!hasWorkspaceDrag(event.dataTransfer)) return; event.preventDefault(); const r = row.getBoundingClientRect(); const y = event.clientY - r.top; row.dataset.dropZone = y < r.height / 3 ? "before" : y > r.height * 2 / 3 ? "after" : "inside"; row.classList.add("is-workspace-drop-target"); });
    row.addEventListener("dragleave", event => { if (!row.contains(event.relatedTarget)) { delete row.dataset.dropZone; row.classList.remove("is-workspace-drop-target"); } });
    row.addEventListener("drop", async event => {
      const moved = readWorkspaceDrag(event.dataTransfer);
      if (!moved) return;
      event.preventDefault();
      event.stopPropagation();
      const zone = row.dataset.dropZone || "inside";
      delete row.dataset.dropZone;
      row.classList.remove("is-workspace-drop-target");
      try {
        if (moved.type === "folder" && zone !== "inside") await reorderFolderRelative(moved.id, folder.id, zone === "before");
        else { await moveWorkspaceItem(moved, folder.id); expanded.add(folder.id); }
        renderFolderTree();
      } catch (err) { AppCore.ui.toast(AppCore.ui.describeError(err), "error"); }
    });
    const menu = button("", "ap-folder-tree__menu"); menu.append(workspaceIcon("more")); menu.setAttribute("aria-label", `Actions for ${folder.name}`); menu.addEventListener("click", event => { event.stopPropagation(); openWorkspaceItemActions(menu, { ...folder, type: "folder", title: folder.name }, AppCore.getModuleContext(), renderFolderTree); }); row.append(menu);
  }
  li.append(row);
  if (isExpanded) {
    const ul = document.createElement("ul");
    ul.className = "ap-folder-tree ap-folder-tree--nested";
    for (const kid of kids) ul.append(renderNode(kid));
    for (const resource of resources) {
      const entry = document.createElement("li");
      entry.className = "ap-folder-tree__resource";
      const b = button(resource.title, "k-resource-link");
      const types = { boards: "board", conversation: "conversation", docs: "doc", files: "file", embeds: "embed" };
      const type = types[resource.module];
      b.draggable = canCreate(getState().role) && Boolean(type);
      b.classList.toggle("is-active", resource.id === getState().selectedResourceId);
      const resourceIcons = { ...types, invoices: "invoice", docs: "document" };
      b.prepend(workspaceIcon(resourceIcons[resource.module] || "file"));
      b.addEventListener("click", event => {
        event.preventDefault();
        event.stopPropagation();
        openResource(resource).catch(error => AppCore.ui.toast(AppCore.ui.describeError(error), "error"));
      });
      if (type) b.addEventListener("dragstart", event => startWorkspaceDrag(event, { type, id: resource.id }));
      entry.append(b);
      if (canCreate(getState().role) && type) {
        const action = button("", "ap-folder-tree__resource-menu");
        action.append(workspaceIcon("more"));
        action.setAttribute("aria-label", `Actions for ${resource.title}`);
        action.addEventListener("click", event => {
          event.stopPropagation();
          openWorkspaceItemActions(action, { ...resource, type }, AppCore.getModuleContext(), renderFolderTree);
        });
        entry.append(action);
      }
      ul.append(entry);
    }
    li.append(ul);
  }
  return li;
}

function openFolderActions(folder) {
  const wrap = document.createElement("form"); wrap.className = "ap-stack";
  const name = document.createElement("input"); name.className = "ap-input"; name.value = folder.name; name.maxLength = 120;
  const color = document.createElement("input"); color.type = "color"; color.value = folder.color;
  const access = createAccessControl({name:"folder-settings-access",privacy:folder.privacy || (folder.client_visible ? "shared" : "internal"),internalRole:folder.internal_role || "viewer"});
  const save = button("Save", "ap-btn ap-btn--primary"); save.addEventListener("click", async (e) => { e.preventDefault(); try { await updateFolder(folder.id, { name: name.value, color: color.value, privacy:access.privacy, internal_role:access.internalRole, client_visible: access.privacy === "shared" }); AppCore.ui.closeModal(); renderFolderTree(); } catch (err) { AppCore.ui.toast(AppCore.ui.describeError(err), "error"); } });
  const add = button("Add subfolder", "ap-btn ap-btn--secondary"); add.addEventListener("click", (e) => { e.preventDefault(); AppCore.ui.closeModal(); openCreateFolder(folder.id); });
  const archive = button("Archive", "ap-btn ap-btn--secondary"); archive.addEventListener("click", async (e) => { e.preventDefault(); if (await AppCore.ui.confirm({ title: "Archive folder?", message: "The folder will move to Library → Archive.", confirmLabel: "Archive", danger: false })) { try { await archiveFolder(folder.id); AppCore.ui.closeModal(); renderFolderTree(); } catch (err) { AppCore.ui.toast(AppCore.ui.describeError(err), "error"); } } });
  const trash = button("Move to Trash", "ap-btn ap-btn--danger"); trash.addEventListener("click", async (e) => { e.preventDefault(); if (await AppCore.ui.confirm({ title: "Move folder to Trash?", message: "It will disappear from the folder list until restored.", confirmLabel: "Move to Trash", danger: true })) { try { await trashFolder(folder.id); AppCore.ui.closeModal(); renderFolderTree(); } catch (err) { AppCore.ui.toast(AppCore.ui.describeError(err), "error"); } } });
  wrap.append(name, color, access.element, save, add, archive, trash); AppCore.ui.openModal({ title: "Folder settings", content: wrap, actions: [] });
}

export function openCreateFolder(parentId = null) {
  const form = document.createElement("form"); form.className = "ap-stack ap-folder-create-form";
  const field = (labelText, control) => {
    const label = document.createElement("label"); label.className = "ap-folder-create-field";
    const caption = document.createElement("span"); caption.className = "ap-folder-create-field__label"; caption.textContent = labelText;
    label.append(caption, control); return label;
  };
  const name = document.createElement("input"); name.className = "ap-input"; name.placeholder = "New folder"; name.value = "New folder"; name.required = true; name.maxLength = 120;
  const description = document.createElement("input"); description.className = "ap-input"; description.placeholder = "Enter description…"; description.maxLength = 500;
  const color = document.createElement("input"); color.type = "color"; color.value = "#F4B400"; color.setAttribute("aria-label", "Folder color");
  const access = createAccessControl({name:"folder-access",privacy:"private",internalRole:"viewer"});
  const colorLabel = document.createElement("label"); colorLabel.className = "ap-folder-color"; colorLabel.append(color, document.createTextNode("Folder color"));
  const submit = button("Save", "ap-btn ap-btn--primary"); submit.type = "submit";
  form.append(field("FOLDER NAME", name), field("DESCRIPTION (optional)", description), colorLabel, access.element, submit);
  form.addEventListener("submit", async (e) => { e.preventDefault(); if (!name.value.trim()) return name.focus(); submit.disabled = true; try { const folder = await createFolder({ name: name.value, description: description.value, privacy:access.privacy, internalRole:access.internalRole, clientVisible: access.privacy === "shared", parentId, color: color.value }); AppCore.ui.closeModal(); if (parentId) expanded.add(parentId); renderFolderTree(); await selectFolder(folder.id); renderFolderTree(); } catch (err) { AppCore.ui.toast(AppCore.ui.describeError(err), "error"); } finally { submit.disabled = false; } });
  AppCore.ui.openModal({ title: parentId ? "New subfolder" : "Create Folder", content: form, actions: [] }); name.focus(); name.select();
}
