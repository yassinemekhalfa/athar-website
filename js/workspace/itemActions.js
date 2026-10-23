import { db } from "../dataClient.js";
import { getState } from "../core/state.js";
import { AppCore } from "../core/appCore.js";
import { emit } from "../core/events.js";
import { archiveFolder, createFolder, moveFolder, selectFolder, trashFolder, updateFolder } from "./folders.js";
import { openFolderSharing } from "./folderPermissions.js";
import { openItemSharing } from "./itemSharing.js";
import { openWorkspaceActionMenu } from "./actionMenu.js";
import { moveWorkspaceItem } from "./dragDrop.js";
import { workspaceIcon } from "../views/workspaceIcons.js";
import { uploadBrandAsset } from "./preferences.js";

const TABLES = {
  board: "boards",
  conversation: "conversations",
  doc: "docs",
  embed: "embeds",
  file: "files"
};

const MODULES = {
  board: "boards",
  conversation: "conversation",
  doc: "docs",
  embed: "embeds",
  file: "files"
};

const el = (tag, className = "", text = null) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== null) node.textContent = text;
  return node;
};

function openTextPrompt(title, label, initial, saveLabel, onSave) {
  const form = el("form", "ap-stack");
  const input = el("input", "ap-input");
  input.value = initial || "";
  input.maxLength = 200;
  input.required = true;
  input.setAttribute("aria-label", label);
  const submit = el("button", "ap-btn ap-btn--primary", saveLabel);
  submit.type = "submit";
  form.append(input, submit);
  form.addEventListener("submit", async event => {
    event.preventDefault();
    const value = input.value.trim();
    if (!value) return AppCore.ui.toast(`${label} cannot be empty.`, "warning");
    submit.disabled = true;
    try {
      await onSave(value);
      AppCore.ui.closeModal();
    } catch (error) {
      AppCore.ui.toast(AppCore.ui.describeError(error), "error");
      submit.disabled = false;
    }
  });
  AppCore.ui.openModal({ title, content: form, actions: [] });
  input.focus();
  input.select();
}

function openMovePicker(item) {
  const folders = getState().folders.filter(folder =>
    !folder.system_key && !folder.archived_at && !folder.trashed_at &&
    folder.id !== item.id && folder.id !== item.workspaceFolderId
  );
  const form = el("form", "ap-stack ap-item-move-picker");
  const select = el("select", "ap-input");
  select.setAttribute("aria-label", "Destination folder");
  const root=el("option","","Workspace (no folder)");root.value="";select.append(root);
  const groupByParent = parentId => folders.filter(folder => (folder.parent_id || null) === parentId);
  const addFolder = (folder, depth, visited) => {
    if (visited.has(folder.id)) return;
    const nextVisited = new Set(visited).add(folder.id);
    const option = el("option", "", `${"— ".repeat(depth)}${folder.name}`);
    option.value = folder.id;
    option.selected = folder.id === item.folder_id || folder.id === item.parent_id;
    select.append(option);
    groupByParent(folder.id).forEach(child => addFolder(child, depth + 1, nextVisited));
  };
  groupByParent(null).forEach(folder => addFolder(folder, 0, new Set()));
  const move = el("button", "ap-btn ap-btn--primary", "Move");
  move.type = "submit";
  form.append(select, move);
  form.addEventListener("submit", async event => {
    event.preventDefault();
    if (!select.value) return AppCore.ui.toast("Choose a destination folder.", "warning");
    move.disabled = true;
    try {
      if (item.type === "folder") await moveFolder(item.id, select.value || null);
      else await moveWorkspaceItem({
        type: item.type,
        id: item.id,
        workspaceFolderId: item.workspaceFolderId
      }, select.value || null);
      AppCore.ui.closeModal();
      await item.onDone?.();
    } catch (error) {
      AppCore.ui.toast(AppCore.ui.describeError(error), "error");
      move.disabled = false;
    }
  });
  AppCore.ui.openModal({ title: item.type === "folder" ? "Move folder" : "Move item", content: form, actions: [] });
}

async function fetchResource(item) {
  const { data, error } = await db.from(TABLES[item.type]).select("*").eq("id", item.id).single();
  if (error) throw error;
  return data;
}

