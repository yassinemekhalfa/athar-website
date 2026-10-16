import {roleBadge} from '../core/permissions.js';
import {db} from '../dataClient.js';
import { AppCore } from "../core/appCore.js";
import { on, emit } from "../core/events.js";
import { subscribeChannel, unsubscribeByPrefix } from "../core/realtime.js";
import { listConversations, createConversation, updateConversation } from "../conversations/conversations.js";
import { listMessages, sendMessage, deleteMessage, attachFileToMessage } from "../conversations/messages.js";
import { signedAttachmentUrl, openImageReview, openVideoReview } from "../conversations/mediaReview.js";
import { workspaceIcon } from "../views/workspaceIcons.js";
import { createAccessControl } from "../workspace/accessControl.js";
import { openItemSharing } from "../workspace/itemSharing.js";

const state = { container:null, context:null, conversations:[], activeId:null, messages:[], off:[], replyTo:null, timer:null,tab:"messages",filter:"all",customizing:false,iconPicker:false,actionMenu:false,requestVersion:0,sending:false };
const drafts=new Map();
function draftFor(id){const key=`draft:${state.context.user.id}:${id}`;if(!drafts.has(key)){let saved={};try{saved=JSON.parse(sessionStorage.getItem(key)||"{}");}catch{}drafts.set(key,{body:saved.body||"",shared:saved.shared!==false,file:null});}return {key,value:drafts.get(key)};}
const el = (tag, cls, text) => {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text != null) node.textContent = text;
  return node;
};

function initials(value = "") {
  return value.trim().split(/\s+/).slice(0, 2).map(word => word[0]).join("").toUpperCase() || "?";
}

function relativeTime(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const delta = Date.now() - date.getTime();
  if (delta < 60 * 1000) return "Now";
  if (delta < 60 * 60 * 1000) return `${Math.floor(delta / 60000)}m`;
  if (delta < 24 * 60 * 60 * 1000) return `${Math.floor(delta / 3600000)}h`;
  if (delta < 7 * 24 * 60 * 60 * 1000) return `${Math.floor(delta / 86400000)}d`;
  return date.toLocaleDateString(undefined, { month:"short", day:"numeric" });
}

function currentConversation() {
  return state.conversations.find(conversation => conversation.id === state.activeId) || null;
}

const customizationFor=conversation=>({icon:"conversation",emoji:"",icon_color:"#f5b900",icon_background:"#f1f1f1",empty_title:"No messages yet",empty_subtitle:"Start the conversation anytime",attachment_comments:true,clients_can_invite:false,...(conversation?.customization||{})});
async function saveCustomization(conversation,patch){await updateConversation(conversation.id,{customization:{...customizationFor(conversation),...patch}});await load();}

function openConversationSharing(conversation){
  return openItemSharing({id:conversation.id,title:conversation.title,type:'conversation'},state.context,load);
}

function renderIconPicker(conversation){
  const config=customizationFor(conversation),picker=el("div","k-conversation-icon-picker");const head=el("div","k-popover-title");head.append(el("strong","","Icon"));const close=el("button","","×");close.type="button";close.setAttribute("aria-label","Close icon picker");close.addEventListener("click",()=>{state.iconPicker=false;render();});head.append(close);picker.append(head,el("h4","","Icon"));
  const icons=el("div","k-icon-picker-grid");for(const name of ["search","home","user","settings","check","info","close","checkCircle","trash","more","clients","plus","link","star","doc","logout"]){const button=el("button",config.icon===name?"is-active":"");button.type="button";button.title=name;button.append(workspaceIcon(name));button.addEventListener("click",()=>saveCustomization(conversation,{icon:name,emoji:""}).catch(error=>AppCore.ui.toast(AppCore.ui.describeError(error),"error")));icons.append(button);}picker.append(icons,el("h4","","Emoji"));
  const emojis=el("div","k-emoji-icon-grid");for(const emoji of ["💯","🔢","😀","😃","😄","😁","😆","😅","🤣","😂","🙂","🙃","🐣","😉","😊","😇","🥰","😍","🤩"]){const button=el("button",config.emoji===emoji?"is-active":"",emoji);button.type="button";button.addEventListener("click",()=>saveCustomization(conversation,{emoji}).catch(error=>AppCore.ui.toast(AppCore.ui.describeError(error),"error")));emojis.append(button);}picker.append(emojis,el("h4","","Image"));const upload=el("button","ap-btn ap-btn--secondary","↑ Upload...");upload.type="button";upload.addEventListener("click",()=>AppCore.ui.toast("Choose an icon or emoji for this conversation.","success"));picker.append(upload,el("small","","Add from URL, or paste from clipboard. Square images work best."));return picker;
}

