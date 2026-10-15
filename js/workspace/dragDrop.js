import { getState } from "../core/state.js";
import { emit } from "../core/events.js";
import { moveFolder } from "./folders.js";
import { AppCore } from "../core/appCore.js";
import { db } from "../dataClient.js";

export const WORKSPACE_DRAG_TYPE = "application/x-athar-workspace-item";

const RESOURCE_TABLES = {
  board: "boards",
  conversation: "conversations",
  doc: "docs",
  embed: "embeds",
  file: "files"
};

export function startWorkspaceDrag(event, item) {
  if (!event.dataTransfer) return;
  event.dataTransfer.setData(WORKSPACE_DRAG_TYPE, JSON.stringify({
    type: item.type,
    id: item.id,
    workspaceFolderId: item.workspaceFolderId || null
  }));
  event.dataTransfer.effectAllowed = "move";
}

export function readWorkspaceDrag(dataTransfer) {
  const raw = dataTransfer?.getData(WORKSPACE_DRAG_TYPE);
  if (raw) {
    try {
      const item = JSON.parse(raw);
      if (item && typeof item.id === "string" && ["folder", "client", ...Object.keys(RESOURCE_TABLES)].includes(item.type)) return item;
    } catch (error) {
      console.warn("Ignoring malformed workspace drag data.", error);
    }
  }

  const legacyResource = dataTransfer?.getData("application/x-athar-resource");
  if (legacyResource) {
    try {
      const item = JSON.parse(legacyResource);
      if (item && typeof item.id === "string" && ["board", "conversation", "doc", "embed", "file"].includes(item.type)) return item;
    } catch (error) {
      console.warn("Ignoring malformed legacy workspace drag data.", error);
    }
  }

  const legacyFolderId = dataTransfer?.getData("text/plain");
  return legacyFolderId ? { type: "folder", id: legacyFolderId } : null;
}

export function hasWorkspaceDrag(dataTransfer) {
  return Boolean(dataTransfer?.types?.includes(WORKSPACE_DRAG_TYPE) || dataTransfer?.types?.includes("application/x-athar-resource") || dataTransfer?.types?.includes("text/plain"));
}

export function attachWorkspaceDropTarget(target, folderId, { onDrop } = {}) {
  target.addEventListener("dragover", event => {
    if (!hasWorkspaceDrag(event.dataTransfer)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    target.classList.add("is-workspace-drop-target");
  });
  target.addEventListener("dragleave", event => {
    if (!target.contains(event.relatedTarget)) target.classList.remove("is-workspace-drop-target");
  });
  target.addEventListener("drop", async event => {
    const item = readWorkspaceDrag(event.dataTransfer);
    if (!item) return;
    event.preventDefault();
    event.stopPropagation();
    target.classList.remove("is-workspace-drop-target");
    try {
      await moveWorkspaceItem(item, folderId);
      await onDrop?.(item);
    } catch (error) {
      AppCore.ui.toast(AppCore.ui.describeError(error), "error");
    }
  });
}

export async function moveWorkspaceItem(item, targetFolderId) {
  const state = getState();
  const target = state.folders.find(folder => folder.id === targetFolderId);
  if (targetFolderId && (!target || target.archived_at || target.trashed_at || target.system_key)) throw new Error("Choose an active destination folder.");

  if (item.type === "folder" || item.type === "client") {
    const folderId = item.type === "client" ? item.workspaceFolderId : item.id;
    if (!folderId) throw new Error("This client does not have a workspace folder yet.");
    if (folderId === targetFolderId) return;
    await moveFolder(folderId, targetFolderId);
    emit("data:changed", { entity: item.type, entityId: item.id, folderId: targetFolderId, action: "moved" });
    AppCore.ui.toast(item.type === "client" ? "Client workspace moved." : "Folder moved.", "success");
    return;
  }

  const table = RESOURCE_TABLES[item.type];
  if (!table) throw new Error("This item cannot be moved.");
  const { error } = await db.from(table).update({ folder_id: targetFolderId }).eq("id", item.id);
  if (error) throw error;
  emit("data:changed", { entity: item.type, entityId: item.id, folderId: targetFolderId, action: "moved" });
  AppCore.ui.toast("Item moved.", "success");
}