function openIconPicker(item, onDone) {
  const choices = [
    { name: "conversation", emoji: "💬" },
    { name: "chat", emoji: "🗨️" },
    { name: "home", emoji: "⌂" },
    { name: "star", emoji: "⭐" },
    { name: "clients", emoji: "👥" },
    { name: "board", emoji: "▦" },
    { name: "document", emoji: "📄" },
    { name: "file", emoji: "📁" },
    { name: "embed", emoji: "🔗" }
  ];
  const grid = el("div", "ap-item-icon-picker");
  for (const { name: iconName, emoji } of choices) {
    const choice = el("button", "ap-item-icon-picker__choice");
    choice.type = "button";
    choice.title = iconName;
    choice.setAttribute("aria-label", iconName);
    choice.append(item.type === "folder" ? document.createTextNode(emoji) : workspaceIcon(iconName));
    choice.addEventListener("click", async () => {
      try {
        if (item.type === "folder") await updateFolder(item.id, { icon_emoji: emoji });
        else {
          const data = await fetchResource(item);
          const customization = { ...(data.customization || {}), icon: iconName, emoji: "" };
          const { error } = await db.from(TABLES[item.type]).update({ customization }).eq("id", item.id);
          if (error) throw error;
          emit("data:changed", { entity: item.type, entityId: item.id, folderId: item.folder_id, action: "updated" });
        }
        AppCore.ui.closeModal();
        await onDone?.();
      } catch (error) {
        AppCore.ui.toast(AppCore.ui.describeError(error), "error");
      }
    });
    grid.append(choice);
  }
  AppCore.ui.openModal({ title: "Customize Icon", content: grid, actions: [] });
}

export function openFolderCoverSettings(item, onDone) {
  const folder = getState().folders.find(entry => entry.id === item.id);
  if (!folder) return AppCore.ui.toast("This folder is no longer available.", "error");
  const form = el("form", "ap-stack ap-folder-cover-form");
  const colorLabel = el("label", "ap-field");
  const colorCaption = el("span", "ap-field__label", "Cover color");
  const color = el("input", "ap-input");
  color.type = "color";
  color.value = /^#[\da-f]{6}$/i.test(folder.color || "") ? folder.color : "#f3f3f3";
  colorLabel.append(colorCaption, color);

  const fileLabel = el("label", "ap-field");
  const fileCaption = el("span", "ap-field__label", "Cover image");
  const file = el("input", "ap-input");
  file.type = "file";
  file.accept = "image/png,image/jpeg,image/webp,image/gif";
  file.setAttribute("aria-label", "Choose a cover image");
  const current = el("img", "ap-folder-cover-preview");
  current.alt = "Folder cover preview";
  let coverImage = folder.cover_image || null;
  const fitLabel = el("label", "ap-field");
  const fitCaption = el("span", "ap-field__label", "Image fit");
  const fit = el("select", "ap-input");
  for (const [value, label] of [["cover", "Fill the entire frame"], ["contain", "Show the full image"]]) {
    const option = el("option", "", label); option.value = value; fit.append(option);
  }
  fit.value = folder.cover_fit === "contain" ? "contain" : "cover";
  fitLabel.append(fitCaption, fit);
  const positionControl = (caption, value, min, max) => {
    const label = el("label", "ap-field");
    const heading = el("span", "ap-field__label", caption);
    const input = el("input", "ap-input");
    input.type = "range"; input.min = String(min); input.max = String(max); input.step = "1"; input.value = String(value);
    label.append(heading, input); return { label, input };
  };
  const horizontal = positionControl("Horizontal position", Number(folder.cover_position_x ?? 50), 0, 100);
  const vertical = positionControl("Vertical position", Number(folder.cover_position_y ?? 50), 0, 100);
  const zoom = positionControl("Zoom", Number(folder.cover_zoom ?? 100), 100, 200);
  const syncPreview = () => {
    current.style.objectFit = fit.value;
    current.style.objectPosition = `${horizontal.input.value}% ${vertical.input.value}%`;
    current.style.transformOrigin = current.style.objectPosition;
    current.style.transform = `scale(${Number(zoom.input.value) / 100})`;
  };
  fit.addEventListener("change", syncPreview);
  for (const control of [horizontal.input, vertical.input, zoom.input]) control.addEventListener("input", syncPreview);
  let selectedFile = null;
  let localPreviewUrl = null;
  const clearLocalPreview = () => {
    if (localPreviewUrl) URL.revokeObjectURL(localPreviewUrl);
    localPreviewUrl = null;
  };
  const previewUrl = value => {
    clearLocalPreview();
    if (!value) {
      current.hidden = true;
      current.removeAttribute("src");
      return;
    }
    try {
      const url = new URL(value, location.origin);
      if (url.protocol !== "https:" && url.origin !== location.origin) throw new Error("Invalid cover image URL.");
      current.src = url.href;
      current.hidden = false;
    } catch {
      current.hidden = true;
      current.removeAttribute("src");
    }
  };
  previewUrl(coverImage);
  syncPreview();
  fileLabel.append(fileCaption, file);
  file.addEventListener("change", () => {
    clearLocalPreview();
    selectedFile = file.files?.[0] || null;
    if (selectedFile) {
      localPreviewUrl = URL.createObjectURL(selectedFile);
      current.src = localPreviewUrl;
      current.hidden = false;
    }
  });

  const clearImage = el("button", "ap-btn ap-btn--secondary", "Remove image");
  clearImage.type = "button";
  clearImage.addEventListener("click", () => {
    selectedFile = null;
    coverImage = null;
    file.value = "";
    previewUrl(null);
  });
  const save = el("button", "ap-btn ap-btn--primary", "Save cover");
  save.type = "submit";
  form.append(colorLabel, fileLabel, current, fitLabel, horizontal.label, vertical.label, zoom.label, clearImage, save);
  form.addEventListener("submit", async event => {
    event.preventDefault();
    save.disabled = true;
    try {
      if (selectedFile) coverImage = await uploadBrandAsset(selectedFile, "folder-covers");
      await updateFolder(folder.id, { color: color.value, cover_image: coverImage, cover_fit: fit.value, cover_position_x: Number(horizontal.input.value), cover_position_y: Number(vertical.input.value), cover_zoom: Number(zoom.input.value) });
      AppCore.ui.closeModal();
      await onDone?.();
      if (document.body.dataset.workspaceView === "folder" && getState().selectedFolderId === folder.id) {
        await selectFolder(folder.id, { force: true });
      }
    } catch (error) {
      AppCore.ui.toast(AppCore.ui.describeError(error), "error");
    } finally {
      save.disabled = false;
    }
  });
  AppCore.ui.openModal({ title: "Customize folder cover", content: form, actions: [] });
}