function renderCustomizeDrawer(conversation){
  const config=customizationFor(conversation),drawer=el("aside","k-conversation-customize");const head=el("div","k-customize-head");head.append(el("h2","","Customize"));const close=el("button","","×");close.type="button";close.setAttribute("aria-label","Close customization");close.addEventListener("click",()=>{state.customizing=false;state.iconPicker=false;render();});head.append(close);drawer.append(head,el("h3","","Appearance"));
  const row=(iconName,title,subtitle,action)=>{const item=el("button","k-customize-row");item.type="button";item.append(workspaceIcon(iconName),el("span","",title),el("small","",subtitle),workspaceIcon("edit"));item.addEventListener("click",action);return item;};
  drawer.append(row(config.icon,"Messages",`${config.icon_color}, ${config.icon_background}`,()=>{state.iconPicker=!state.iconPicker;render();}),row("circle","Empty State",config.empty_title,()=>openEmptyStateEditor(conversation)));
  drawer.append(el("h3","","Settings"),row("clients","User Actions",config.attachment_comments?"Attachment Comments +1 more":"User actions restricted",()=>saveCustomization(conversation,{attachment_comments:!config.attachment_comments}).catch(error=>AppCore.ui.toast(AppCore.ui.describeError(error),"error"))),row("user","Client Settings",config.clients_can_invite?"Clients can see and invite others":"Clients cannot invite others",()=>saveCustomization(conversation,{clients_can_invite:!config.clients_can_invite}).catch(error=>AppCore.ui.toast(AppCore.ui.describeError(error),"error"))));return drawer;
}

function openEmptyStateEditor(conversation){const config=customizationFor(conversation),form=el("form","ap-stack"),title=el("input","ap-input"),subtitle=el("input","ap-input"),save=el("button","ap-btn ap-btn--primary","Save");title.value=config.empty_title;subtitle.value=config.empty_subtitle;title.setAttribute("aria-label","Empty state title");subtitle.setAttribute("aria-label","Empty state subtitle");save.type="submit";form.append(title,subtitle,save);form.addEventListener("submit",async event=>{event.preventDefault();await saveCustomization(conversation,{empty_title:title.value.trim()||"No messages yet",empty_subtitle:subtitle.value.trim()});AppCore.ui.closeModal();});AppCore.ui.openModal({title:"Empty State",content:form,actions:[]});}

function renderActionMenu(conversation){const menu=el("div","k-conversation-action-menu");const item=(iconName,label,action,danger=false)=>{const button=el("button",danger?"is-danger":"");button.type="button";button.append(workspaceIcon(iconName),el("span","",label));button.addEventListener("click",async()=>{state.actionMenu=false;try{await action();}catch(error){AppCore.ui.toast(AppCore.ui.describeError(error),"error");}});menu.append(button);};
 item("edit","Rename...",()=>openSettings(conversation));item("palette","Customize Icon...",()=>{state.customizing=true;state.iconPicker=true;render();});item("folder","Move...",()=>openMoveConversation(conversation));item("copy","Duplicate...",async()=>{const {data,error}=await db.from("conversations").insert({agency_id:conversation.agency_id,folder_id:conversation.folder_id,title:`${conversation.title} copy`,description:conversation.description,privacy:conversation.privacy,internal_role:conversation.internal_role,client_visible:conversation.client_visible,customization:conversation.customization,created_by:state.context.user.id}).select().single();if(error)throw error;state.activeId=data.id;await load();});item("star",conversation.pinned?"Remove from Favorites":"Add to Favorites",async()=>{await updateConversation(conversation.id,{pinned:!conversation.pinned});await load();});item("link","Copy Link",async()=>{await navigator.clipboard.writeText(new URL(`client-view.html#/resource/conversation/${conversation.id}`,location.href).href);AppCore.ui.toast("Conversation link copied.","success");});item("clients","Share...",()=>openConversationSharing(conversation));item("archive","Archive",async()=>{await updateConversation(conversation.id,{archived_at:new Date().toISOString()});state.activeId=null;await load();});item("trash","Move to Trash",async()=>{await updateConversation(conversation.id,{trashed_at:new Date().toISOString()});state.activeId=null;await load();},true);return menu;}

