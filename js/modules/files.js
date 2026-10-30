import {openItemSharing} from '../workspace/itemSharing.js';
import { db, isSupabaseMode } from "../dataClient.js";
import { AppCore } from "../core/appCore.js";
import { emit, on } from "../core/events.js";

const MAX_UPLOAD_BYTES = 26214400;
const MAX_DRIVE_UPLOAD_BYTES = 5 * 1024 ** 4;
const ALLOWED_EXACT_MIME = new Set([
  "application/pdf",
  "application/zip",
  "application/msword",
  "application/vnd.ms-excel",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation"
]);
const BLOCKED_EXTENSIONS = new Set(["exe", "bat", "sh", "ps1"]);
const BLOCKED_MIME = new Set(["application/x-msdownload", "application/x-sh"]);

const state = {
  container: null,
  context: null,
  files: [],
  canUpload: false,
  offEvents: [],
  filter: ""
};

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined && text !== null) node.textContent = text;
  return node;
}

function button(label, variant = "secondary") {
  const node = el("button", `ap-btn ap-btn--${variant}`, label);
  node.type = "button";
  return node;
}

function extension(name) {
  const dot = String(name || "").lastIndexOf(".");
  return dot >= 0 ? String(name).slice(dot + 1).toLowerCase() : "";
}

function fileKind(file) {
  const mime = String(file.mime_type || "");
  const ext = extension(file.original_name);
  if (mime === "application/pdf" || ext === "pdf") return { label: "PDF", className: "pdf" };
  if (mime.startsWith("image/")) return { label: ext || "IMG", className: "image" };
  if (mime.startsWith("video/")) return { label: ext || "VIDEO", className: "video" };
  if (mime.startsWith("audio/")) return { label: ext || "AUDIO", className: "audio" };
  if (/word|document/.test(mime) || ["doc", "docx"].includes(ext)) return { label: "DOC", className: "document" };
  if (/sheet|excel/.test(mime) || ["xls", "xlsx", "csv"].includes(ext)) return { label: "XLS", className: "sheet" };
  if (/presentation|powerpoint/.test(mime) || ["ppt", "pptx"].includes(ext)) return { label: "PPT", className: "presentation" };
  if (mime.includes("zip") || ext === "zip") return { label: "ZIP", className: "archive" };
  return { label: (ext || "FILE").slice(0, 5).toUpperCase(), className: "generic" };
}

function isAllowedFile(file, maxBytes = MAX_UPLOAD_BYTES) {
  if (!file || file.size <= 0 || file.size > maxBytes) return false;
  if (BLOCKED_EXTENSIONS.has(extension(file.name))) return false;
  if (BLOCKED_MIME.has(file.type)) return false;
  if (isSupabaseMode) return true;
  return file.type.startsWith("image/") || file.type.startsWith("text/") || ALLOWED_EXACT_MIME.has(file.type) || file.type.startsWith("application/vnd.openxmlformats-officedocument.");
}

async function resolveCanUpload() {
  if (!state.context.folderId) return Boolean(state.context.canUpload);
  if (state.context.canUpload) return true;
  try {
    const { data, error } = await db.rpc("can_upload_to_folder", { p_folder: state.context.folderId });
    if (error) throw error;
    return Boolean(data);
  } catch {
    return false;
  }
}

async function loadFiles() {

  const [{ data, error }, canUpload] = await Promise.all([
    db.from("files").select("*").eq("agency_id",state.context.agencyId).eq("folder_id", state.context.folderId||null).order("created_at", { ascending: false }),
    resolveCanUpload()
  ]);
  if (error) throw error;
  state.files = data || [];
  state.canUpload = canUpload;
}

async function loadAndRender() {
  if (!state.container) return;

  AppCore.ui.renderLoading(state.container, "Loading files…");
  try {
    await loadFiles();
    render();
  } catch (error) {
    AppCore.ui.renderError(state.container, error, loadAndRender);
  }
}