async function duplicateItem(item, onDone) {
  if (item.type === "folder") {
    const folder = getState().folders.find(entry => entry.id === item.id);
    if (!folder) throw new Error("This folder is no longer available.");
    await createFolder({
      name: `${folder.name} copy`,
      parentId: folder.parent_id || null,
      color: folder.color,
      coverImage: folder.cover_image || null,
      description: folder.description || "",
      privacy: folder.privacy || "private",
      internalRole: folder.internal_role || "viewer",
      clientVisible: Boolean(folder.client_visible)
    });
    AppCore.ui.toast("Folder duplicated.", "success");
    await onDone?.();
    return;
  }

  if (!["board", "conversation", "doc", "embed"].includes(item.type)) {
    throw new Error("This item type cannot be duplicated.");
  }
  const source = await fetchResource(item);
  const values = {
    agency_id: source.agency_id,
    folder_id: source.folder_id,
    title: `${source.title || item.title} copy`,
    description: source.description || null,
    privacy: source.privacy || "private",
    internal_role: source.internal_role || "viewer",
    client_visible: Boolean(source.client_visible),
    created_by: getState().user.id
  };
  if (item.type === "conversation") values.customization = source.customization || {};
  if (item.type === "doc") values.content_html = source.content_html || "";
  if (item.type === "embed") values.url = source.url;
  const { data, error } = await db.from(TABLES[item.type]).insert(values).select("id").single();
  if (error) throw error;
  AppCore.ui.toast("Item duplicated.", "success");
  await onDone?.();
  return data;
}

async function copyItemLink(item) {
  const path=item.type==='folder'?'#/folder/'+item.id:'#/resource/'+item.type+'/'+item.id;
  await navigator.clipboard.writeText(new URL('workspace.html'+path,location.href).href);
  AppCore.ui.toast("Link copied.", "success");
}

async function downloadItem(item) {
  if (item.type !== "file") throw new Error("This item cannot be downloaded from here.");
  const source = item.raw || await fetchResource(item);
  const { data, error } = await db.storage.from(source.bucket_name || "project-files").createSignedUrl(source.storage_path, 60);
  if (error) throw error;
  if (!data?.signedUrl) throw new Error("Could not create a download link.");
  const link = document.createElement("a");
  link.href = data.signedUrl;
  link.download = source.original_name || item.title;
  link.rel = "noopener";
  link.click();
}