function openMoveConversation(conversation){const form=el("form","ap-stack"),select=el("select","ap-select"),save=el("button","ap-btn ap-btn--primary","Move");for(const folder of AppCore.getFolders().filter(folder=>!folder.system_key&&!folder.archived_at&&!folder.trashed_at)){const option=el("option","",folder.name);option.value=folder.id;option.selected=folder.id===conversation.folder_id;select.append(option);}select.setAttribute("aria-label","Destination folder");save.type="submit";form.append(select,save);form.addEventListener("submit",async event=>{event.preventDefault();await updateConversation(conversation.id,{folder_id:select.value});AppCore.ui.closeModal();await AppCore.selectFolder(select.value,{skipOverview:true,refreshModule:false});await AppCore.selectModule("conversation",conversation.id);});AppCore.ui.openModal({title:"Move conversation",content:form,actions:[]});}

async function load() {
  const version=++state.requestVersion,context=state.context;if(!context||!state.container)return;

  if(!state.container.querySelector('.k-chat-page'))AppCore.ui.renderLoading(state.container, "Loading conversations...");
  try {
    const conversations=await listConversations(context.folderId);if(version!==state.requestVersion||context!==state.context)return;state.conversations=conversations;
    const requestedId = state.context.resourceId;
    const activeExists = state.conversations.some(conversation => conversation.id === state.activeId);
    const requestedExists = requestedId && state.conversations.some(conversation => conversation.id === requestedId);
    if (!activeExists) state.activeId = requestedExists ? requestedId : state.conversations[0]?.id || null;
    await loadMessages();
    if(version!==state.requestVersion||context!==state.context)return;
    render();
    subscribe();
  } catch (error) {
    if(state.container&&context===state.context)AppCore.ui.renderError(state.container, error, load);
  }
}

async function loadMessages(){const id=state.activeId,context=state.context;if(!context)return;const rows=id?await listMessages(id):[];if(state.context!==context||state.activeId!==id)return;state.messages=rows;const access=id?await db.rpc('resource_capabilities',{p_type:'conversations',p_id:id}):{data:null};if(access.error)throw access.error;state.access=access.data;if(rows.length){const {error}=await db.from('message_reads').upsert(rows.map(m=>({message_id:m.id,profile_id:context.user.id})),{onConflict:'message_id,profile_id',ignoreDuplicates:true});if(error)console.warn('Unable to save read receipts',error.code);}}

function subscribe() {
  unsubscribeByPrefix("messages:conversation:");
  unsubscribeByPrefix("conversations:folder:");
  if (state.activeId) subscribeChannel(`messages:conversation:${state.activeId}`, channel => channel.on(
    "postgres_changes", { event:"*", schema:"public", table:"messages", filter:`conversation_id=eq.${state.activeId}` }, () => schedule()
  ));
  if (state.context.folderId) subscribeChannel(`conversations:folder:${state.context.folderId}`, channel => channel.on(
    "postgres_changes", { event:"*", schema:"public", table:"conversations", filter:`folder_id=eq.${state.context.folderId}` }, () => schedule()
  ));
}

function schedule() {
  clearTimeout(state.timer);
  state.timer = setTimeout(() => load().catch(console.error), 120);
}

function renderThread(conversation) {
  const active = conversation.id === state.activeId;
  const title = conversation.title || "Untitled conversation";
  const button = el("button", `k-conversation-thread${active ? " k-conversation-thread--active" : ""}`);
  button.type = "button";
  button.setAttribute("aria-current", active ? "page" : "false");
  const avatar = el("span", "k-conversation-thread__avatar", initials(title));
  const copy = el("span", "k-conversation-thread__copy");
  const heading = el("span", "k-conversation-thread__heading");
  heading.append(el("strong", "", title));
  heading.append(el("time", "", relativeTime(conversation.last_message_at || conversation.created_at)));
  copy.append(heading, el("span", "k-conversation-thread__preview", conversation.client_visible ? "Shared with client" : "Internal conversation"));
  button.append(avatar, copy);
  button.addEventListener("click", async () => {
    state.activeId = conversation.id;
    state.replyTo = null;
    await loadMessages();
    subscribe();
    render();
  });
  return button;
}