function render() {
  const root = el("section", "ap-files");
  root.dataset.module = "files";
  const header = el("div", "ap-files__header");
  const heading = el("div", "ap-files__heading");
  heading.append(el("h2", "ap-files__title", "Files"), el("p", "ap-files__subtitle", state.context.isClient ? "Files shared with you in this folder." : "Upload and share files for this folder."));
  header.append(heading);
  if (state.canUpload) {
    const upload = button("Upload files", "primary");
    upload.addEventListener("click", openUploadModal);
    header.append(upload);
  }
  root.append(header);

  if (!state.files.length) {
    const empty = el("div", "ap-files__empty");
    empty.append(el("h3", "ap-files__empty-title", state.context.isClient ? "No files have been shared with you yet" : "No files yet"));
    if (state.canUpload) {
      const upload = button("Upload files", "primary");
      upload.addEventListener("click", openUploadModal);
      empty.append(upload);
    }
    root.append(empty);
    state.container.replaceChildren(root);
    return;
  }

  const tools = el("div", "ap-files__tools");
  const count = el("span", "ap-files__count", `${state.files.length} file${state.files.length === 1 ? "" : "s"}`);
  const search = el("input", "ap-input ap-files__search");
  search.type = "search";
  search.placeholder = "Search files…";
  search.setAttribute("aria-label", "Search files");
  search.value = state.filter;
  tools.append(count, search);
  const list = el("div", "ap-files__list");
  const showFiles = () => {
    const query = search.value.trim().toLowerCase();
    state.filter = search.value;
    const files = state.files.filter(file => !query || String(file.original_name || "").toLowerCase().includes(query));
    list.replaceChildren(...files.map(renderFile));
    count.textContent = files.length === state.files.length
      ? `${state.files.length} file${state.files.length === 1 ? "" : "s"}`
      : `${files.length} of ${state.files.length} files`;
    if (!files.length) list.append(el("p", "ap-files__no-results", "No files match your search."));
  };
  search.addEventListener("input", showFiles);
  root.append(tools, list);
  showFiles();
  state.container.replaceChildren(root);
}

function renderFile(file) {
  const row = el("article", "ap-file");
  row.dataset.fileId = file.id;
  row.tabIndex = 0;
  row.setAttribute("role", "button");
  row.setAttribute("aria-label", `Preview ${file.original_name}`);
  const kind = fileKind(file);
  const icon = el("div", `ap-file__icon ap-file__icon--${kind.className}`, kind.label);
  const info = el("div", "ap-file__info");
  info.append(el("h3", "ap-file__name", file.original_name));
  const meta = el("div", "ap-file__meta");
  meta.append(el("span", "ap-file__meta-item", AppCore.utils.formatBytes(file.size_bytes)), el("span", "ap-file__meta-item", AppCore.utils.formatDate(file.created_at, "relative")));
  if (file.storage_provider === "google_drive") meta.append(el("span", "ap-file__meta-item ap-file__provider", "Google Drive"));
  if (file.client_visible && state.context.isStaff) meta.append(el("span", "ap-badge ap-badge--info", "Client visible"));
  info.append(meta);
  const actions = el("div", "ap-file__actions");
  const open = button(kind.className === "pdf" ? "Preview PDF" : "Preview", "secondary");
  open.classList.add("ap-btn--sm");
  open.addEventListener("click", () => openFile(file));
  actions.append(open);

  if (state.context.canShare) {
    const share=button('Share','secondary');share.classList.add('ap-btn--sm');share.setAttribute('aria-label','Share '+file.original_name);
    share.addEventListener('click',()=>openItemSharing({id:file.id,type:'file',title:file.original_name},state.context));actions.append(share);
  }

  const canDelete = state.context.canManageAll || state.context.canUpload&&file.uploaded_by === state.context.user.id;
  if (canDelete) {
    const remove = button("Delete", "danger");
    remove.classList.add("ap-btn--sm");
    remove.addEventListener("click", () => deleteFile(file));
    actions.append(remove);
  }
  row.addEventListener("click", event => { if (!event.target.closest("button")) openFile(file); });
  row.addEventListener("keydown", event => { if (event.target === row && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); openFile(file); } });
  row.append(icon, info, actions);
  return row;
}