async function updateNamedItem(item, title, onDone) {
  if (item.type === "folder") await updateFolder(item.id, { name: title });
  else {
    const column = item.type === "file" ? "original_name" : "title";
    const { error } = await db.from(TABLES[item.type]).update({ [column]: title }).eq("id", item.id);
    if (error) throw error;
    emit("data:changed", { entity: item.type, entityId: item.id, folderId: item.folder_id, action: "updated" });
  }
  AppCore.ui.toast("Name updated.", "success");
  await onDone?.();
}

async function setFavorite(item, onDone) {
  const source = await fetchResource(item);
  const { error } = await db.from(TABLES[item.type]).update({ pinned: !source.pinned }).eq("id", item.id);
  if (error) throw error;
  emit("data:changed", { entity: item.type, entityId: item.id, folderId: item.folder_id, action: "updated" });
  AppCore.ui.toast(source.pinned ? "Removed from Favorites." : "Added to Favorites.", "success");
  await onDone?.();
}

async function setStatus(item, status, onDone) {
  if (item.type === "folder") {
    if (status === "archive") await archiveFolder(item.id);
    else await trashFolder(item.id);
  } else {
    const column = status === "archive" ? "archived_at" : "trashed_at";
    const { error } = await db.from(TABLES[item.type]).update({ [column]: new Date().toISOString() }).eq("id", item.id);
    if (error) throw error;
    emit("data:changed", { entity: item.type, entityId: item.id, folderId: item.folder_id, action: status });
  }
  AppCore.ui.toast(status === "archive" ? "Item archived." : "Item moved to Trash.", "success");
  await onDone?.();
}

export function openWorkspaceItemActions(anchor, item, context, onDone) {
  const normalized = { ...item, onDone };
  const groups = [];
  const primary = [];
  primary.push({
    icon: "edit",
    label: "Rename...",
    run: () => openTextPrompt("Rename item", "Item name", normalized.title || normalized.name, "Save", value => updateNamedItem(normalized, value, onDone))
  });
  if (["folder","board","conversation","doc","embed"].includes(normalized.type)) {
    primary.push({ icon: "palette", label: "Customize Icon...", run: () => openIconPicker(normalized, onDone) });
  }
  if (normalized.type === "folder") {
    primary.push({ icon: "image", label: "Customize Cover...", run: () => openFolderCoverSettings(normalized, onDone) });
  }
  if (["folder", "board", "conversation", "doc", "embed"].includes(normalized.type)) {
    primary.push({ icon: "copy", label: "Duplicate...", run: () => duplicateItem(normalized, onDone) });
  }
  primary.push({ icon: "folder", label: "Move...", run: () => openMovePicker(normalized) });
  if (["conversation","board"].includes(normalized.type)) {
    primary.push({
      icon: "star",
      label: normalized.raw?.pinned || normalized.pinned ? "Remove from Favorites" : "Add to Favorites",
      run: () => setFavorite(normalized, onDone)
    });
  }
  groups.push(primary);

  const secondary = [];
  if (normalized.type === "file" && (context.canDownload||context.isClient)) secondary.push({ icon: "download", label: "Download", run: () => downloadItem(normalized) });
  secondary.push({ icon: "link", label: "Copy Link", run: () => copyItemLink(normalized) });
  if (context.canShare && ["board", "conversation", "doc", "embed", "file"].includes(normalized.type)) {
    secondary.push({ icon: "clients", label: "Share...", run: () => openItemSharing(normalized, context, onDone) });
  } else if (context.canShare && normalized.type === "folder") {
    secondary.push({ icon: "clients", label: "Share...", run: () => openFolderSharing(normalized.id) });
  }
  groups.push(secondary);

  if (normalized.type !== "invoice" && normalized.type !== "task") {
    groups.push([
      { icon: "archive", label: "Archive", run: () => setStatus(normalized, "archive", onDone) },
      { icon: "trash", label: "Move to Trash", danger: true, run: async () => {
        if (!await AppCore.ui.confirm({ title: "Move to Trash?", message: `${normalized.title || normalized.name} will be moved to Trash.`, confirmLabel: "Move to Trash", danger: true })) return;
        await setStatus(normalized, "trash", onDone);
      } }
    ]);
  }
  openWorkspaceActionMenu(anchor, groups);
}