function renderFilesView() {
  const root = el("div", "k-chat-files-tab");
  const files = state.messages.flatMap(message => message.attachments || []);
  if (!files.length) { root.append(el("div", "k-chat-files-empty", "No files yet")); return root; }
  const grid = el("div", "k-chat-files-grid");
  files.forEach(attachment => {
    const card = el("button", "k-chat-file-card"); card.type = "button";
    card.append(workspaceIcon("file"), el("span", "", attachment.original_name || "Attachment"));
    card.addEventListener("click", async () => { try { window.open(await signedAttachmentUrl(attachment.storage_path), "_blank", "noopener,noreferrer"); } catch (error) { AppCore.ui.toast(AppCore.ui.describeError(error), "error"); } });
    grid.append(card);
  });
  root.append(grid); return root;
}

function render() {
  if(!state.container||!state.context)return;
  const previousFeed=state.container.querySelector(".k-chat-feed");const previousTop=previousFeed?.scrollTop||0;const nearBottom=!previousFeed||previousFeed.scrollHeight-previousFeed.scrollTop-previousFeed.clientHeight<80;
  const focus=state.container.contains(document.activeElement)&&document.activeElement.matches("textarea");const caret=focus?document.activeElement.selectionStart:0;
  const root = el("section", "k-chat-page");
  if(state.customizing)root.classList.add("is-customizing");
  root.dataset.module = "conversation";
  const current = currentConversation();
  if (!current) {
    const empty = el("div", "k-chat-no-conversation");
    empty.append(el("div", "k-chat-empty__icon", ""), el("h2", "", state.context.isClient ? "No conversation shared yet" : "No conversation yet"), el("p", "", state.context.isClient ? "When your team shares a conversation, it will appear here." : "Create a conversation to start messaging."));
    if (state.context.canCreate) { const create = el("button", "k-chat-empty__button", "New Conversation"); create.addEventListener("click", openCreateConversation); empty.append(create); }
    root.append(empty); state.container.replaceChildren(root); return;
  }
  const header = el("header", "k-chat-page-header");
  const config=customizationFor(current);
  const left = el("div", "k-chat-page-header__left"); const iconHost = el("span", "k-chat-page-header__icon"); iconHost.append(workspaceIcon("conversation"));
  iconHost.replaceChildren(config.emoji?el("span","k-chat-custom-emoji",config.emoji):workspaceIcon(config.icon));iconHost.style.color=config.icon_color;iconHost.style.background=config.icon_background;iconHost.addEventListener("click",()=>{if(state.context.canCreate){state.iconPicker=!state.iconPicker;render();}});
  const select = el("select", "k-chat-conversation-select"); select.setAttribute("aria-label", "Select conversation");
  state.conversations.forEach(conversation => { const option = el("option", "", conversation.title || "Conversation"); option.value = conversation.id; option.selected = conversation.id === current.id; select.append(option); });
  select.addEventListener("change", async () => { state.activeId = select.value; state.replyTo = null; state.tab = "messages"; await loadMessages(); subscribe(); render(); });
  left.append(iconHost, select);
  if(state.context.canCreate){const favorite=el("button",`k-chat-header-button k-chat-favorite${current.pinned?" is-active":""}`);favorite.type="button";favorite.title=current.pinned?"Unpin conversation":"Pin conversation";favorite.append(workspaceIcon("star"));favorite.addEventListener("click",async()=>{favorite.disabled=true;try{await updateConversation(current.id,{pinned:!current.pinned});await load();}catch(error){AppCore.ui.toast(AppCore.ui.describeError(error),"error");favorite.disabled=false;}});left.append(favorite);}
  const right = el("div", "k-chat-page-header__right");
  const filter=el("button","k-chat-header-button");filter.type="button";filter.title=`Message filter: ${state.filter}`;filter.append(workspaceIcon("filter"));filter.addEventListener("click",()=>{state.filter=state.filter==="all"?"shared":state.filter==="shared"?"internal":"all";render();AppCore.ui.toast(`Showing ${state.filter} messages.`,"success");});right.append(filter);
  if (state.context.canManageAll || current.created_by===state.context.user.id&&state.context.canCreate) { const customize = el("button", `k-chat-header-button${state.customizing?" is-active":""}`); customize.title="Customize conversation";customize.append(workspaceIcon("palette")); customize.addEventListener("click", () => {state.customizing=!state.customizing;state.actionMenu=false;render();}); right.append(customize);const settings = el("button", `k-chat-header-button${state.actionMenu?" is-active":""}`); settings.title="More options";settings.append(workspaceIcon("more")); settings.addEventListener("click", () => {state.actionMenu=!state.actionMenu;render();}); right.append(settings);if(state.actionMenu)right.append(renderActionMenu(current)); }
  right.append(el("span", "k-chat-header-avatar", initials(state.context.profile?.full_name || state.context.user?.email || "U")));
  if (state.context.canShare) { const share = el("button", `k-chat-share-button${current.client_visible?" is-shared":""}`);share.type="button";share.setAttribute("aria-label","Share conversation"); share.append(workspaceIcon("share"), document.createTextNode("Share")); share.addEventListener("click",()=>openConversationSharing(current)); right.append(share); }
  header.append(left, right); root.append(header);
  const tabs = el("div", "k-chat-tabs"); [["messages", "Messages"], ["files", "Files"]].forEach(([key, label]) => { const tab = el("button", `k-chat-tab${state.tab === key ? " is-active" : ""}`, label); tab.type = "button"; tab.addEventListener("click", () => { state.tab = key; render(); }); tabs.append(tab); }); root.append(tabs);
  if (state.tab === "files") { root.append(renderFilesView()); } else { const workspace = el("div", "k-chat-workspace"); const feed = el("div", "k-chat-feed");const shown=state.messages.filter(message=>state.filter==="all"||state.filter==="shared"&&message.client_visible||state.filter==="internal"&&!message.client_visible); if (!shown.length) {const empty=el("div","k-chat-empty");const emptyIcon=el("span","k-chat-empty__icon");emptyIcon.style.color=config.icon_color;emptyIcon.style.background=config.icon_background;emptyIcon.append(config.emoji?el("span","k-chat-empty__emoji",config.emoji):workspaceIcon(config.icon));empty.append(emptyIcon,el("h2","",state.messages.length?"No matching messages":config.empty_title),el("p","",state.messages.length?"Change the message filter to see more.":config.empty_subtitle));if(!state.messages.length&&(state.context.canComment&&state.access?.comment!==false)){const actions=el("div","k-chat-empty__actions");const write=el("button","ap-btn ap-btn--primary","Write a Message");write.type="button";write.prepend(workspaceIcon("conversation"));write.addEventListener("click",()=>root.querySelector("textarea")?.focus());actions.append(write);if(state.context.canShare){const invite=el("button","ap-btn ap-btn--dark","Invite Users");invite.type="button";invite.prepend(workspaceIcon("clients"));invite.addEventListener("click",()=>openConversationSharing(current));actions.append(invite);}empty.append(actions);}feed.append(empty);} else shown.forEach(message => feed.append(renderMessage(message))); workspace.append(feed, renderComposer(current)); root.append(workspace); requestAnimationFrame(() => { feed.scrollTop = nearBottom?feed.scrollHeight:previousTop; }); }
  if(state.iconPicker)root.append(renderIconPicker(current));if(state.customizing)root.append(renderCustomizeDrawer(current));
  state.container.replaceChildren(root);
  if(focus){const input=root.querySelector("textarea");input?.focus({preventScroll:true});input?.setSelectionRange(caret,caret);}
}