export function openUploadModal() {
  const content = el("div", "ap-file-upload");
  const fileInput = el("input", "ap-input");
  fileInput.type = "file";
  fileInput.multiple = true;
  fileInput.accept = isSupabaseMode ? "" : "image/*,application/pdf,text/*,application/zip,.doc,.docx,.xls,.xlsx,.ppt,.pptx";
  const chooser = el("label", "ap-field");
  chooser.append(el("span", "ap-field__label", "Choose files"), fileInput, el("span", "ap-field__hint", isSupabaseMode ? "Select one or many files. They will be stored in your connected Google Drive." : "Select one or many files. Each file can be up to 25 MiB."));
  const folderInput = el("input", "ap-input");
  folderInput.type = "file";
  folderInput.multiple = true;
  folderInput.accept = fileInput.accept;
  folderInput.setAttribute("webkitdirectory", "");
  folderInput.setAttribute("directory", "");
  const folderChooser = el("label", "ap-field");
  folderChooser.append(el("span", "ap-field__label", "Choose a folder"), folderInput, el("span", "ap-field__hint", "Uploads every supported file and keeps its relative folder path."));
  const selection = el("p", "ap-file-upload__selection", "No files selected.");
  selection.setAttribute("role", "status");
  const showSelection = input => { const files = [...input.files || []]; selection.textContent = files.length ? `${files.length} file${files.length === 1 ? "" : "s"} selected.` : "No files selected."; };
  fileInput.addEventListener("change", () => { if (fileInput.files?.length) folderInput.value = ""; showSelection(fileInput); });
  folderInput.addEventListener("change", () => { if (folderInput.files?.length) fileInput.value = ""; showSelection(folderInput); });
  content.append(chooser, folderChooser, selection);

  let visible = null;
  if (state.context.canShare) {
    visible = el("input", "ap-checkbox");
    visible.type = "checkbox";
    visible.checked = false;
    const vis = el("label", "ap-file-upload__visibility");
    vis.append(visible, el("span", "ap-file-upload__visibility-label", "Visible to clients"));
    content.append(vis);
  }

  const actions = el("div", "ap-module-form__actions");
  const cancel = button("Cancel", "secondary");
  const upload = button("Upload", "primary");
  cancel.addEventListener("click", () => AppCore.ui.closeModal());
  upload.addEventListener("click", async () => {
    const files = [...(folderInput.files?.length ? folderInput.files : fileInput.files || [])];
    if (!files.length) return fileInput.focus();
    const limit = isSupabaseMode ? MAX_DRIVE_UPLOAD_BYTES : MAX_UPLOAD_BYTES;
    const accepted = files.filter(file => isAllowedFile(file, limit)), rejected = files.length - accepted.length;
    if (!accepted.length) return AppCore.ui.toast(`None of the selected files can be uploaded. Check their type and ${isSupabaseMode ? "available Google Drive storage" : "25 MiB size limit"}.`, "warning");
    upload.disabled = true;
    cancel.disabled = true;
    let completed = 0;
    const failures = [];
    try {
      for (const file of accepted) {
        upload.textContent = `Uploading ${completed + 1} of ${accepted.length}…`;
        selection.textContent = `Uploading ${file.webkitRelativePath || file.name}`;
        try { await uploadFile(file, state.context.isClient ? true : Boolean(visible?.checked), state.context, state.context?.folderId, file.webkitRelativePath || file.name); }
        catch (error) { failures.push({ file, error }); }
        completed += 1;
      }
      await loadAndRender();
      const succeeded = accepted.length - failures.length;
      if (!failures.length) {
        AppCore.ui.closeModal();
        AppCore.ui.toast(`${succeeded} file${succeeded === 1 ? "" : "s"} uploaded${rejected ? `; ${rejected} unsupported file${rejected === 1 ? " was" : "s were"} skipped` : ""}.`, "success");
      } else {
        const firstFailure = failures[0];
        const reason = firstFailure ? AppCore.ui.describeError(firstFailure.error) : `${rejected} unsupported file${rejected === 1 ? "" : "s"}`;
        selection.textContent = `${succeeded} uploaded, ${failures.length + rejected} skipped or failed. ${firstFailure ? `${firstFailure.file.name}: ${reason}` : reason}`;
        AppCore.ui.toast(`${succeeded} uploaded. ${firstFailure ? reason : `${rejected} unsupported file${rejected === 1 ? "" : "s"}.`}`, "warning");
      }
    } catch (error) {
      AppCore.ui.toast(AppCore.ui.describeError(error), "error");
    } finally {
      upload.disabled = false;
      cancel.disabled = false;
      upload.textContent = "Upload";
    }
  });
  actions.append(cancel, upload);
  content.append(actions);
  AppCore.ui.openModal({ title: "Upload files or folder", content, actions: [] });
}

async function uploadFile(file, clientVisible, context = state.context, folderId = context?.folderId, originalName = file.name) {
  if (isSupabaseMode) return uploadGoogleDriveFile(file, clientVisible, context, folderId, originalName);
  const fileId = AppCore.utils.uuid();
  const safeName = AppCore.utils.sanitizeFilename(originalName);
  const storagePath = `${context.agencyId}/${folderId}/${fileId}/${safeName}`;
  const metadata = {
    id: fileId,
    agency_id: context.agencyId,
    folder_id: folderId,
    uploaded_by: context.user.id,
    bucket_name: "project-files",
    storage_path: storagePath,
    original_name: originalName,
    mime_type: file.type,
    size_bytes: file.size,
    client_visible: Boolean(clientVisible), privacy: clientVisible ? "shared" : "private"
  };

  const { error: metadataError } = await db.from("files").insert(metadata);
  if (metadataError) throw metadataError;

  const { error: uploadError } = await db.storage.from("project-files").upload(storagePath, file, {
    cacheControl: "3600",
    upsert: false,
    contentType: file.type
  });
  if (uploadError) {
    await db.from("files").delete().eq("id", fileId);
    throw uploadError;
  }

  emit("data:changed", { entity: "file", entityId: fileId, folderId, action: "created" });
  return fileId;
}