function renderMessage(message) {
  const mine = message.sender_id === state.context.user.id;
  const senderName = message.sender?.full_name || message.sender?.email || "Member";
  const card = el("article", `ap-message k-message${mine ? " ap-message--mine k-message--mine" : ""}${!message.client_visible ? " ap-message--internal k-message--internal" : ""}`);
  const avatar = el("span", "k-message__avatar", initials(senderName));
  const content = el("div", "k-message__content");
  const meta = el("div", "ap-message__meta k-message__meta");
  meta.append(el("strong", "", senderName),roleBadge(message.sender_role||"member"), el("span", "", AppCore.utils.formatDate(message.created_at, "relative")));
  if (!message.client_visible && state.context.isStaff) meta.append(el("span", "k-message__internal-label", "Internal"));
  const body = el("p", "ap-message__body", message.body || "");
  if (!message.body) body.hidden = true;
  const attachments = el("div", "k-message-attachments");
  (message.attachments || []).forEach(attachment => {
    const box = el("div", "k-message-attachment");
    const mime = attachment.mime_type || "";
    if(mime.startsWith("audio/")){const audio=document.createElement("audio");audio.controls=true;signedAttachmentUrl(attachment.storage_path).then(url=>audio.src=url).catch(()=>{});box.append(audio);}
    if (mime.startsWith("image/")) {
      const image = document.createElement("img"); image.alt = attachment.original_name; image.loading = "lazy";
      signedAttachmentUrl(attachment.storage_path).then(url => image.src = url).catch(() => {});
      image.addEventListener("click", () => openImageReview(attachment).catch(error => AppCore.ui.toast(AppCore.ui.describeError(error), "error")));
      box.append(image);
    } else if (mime.startsWith("video/")) {
      const video = document.createElement("video"); video.controls = true; video.preload = "metadata"; video.playsInline = true;
      signedAttachmentUrl(attachment.storage_path).then(url => video.src = url).catch(() => {});
      box.append(video);
    }
    const bar = el("div", "k-message-attachment__bar");
    const download=el("button","",attachment.original_name);download.type="button";download.addEventListener("click",async()=>{try{window.open(await signedAttachmentUrl(attachment.storage_path),"_blank","noopener");}catch(e){AppCore.ui.toast(AppCore.ui.describeError(e),"error");}});bar.append(download);
    if (mime.startsWith("image/") || mime.startsWith("video/")) { const review = el("button", "", mime.startsWith("video/") ? "Review video" : "Review & comment"); review.type="button"; review.addEventListener("click",()=> (mime.startsWith("video/") ? openVideoReview(attachment) : openImageReview(attachment)).catch(error=>AppCore.ui.toast(AppCore.ui.describeError(error),"error"))); bar.append(review); }
    box.append(bar); attachments.append(box);
  });
  const actions = el("div", "ap-message__actions k-message__actions");
  const reply = el("button", "", "Reply");
  reply.type = "button";
  reply.addEventListener("click", () => { state.replyTo = message.reply_to_message_id || message.id; render(); });
  actions.append(reply);
  if (mine || state.context.isOwner) {
    const remove = el("button", "", "Delete");
    remove.type = "button";
    remove.addEventListener("click", async () => {
      if (!await AppCore.ui.confirm({ title:"Delete message?", message:"This cannot be undone.", confirmLabel:"Delete", danger:true })) return;
      try {
        await deleteMessage(message.id);
        await loadMessages();
        render();
      } catch (error) {
        AppCore.ui.toast(AppCore.ui.describeError(error), "error");
      }
    });
    actions.append(remove);
  }
  content.append(meta);const parent=state.messages.find(m=>m.id===message.reply_to_message_id);if(parent)content.append(el('blockquote','k-reply-quote',((parent.sender?.full_name||'Member')+': '+(parent.body||'Attachment')).slice(0,180)));content.append(body);
  if ((message.attachments || []).length) content.append(attachments);
  content.append(actions);
  card.append(avatar, content);
  return card;
}

function renderComposer(current) {
  if(!(state.context.canComment&&state.access?.comment!==false)){const notice=el('p','ap-soft-empty','You have read-only access to this conversation.');return notice;}
  const draft=draftFor(current.id);const saveDraft=()=>{try{sessionStorage.setItem(draft.key,JSON.stringify({body:draft.value.body,shared:draft.value.shared}));}catch{/* The in-memory draft remains available. */}};
  const form = el("form", "ap-message-composer k-message-composer");
  if (state.replyTo) {
    const replyBar = el("div", "ap-replying k-message-replying");
    replyBar.append(el("span", "", "Replying to a message"));
    const cancel = el("button", "", "Cancel");
    cancel.type = "button";
    cancel.addEventListener("click", () => { state.replyTo = null; render(); });
    replyBar.append(cancel);
    form.append(replyBar);
  }
  const textarea = el("textarea", "ap-textarea");
  textarea.placeholder = "Write a message...";textarea.value=draft.value.body;textarea.addEventListener("input",()=>{draft.value.body=textarea.value;saveDraft();});
  textarea.required = false;
  textarea.maxLength = 20000;
  textarea.setAttribute("aria-label", "Write a message");
  textarea.addEventListener("keydown", event => {
    if (event.key === "Enter" && !event.shiftKey && !event.isComposing && !matchMedia("(pointer: coarse)").matches) {
      event.preventDefault();
      form.requestSubmit();
    }
  });
  const fileInput = document.createElement("input"); fileInput.type="file"; fileInput.accept="image/*,video/*,audio/*,application/pdf,.zip,.doc,.docx,.xls,.xlsx"; fileInput.hidden=true;
  const chosen=el('button','k-message-file-preview');chosen.type='button';chosen.title='Remove attachment';const showChosen=()=>{chosen.textContent=draft.value.file?'× '+draft.value.file.name:'';chosen.hidden=!draft.value.file;};chosen.addEventListener('click',()=>{draft.value.file=null;fileInput.value='';showChosen();});showChosen();
  fileInput.setAttribute('aria-label','Attach file');fileInput.addEventListener('change',()=>{const file=fileInput.files?.[0];if(file&&file.size>26214400){AppCore.ui.toast('Choose a file smaller than 25 MB.','warning');fileInput.value='';return;}draft.value.file=file||null;showChosen();});
  const bottom = el("div", "ap-message-composer__bottom k-message-composer__bottom");
  const details = el("div", "k-message-composer__details");
  let visible = null;
  if (state.context.isStaff) {
    const label = el("label", "ap-checkbox-label k-message-visibility-control");
    visible = document.createElement("input");
    visible.type = "checkbox";
    visible.checked = draft.value.shared;
    label.append(visible, document.createTextNode(" Share with client"));
    label.hidden=true;details.append(label);
    form.classList.toggle("is-note",!draft.value.shared);const tabs=el("div","k-composer-tabs");for(const [text,isReply] of [["Reply",true],["Note",false]]){const b=el("button",isReply===draft.value.shared?"is-active":"",text);b.type="button";b.addEventListener("click",()=>{visible.checked=isReply;draft.value.shared=isReply;saveDraft();tabs.querySelectorAll("button").forEach(x=>x.classList.toggle("is-active",x===b));form.classList.toggle("is-note",!isReply);});tabs.append(b);}form.prepend(tabs);
  }
  const attach = el("button", "k-message-attach-btn"); attach.type="button"; attach.title="Attach file"; attach.append(workspaceIcon("paperclip")); attach.addEventListener("click",()=>fileInput.click()); attach.hidden=state.access?.upload===false;details.append(attach, chosen, el("span", "k-message-shortcut", "Enter to send · Shift+Enter for a new line"));
  const emoji=el("button","k-composer-tool","☺");emoji.type="button";emoji.setAttribute("aria-label","Insert emoji");emoji.addEventListener("click",()=>{form.querySelector(".k-emoji-picker")?.remove();const picker=el("div","k-emoji-picker");for(const value of ["😀","👍","🎉","❤️","✅","🙏","👀","🚀","💬","📌","🙌","😊"]){const b=el("button","",value);b.type="button";b.addEventListener("click",()=>{textarea.setRangeText(value,textarea.selectionStart,textarea.selectionEnd,"end");draft.value.body=textarea.value;saveDraft();picker.remove();textarea.focus();});picker.append(b);}form.append(picker);});details.append(emoji);
  const send = el("button", "ap-btn ap-btn--primary k-message-send", "Send");
  send.type = "submit";
  bottom.append(send, details);
  form.append(fileInput, textarea, bottom);
  form.addEventListener('submit',async event=>{
    event.preventDefault();if(state.sending)return;const body=textarea.value.trim(),file=draft.value.file;if(!body&&!file)return;state.sending=true;send.disabled=true;textarea.disabled=true;
    try{const context=state.context;const created=await sendMessage({conversationId:current.id,body,clientVisible:context.isClient?true:draft.value.shared,replyToMessageId:state.replyTo});
      if(file){try{await attachFileToMessage({message:created,file});}catch(error){await deleteMessage(created.id);throw error;}}
      draft.value.body='';draft.value.file=null;sessionStorage.removeItem(draft.key);state.replyTo=null;
      if(state.context===context){await loadMessages();render();}emit('data:changed',{entity:'message',entityId:created.id,folderId:context.folderId,action:'created'});
    }catch(error){AppCore.ui.toast(AppCore.ui.describeError(error),'error');}finally{state.sending=false;send.disabled=false;textarea.disabled=false;}
  });
  return form;
}