async function driveAction(action, payload = {}, agencyId = state.context?.agencyId) {
  const { data, error } = await db.functions.invoke("google-drive", { body: { action, agency_id: agencyId, ...payload } });
  let message = data?.error || error?.message;
  if (error?.context && typeof error.context.json === "function") {
    try { message = (await error.context.json())?.error || message; } catch { /* use the invocation error */ }
  }
  if (error || data?.error) throw Object.assign(new Error(message || "Google Drive request failed."), { userMessage: true });
  return data?.data;
}

let driveConnected = false;
async function ensureDriveConnection(context = state.context) {
  if (driveConnected) return;
  let status = await driveAction("status", {}, context.agencyId);
  if (!status?.connected) {
    const connection = await driveAction("connect", {}, context.agencyId);
    const popup = window.open(connection.authorization_url, "athar-google-drive", "popup,width=620,height=760");
    if (!popup) throw Object.assign(new Error("Allow popups so Athar can connect Google Drive."), { userMessage: true });
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => { cleanup(); reject(new Error("Google Drive connection timed out.")); }, 10 * 60_000);
      const receive = event => { if (event.source !== popup || event.data?.type !== "athar-google-drive") return; cleanup(); event.data.ok ? resolve() : reject(new Error("Google Drive connection was not completed.")); };
      const cleanup = () => { clearTimeout(timer); window.removeEventListener("message", receive); };
      window.addEventListener("message", receive);
    });
    status = await driveAction("status", {}, context.agencyId);
  }
  if (!status?.connected) throw new Error("Google Drive is not connected.");
  driveConnected = true;
}

async function uploadGoogleDriveFile(file, clientVisible, context, folderId, originalName) {
  await ensureDriveConnection(context);
  const started = await driveAction("start-upload", { folder_id: folderId, name: file.name, relative_path: originalName, mime_type: file.type || "application/octet-stream", size: file.size }, context.agencyId);
  const response = await fetch(started.session_url, { method: "PUT", headers: { "Content-Type": file.type || "application/octet-stream", "Content-Range": `bytes 0-${file.size - 1}/${file.size}` }, body: file });
  if (!response.ok) {
    const detail = await response.text();
    throw Object.assign(new Error(`Google Drive upload failed (${response.status})${detail ? `: ${detail.slice(0, 240)}` : "."}`), { userMessage: true });
  }
  const uploaded = await response.json();
  const record = await driveAction("complete-upload", { folder_id: folderId, record_id: started.record_id, relative_path: started.relative_path, mime_type: file.type || "application/octet-stream", size: file.size, client_visible: clientVisible, file: uploaded }, context.agencyId);
  emit("data:changed", { entity: "file", entityId: record.id, folderId, action: "created" });
  return record.id;
}

export async function uploadFileToFolder(context, folderId, file, clientVisible = false, originalName = file?.webkitRelativePath || file?.name) {
  if (!context?.isStaff) throw new Error("Only workspace members can upload files here.");
  const limit = isSupabaseMode ? MAX_DRIVE_UPLOAD_BYTES : MAX_UPLOAD_BYTES;
  if (!isAllowedFile(file, limit)) throw new Error(file?.size > limit ? `That file is larger than ${isSupabaseMode ? "the Google Drive upload limit" : "25 MiB"}.` : "That file type is not allowed.");
  return uploadFile(file, clientVisible, context, folderId, originalName);
}