export function openCreateConversation(options = {}) {
  const context = options.context || state.context;
  if (!context?.folderId) { AppCore.ui.toast("Create or choose a folder first.", "warning"); return; }
  const form = el("form", "ap-stack ap-resource-create-form");
  const title = el("input", "ap-input");
  title.placeholder = "New Conversation";title.maxLength=120;title.setAttribute("aria-label","Conversation title");
  title.required = true;
  const titleField=el("label","ap-resource-create-field");titleField.append(el("span","ap-resource-create-field__label","CONVERSATION NAME"),title);
  const description=el("textarea","ap-textarea");description.rows=2;description.maxLength=500;description.placeholder="Enter description…";description.setAttribute("aria-label","Description (optional)");
  const descriptionField=el("label","ap-resource-create-field");descriptionField.append(el("span","ap-resource-create-field__label","DESCRIPTION (optional)"),description,el("small","","Displayed in folder view"));
  const access=createAccessControl({name:"conversation-access",privacy:"private",internalRole:"viewer"});
  const save = el("button", "ap-btn ap-btn--primary", "Create");
  save.type = "submit";
  form.append(titleField,descriptionField,access.element,save);
  form.addEventListener("submit", async event => {
    event.preventDefault();
    try {
      const conversation = await createConversation({ folderId:context.folderId, title:title.value, description:description.value, privacy:access.privacy, internalRole:access.internalRole, clientVisible:access.privacy==="shared" });
      AppCore.ui.closeModal();
      AppCore.ui.toast("Conversation created.", "success");
      emit("data:changed", { entity:"conversation", entityId:conversation.id, folderId:context.folderId, action:"created" });
      if (options.onDone) await options.onDone(conversation);
      else { state.activeId = conversation.id; await load(); }
    } catch (error) {
      AppCore.ui.toast(AppCore.ui.describeError(error), "error");
    }
  });
  AppCore.ui.openModal({ title:"Create Conversation", content:form, actions:[] });
  title.focus();title.select();
}

function openSettings(conversation) {
  const form = el("form", "ap-stack");
  const title = el("input", "ap-input");
  title.value = conversation.title;title.required=true;title.maxLength=120;title.setAttribute("aria-label","Conversation title");
  const access = createAccessControl({name:"conversation-settings-access",privacy:conversation.privacy || (conversation.client_visible?"shared":"internal"),internalRole:conversation.internal_role || "viewer"});
  const save = el("button", "ap-btn ap-btn--primary", "Save");
  save.type = "submit";
  const archive = el("button", "ap-btn ap-btn--danger", "Archive");
  archive.type = "button";
  archive.addEventListener("click", async () => {
    try {
      await updateConversation(conversation.id, { archived_at:new Date().toISOString() });
      AppCore.ui.closeModal();
      state.activeId = null;
      await load();
    } catch (error) {
      AppCore.ui.toast(AppCore.ui.describeError(error), "error");
    }
  });
  form.append(title, access.element, save, archive);
  form.addEventListener("submit", async event => {
    event.preventDefault();
    try {
      await updateConversation(conversation.id, { title:title.value.trim(), client_visible:access.privacy === "shared", privacy:access.privacy, internal_role:access.internalRole });
      AppCore.ui.closeModal();
      await load();
    } catch (error) {
      AppCore.ui.toast(AppCore.ui.describeError(error), "error");
    }
  });
  AppCore.ui.openModal({ title:"Conversation settings", content:form, actions:[] });
}

const module = {
  name:"conversation",
  async mount(container, context) {
    state.container = container;
    state.context = context;state.tab="messages";state.replyTo=null;
    state.activeId = context.resourceId || null;
    state.off = [on("folder:selected", () => {})];
    await load();
  },
  async unmount() {
    state.requestVersion++;state.context=null;
    state.off.forEach(off => off());
    state.off = [];
    unsubscribeByPrefix("messages:conversation:");
    unsubscribeByPrefix("conversations:folder:");
    clearTimeout(state.timer);
    state.container?.replaceChildren();
    state.container = null;state.activeId=null;state.messages=[];
  },
  async refresh(context) {
    state.context = context;
    state.activeId = context.resourceId || state.activeId || null;
    await load();
  }
};

export default module;