async function openFile(file) {
  try {
    let previewUrl;
    let externalUrl;
    if (file.storage_provider === "google_drive" && file.external_file_id) {
      previewUrl = `https://drive.google.com/file/d/${encodeURIComponent(file.external_file_id)}/preview`;
      externalUrl = file.external_url || `https://drive.google.com/file/d/${encodeURIComponent(file.external_file_id)}/view`;
    } else {
      const { data, error } = await db.storage.from("project-files").createSignedUrl(file.storage_path, 60 * 30);
      if (error) throw error;
      previewUrl = externalUrl = data.signedUrl;
    }
    const wrap = el("div", "ap-file-preview");
    const mime = String(file.mime_type || "");
    const isPdf = mime === "application/pdf" || extension(file.original_name) === "pdf";
    const loading = el("div", "ap-file-preview__loading", isPdf ? "Loading PDF…" : "Loading preview…");
    let viewer;
    if (file.storage_provider === "google_drive") {
      viewer = el("iframe", "ap-file-preview__frame");
      viewer.src = previewUrl;
      viewer.title = `Preview of ${file.original_name || "file"}`;
      viewer.allow = "autoplay; fullscreen";
    } else if (mime.startsWith("image/")) {
      viewer = el("img", "ap-file-preview__media");
      viewer.alt = file.original_name || "File preview";
      viewer.src = previewUrl;
    } else if (mime.startsWith("video/")) {
      viewer = el("video", "ap-file-preview__media");
      viewer.src = previewUrl;
      viewer.controls = true;
      viewer.playsInline = true;
    } else if (mime.startsWith("audio/")) {
      viewer = el("audio", "ap-file-preview__audio");
      viewer.src = previewUrl;
      viewer.controls = true;
    } else {
      viewer = el("iframe", "ap-file-preview__frame");
      viewer.src = isPdf && !previewUrl.includes("#") ? `${previewUrl}#view=FitH&toolbar=1&navpanes=0` : previewUrl;
      viewer.title = `Preview of ${file.original_name || "file"}`;
      viewer.allow = "autoplay; fullscreen";
    }
    viewer.addEventListener?.("load", () => loading.remove(), { once: true });
    wrap.append(loading, viewer);
    const openFull = button(file.storage_provider === "google_drive" ? "Open in Google Drive" : "Open in new tab", "primary");
    openFull.addEventListener("click", () => window.open(externalUrl, "_blank", "noopener,noreferrer"));
    const download = button("Download", "secondary");
    download.addEventListener("click", async () => {
      try {
        const downloadUrl = file.storage_provider === "google_drive" && file.external_file_id
          ? `https://drive.google.com/uc?export=download&id=${encodeURIComponent(file.external_file_id)}`
          : externalUrl;
        const link = document.createElement("a");
        link.href = downloadUrl;
        link.download = file.original_name || "download";
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        document.body.append(link);
        link.click();
        link.remove();
      } catch (error) { AppCore.ui.toast(AppCore.ui.describeError(error), "error"); }
    });
    const fullScreen = button("Full screen", "secondary");
    AppCore.ui.openModal({ title: file.original_name || "File preview", content: wrap, actions: [download, fullScreen, openFull] });
    const modal = document.querySelector("#modal-root .ap-modal");
    modal?.classList.add("ap-file-preview-modal", isPdf ? "ap-file-preview-modal--pdf" : "ap-file-preview-modal--media");
    fullScreen.addEventListener("click", async () => {
      if (!modal) return;
      try {
        if (document.fullscreenElement) await document.exitFullscreen();
        else if (modal.requestFullscreen) await modal.requestFullscreen();
        else modal.classList.toggle("is-fullscreen");
      } catch { modal.classList.toggle("is-fullscreen"); }
    });
  } catch (error) {
    AppCore.ui.toast(AppCore.ui.describeError(error), "error");
  }
}

async function deleteFile(file) {
  const confirmed = await AppCore.ui.confirm({ title: "Delete file?", message: `Delete ${file.original_name}? This cannot be undone.`, confirmLabel: "Delete", danger: true });
  if (!confirmed) return;
  try {
    if (file.storage_provider === "google_drive") {
      await driveAction("delete", { file_id: file.id });
      emit("data:changed", { entity: "file", entityId: file.id, folderId: state.context.folderId, action: "deleted" });
      AppCore.ui.toast("File deleted from Google Drive.", "success");
      await loadAndRender();
      return;
    }
    const { error: storageError } = await db.storage.from("project-files").remove([file.storage_path]);
    if (storageError) throw storageError;
    const { error: rowError } = await db.from("files").delete().eq("id", file.id);
    if (rowError) throw rowError;
    emit("data:changed", { entity: "file", entityId: file.id, folderId: state.context.folderId, action: "deleted" });
    AppCore.ui.toast("File deleted.", "success");
    await loadAndRender();
  } catch (error) {
    AppCore.ui.toast(AppCore.ui.describeError(error), "error");
  }
}

const filesModule = {
  name: "files",
  async mount(container, context) {
    state.container = container;
    state.context = context;
    state.offEvents.push(on("app:teardown", () => { state.files = []; }));
    await loadAndRender();
  },
  async unmount() {
    state.offEvents.splice(0).forEach((off) => off?.());
    state.container?.replaceChildren();
    state.container = null;
    state.context = null;
    state.files = [];
    state.canUpload = false;
    state.filter = "";
  },
  async refresh(context) {
    state.context = context;
    await loadAndRender();
  }
};

export default filesModule;
