import {openItemSharing} from '../workspace/itemSharing.js';
import {openWorkspaceItemActions} from '../workspace/itemActions.js';
import {openWorkspaceActionMenu} from '../workspace/actionMenu.js';
import {createTaskColorControl,applyTaskColor,taskColorValue} from './taskAppearance.js';
import { uploadBrandAsset } from "../workspace/preferences.js";
import { db } from "../dataClient.js";
import { workspaceIcon } from "../views/workspaceIcons.js";
import { createAccessControl } from "../workspace/accessControl.js";
import { AppCore } from "../core/appCore.js";
import { emit, on } from "../core/events.js";
import { subscribeChannel, unsubscribeByPrefix } from "../core/realtime.js";
import {
  POSITION_STEP,
  sortByPosition,
  nextPosition,
  insertionPosition,
  needsRenormalize,
  fetchAssignableProfiles,
  fetchProfilesByIds,
  createTask,
  updateTask,
  deleteTask,
  moveTask,
  fetchTaskComments,
  createTaskComment,
  deleteTaskComment,
  profileLabel,
  priorityLabel
} from "./tasks.js";

const state = {
  container: null,
  context: null,
  view: "kanban",
  taskFilter: "all",
  calendarCursor: new Date(),
  boards: [],
  boardId: null,
  columns: [],
  tasks: [],
  profiles: new Map(),
  assignees: [],
  draggedTaskId: null,
  draggedColumnId: null,
  offEvents: [],
  refreshTimer: null,
  refreshPending: false,
  inlineTaskSubmissions: new Set(),
  inlineTaskDrafts: new Map()
};

function el(tag, className, ...children) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  node.append(...children.filter(child=>child!==undefined&&child!==null));
  return node;
}

function button(label, variant = "secondary") {
  const node = el("button", `ap-btn ap-btn--${variant}`, label);
  node.type = "button";
  return node;
}

function field(labelText, control, hint) {
  if(control.matches("input,select,textarea")&&!control.hasAttribute("aria-label"))control.setAttribute("aria-label",labelText);
  const wrapper = el("label", "ap-field");
  wrapper.append(el("span", "ap-field__label", labelText), control);
  if (hint) wrapper.append(el("span", "ap-field__hint", hint));
  return wrapper;
}

function input(value = "", type = "text") {
  const node = el("input", "ap-input");
  node.type = type;
  node.value = value ?? "";
  return node;
}

function textarea(value = "") {
  const node = el("textarea", "ap-textarea");
  node.value = value ?? "";
  node.rows = 4;
  return node;
}

function selectControl(options, value) {
  const node = el("select", "ap-select");
  for (const option of options) {
    const item = document.createElement("option");
    item.value = option.value ?? "";
    item.textContent = option.label;
    item.selected = String(item.value) === String(value ?? "");
    node.append(item);
  }
  return node;
}

function checkboxControl(checked = false) {
  const node = el("input", "ap-checkbox");
  node.type = "checkbox";
  node.checked = Boolean(checked);
  return node;
}

function currentBoard() {
  return state.boards.find((board) => board.id === state.boardId) || null;
}

const COLUMN_WIDTH_MIN=260;
const COLUMN_WIDTH_MAX=720;
const clampColumnWidth=value=>Math.min(COLUMN_WIDTH_MAX,Math.max(COLUMN_WIDTH_MIN,Math.round(Number(value)||408)));
function savedColumnWidth(columnId){const value=currentBoard()?.customization?.columnWidths?.[columnId];return Number.isFinite(Number(value))?clampColumnWidth(value):null;}
async function saveColumnWidth(columnId,width){
  const board=currentBoard();if(!board)return;
  const customization={...(board.customization||{})},columnWidths={...(board.customization?.columnWidths||{})};
  if(width===null)delete columnWidths[columnId];else columnWidths[columnId]=clampColumnWidth(width);
  customization.columnWidths=columnWidths;board.customization=customization;
  const {error}=await db.from('boards').update({customization}).eq('id',board.id);if(error)throw error;
}

function taskMatchesFilter(task) {
  if (state.taskFilter === "active") return !task.completed_at;
  if (state.taskFilter === "completed") return Boolean(task.completed_at);
  return true;
}

function filteredTasks() {
  return state.tasks.filter(taskMatchesFilter);
}

function tasksInColumn(columnId) {
  return sortByPosition(filteredTasks().filter(task => task.column_id === columnId));
}

function scheduleRealtimeRefresh() {
  clearTimeout(state.refreshTimer);
  state.refreshTimer = setTimeout(() => {
    if (!state.container?.isConnected) return;
    if (document.activeElement?.matches(".k-inline-task .ap-input") || state.inlineTaskSubmissions.size) {
      state.refreshPending = true;
      return;
    }
    state.refreshPending = false;
    loadActiveBoard().catch(showError);
  }, 120);
}

function showError(error) {
  if (!state.container) return;
  AppCore.ui.renderError(state.container, error, () => loadFolder());
}

async function loadBoards() {
  const context=state.context;
  let query=db.from('boards').select('*').eq('agency_id',state.context.agencyId).is('archived_at',null).is('trashed_at',null).order('position');
  if(state.context.resourceId)query=query.eq('id',state.context.resourceId);
  else query=state.context.folderId?query.eq('folder_id',state.context.folderId):query.is('folder_id',null);
  const {data,error}=await query;if(state.context!==context)return;if(error)throw error;state.boards=data||[];
  if(!state.boards.some(board=>board.id===state.boardId))state.boardId=state.boards[0]?.id||null;
}

async function loadActiveBoard() {
  const context=state.context,boardId=state.boardId;
  if(!context)return;
  unsubscribeByPrefix("tasks:board:");
  unsubscribeByPrefix("columns:board:");

  if (!state.boardId) {
    state.columns = [];
    state.tasks = [];
    state.profiles = new Map();
    render();
    return;
  }

  // The scheduled database job handles deadlines even when nobody is online.
  // Running the same idempotent operation here removes the scheduler's
  // one-minute delay as soon as somebody opens a board.
  await db.rpc("complete_expired_board_tasks");

  const [{ data: columns, error: columnsError }, { data: tasks, error: tasksError }] = await Promise.all([
    db.from("board_columns").select("*").eq("board_id", state.boardId).order("position", { ascending: true }).order("created_at", { ascending: true }),
    db.from("tasks").select("*").eq("board_id", state.boardId).is("archived_at",null).is("trashed_at",null).order("position", { ascending: true }).order("created_at", { ascending: true })
  ]);
  if(state.context!==context||state.boardId!==boardId)return;
  if (columnsError) throw columnsError;
  if (tasksError) throw tasksError;

  state.columns = columns || [];
  state.tasks = tasks || [];
  const profiles = await fetchProfilesByIds(state.tasks.map((task) => task.assignee_id));
  const assignees = context.canCreate ? await fetchAssignableProfiles(context.agencyId) : [];
  if(state.context!==context||state.boardId!==boardId)return;
  state.profiles=profiles;state.assignees=assignees;

  subscribeChannel(`tasks:board:${state.boardId}`, (channel) =>
    channel.on("postgres_changes", { event: "*", schema: "public", table: "tasks", filter: `board_id=eq.${state.boardId}` }, scheduleRealtimeRefresh)
  );
  subscribeChannel(`columns:board:${state.boardId}`, (channel) =>
    channel.on("postgres_changes", { event: "*", schema: "public", table: "board_columns", filter: `board_id=eq.${state.boardId}` }, scheduleRealtimeRefresh)
  );

  render();
}

async function loadFolder() {
  if (!state.container) return;
  AppCore.ui.renderLoading(state.container, "Loading board…");
  const context=state.context;
  await loadBoards();
  if(state.context!==context)return;
  await loadActiveBoard();
}

function boardIconButton(iconName, title) {
  const node = el("button", "k-board-icon-btn");
  node.type = "button";
  node.title = title;
  node.setAttribute("aria-label", title);
  node.append(workspaceIcon(iconName));
  return node;
}

function renderBoardHeader(board) {
  const header = el("header", "k-board-header");
  const top = el("div", "k-board-header__main");
  const left = el("div", "k-board-header__left");
  const titleIcon = el("span", "k-board-title-icon"); titleIcon.append(board.customization?.emoji ? el("span","",board.customization.emoji) : workspaceIcon(board.customization?.icon||"board"));
  left.append(titleIcon, el("h1", "k-board-title", board.title || "Board"));
  const favorite=boardIconButton('star','Favorite');favorite.classList.toggle('is-active',Boolean(board.pinned));favorite.addEventListener('click',async()=>{try{const {error}=await db.from('boards').update({pinned:!board.pinned}).eq('id',board.id);if(error)throw error;await loadFolder();}catch(error){AppCore.ui.toast(AppCore.ui.describeError(error),'error');}});if(state.context.canCreate)left.append(favorite);
  const right = el("div", "k-board-header__right");
  const filter = el("details", "k-board-menu"); const filterSummary = el("summary", "k-board-icon-btn"); filterSummary.append(workspaceIcon("filter")); filter.append(filterSummary); const filterPanel = el("div", "k-board-menu__panel"); [["all", "All tasks"], ["active", "Active tasks"], ["completed", "Completed"]].forEach(([value, label]) => { const item = el("button", `k-board-menu__item${state.taskFilter === value ? " is-active" : ""}`, label); item.type = "button"; item.addEventListener("click", () => { state.taskFilter = value; filter.open = false; render(); }); filterPanel.append(item); }); filter.append(filterPanel);
  filterSummary.setAttribute('aria-label','Filter tasks');right.append(filter);
  if(state.context.canCreate){const customize=boardIconButton('palette','Customize board');customize.addEventListener('click',()=>openBoardCustomization(board));right.append(customize);const menu=boardIconButton('more','Board actions');menu.addEventListener('click',()=>openWorkspaceItemActions(menu,{id:board.id,type:'board',title:board.title,raw:board},state.context,loadFolder));right.append(menu);}
  right.append(el('span','k-board-avatar',AppCore.utils.initials(state.context.profile?.full_name||state.context.user?.email||'U')));
  if(state.context.canShare){const share=el('button','k-board-share');share.type='button';share.setAttribute('aria-label','Share board');share.append(workspaceIcon('lock'),el('span','','Share'));share.addEventListener('click',()=>openItemSharing({id:board.id,type:'board',title:board.title},state.context,loadFolder));right.append(share);}
  top.append(left, right);
  const tabs = el("nav", "k-board-tabs"); [["kanban", "Board"], ["table", "Table"], ["calendar", "Calendar"]].forEach(([value, label]) => { const tab = el("button", `k-board-tab${state.view === value ? " is-active" : ""}`, label); tab.type = "button"; tab.addEventListener("click", () => { state.view = value; render(); }); tabs.append(tab); });
  header.append(top, tabs); return header;
}

function openBoardCustomization(board){
  const form=el('form','ap-stack'),config=board.customization||{};
  const emoji=input(config.emoji||'');emoji.maxLength=8;emoji.placeholder='Optional emoji';
  const icon=selectControl(['board','folder','star','checkCircle','calendar','briefcase','conversation'].map(value=>({value,label:value})),config.icon||'board');
  const labels=input((config.labels||[]).join(', '));labels.placeholder='Design, Review, Approved';
  const density=selectControl([{value:'comfortable',label:'Comfortable'},{value:'compact',label:'Compact'}],config.density||'comfortable');
  form.append(field('Board icon',icon),field('Emoji',emoji),field('Labels',labels,'Separate label names with commas. Labels remain editable on every task.'),field('Card spacing',density));
  const settings=button('Board settings');settings.addEventListener('click',()=>openBoardForm(board));const add=button('Add section');add.addEventListener('click',()=>openColumnForm());form.append(settings,add);
  const save=button('Save customization','primary');save.type='submit';form.append(save);
  form.addEventListener('submit',async event=>{event.preventDefault();save.disabled=true;try{const customization={...config,icon:icon.value,emoji:emoji.value.trim(),labels:[...new Set(labels.value.split(',').map(x=>x.trim()).filter(Boolean))],density:density.value};const {error}=await db.from('boards').update({customization}).eq('id',board.id);if(error)throw error;AppCore.ui.closeModal();await loadFolder();}catch(error){AppCore.ui.toast(AppCore.ui.describeError(error),'error');}finally{save.disabled=false;}});
  AppCore.ui.openModal({title:'Customize board',content:form,actions:[]});
}

function renderTaskTable() {
  const wrapper = el("div", "k-board-table-wrap"); const table = el("div", "k-board-table");
  const header = el("div", "k-board-table-row k-board-table-row--head"); ["#", "Name", "List", "Label", "Members", "Due Date", "Priority"].forEach(label => header.append(el("span", "", label))); table.append(header);
  const columns = new Map(state.columns.map(column => [column.id, column]));
  sortByPosition(filteredTasks()).forEach((task, index) => { const row = el("button", "k-board-table-row"); row.type = "button"; const profile = state.profiles.get(task.assignee_id); const name = el("span", "k-board-table-name"); name.append(el("strong", "", task.title)); if (task.description) name.append(el("small", "", task.description)); [String(index + 1), null, columns.get(task.column_id)?.name || "—", task.details?.label || "—", profile ? profileLabel(profile) : "—", task.due_date || "—", priorityLabel(task.priority)].forEach((value, columnIndex) => row.append(columnIndex === 1 ? name : el("span", "", value))); row.addEventListener("click", () => openTaskDetail(task)); table.append(row); });
  if (state.context.canCreate && state.columns.length) { const form = el("form", "k-board-table-add"); const plus = el("span", ""); plus.append(workspaceIcon("plus")); const title = input(); title.placeholder = "Add new item..."; form.append(plus, title); form.addEventListener("submit", async event => { event.preventDefault(); const value = title.value.trim(); if (!value) return; title.disabled = true; try { const column = sortByPosition(state.columns)[0]; await createTask({ context: state.context, boardId: state.boardId, columnId: column.id, title: value, clientVisible: currentBoard()?.client_visible, siblings: tasksInColumn(column.id) }); title.value = ""; await loadActiveBoard(); } catch (error) { AppCore.ui.toast(AppCore.ui.describeError(error), "error"); } finally { title.disabled = false; } }); table.append(form); }
  wrapper.append(table); return wrapper;
}

function dateKey(date) { return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join("-"); }
function taskDateKey(task) { return task.due_date ? String(task.due_date).slice(0, 10) : null; }
function changeCalendarMonth(offset) { const next = new Date(state.calendarCursor); next.setDate(1); next.setMonth(next.getMonth() + offset); state.calendarCursor = next; render(); }
function renderBoardCalendar() {
  const root = el("div", "k-board-calendar"); const toolbar = el("div", "k-board-calendar__toolbar"); const month = el("div", "k-board-calendar__month"); const previous = boardIconButton("chevronLeft", "Previous month"); const next = boardIconButton("chevronRight", "Next month"); const label = el("strong", "", state.calendarCursor.toLocaleDateString(undefined, { month: "long", year: "numeric" })); previous.addEventListener("click", () => changeCalendarMonth(-1)); next.addEventListener("click", () => changeCalendarMonth(1)); month.append(previous, label, next); const today = el("button", "k-board-calendar__today", "Today"); today.type = "button"; today.addEventListener("click", () => { state.calendarCursor = new Date(); render(); }); toolbar.append(month, today); root.append(toolbar);
  const weekdays = el("div", "k-board-calendar__weekdays"); ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].forEach(day => weekdays.append(el("span", "", day))); root.append(weekdays);
  const year = state.calendarCursor.getFullYear(); const monthIndex = state.calendarCursor.getMonth(); const first = new Date(year, monthIndex, 1); const start = new Date(year, monthIndex, 1 - ((first.getDay() + 6) % 7)); const grid = el("div", "k-board-calendar__grid"); const todayKey = dateKey(new Date());
  for (let index = 0; index < 42; index += 1) { const date = new Date(start); date.setDate(start.getDate() + index); const cell = el("div", "k-board-calendar__cell"); if (date.getMonth() !== monthIndex) cell.classList.add("is-outside"); const number = el("span", "k-board-calendar__number", String(date.getDate())); if (dateKey(date) === todayKey) number.classList.add("is-today"); cell.append(number); filteredTasks().filter(task => taskDateKey(task) === dateKey(date)).forEach(task => { const item = el("button", "k-board-calendar__task", task.title); item.type = "button"; applyTaskColor(item,task);if (task.completed_at) item.classList.add("is-completed"); item.addEventListener("click", event => {event.stopPropagation();openTaskDetail(task);}); cell.append(item); }); if(state.context.canCreate&&state.columns.length){cell.tabIndex=0;cell.setAttribute("aria-label","Create task on "+dateKey(date));const create=()=>openTaskForm(sortByPosition(state.columns)[0].id,dateKey(date));cell.addEventListener("click",create);cell.addEventListener("keydown",event=>{if(event.target===cell&&["Enter"," "].includes(event.key)){event.preventDefault();create();}});}grid.append(cell); }
  root.append(grid); return root;
}

function render() {
  if (!state.container) return;
  state.container.replaceChildren();
  const root = el("section", "ap-board k-board-page"); root.dataset.module = "boards";
  if (!state.boards.length) { const empty = el("div", "k-board-empty"); empty.append(workspaceIcon("board"), el("h2", "", state.context.isClient ? "No board shared yet" : "No boards yet"), el("p", "", state.context.isClient ? "Shared boards will appear here." : "Create your first board to start organizing work.")); if (state.context.canCreate) { const create = button("Create Board", "primary"); create.addEventListener("click", () => openBoardForm()); empty.append(create); } root.append(empty); state.container.append(root); return; }
  const board = currentBoard(); if (!board) return;
  root.dataset.density=board.customization?.density||"comfortable";root.append(renderBoardHeader(board)); const content = el("div", "k-board-content");
  if (state.view === "kanban") { const canvas = el("div", "k-board-canvas ap-board__canvas"); sortByPosition(state.columns).forEach(column => canvas.append(renderColumn(column))); if (state.context.canCreate) { const add = el("button", "k-board-add-column"); add.type = "button"; add.title = "Add section"; add.append(workspaceIcon("plus")); add.addEventListener("click", () => openColumnForm()); canvas.append(add); } content.append(canvas); }
  else if (state.view === "table") content.append(renderTaskTable());
  else content.append(renderBoardCalendar());
  root.append(content); state.container.append(root);
}

function renderColumn(column) {
  const columnNode = el("section", "ap-board-column");
  columnNode.style.setProperty("--column-color", column.color || "#e2e5ea");
  columnNode.style.setProperty("--column-background", /^#[\da-f]{6}$/i.test(column.background_color || "") ? column.background_color : "#f7f7f7");
  columnNode.dataset.columnId = column.id;
  columnNode.dataset.module = "boards";
  const storedWidth=savedColumnWidth(column.id);if(storedWidth)columnNode.style.setProperty('--board-column-width',`${storedWidth}px`);
  if (state.context.canCreate) {
    columnNode.draggable = true;
    columnNode.addEventListener("dragstart", (event) => {
      if (event.target.closest(".ap-task-card,.k-board-column-resizer")){event.preventDefault();return;}
      state.draggedColumnId = column.id;
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", `column:${column.id}`);
      columnNode.classList.add("ap-board-column--dragging");
    });
    columnNode.addEventListener("dragend", () => {
      state.draggedColumnId = null;
      columnNode.classList.remove("ap-board-column--dragging");
    });
    columnNode.addEventListener("dragover", (event) => {
      if (state.draggedColumnId) event.preventDefault();
    });
    columnNode.addEventListener("drop", (event) => {
      if (!state.draggedColumnId || event.target.closest(".ap-task-card")) return;
      event.preventDefault();
      reorderColumn(state.draggedColumnId, column.id, event.clientX > columnNode.getBoundingClientRect().left + columnNode.getBoundingClientRect().width / 2).catch((error) => AppCore.ui.toast(AppCore.ui.describeError(error), "error"));
    });
  }

  const header = el("div", "ap-board-column__header");
  const titleWrap = el("div", "ap-board-column__title-wrap");
  const dot = el("span", "ap-dot");
  dot.style.backgroundColor = column.color;
  dot.setAttribute("aria-hidden", "true");
  titleWrap.append(dot, el("h3", "ap-board-column__title", column.name));
  if ((column.validation_minutes > 0 || column.validation_hours > 0) && column.validation_due_at) {
    const due = new Date(column.validation_due_at);
    const deadline = el("span", "ap-board-column__deadline", due <= new Date() ? "Completing…" : `Auto-completes ${due.toLocaleString()}`);
    deadline.title = `Timer started ${new Date(column.validation_started_at || column.created_at).toLocaleString()}`;
    titleWrap.append(deadline);
  }
  header.append(titleWrap);
  const count = tasksInColumn(column.id).length;
  if (count) header.append(el("span", "k-board-column-count", String(count)));

  if (state.context.canCreate) {
    const actions = el("div", "ap-board-column__actions");
    const more = boardIconButton("more", `Actions for ${column.name}`);
    more.classList.add("k-board-column__more");
    more.addEventListener("click", event => {
      event.stopPropagation();
      const tasks = state.tasks.filter(task => task.column_id === column.id);
      openWorkspaceActionMenu(more, [
        [{ label: "Edit Title...", icon: "edit", run: () => openColumnForm(column) },
         { label: "Add Multiple Tasks...", icon: "plus", run: () => openBulkTaskForm(column) }],
        [{ label: "Duplicate", icon: "copy", run: () => boardItemAction("duplicate_column", column) },
         { label: "Duplicate to Board...", icon: "copy", run: () => openBoardDestination("duplicate_column", column) }],
        [{ label: "Move All Tasks to List", icon: "arrowRight", disabled: !tasks.length, children: [state.columns.filter(target => target.id !== column.id).map(target => ({
          label: target.name, icon: "list", run: () => boardItemAction("move_tasks", tasks[0], state.boardId, target.id, tasks.map(task => task.id))
        }))] }],
        [{ label: "List color", colors: boardColors, value: column.background_color || "none", run: async color => {
          const {error} = await db.from("board_columns").update({background_color:color}).eq("id",column.id);
          if(error) throw error; await loadActiveBoard();
        }}],
        [{ label: "Change Tasks Color...", icon: "palette", disabled: !tasks.length, run: () => openColumnTaskColorForm(column) }],
        [{ label: "Copy Link", icon: "link", run: () => copyBoardLink() }],
        [{ label: "Archive All Tasks", icon: "archive", disabled: !tasks.length, run: () => archiveColumnTasks(column) },
         { label: "Remove", icon: "trash", danger: true, run: () => deleteColumn(column) }]
      ], {className:"ap-board-action-menu"});
    });
    actions.append(more);
    header.append(actions);
  }

  const list = el("div", "ap-board-column__tasks");
  list.dataset.columnId = column.id;
  list.addEventListener("dragover", (event) => {
    if (state.draggedTaskId) {
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
    }
  });
  list.addEventListener("drop", (event) => handleTaskDrop(event, column.id));

  const tasks = tasksInColumn(column.id);
  for (const task of tasks) list.append(renderTaskCard(task));
  if (state.context.canCreate) {
    const quick = el("form", "k-inline-task");
    const title = input(state.inlineTaskDrafts.get(column.id) || "");
    title.placeholder = "Create";
    title.setAttribute("aria-label", `Add task to ${column.name}`);
    title.addEventListener("input", () => state.inlineTaskDrafts.set(column.id, title.value));
    title.addEventListener("blur", () => {
      if (state.refreshPending) scheduleRealtimeRefresh();
    });
    quick.append(title);
    quick.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (!title.value.trim()) return;
      title.disabled = true;
      state.inlineTaskSubmissions.add(column.id);
      try {
        await createTask({ context: state.context, boardId: state.boardId, columnId: column.id, title: title.value, clientVisible: currentBoard()?.client_visible, siblings: tasksInColumn(column.id) });
        state.inlineTaskSubmissions.delete(column.id);
        state.inlineTaskDrafts.delete(column.id);
        state.refreshPending = false;
        clearTimeout(state.refreshTimer);
        await loadActiveBoard();
      } catch (error) {
        state.inlineTaskSubmissions.delete(column.id);
        AppCore.ui.toast(AppCore.ui.describeError(error), "error");
        title.disabled = false;
        if (state.refreshPending) scheduleRealtimeRefresh();
      }
    });
    list.append(quick);
  }
  columnNode.append(header, list);
  if(state.context.canCreate){
    const resize=el('div','k-board-column-resizer');resize.tabIndex=0;resize.setAttribute('role','separator');resize.setAttribute('aria-orientation','vertical');resize.setAttribute('aria-label',`Resize ${column.name} column`);resize.title='Drag to resize · Double-click to reset';
    const updateAria=()=>resize.setAttribute('aria-valuenow',String(Math.round(columnNode.getBoundingClientRect().width)));resize.setAttribute('aria-valuemin',String(COLUMN_WIDTH_MIN));resize.setAttribute('aria-valuemax',String(COLUMN_WIDTH_MAX));
    resize.addEventListener('pointerdown',event=>{if(event.button!==0)return;event.preventDefault();event.stopPropagation();const startX=event.clientX,startWidth=columnNode.getBoundingClientRect().width;columnNode.draggable=false;columnNode.classList.add('is-resizing');resize.setPointerCapture(event.pointerId);const move=moveEvent=>{const width=clampColumnWidth(startWidth+moveEvent.clientX-startX);columnNode.style.setProperty('--board-column-width',`${width}px`);resize.setAttribute('aria-valuenow',String(width));};const finish=async()=>{resize.removeEventListener('pointermove',move);resize.removeEventListener('pointerup',finish);resize.removeEventListener('pointercancel',finish);columnNode.draggable=true;columnNode.classList.remove('is-resizing');try{await saveColumnWidth(column.id,columnNode.getBoundingClientRect().width);}catch(error){AppCore.ui.toast(AppCore.ui.describeError(error),'error');}};resize.addEventListener('pointermove',move);resize.addEventListener('pointerup',finish);resize.addEventListener('pointercancel',finish);});
    resize.addEventListener('keydown',async event=>{if(!['ArrowLeft','ArrowRight','Home'].includes(event.key))return;event.preventDefault();const width=event.key==='Home'?null:clampColumnWidth(columnNode.getBoundingClientRect().width+(event.key==='ArrowRight'?16:-16));if(width===null)columnNode.style.removeProperty('--board-column-width');else columnNode.style.setProperty('--board-column-width',`${width}px`);updateAria();try{await saveColumnWidth(column.id,width);}catch(error){AppCore.ui.toast(AppCore.ui.describeError(error),'error');}});
    resize.addEventListener('dblclick',async event=>{event.preventDefault();event.stopPropagation();columnNode.style.removeProperty('--board-column-width');updateAria();try{await saveColumnWidth(column.id,null);}catch(error){AppCore.ui.toast(AppCore.ui.describeError(error),'error');}});columnNode.append(resize);requestAnimationFrame(updateAria);
  }
  return columnNode;
}

function renderTaskCard(task) {
  const card = el("article", "ap-task-card");applyTaskColor(card,task);
  card.classList.toggle("is-completed",Boolean(task.completed_at));
  card.dataset.taskId = task.id;
  card.dataset.module = "boards";
  card.tabIndex = 0;
  card.setAttribute("role", "group");
  card.setAttribute("aria-label", `Task ${task.title}`);
  if (state.context.canCreate) {
    card.draggable = true;
    card.addEventListener("dragstart", (event) => {
      event.stopPropagation();
      state.draggedTaskId = task.id;
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", `task:${task.id}`);
      card.classList.add("ap-task-card--dragging");
    });
    card.addEventListener("dragend", () => {
      state.draggedTaskId = null;
      card.classList.remove("ap-task-card--dragging");
    });
  }
  const open = () => openTaskDetail(task).catch((error) => AppCore.ui.toast(AppCore.ui.describeError(error), "error"));
  card.addEventListener("click", event => {
    if (event.target.closest("button")) return;
    open();
  });
  card.addEventListener("keydown", (event) => {
    if (event.target.closest("button")) return;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      open();
    }
  });

  const top = el("div", "ap-task-card__top");
  const coverImage = task.details?.cover_image;
  if (coverImage) {
    try {
      const url = new URL(coverImage, location.origin);
      if (url.protocol === "https:" || url.origin === location.origin) {
        const cover = el("img", "ap-task-card__cover");
        cover.src = url.href;
        cover.alt = "";
        cover.addEventListener("error", () => cover.remove(), { once: true });
        card.append(cover);
      }
    } catch {
      // Ignore invalid saved cover URLs.
    }
  }
  top.append(el("span", `ap-badge ap-task-card__priority ap-task-card__priority--${task.priority}`, priorityLabel(task.priority)));
  if (task.client_visible && state.context.canCreate) top.append(el("span", "ap-badge ap-badge--info", "Client"));
  if (task.completed_at) top.append(el("span", "ap-badge ap-badge--success", "Completed"));
  if(task.details?.label)top.append(el("span","ap-task-label",task.details.label));
  if(task.validation?.status==="pending")top.append(validationStatus(task));
  if (state.context.canCreate) {
    const more = boardIconButton("more", `Actions for ${task.title}`);
    more.classList.add("k-task-card__more");
    more.addEventListener("click", event => {
      event.stopPropagation();
      event.preventDefault();
      const canEdit = state.context.canManageAll || task.created_by === state.context.user.id || !task.created_by;
      const edit = (label,icon,run) => ({label,icon,run,disabled:!canEdit});
      const groups = [
        [edit("Rename...", "edit", async () => {
          await openTaskDetail(task);const title=document.querySelector(".k-task-sheet-title");title?.focus();title?.select();
        }), {label:"Open...",icon:"expand",run:()=>openTaskDetail(task)},
        {label:"Add Comment...",icon:"conversation",run:()=>openTaskDetail(task,"comments")}],
        [edit("Cover...","cover",()=>openTaskColorForm(task)),
         edit("Label as...","tag",()=>openTaskDetailsToField(task,"Label")),
         edit("Members...","clients",()=>openTaskDetailsToField(task,"Members")),
         edit("Dates...","calendar",()=>openTaskDetailsToField(task,"Due Date")),
         edit("Custom Fields...","list",()=>openTaskDetailsToField(task,"Task color"))],
        [edit("Repeat...","repeat",()=>openTaskRepeatMenu(task)),
         {label:"Duplicate",icon:"copy",run:()=>boardItemAction("duplicate_task",task,state.boardId,task.column_id)},
         {label:"Duplicate to Board...",icon:"copy",run:()=>openBoardDestination("duplicate_task",task)}],
        [{label:"Move to List",icon:"arrowRight",disabled:!canEdit,children:[state.columns.filter(column=>column.id!==task.column_id).map(column=>({
          label:column.name,icon:"list",run:()=>boardItemAction("move_tasks",task,state.boardId,column.id)
        }))]},edit("Move to Board...","arrowRight",()=>openBoardDestination("move_tasks",task))],
        ...(canEdit?[[{label:"Task color",colors:boardColors,value:taskColorValue(task.task_color)||"none",run:async color=>{
          await updateTask(task.id,{task_color:color},state.context.folderId);await loadActiveBoard();
        }}]]:[]),
        [{label:"Copy Link",icon:"link",run:()=>copyBoardLink()},edit("Delete task","trash",async()=>{
          if(!await AppCore.ui.confirm({title:"Delete task?",message:"This task and its comments will be deleted.",confirmLabel:"Delete",danger:true}))return;
          await deleteTask(task.id,state.context.folderId);await loadActiveBoard();
        })]
      ];
      openWorkspaceActionMenu(more, groups, {className:"ap-board-action-menu"});
    });
    card.append(more);
  }
  card.append(top, el("h4", "ap-task-card__title", task.title));

  if (task.description) card.append(el("p", "ap-task-card__description", task.description));
  const meta = el("div", "ap-task-card__meta");
  if (task.due_date) meta.append(el("span", "ap-task-card__meta-item", `Due ${AppCore.utils.formatDate(task.due_date, "short")}`));
  const profile = state.profiles.get(task.assignee_id);
  if (profile) meta.append(el("span", "ap-task-card__meta-item", profileLabel(profile)));
  card.append(meta);
  return card;
}

async function openTaskDetailsToField(task, label) {
  await openTaskDetail(task);
  const sheet = document.querySelector(".k-task-sheet-v2");
  if (!sheet) throw new Error("The task details could not be opened.");
  if (label === "Task color") sheet.querySelector(".k-task-add-field")?.click();
  const row = [...sheet.querySelectorAll(".k-task-field-row")].find(item =>
    item.querySelector(".k-task-field-label")?.textContent === label
  );
  const control = row?.querySelector("input,select,textarea");
  if (!control) throw new Error(`${label} is not available for this task.`);
  row.scrollIntoView({ behavior: "smooth", block: "center" });
  control.focus();
}

async function openTaskRepeatMenu(task) {
  await openTaskDetail(task);
  const repeat = [...document.querySelectorAll(".k-task-sheet-actions button")].find(item =>
    item.textContent.trim().startsWith("Repeat")
  );
  if (!repeat) throw new Error("Repeat settings are not available for this task.");
  repeat.click();
}

async function handleTaskDrop(event, columnId) {
  if (!state.context.canCreate || !state.draggedTaskId) return;
  event.preventDefault();
  event.stopPropagation();
  const dragged = state.tasks.find((task) => task.id === state.draggedTaskId);
  if (!dragged) return;

  const targetCard = event.target.closest(".ap-task-card");
  const siblings = tasksInColumn(columnId).filter((task) => task.id !== dragged.id);
  let index = siblings.length;
  if (targetCard) {
    const targetId = targetCard.dataset.taskId;
    const targetIndex = siblings.findIndex((task) => task.id === targetId);
    if (targetIndex >= 0) {
      const rect = targetCard.getBoundingClientRect();
      index = targetIndex + (event.clientY > rect.top + rect.height / 2 ? 1 : 0);
    }
  }

  try {
    await moveTask({ task: dragged, targetColumnId: columnId, insertionIndex: index, targetRows: siblings });
    await loadActiveBoard();
  } catch (error) {
    AppCore.ui.toast(AppCore.ui.describeError(error), "error");
    await loadActiveBoard();
  } finally {
    state.draggedTaskId = null;
  }
}

function columnUpsertRow(column) {
  return {
    id: column.id,
    agency_id: column.agency_id,
    board_id: column.board_id,
    name: column.name,
    color: column.color,
    position: column.position
  };
}

async function reorderColumn(draggedId, targetId, after) {
  if (draggedId === targetId) return;
  const dragged = state.columns.find((column) => column.id === draggedId);
  let siblings = sortByPosition(state.columns.filter((column) => column.id !== draggedId));
  const targetIndex = siblings.findIndex((column) => column.id === targetId);
  if (!dragged || targetIndex < 0) return;

  if (needsRenormalize(siblings)) {
    siblings = siblings.map((column, index) => ({ ...column, position: (index + 1) * POSITION_STEP }));
    const { error } = await db.from("board_columns").upsert(siblings.map(columnUpsertRow), { onConflict: "id" });
    if (error) throw error;
  }

  const index = Math.min(siblings.length, targetIndex + (after ? 1 : 0));
  let position = insertionPosition(siblings, index);
  const previous = siblings[index - 1];
  const next = siblings[index];
  if ((previous && previous.position === position) || (next && next.position === position)) {
    siblings = siblings.map((column, idx) => ({ ...column, position: (idx + 1) * POSITION_STEP }));
    const { error } = await db.from("board_columns").upsert(siblings.map(columnUpsertRow), { onConflict: "id" });
    if (error) throw error;
    position = insertionPosition(siblings, index);
  }

  const { error } = await db.from("board_columns").update({ position }).eq("id", dragged.id);
  if (error) throw error;
  emit("data:changed", { entity: "board", entityId: state.boardId, folderId: state.context.folderId, action: "updated" });
  await loadActiveBoard();
}

export function openBoardForm(board = null, options = {}) {
  const context = options.context || state.context;
  if (!context?.agencyId) return;
  const form = el("form", "ap-module-form ap-resource-create-form");
  const title = input(board?.title || "");
  title.placeholder = board ? "Board name" : "New Board";
  title.setAttribute("aria-label", "Board name");
  title.required = true;
  title.maxLength = 160;
  const description = textarea(board?.description || "");
  description.placeholder = "Enter description…";
  description.setAttribute("aria-label", "Description (optional)");
  const titleField = field("BOARD NAME", title);
  const descriptionField = field("DESCRIPTION (optional)", description, "Displayed in folder view");
  const access = createAccessControl({ name:"board-access", privacy:board?.privacy || (board?.client_visible ? "shared" : "private"), internalRole:board?.internal_role || "viewer" });
  form.append(titleField, descriptionField, access.element);

  const actions = el("div", "ap-module-form__actions");
  const cancel = button("Cancel", "secondary");
  const save = button(board ? "Save board" : "Create board", "primary");
  cancel.addEventListener("click", () => AppCore.ui.closeModal());
  actions.append(cancel, save);
  form.append(actions);

  save.addEventListener("click", async () => {
    if (!title.value.trim()) return title.focus();
    save.disabled = true;
    try {
      let createdBoard = null;
      if (board) {
        const { error } = await db.from("boards").update({
          title: title.value.trim(), description: description.value.trim() || null, privacy:access.privacy, internal_role:access.internalRole, client_visible: access.privacy === "shared"
        }).eq("id", board.id);
        if (error) throw error;
        emit("data:changed", { entity: "board", entityId: board.id, folderId: context.folderId, action: "updated" });
      } else {
        const position = nextPosition(state.boards || []);
        const { data: created, error } = await db.from("boards").insert({
          agency_id: context.agencyId,
          folder_id: context.folderId,
          title: title.value.trim(),
          description: description.value.trim() || null,
          privacy: access.privacy,
          internal_role: access.internalRole,
          client_visible: access.privacy === "shared",
          position,
          created_by: context.user.id
        }).select().single();
        if (error) throw error;
        createdBoard = created;
        const defaultColumns = [{ name: "Open", color: "#DCE2E8" }, { name: "To-Do", color: "#F8C7BD" }, { name: "Doing", color: "#B8D9FB" }, { name: "Done", color: "#BFEBC8" }];
        const defaults = defaultColumns.map((column, index) => ({ agency_id: context.agencyId, board_id: created.id, name: column.name, color: column.color, position: (index + 1) * POSITION_STEP }));
        const { error: columnsError } = await db.from("board_columns").insert(defaults);
        if (columnsError) throw columnsError;
        if (state.context?.folderId === context.folderId) state.boardId = created.id;
        emit("data:changed", { entity: "board", entityId: created.id, folderId: context.folderId, action: "created" });
      }
      AppCore.ui.closeModal();
      AppCore.ui.toast(board ? "Board updated." : "Board created.", "success");
      if (!board && options.onDone) await options.onDone(createdBoard);
      else await loadFolder();
    } catch (error) {
      AppCore.ui.toast(AppCore.ui.describeError(error), "error");
    } finally {
      save.disabled = false;
    }
  });

  if (board) {
    const archive = button("Archive board", "danger");
    archive.addEventListener("click", async () => {
      const confirmed = await AppCore.ui.confirm({ title: "Archive board?", message: "The board and its tasks will disappear from normal views.", confirmLabel: "Archive", danger: true });
      if (!confirmed) return;
      const { error } = await db.from("boards").update({ archived_at: new Date().toISOString() }).eq("id", board.id);
      if (error) return AppCore.ui.toast(AppCore.ui.describeError(error), "error");
      emit("data:changed", { entity: "board", entityId: board.id, folderId: state.context.folderId, action: "deleted" });
      AppCore.ui.closeModal();
      await loadFolder();
    });
    form.append(archive);
  }

  AppCore.ui.openModal({ title: board ? "Board settings" : "Create Board", content: form, actions: [] });
  title.focus(); if (!board) { title.value = "New Board"; title.select(); }
}

function openColumnForm(column = null) {
  const form = el("form", "ap-module-form");
  const name = input(column?.name || "");
  name.required = true;
  name.maxLength = 60;
  const color = input(column?.color || "#8A90A6", "color");
  const savedMinutes=Number(column?.validation_minutes||Number(column?.validation_hours||0)*60);
  const deadline=selectControl([{value:'0',label:'No validation required'},{value:'1440',label:'24 hours'},{value:'2880',label:'48 hours'},{value:'custom',label:'Custom deadline'}],[0,1440,2880].includes(savedMinutes)?String(savedMinutes):'custom');
  const unitOptions=[['minutes',1],['hours',60],['days',1440],['weeks',10080]];
  const initialUnit=unitOptions.slice().reverse().find(([,factor])=>savedMinutes&&savedMinutes%factor===0)?.[0]||'hours';
  const unitFactor=unit=>unitOptions.find(([name])=>name===unit)?.[1]||60;
  const customAmount=input(savedMinutes?Math.max(1,savedMinutes/unitFactor(initialUnit)):24,'number');customAmount.min=1;customAmount.max=5256000;customAmount.step=1;
  const customUnit=selectControl(unitOptions.map(([value])=>({value,label:value[0].toUpperCase()+value.slice(1)})),initialUnit);
  const customControls=el('div','ap-deadline-custom');customControls.append(customAmount,customUnit);
  const customField=field('Custom deadline',customControls);customField.hidden=deadline.value!=='custom';deadline.addEventListener('change',()=>{customField.hidden=deadline.value!=='custom';});form.append(field('Section name',name),field('Color',color),field('Approval deadline',deadline,'The timer starts when you save. Unfinished tasks are completed automatically when it expires; an owner or admin can approve earlier.'),customField);
  const actions = el("div", "ap-module-form__actions");
  const cancel = button("Cancel", "secondary");
  const save = button(column ? "Save section" : "Add section", "primary");
  cancel.addEventListener("click", () => AppCore.ui.closeModal());
  actions.append(cancel, save);
  form.append(actions);

  save.addEventListener("click", async () => {
    if (!name.value.trim()) return name.focus();
    if(deadline.value==="custom"&&!customAmount.reportValidity())return;
    const validationMinutes=deadline.value==="custom"?Number(customAmount.value)*unitFactor(customUnit.value):Number(deadline.value);
    const validationHours=validationMinutes?Math.ceil(validationMinutes/60):0;
    const startedAt=validationMinutes?new Date():null;
    const deadlineFields={
      validation_hours:validationHours,
      validation_minutes:validationMinutes,
      validation_started_at:startedAt?.toISOString()||null,
      validation_due_at:startedAt?new Date(startedAt.getTime()+validationMinutes*60000).toISOString():null
    };
    save.disabled = true;
    try {
      if (column) {
        const { error } = await db.from("board_columns").update({ name: name.value.trim(), color: color.value, ...deadlineFields }).eq("id", column.id);
        if (error) throw error;
      } else {
        const { error } = await db.from("board_columns").insert({
          agency_id: state.context.agencyId,
          board_id: state.boardId,
          name: name.value.trim(),
          color: color.value,
          ...deadlineFields,
          position: nextPosition(state.columns)
        });
        if (error) throw error;
      }
      emit("data:changed", { entity: "board", entityId: state.boardId, folderId: state.context.folderId, action: "updated" });
      await loadActiveBoard();
      AppCore.ui.closeModal();
    } catch (error) {
      AppCore.ui.toast(AppCore.ui.describeError(error), "error");
    } finally { save.disabled = false; }
  });

  if (column) {
    const remove = button("Delete column", "danger");
    remove.addEventListener("click", () => deleteColumn(column).catch(error => AppCore.ui.toast(AppCore.ui.describeError(error), "error")));
    form.append(remove);
  }

  AppCore.ui.openModal({ title: column ? "Edit section" : "Add section", content: form, actions: [] });
  name.focus();
}

async function deleteColumn(column) {
  if (tasksInColumn(column.id).length) {
    AppCore.ui.toast("Move or delete this column's tasks first.", "warning");
    return;
  }
  if (!await AppCore.ui.confirm({ title: "Delete column?", message: "This cannot be undone.", confirmLabel: "Delete", danger: true })) return;
  const { error } = await db.from("board_columns").delete().eq("id", column.id);
  if (error) throw error;
  AppCore.ui.closeModal();
  await loadActiveBoard();
}

const boardColors = [
  {label:"None",value:"none"},{label:"Pink",value:"#fbd7d1"},{label:"Orange",value:"#f9dfc7"},
  {label:"Yellow",value:"#fff1c6"},{label:"Green",value:"#c8eccd"},{label:"Blue",value:"#c5ddfa"},
  {label:"Purple",value:"#ead9f1"},{label:"Black",value:"#000000"}
];

async function boardItemAction(action, source, boardId=state.boardId, columnId=null, taskIds) {
  const {error}=await db.rpc("board_item_action",{p_action:action,p_id:source.id,p_board:boardId,p_column:columnId,p_ids:taskIds});
  if(error)throw error;
  emit("data:changed",{entity:"task",folderId:state.context.folderId,action:"updated"});
  await loadActiveBoard();
}

async function copyBoardLink() {
  const url=new URL(location.href);url.hash='/resource/board/'+state.boardId;
  await navigator.clipboard.writeText(url.href);AppCore.ui.toast("Board link copied.","success");
}

async function openBoardDestination(action, source) {
  const {data:boards,error}=await db.from("boards").select("*").eq("agency_id",state.context.agencyId).is("archived_at",null).is("trashed_at",null).order("title");
  if(error)throw error;
  const form=el("form","ap-module-form");
  const boardSelect=selectControl(boards.map(board=>({value:board.id,label:board.title})),state.boardId);
  const columnSelect=selectControl([],"");
  const columnField=field("Destination list",columnSelect);columnField.hidden=action==="duplicate_column";
  const save=button(action==="move_tasks"?"Move tasks":"Duplicate","primary");save.type="submit";
  const loadColumns=async()=>{
    const selectedBoard=boardSelect.value;save.disabled=true;
    const {data,error}=await db.from("board_columns").select("*").eq("board_id",selectedBoard).order("position");
    if(selectedBoard!==boardSelect.value)return;
    if(error){AppCore.ui.toast(AppCore.ui.describeError(error),"error");return;}
    columnSelect.replaceChildren(...data.map(column=>{const option=document.createElement("option");option.value=column.id;option.textContent=column.name;return option;}));
    save.disabled=!data.length&&action!=="duplicate_column";
  };
  boardSelect.addEventListener("change",loadColumns);
  form.append(field("Destination board",boardSelect),columnField,save);
  form.addEventListener("submit",async event=>{
    event.preventDefault();save.disabled=true;
    try{await boardItemAction(action,source,boardSelect.value,columnSelect.value||null);AppCore.ui.closeModal();AppCore.ui.toast(action==="move_tasks"?"Task moved.":"Copy created.","success");}
    catch(error){AppCore.ui.toast(AppCore.ui.describeError(error),"error");save.disabled=false;}
  });
  AppCore.ui.openModal({title:action==="move_tasks"?"Move to Board":"Duplicate to Board",content:form,actions:[]});
  await loadColumns();
}

async function archiveColumnTasks(column) {
  const ids=state.tasks.filter(task=>task.column_id===column.id).map(task=>task.id);
  if(!ids.length)return;
  if(!await AppCore.ui.confirm({title:"Archive tasks?",message:"Archive all visible tasks in this list? They will remain available in Library > Archive.",confirmLabel:"Archive"}))return;
  const {error}=await db.from("tasks").update({archived_at:new Date().toISOString()}).in("id",ids);
  if(error)throw error;
  emit("data:changed",{entity:"task",folderId:state.context.folderId,action:"archived"});await loadActiveBoard();
}

function openTaskColorForm(task) {
  const details = taskDetailData(task);
  const form = el("form", "ap-module-form");
  const color = createTaskColorControl(task.task_color);
  const image = input();
  image.type = "file";
  image.accept = "image/png,image/jpeg,image/webp,image/gif";
  image.setAttribute("aria-label", "Choose a task cover image");
  const preview = el("img", "k-task-cover-preview");
  preview.alt = "Task cover preview";
  let coverImage = details.cover_image || null;
  let selectedFile = null;
  let previewUrl = null;
  const showPreview = value => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = null;
    if (!value) {
      preview.hidden = true;
      preview.removeAttribute("src");
      return;
    }
    try {
      const url = new URL(value, location.origin);
      if (url.protocol !== "https:" && url.origin !== location.origin) throw new Error("Invalid cover image URL.");
      preview.src = url.href;
      preview.hidden = false;
    } catch {
      preview.hidden = true;
      preview.removeAttribute("src");
    }
  };
  showPreview(coverImage);
  image.addEventListener("change", () => {
    selectedFile = image.files?.[0] || null;
    if (selectedFile) {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      previewUrl = URL.createObjectURL(selectedFile);
      preview.src = previewUrl;
      preview.hidden = false;
    } else showPreview(coverImage);
  });
  const removeImage = button("Remove cover image");
  removeImage.addEventListener("click", () => {
    selectedFile = null;
    coverImage = null;
    image.value = "";
    showPreview(null);
  });
  const save = button("Save cover", "primary");
  save.type = "submit";
  form.append(field("Card color", color), field("Cover image", image), preview, removeImage, save);
  form.addEventListener("submit", async event => {
    event.preventDefault();
    save.disabled = true;
    try {
      const nextDetails = {
        ...details,
        cover_image: selectedFile ? await uploadBrandAsset(selectedFile, "task-covers") : coverImage
      };
      await updateTask(task.id, { task_color: color.value, details: nextDetails }, state.context.folderId);
      AppCore.ui.closeModal();
      await loadActiveBoard();
    } catch (error) {
      AppCore.ui.toast(AppCore.ui.describeError(error), "error");
      save.disabled = false;
    }
  });
  AppCore.ui.openModal({
    title: "Task cover",
    content: form,
    actions: [],
    onClose: () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      previewUrl = null;
    }
  });
}

function nextRepeatDueDate(dueDate, repeat) {
  if (!dueDate) return null;
  const date = new Date(`${String(dueDate).slice(0, 10)}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return null;
  if (repeat === "daily") date.setUTCDate(date.getUTCDate() + 1);
  else if (repeat === "weekly") date.setUTCDate(date.getUTCDate() + 7);
  else if (repeat === "monthly") {
    const day = date.getUTCDate();
    date.setUTCDate(1);
    date.setUTCMonth(date.getUTCMonth() + 1);
    const lastDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
    date.setUTCDate(Math.min(day, lastDay));
  } else return null;
  return date.toISOString().slice(0, 10);
}

async function createNextRepeatTask(task, completedAt, canEdit) {
  const details = taskDetailData(task);
  const repeat = details.repeat;
  if (!["daily", "weekly", "monthly"].includes(repeat) || details.repeat_next_task_id) return;

  const existing = state.tasks.find(candidate =>
    candidate.details?.repeat_parent_id === task.id &&
    candidate.details?.repeat_source_completed_at === completedAt
  );
  if (existing) {
    const updated = await updateTask(task.id, {
      details: { ...details, repeat_next_task_id: existing.id }
    }, state.context.folderId);
    Object.assign(task, updated);
    return;
  }
  if (!canEdit) throw Object.assign(new Error("You can complete this task, but you do not have permission to create its next repeat."), { userMessage: true });

  const nextDetails = {
    ...details,
    attachments: [],
    subtasks: details.subtasks.map(subtask => ({ ...subtask, done: false })),
    repeat_next_task_id: null,
    repeat_parent_id: task.id,
    repeat_source_completed_at: completedAt
  };
  const orderedColumns = sortByPosition(state.columns);
  const currentColumnIndex = orderedColumns.findIndex(column => column.id === task.column_id);
  const repeatColumn = currentColumnIndex === orderedColumns.length - 1 && orderedColumns.length > 1
    ? orderedColumns[0]
    : state.columns.find(column => column.id === task.column_id);
  if (!repeatColumn) throw new Error("The task's list is no longer available.");
  const nextTask = await createTask({
    context: state.context,
    boardId: task.board_id,
    columnId: repeatColumn.id,
    title: task.title,
    description: task.description,
    assigneeId: task.assignee_id,
    dueDate: nextRepeatDueDate(task.due_date || completedAt.slice(0, 10), repeat),
    dueTime: task.due_time,
    priority: task.priority,
    taskColor: task.task_color,
    clientVisible: task.client_visible,
    siblings: tasksInColumn(repeatColumn.id),
    details: nextDetails
  });
  const updated = await updateTask(task.id, {
    details: { ...details, repeat_next_task_id: nextTask.id }
  }, state.context.folderId);
  Object.assign(task, updated);
}

function openBulkTaskForm(column) {
  const form = el("form", "ap-module-form");
  const titles = textarea();
  titles.rows = 7;
  titles.placeholder = "One task per line";
  titles.setAttribute("aria-label", "Task titles");
  const actions = el("div", "ap-module-form__actions");
  const cancel = button("Cancel", "secondary");
  const create = button("Create tasks", "primary");
  create.type = "submit";
  cancel.addEventListener("click", () => AppCore.ui.closeModal());
  actions.append(cancel, create);
  form.append(field("Task titles", titles, "Enter one task on each line."), actions);
  form.addEventListener("submit", async event => {
    event.preventDefault();
    const names = titles.value.split(/\r?\n/).map(name => name.trim()).filter(Boolean);
    if (!names.length) return titles.focus();
    create.disabled = true;
    try {
      let siblings = tasksInColumn(column.id);
      for (const title of names) {
        const task = await createTask({
          context: state.context,
          boardId: state.boardId,
          columnId: column.id,
          title,
          clientVisible: currentBoard()?.client_visible,
          siblings
        });
        siblings = [...siblings, task];
      }
      AppCore.ui.closeModal();
      await loadActiveBoard();
    } catch (error) {
      AppCore.ui.toast(AppCore.ui.describeError(error), "error");
      create.disabled = false;
    }
  });
  AppCore.ui.openModal({ title: "Add Multiple Tasks", content: form, actions: [] });
  titles.focus();
}

function openColumnTaskColorForm(column) {
  const form = el("form", "ap-module-form");
  const color = createTaskColorControl("none");
  const actions = el("div", "ap-module-form__actions");
  const cancel = button("Cancel", "secondary");
  const save = button("Apply to tasks", "primary");
  save.type = "submit";
  cancel.addEventListener("click", () => AppCore.ui.closeModal());
  actions.append(cancel, save);
  form.append(field("Task color", color), actions);
  form.addEventListener("submit", async event => {
    event.preventDefault();
    save.disabled = true;
    try {
      const ids=state.tasks.filter(task=>task.column_id===column.id).map(task=>task.id);
      const {error}=await db.from("tasks").update({task_color:color.value}).in("id",ids);
      if(error)throw error;
      AppCore.ui.closeModal();
      await loadActiveBoard();
    } catch (error) {
      AppCore.ui.toast(AppCore.ui.describeError(error), "error");
      save.disabled = false;
    }
  });
  AppCore.ui.openModal({ title: "Change Tasks Color", content: form, actions: [] });
}

function taskFormFields(task = {}) {
  const title = input(task.title || "");
  title.required = true;
  title.maxLength = 200;
  const description = textarea(task.description || "");
  const dueDate = input(task.due_date || "", "date");
  const dueTime = input(task.due_time || "", "time");dueTime.step=60;
  const priority = selectControl([
    { value: "low", label: "Low" }, { value: "normal", label: "Normal" }, { value: "high", label: "High" }, { value: "urgent", label: "Urgent" }
  ], task.priority || "normal");
  const assignee = selectControl([
    { value: "", label: "Anyone" },
    ...state.assignees.map((profile) => ({ value: profile.id, label: profileLabel(profile) }))
  ], task.assignee_id || "");
  const taskColor=createTaskColorControl(task.task_color);
  const visible = checkboxControl(task.client_visible || false);
  const completed = checkboxControl(Boolean(task.completed_at));
  return { title, description, dueDate, dueTime, priority, taskColor, assignee, visible, completed };
}

function openTaskForm(columnId,dueDate="") {
  const fields = taskFormFields({due_date:dueDate});
  const form = el("form", "ap-module-form");
  form.append(
    field("Task title", fields.title), field("Description", fields.description), field("Assignee", fields.assignee),
    field("Due date", fields.dueDate), field("Time", fields.dueTime), field("Task color", fields.taskColor), field("Priority", fields.priority), field("Visible to clients", fields.visible)
  );
  const actions = el("div", "ap-module-form__actions");
  const cancel = button("Cancel", "secondary");
  const save = button("Create task", "primary");
  cancel.addEventListener("click", () => AppCore.ui.closeModal());
  actions.append(cancel, save);
  form.append(actions);
  save.addEventListener("click", async () => {
    if (!fields.title.value.trim()) return fields.title.focus();
    save.disabled = true;
    try {
      await createTask({
        context: state.context,
        boardId: state.boardId,
        columnId,
        title: fields.title.value,
        description: fields.description.value,
        assigneeId: fields.assignee.value,
        dueDate: fields.dueDate.value,
        dueTime: fields.dueTime.value,
        priority: fields.priority.value,
        taskColor: fields.taskColor.value,
        clientVisible: fields.visible.checked,
        siblings: tasksInColumn(columnId)
      });
      AppCore.ui.closeModal();
      AppCore.ui.toast("Task created.", "success");
      await loadActiveBoard();
    } catch (error) {
      AppCore.ui.toast(AppCore.ui.describeError(error), "error");
    } finally { save.disabled = false; }
  });
  AppCore.ui.openModal({ title: "New task", content: form, actions: [] });
  fields.title.focus();
}

function taskDetailData(task) {
  const details = task.details && typeof task.details === "object" ? { ...task.details } : {};
  details.subtasks = Array.isArray(details.subtasks) ? details.subtasks : [];
  details.attachments = Array.isArray(details.attachments) ? details.attachments : [];
  details.media_comments = Array.isArray(details.media_comments) ? details.media_comments : [];
  details.media_pins = Array.isArray(details.media_pins) ? details.media_pins : [];
  return details;
}

function taskActionButton(iconName, label) {
  const node = button("", "ghost");
  node.className = "k-task-sheet-action";
  node.append(workspaceIcon(iconName), el("span", "", label));
  return node;
}

function taskFieldRow(iconName, label, control) {
  if(control.matches("input,select,textarea")&&!control.hasAttribute("aria-label"))control.setAttribute("aria-label",label);
  const row = el("div", "k-task-field-row");
  const iconHost = el("span", "k-task-field-icon");
  iconHost.append(workspaceIcon(iconName));
  row.append(iconHost, el("span", "k-task-field-label", label), control);
  return row;
}

function taskChoiceMenu(anchor, choices, selected, onChoose) {
  document.querySelectorAll(".k-task-choice-menu").forEach(node => node.remove());
  const popup = el("div", "k-task-choice-menu");
  popup.setAttribute("role", "menu");
  popup.setAttribute("aria-label", "Repeat frequency");
  const close = restoreFocus => {
    popup.remove();
    document.removeEventListener("pointerdown", onOutsidePointerDown);
    document.removeEventListener("keydown", onMenuKeyDown, true);
    if (restoreFocus) anchor.focus();
  };
  const onOutsidePointerDown = event => {
    if (!popup.contains(event.target) && !anchor.contains(event.target)) close(false);
  };
  const onMenuKeyDown = event => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      close(true);
    } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      const items = [...popup.querySelectorAll('[role="menuitemradio"]')];
      const current = items.indexOf(document.activeElement);
      const offset = event.key === "ArrowDown" ? 1 : -1;
      event.preventDefault();
      items[(current + offset + items.length) % items.length]?.focus();
    } else if (event.key === "Tab") {
      close(false);
      anchor.focus();
    }
  };
  choices.forEach(choice => {
    const item = button(choice.label, "ghost");
    item.className = `k-task-choice-item${String(choice.value) === String(selected) ? " is-selected" : ""}`;
    item.setAttribute("role", "menuitemradio");
    item.setAttribute("aria-checked", String(String(choice.value) === String(selected)));
    if (String(choice.value) === String(selected)) item.append(workspaceIcon("check"));
    item.addEventListener("click", async event => {
      event.stopPropagation();
      item.disabled = true;
      try {
        await onChoose(choice.value);
        close(false);
      } catch (error) {
        AppCore.ui.toast(AppCore.ui.describeError(error), "error");
        item.disabled = false;
      }
    });
    popup.append(item);
  });
  document.body.append(popup);
  const rect = anchor.getBoundingClientRect();
  popup.style.top = `${rect.bottom + 7}px`;
  popup.style.left = `${Math.max(12, Math.min(window.innerWidth - 235, rect.left))}px`;
  document.addEventListener("pointerdown", onOutsidePointerDown);
  document.addEventListener("keydown", onMenuKeyDown, true);
  popup.querySelector('[aria-checked="true"]')?.focus();
}

function validationStatus(task){
  const overdue=task.validation?.status==='pending'&&Date.now()>Date.parse(task.validation.due_at);
  const badge=el('span',overdue?'ap-validation-status is-overdue':'ap-validation-status',overdue?'Approval overdue':'Awaiting validation');
  badge.dataset.approvalDue=task.validation?.due_at||'';badge.title=task.validation?.due_at?'Approval due '+new Date(task.validation.due_at).toLocaleString():'';return badge;
}

async function openTaskMediaReview(task, attachment, canAnnotate = true) {
  const { data, error } = await db.storage.from("project-files").createSignedUrl(attachment.path, 3600);
  if (error) throw error;
  const url = data.signedUrl;
  const details = taskDetailData(task);
  const overlay = el("div", "k-review-overlay");
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.setAttribute("aria-label", `Review ${attachment.name}`);
  overlay.tabIndex = -1;
  const header = el("header", "k-review-top");
  const heading = el("div");
  heading.append(el("strong", "", attachment.name), el("small", "", `${attachment.type.startsWith("video/") ? "Video" : "Image"} review`));
  const headerActions = el("div", "k-review-top__actions");
  const original = el("a", "k-review-open", "Open original");
  original.href = url;
  original.target = "_blank";
  original.rel = "noopener noreferrer";
  const closeButton = button("×");
  closeButton.className = "k-review-close";
  closeButton.setAttribute("aria-label", "Close media review");
  headerActions.append(original, closeButton);
  header.append(heading, headerActions);

  const body = el("div", "k-review-body");
  const stage = el("main", "k-review-stage");
  const toolbar = el("div", "k-review-toolbar");
  const pinMode = button("▣ Pin mode off");
  pinMode.className = "k-review-pin-btn";
  pinMode.setAttribute("aria-pressed", "false");
  pinMode.hidden = !canAnnotate;
  toolbar.append(pinMode, el("span", "", canAnnotate
    ? `Turn on pin mode, then click the ${attachment.type.startsWith("video/") ? "video" : "image"} to pin a comment.`
    : "Pinned comments are view-only for your account."));
  const canvas = el("div", "k-review-canvas");
  const mediaWrap = el("div", `k-review-image-wrap ${attachment.type.startsWith("video/") ? "k-review-video-wrap" : ""} is-pinning`);
  const media = attachment.type.startsWith("video/") ? document.createElement("video") : document.createElement("img");
  if (media instanceof HTMLVideoElement) {
    media.controls = true;
    media.playsInline = true;
    media.preload = "metadata";
  } else {
    media.alt = attachment.name;
  }
  media.src = url;
  mediaWrap.append(media);
  canvas.append(mediaWrap);
  stage.append(toolbar, canvas);

  const side = el("aside", "k-review-side");
  const sideHeading = el("div", "k-review-side__head");
  const count = el("span", "k-review-count");
  sideHeading.append(el("h2", "", "Pinned comments"), count);
  const comments = el("div", "k-review-comments");
  side.append(sideHeading, comments);
  body.append(stage, side);
  overlay.append(header, body);

  let pinning = false;
  let closed = false;
  const pinsForAttachment = () => (taskDetailData(task).media_pins || []).filter(pin => pin.attachment_id === attachment.id);
  const close = () => {
    if (closed) return;
    closed = true;
    overlay.remove();
    document.body.classList.remove("k-review-opened");
    document.removeEventListener("keydown", onKeyDown, true);
  };
  const onKeyDown = event => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      close();
    }
  };
  closeButton.addEventListener("click", close);
  if (canAnnotate) {
    pinMode.addEventListener("click", () => {
      pinning = !pinning;
      pinMode.textContent = pinning ? "▣ Pin mode on" : "▣ Pin mode off";
      pinMode.classList.toggle("is-active", pinning);
      pinMode.setAttribute("aria-pressed", String(pinning));
      mediaWrap.classList.toggle("is-pinning", pinning);
    });
  }

  const renderPins = () => {
    mediaWrap.querySelectorAll(".k-review-pin").forEach(pin => pin.remove());
    comments.replaceChildren();
    const pins = pinsForAttachment();
    count.textContent = `${pins.length} comment${pins.length === 1 ? "" : "s"}`;
    if (!pins.length) comments.append(el("div", "k-review-empty", "No pinned comments yet. Turn on pin mode and select a detail."));
    pins.forEach((pin, index) => {
      const marker = button(String(index + 1));
      marker.className = "k-review-pin";
      marker.style.left = `${pin.x}%`;
      marker.style.top = `${pin.y}%`;
      if (pin.time != null) marker.textContent = AppCore.utils.formatTime?.(pin.time) || `${Math.floor(pin.time / 60)}:${String(Math.floor(pin.time % 60)).padStart(2, "0")}`;
      marker.title = pin.body;
      marker.setAttribute("aria-label", `Pinned comment ${index + 1}: ${pin.body}`);
      marker.addEventListener("click", event => {
        event.stopPropagation();
        document.getElementById(`task-media-pin-${pin.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
      });
      mediaWrap.append(marker);

      const card = el("article", "k-review-comment");
      card.id = `task-media-pin-${pin.id}`;
      const meta = el("div", "k-review-comment__meta");
      meta.append(el("strong", "", pin.author_name || "Member"), el("span", "", AppCore.utils.formatDate(pin.created_at, "short")));
      card.append(meta, el("div", "k-review-comment__pinlabel", pin.time == null ? `Pin ${index + 1}` : `At ${marker.textContent}`), el("p", "", pin.body));
      if (pin.author_id === state.context.user.id || state.context.isOwner || state.context.canManageAll) {
        const remove = el("button", "k-review-delete", "Delete");
        remove.type = "button";
        remove.addEventListener("click", async () => {
          remove.disabled = true;
          try {
            const nextDetails = taskDetailData(task);
            nextDetails.media_pins = (nextDetails.media_pins || []).filter(item => item.id !== pin.id);
            const updated = await updateTask(task.id, { details: nextDetails }, state.context.folderId);
            Object.assign(task, updated);
            renderPins();
          } catch (error) {
            AppCore.ui.toast(AppCore.ui.describeError(error), "error");
            remove.disabled = false;
          }
        });
        card.append(remove);
      }
      comments.append(card);
    });
  };
  mediaWrap.addEventListener("click", event => {
    if (!pinning || event.target !== media) return;
    const rect = media.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const x = Math.max(0, Math.min(100, ((event.clientX - rect.left) / rect.width) * 100));
    const y = Math.max(0, Math.min(100, ((event.clientY - rect.top) / rect.height) * 100));
    const dialog = el("div", "k-review-pin-dialog");
    const panel = el("div");
    const input = textarea();
    input.maxLength = 5000;
    input.placeholder = "Write a pinned comment…";
    const actions = el("div");
    const cancel = button("Cancel");
    cancel.addEventListener("click", () => dialog.remove());
    const save = button("Save comment");
    save.dataset.save = "";
    actions.append(cancel, save);
    panel.append(el("strong", "", "Comment on this detail"), input, actions);
    dialog.append(panel);
    overlay.append(dialog);
    input.focus();
    save.addEventListener("click", async () => {
      const value = input.value.trim();
      if (!value) return input.focus();
      save.disabled = true;
      try {
        const nextDetails = taskDetailData(task);
        nextDetails.media_pins = [
          ...(nextDetails.media_pins || []),
          {
            id: globalThis.ATHAR_UUID(),
            attachment_id: attachment.id,
            comment_id: (taskDetailData(task).media_comments || []).find(item => item.attachments?.some(file => file.id === attachment.id))?.comment_id || null,
            body: value,
            x,
            y,
            time: media instanceof HTMLVideoElement ? media.currentTime : null,
            author_id: state.context.user.id,
            author_name: profileLabel(state.context.profile),
            created_at: new Date().toISOString()
          }
        ];
        const updated = await updateTask(task.id, { details: nextDetails }, state.context.folderId);
        Object.assign(task, updated);
        dialog.remove();
        renderPins();
      } catch (error) {
        AppCore.ui.toast(AppCore.ui.describeError(error), "error");
        save.disabled = false;
      }
    });
  });
  document.body.append(overlay);
  document.body.classList.add("k-review-opened");
  document.addEventListener("keydown", onKeyDown, true);
  overlay.focus();
  renderPins();
}

function renderValidation(task){
  const box=el('section','ap-task-validation');box.append(el('h3','','Stage validation'));
  const run=async(action,control)=>{control.disabled=true;try{const {data,error}=await db.rpc('task_validation',{p_task_id:task.id,p_action:action});if(error)throw error;Object.assign(task,data);await loadActiveBoard();await openTaskDetail(task);}catch(error){AppCore.ui.toast(AppCore.ui.describeError(error),'error');}finally{control.disabled=false;}};
  if(task.validation?.status==='pending'){
    box.append(validationStatus(task),el('p','','Approval due '+new Date(task.validation.due_at).toLocaleString()));
    if(['owner','admin'].includes(state.context.role)){for(const [action,text] of [['approve','Approve and move'],['reject','Request changes']]){const control=button(text,action==='approve'?'primary':'secondary');control.addEventListener('click',()=>run(action,control));box.append(control);}}
  }else{
    const stage=state.columns.find(c=>c.id===task.column_id);box.append(el('p','',task.validation?.status==='changes_requested'?'Changes requested. Update the task, then submit it again.':(stage?.validation_due_at?'Automatic completion: '+new Date(stage.validation_due_at).toLocaleString():'No automatic completion deadline.')));
    if(state.context.canCreate||task.assignee_id===state.context.user.id){const request=button('Request validation','primary');request.addEventListener('click',()=>run('request',request));box.append(request);}
  }
  return box;
}

async function openTaskDetail(task, initialTab = "comments") {
  // Task access follows its board. Older deployed databases did not accept
  // `tasks` in resource_capabilities, so do not let that optional capability
  // lookup prevent the task sheet from opening.
  const accessResult=await db.rpc("resource_capabilities",{p_type:"tasks",p_id:task.id});
  const access=accessResult.error
    ? {can_view:true,can_edit:state.context.canCreate,can_share:state.context.canManageAll,can_upload:state.context.canCreate,can_comment:state.context.canComment,comment:state.context.canComment}
    : accessResult.data;
  const canEdit = state.context.canCreate&&(state.context.canManageAll||task.created_by===state.context.user.id||!task.created_by);
  let details = taskDetailData(task);
  let activeTab = initialTab;
  const patchTask = async patch => { try{const updated=await updateTask(task.id,patch,state.context.folderId);Object.assign(task,updated||patch);details=taskDetailData(task);return updated;}catch(error){AppCore.ui.toast(AppCore.ui.describeError(error),"error");return null;} };
  let detailsSave=Promise.resolve();
  const saveDetails = next => {
    const normalized={...next,subtasks:Array.isArray(next.subtasks)?next.subtasks:[],attachments:Array.isArray(next.attachments)?next.attachments:[]};
    const save=async()=>{const updated=await updateTask(task.id,{details:normalized},state.context.folderId);Object.assign(task,updated);details=taskDetailData(task);return updated;};
    detailsSave=detailsSave.catch(()=>{}).then(save);return detailsSave;
  };

  const sheet = el("section", "k-task-sheet-v2");
  const upload = document.createElement("input");
  upload.type = "file"; upload.hidden = true; upload.accept = "image/*,video/*,audio/*,application/pdf,.zip,.doc,.docx,.xls,.xlsx";
  upload.addEventListener("change", async () => {
    const file = upload.files?.[0];
    if (!file) return;
    try {
      if (file.size > 26214400) throw new Error("Choose a file smaller than 25 MB.");
      const id = globalThis.ATHAR_UUID();
      const path = `${state.context.agencyId}/${state.context.folderId}/${id}/${(file.name || "file").replace(/[^a-zA-Z0-9._-]/g, "-")}`;
      const { error: metadataError } = await db.from("files").insert({ id, agency_id: state.context.agencyId, folder_id: state.context.folderId, task_id:task.id, storage_path: path, original_name: file.name || "attachment", mime_type: file.type || "application/octet-stream", size_bytes: file.size, client_visible: task.client_visible, uploaded_by: state.context.user.id });
      if (metadataError) throw metadataError;
      const { error: uploadError } = await db.storage.from("project-files").upload(path, file, { upsert: false, contentType: file.type || "application/octet-stream" });
      if (uploadError) throw uploadError;
      await saveDetails({ ...details, attachments: [...details.attachments, { id, name: file.name || "Attachment", path, type: file.type || "application/octet-stream", size: file.size }] });
      upload.value = "";
      await renderCurrentTab();
      AppCore.ui.toast("Attachment uploaded.", "success");
    } catch (error) { AppCore.ui.toast(AppCore.ui.describeError(error), "error"); }
  });
  sheet.append(upload);

  const top = el("div", "k-task-sheet-top");
  const boardIcon = el("span", "k-task-sheet-top__board"); boardIcon.append(workspaceIcon("board"));
  const avatar = el("span", "k-task-sheet-avatar", AppCore.utils.initials(state.context.profile?.full_name || state.context.user?.email || "U"));
  const more = button("", "ghost"); more.className = "k-task-sheet-icon-button"; more.append(workspaceIcon("more"));
  more.addEventListener("click", event => { event.stopPropagation(); taskChoiceMenu(more, [{ value: "copy", label: "Copy task reference" }, ...(canEdit?[{ value: "delete", label: "Delete task" }]:[])], "", async action => { if (action === "copy") { await navigator.clipboard?.writeText(`${task.title} — ${task.id}`); AppCore.ui.toast("Task reference copied.", "success"); } else if (await AppCore.ui.confirm({ title: "Delete task?", message: "This task and its comments will be deleted.", confirmLabel: "Delete", danger: true })) { await deleteTask(task.id, state.context.folderId); AppCore.ui.closeModal(); await loadActiveBoard(); } }); });
  const topRight = el("div", "k-task-sheet-top__right"); topRight.append(avatar, more); top.append(boardIcon, topRight); sheet.append(top);

  const heading = el("div", "k-task-sheet-heading");
  const titleLine = el("div", "k-task-sheet-title-line");
  const title = input(task.title || ""); title.className = "k-task-sheet-title"; title.disabled = !canEdit;
  title.addEventListener("change", async () => { if (!title.value.trim() || title.value.trim() === task.title) return; try { await patchTask({ title: title.value.trim() }); } catch (error) { title.value = task.title; AppCore.ui.toast(AppCore.ui.describeError(error), "error"); } });
  titleLine.append(title); heading.append(titleLine, el("div", "k-task-sheet-meta", `in ${currentBoard()?.title || "Board"} • Created ${AppCore.utils.formatDate(task.created_at, "short")}`)); sheet.append(heading);

  const actions = el("div", "k-task-sheet-actions");
  const complete = taskActionButton("check", task.completed_at ? "Reopen" : "Complete");
  const updateCompleteState = () => {
    const stageRequiresValidation = !task.completed_at &&
      (task.validation?.status === "pending" || ((state.columns.find(column => column.id === task.column_id)?.validation_minutes || 0) > 0) || state.columns.find(column => column.id === task.column_id)?.validation_hours > 0);
    complete.disabled = (!canEdit && task.assignee_id !== state.context.user.id) ||
      stageRequiresValidation;
    complete.title = complete.disabled ? "Use stage validation to approve this task" : task.completed_at ? "Reopen task" : "Mark task complete";
    complete.setAttribute("aria-label", task.completed_at ? "Reopen" : "Complete");
    complete.setAttribute("aria-pressed",String(Boolean(task.completed_at)));
    complete.classList.toggle("is-completed",Boolean(task.completed_at));
    complete.querySelector("span:last-child").textContent = task.completed_at ? "Reopen" : "Complete";
  };
  updateCompleteState();
  complete.addEventListener("click", async () => {
    if (complete.disabled) return;
    complete.disabled = true;
    const completedAt = task.completed_at ? null : new Date().toISOString();
    try {
      const updated = await updateTask(task.id, { completed_at: completedAt }, state.context.folderId);
      Object.assign(task, updated);
      if (completedAt) createNextRepeatTask(task, completedAt, canEdit).catch(error=>AppCore.ui.toast(`Task completed, but the next repeated task could not be created: ${AppCore.ui.describeError(error)}`,"warning"));
      updateCompleteState();
      await loadActiveBoard();
      if (completedAt) AppCore.ui.toast("Task completed.", "success");
      else AppCore.ui.toast("Task reopened.", "success");
    } catch (error) {
      AppCore.ui.toast(AppCore.ui.describeError(error), "error");
      try {
        await loadActiveBoard();
      } catch (refreshError) {
        AppCore.ui.toast(AppCore.ui.describeError(refreshError), "error");
      }
    } finally {
      updateCompleteState();
    }
  });
  const attach = taskActionButton("paperclip", "Attachment"); attach.disabled = !canEdit; attach.addEventListener("click", () => upload.click());
  const subtaskAction = taskActionButton("subtasks", "Subtasks");
  const repeat = taskActionButton("repeat", details.repeat && details.repeat !== "none" ? details.repeat : "Repeat");
  repeat.disabled = !canEdit;
  repeat.setAttribute("aria-label", `Repeat: ${details.repeat || "none"}`);
  repeat.addEventListener("click", event => {
    event.stopPropagation();
    taskChoiceMenu(repeat, [
      { value: "none", label: "No repeat" },
      { value: "daily", label: "Daily" },
      { value: "weekly", label: "Weekly" },
      { value: "monthly", label: "Monthly" }
    ], details.repeat || "none", async value => {
      const updated = await updateTask(task.id, {
        details: { ...details, repeat: value }
      }, state.context.folderId);
      Object.assign(task, updated);
      details.repeat = value;
      const label = value === "none" ? "Repeat" : value[0].toUpperCase() + value.slice(1);
      repeat.querySelector("span:last-child").textContent = label;
      repeat.setAttribute("aria-label", `Repeat: ${value}`);
    });
  });
  actions.append(complete, attach, subtaskAction, repeat); sheet.append(actions);
  subtaskAction.addEventListener("click",()=>sheet.querySelector(".k-task-subtasks")?.scrollIntoView({behavior:"smooth",block:"start"}));
  const stage=state.columns.find(column=>column.id===task.column_id);


  const scroll = el("div", "k-task-sheet-scroll");
  if(stage?.validation_minutes>0||stage?.validation_hours>0||task.validation?.status==="pending")scroll.append(renderValidation(task));
  const fieldsSection = el("section", "k-task-sheet-section"); fieldsSection.append(el("h3", "k-task-sheet-section-title", "Fields"));
  const fields = el("div", "k-task-fields");
  const member = selectControl([{ value: "", label: "Anyone" }, ...state.assignees.map(profile => ({ value: profile.id, label: profileLabel(profile) }))], task.assignee_id || ""); member.className = "k-task-field-control"; member.disabled = !canEdit; member.addEventListener("change", () => patchTask({ assignee_id: member.value || null }));
  const list = selectControl(state.columns.map(column => ({ value: column.id, label: column.name })), task.column_id); list.className = "k-task-field-control"; list.disabled = !canEdit; list.addEventListener("change", async () => { const updated=await patchTask({ column_id: list.value });if(!updated)list.value=task.column_id;await loadActiveBoard(); });
  const label = input(details.label || ""); label.className = "k-task-field-control"; label.placeholder = "Empty"; label.disabled = !canEdit; label.addEventListener("change", () => saveDetails({ ...details, label: label.value.trim() }));
  const labelSuggestions=el('datalist');labelSuggestions.id='board-task-labels';for(const text of currentBoard()?.customization?.labels||[]){const option=el('option');option.value=text;labelSuggestions.append(option);}fields.append(labelSuggestions);label.setAttribute('list',labelSuggestions.id);
  const due = input(task.due_date || "", "date"); due.className = "k-task-field-control"; due.disabled = !canEdit; due.addEventListener("change", () => patchTask({ due_date: due.value || null }));
  const dueTime=input(task.due_time||"","time");dueTime.step=60;dueTime.className="k-task-field-control";dueTime.disabled=!canEdit;dueTime.addEventListener("change",()=>patchTask({due_time:dueTime.value||null}));
  fields.append(taskFieldRow("clients", "Members", member), taskFieldRow("list", "List", list), taskFieldRow("tag", "Label", label), taskFieldRow("calendar", "Due Date", due),taskFieldRow("clock","Time",dueTime));
  const optional = el("div", "k-task-optional-fields"); optional.hidden = true; const priority = selectControl([{ value: "low", label: "Low" }, { value: "normal", label: "Normal" }, { value: "high", label: "High" }, { value: "urgent", label: "Urgent" }], task.priority || "normal"); priority.className = "k-task-field-control"; priority.disabled = !canEdit; priority.addEventListener("change", () => patchTask({ priority: priority.value }));const taskColor=createTaskColorControl(task.task_color);taskColor.disabled=!canEdit;taskColor.addEventListener("change",()=>patchTask({task_color:taskColor.value})); const visible = checkboxControl(Boolean(task.client_visible)); visible.disabled = !canEdit; visible.addEventListener("change", () => patchTask({ client_visible: visible.checked })); optional.append(taskFieldRow("flag", "Priority", priority),taskFieldRow("palette","Task color",taskColor), taskFieldRow("share", "Visible to client", visible)); fields.append(optional);
  const addField = button("", "ghost"); addField.className = "k-task-add-field"; addField.append(workspaceIcon("plus"), document.createTextNode("Add a Field")); addField.addEventListener("click", () => { optional.hidden = !optional.hidden; }); fieldsSection.append(fields, addField); scroll.append(fieldsSection);

  const descriptionSection = el("section", "k-task-sheet-section k-task-description-section"); descriptionSection.append(el("h3", "k-task-sheet-section-title", "Description")); const description = textarea(task.description || ""); description.className = "k-task-description"; description.placeholder = "Add Description"; description.disabled = !canEdit; description.addEventListener("change", () => patchTask({ description: description.value.trim() || null })); descriptionSection.append(description); scroll.append(descriptionSection);

  const subtasksSection = el("section", "k-task-sheet-section k-task-subtasks");
  const subtasksHeading=el("div","k-task-subtasks-heading");subtasksHeading.append(el("h3", "k-task-sheet-section-title", "Subtasks"));
  const subtaskProgress=el("span","k-task-subtasks-progress");subtasksHeading.append(subtaskProgress);subtasksSection.append(subtasksHeading);
  const subtasksHost = el("div", "k-task-subtasks-list");
  const persistSubtasks=async next=>{subtasksHost.setAttribute("aria-busy","true");subtasksHost.inert=true;try{await saveDetails({...details,subtasks:next});renderSubtasks();}catch(error){AppCore.ui.toast(AppCore.ui.describeError(error),"error");renderSubtasks();}finally{subtasksHost.removeAttribute("aria-busy");subtasksHost.inert=false;}};
  const renderSubtasks = () => {
    subtasksHost.replaceChildren();
    const completed=details.subtasks.filter(item=>item.done).length,total=details.subtasks.length;subtaskProgress.textContent=total?`${completed} of ${total} completed`:"No subtasks";
    for(const subtask of details.subtasks){
      const row=el("div","k-task-subtask-row");row.dataset.subtaskId=subtask.id;
      const check=checkboxControl(Boolean(subtask.done));check.disabled=!canEdit;check.setAttribute("aria-label",`Complete ${subtask.title}`);
      check.addEventListener("change",()=>persistSubtasks(details.subtasks.map(item=>item.id===subtask.id?{...item,done:check.checked}:item)));
      const titleControl=canEdit?input(subtask.title):el("span","k-task-subtask-title",subtask.title);titleControl.className="k-task-subtask-title";
      if(canEdit){titleControl.maxLength=240;titleControl.setAttribute("aria-label",`Subtask title: ${subtask.title}`);titleControl.addEventListener("change",()=>{const title=titleControl.value.trim();if(!title){titleControl.value=subtask.title;return;}if(title!==subtask.title)persistSubtasks(details.subtasks.map(item=>item.id===subtask.id?{...item,title}:item));});}
      const remove=button("?","ghost");remove.className="k-task-subtask-remove";remove.hidden=!canEdit;remove.setAttribute("aria-label",`Remove subtask: ${subtask.title}`);remove.addEventListener("click",()=>persistSubtasks(details.subtasks.filter(item=>item.id!==subtask.id)));
      row.append(check,titleControl,remove);subtasksHost.append(row);
    }
    if(canEdit){
      const form=el("form","k-task-subtask-add"),subtaskInput=input("");subtaskInput.placeholder="Add a subtask";subtaskInput.setAttribute("aria-label","New subtask title");subtaskInput.maxLength=240;
      const add=button("","ghost");add.type="submit";add.setAttribute("aria-label","Add subtask");add.append(workspaceIcon("plus"));form.append(subtaskInput,add);
      form.addEventListener("submit",async event=>{event.preventDefault();const value=subtaskInput.value.trim();if(!value)return subtaskInput.focus();add.disabled=true;subtaskInput.disabled=true;await persistSubtasks([...details.subtasks,{id:globalThis.ATHAR_UUID(),title:value,done:false}]);add.disabled=false;subtaskInput.disabled=false;subtaskInput.value="";subtaskInput.focus();});subtasksHost.append(form);
    }
  };
  renderSubtasks(); subtasksSection.append(subtasksHost); scroll.append(subtasksSection);

  const activity = el("section", "k-task-activity"); const tabs = el("div", "k-task-activity-tabs"); const panel = el("div", "k-task-activity-panel"); const composerHost = el("div", "k-task-comment-composer-host"); const tabButtons = new Map();
  [["comments", "Comments"], ["files", "Files"], ["log", "Log"]].forEach(([key, labelText]) => { const tab = button(labelText, "ghost"); tab.className = "k-task-activity-tab"; tab.addEventListener("click", async () => { activeTab = key; await renderCurrentTab(); }); tabButtons.set(key, tab); tabs.append(tab); }); activity.append(tabs, panel); scroll.append(activity); sheet.append(scroll, composerHost);
  async function renderCommentsTab() {
    panel.replaceChildren(el("div", "k-task-activity-loading", "Loading comments…"));
    let comments = [];
    try {
      comments = await fetchTaskComments(task.id);
    } catch (error) {
      panel.replaceChildren(el("p", "k-task-activity-error", AppCore.ui.describeError(error)));
      return;
    }

    const list = el("div", "k-task-comment-list");
    if (!comments.length) list.append(el("div", "k-task-comments-empty", "No comments yet."));
    for (const comment of comments) {
      const row = el("article", "k-task-comment-v2");
      const avatar = el("span", "k-task-comment-avatar", AppCore.utils.initials(profileLabel(comment.author)));
      const content = el("div", "k-task-comment-content");
      content.append(
        el("div", "k-task-comment-header", `${profileLabel(comment.author)} · ${AppCore.utils.formatDate(comment.created_at, "short")}`)
      );
      if (comment.body.trim()) content.append(el("p", "k-task-comment-body", comment.body));

      const mediaComment = details.media_comments.find(item => item.comment_id === comment.id);
      if (mediaComment?.attachments?.length) {
        const attachments = el("div", "k-task-comment-attachments");
        for (const attachment of mediaComment.attachments) {
          const attachmentCard = el("div", "k-task-comment-attachment");
          const name = el("span", "k-task-comment-attachment__name", attachment.name || "Attachment");
          attachmentCard.append(name);
          if (attachment.type?.startsWith("audio/")) {
            try {
              const { data, error } = await db.storage.from("project-files").createSignedUrl(attachment.path, 3600);
              if (error) throw error;
              const player = document.createElement("audio");
              player.controls = true;
              player.preload = "none";
              player.src = data.signedUrl;
              attachmentCard.append(player);
            } catch (error) {
              attachmentCard.append(el("span", "k-task-comment-media-error", AppCore.ui.describeError(error)));
            }
          } else if (attachment.type?.startsWith("image/") || attachment.type?.startsWith("video/")) {
            const open = button(attachment.type.startsWith("video/") ? "Review video and pins" : "Review image and pins", "ghost");
            open.className = "k-task-comment-media-open";
            open.addEventListener("click", async () => {
              open.disabled = true;
              try {
                await openTaskMediaReview(task, attachment, state.context.canComment && access?.comment !== false);
              } catch (error) {
                AppCore.ui.toast(AppCore.ui.describeError(error), "error");
              } finally {
                open.disabled = false;
              }
            });
            attachmentCard.append(open);
          }
          attachments.append(attachmentCard);
        }
        content.append(attachments);
      }

      if (comment.author_id === state.context.user.id || state.context.isOwner) {
        const remove = button("Delete", "ghost");
        remove.classList.add("k-task-comment-delete");
        remove.addEventListener("click", async () => {
          if (!await AppCore.ui.confirm({ title: "Delete comment?", message: "This cannot be undone.", confirmLabel: "Delete", danger: true })) return;
          remove.disabled = true;
          try {
            const media = details.media_comments.find(item => item.comment_id === comment.id);
            if (media?.attachments?.length) {
              const failures = [];
              for (const attachment of media.attachments) {
                const { error: storageError } = await db.storage.from("project-files").remove([attachment.path]);
                if (storageError) failures.push(storageError);
                const { error: rowError } = await db.from("files").delete().eq("id", attachment.id);
                if (rowError) failures.push(rowError);
              }
              if (failures.length) throw new Error(`Attachment cleanup failed: ${failures.map(error => AppCore.ui.describeError(error)).join("; ")}`);
            }
            const nextDetails = taskDetailData(task);
            nextDetails.media_comments = nextDetails.media_comments.filter(item => item.comment_id !== comment.id);
            const attachmentIds = new Set((media?.attachments || []).map(file => file.id));
            nextDetails.media_pins = nextDetails.media_pins.filter(pin => pin.comment_id !== comment.id && !attachmentIds.has(pin.attachment_id));
            const updated = await updateTask(task.id, { details: nextDetails }, state.context.folderId);
            Object.assign(task, updated);
            details = taskDetailData(task);
            await deleteTaskComment(comment, state.context);
            await renderCurrentTab();
          } catch (error) {
            AppCore.ui.toast(AppCore.ui.describeError(error), "error");
            remove.disabled = false;
            await renderCurrentTab();
          }
        });
        content.append(remove);
      }
      row.append(avatar, content);
      list.append(row);
    }
    panel.replaceChildren(list);
  }
  function renderFilesTab() { panel.replaceChildren(); const grid = el("div", "k-task-files-grid"); if (!details.attachments.length) { grid.append(el("div", "k-task-files-empty", "No files yet")); } details.attachments.forEach(file => { const card = button("", "ghost"); card.className = "k-task-file-card";card.disabled=!state.context.canDownload&&!state.context.isClient; card.append(workspaceIcon(file.type?.startsWith("image/") ? "image" : "file"), el("span", "k-task-file-copy", file.name || "Attachment")); card.addEventListener("click", async () => { const { data, error } = await db.storage.from("project-files").createSignedUrl(file.path, 300); if (error) AppCore.ui.toast(AppCore.ui.describeError(error), "error"); else window.open(data.signedUrl, "_blank", "noopener,noreferrer"); }); grid.append(card); }); panel.append(grid); }
  function renderLogTab() { panel.replaceChildren(); const log = el("div", "k-task-log"); [["plus", "Task created", task.created_at], ["edit", "Task last updated", task.updated_at], ["check", task.completed_at ? "Task completed" : "Task open", task.completed_at]].forEach(([iconName, labelText, date]) => { const row = el("div", "k-task-log-row"); const iconHost = el("span", "k-task-log-icon"); iconHost.append(workspaceIcon(iconName)); row.append(iconHost, el("span", "", `${labelText}${date ? ` · ${AppCore.utils.formatDate(date, "short")}` : ""}`)); log.append(row); }); panel.append(log); }
  function renderCommentComposer() {
    composerHost.replaceChildren();
    if (activeTab !== "comments" || !state.context.canComment || access?.comment === false) return;
    const form = el("form", "k-task-comment-composer");
    const body = textarea("");
    body.className = "k-task-comment-input";
    body.placeholder = "Write a message or note…";
    const fileInput = document.createElement("input");
    fileInput.type = "file";
    fileInput.accept = "image/*,video/*,audio/*";
    fileInput.multiple = true;
    fileInput.hidden = true;
    const selectedFiles = [];
    const preview = el("div", "k-task-comment-file-preview");
    const renderPreview = () => {
      preview.replaceChildren();
      selectedFiles.forEach((file, index) => {
        const item = el("span", "k-task-comment-file-chip", `${file.name} (${Math.ceil(file.size / 1024)} KB)`);
        const remove = button("×", "ghost");
        remove.type = "button";
        remove.setAttribute("aria-label", `Remove ${file.name}`);
        remove.addEventListener("click", () => {
          selectedFiles.splice(index, 1);
          renderPreview();
        });
        item.append(remove);
        preview.append(item);
      });
      preview.hidden = selectedFiles.length === 0;
    };
    fileInput.addEventListener("change", () => {
      const existing = new Set(selectedFiles.map(file => `${file.name}:${file.size}:${file.lastModified}`));
      for (const file of fileInput.files || []) {
        if (!file.type.startsWith("image/") && !file.type.startsWith("audio/") && !file.type.startsWith("video/")) {
          AppCore.ui.toast(`${file.name} is not an image, audio, or video file.`, "error");
          continue;
        }
        if (file.size > 26214400) {
          AppCore.ui.toast(`${file.name} is larger than 25 MB.`, "error");
          continue;
        }
        const key = `${file.name}:${file.size}:${file.lastModified}`;
        if (!existing.has(key)) {
          selectedFiles.push(file);
          existing.add(key);
        }
      }
      fileInput.value = "";
      renderPreview();
    });

    const send = button("Send", "primary");
    send.className = "k-task-comment-send";
    send.type = "submit";
    const attach = button("Attach media", "ghost");
    attach.type = "button";
    attach.className = "k-task-comment-tool";
    attach.addEventListener("click", () => fileInput.click());
    const note = button("", "ghost");
    note.className = "k-task-comment-tool";
    note.append(workspaceIcon("lock"));
    let clientVisible = true;
    if (state.context.isStaff) {
      note.title = "Toggle client visibility";
      note.setAttribute("aria-label", "Toggle client visibility");
      note.addEventListener("click", () => {
        clientVisible = !clientVisible;
        note.classList.toggle("is-active", !clientVisible);
      });
    } else note.hidden = true;
    const controls = el("div", "k-task-comment-controls");
    controls.append(attach, send, note);
    form.append(fileInput, body, preview, controls);
    form.addEventListener("submit", async event => {
      event.preventDefault();
      const value = body.value.trim();
      if (!value && !selectedFiles.length) return;
      send.disabled = true;
      attach.disabled = true;
      try {
        const comment = await createTaskComment({
          context: state.context,
          taskId: task.id,
          body: value,
          clientVisible: state.context.isClient ? true : clientVisible
        });
        const uploaded = [];
        try {
          for (const file of selectedFiles) {
            const id = globalThis.ATHAR_UUID();
            const safeName = (file.name || "attachment").replace(/[^a-zA-Z0-9._-]+/g, "-").slice(-160);
            const path = `${state.context.agencyId}/${state.context.folderId}/${id}/${safeName}`;
            const { error: metadataError } = await db.from("files").insert({
              id,
              agency_id: state.context.agencyId,
              folder_id: state.context.folderId,
              task_id: task.id,
              uploaded_by: state.context.user.id,
              bucket_name: "project-files",
              storage_path: path,
              original_name: file.name || "attachment",
              mime_type: file.type,
              size_bytes: file.size,
              client_visible: state.context.isClient ? true : clientVisible,
              privacy: state.context.isClient || clientVisible ? "shared" : "private"
            });
            if (metadataError) throw metadataError;
            const { error: uploadError } = await db.storage.from("project-files").upload(path, file, {
              cacheControl: "3600",
              upsert: false,
              contentType: file.type
            });
            if (uploadError) {
              const { error: cleanupError } = await db.from("files").delete().eq("id", id);
              if (cleanupError) {
                throw new Error(`${AppCore.ui.describeError(uploadError)} Metadata cleanup also failed: ${AppCore.ui.describeError(cleanupError)}`);
              }
              throw uploadError;
            }
            uploaded.push({ id, name: file.name || "Attachment", path, type: file.type, size: file.size });
          }
          if (uploaded.length) {
            const nextDetails = taskDetailData(task);
            nextDetails.media_comments = [
              ...nextDetails.media_comments,
              { comment_id: comment.id, attachments: uploaded }
            ];
            const updated = await updateTask(task.id, { details: nextDetails }, state.context.folderId);
            Object.assign(task, updated);
            details = taskDetailData(task);
          }
        } catch (error) {
          const cleanupErrors = [];
          for (const attachment of uploaded) {
            const { error: storageError } = await db.storage.from("project-files").remove([attachment.path]);
            if (storageError) cleanupErrors.push(storageError);
            const { error: rowError } = await db.from("files").delete().eq("id", attachment.id);
            if (rowError) cleanupErrors.push(rowError);
          }
          try {
            await deleteTaskComment(comment, state.context);
          } catch (cleanupError) {
            cleanupErrors.push(cleanupError);
          }
          if (cleanupErrors.length) {
            throw new Error(`${AppCore.ui.describeError(error)} Cleanup also failed: ${cleanupErrors.map(AppCore.ui.describeError).join("; ")}`);
          }
          throw error;
        }
        body.value = "";
        selectedFiles.splice(0, selectedFiles.length);
        renderPreview();
        await renderCommentsTab();
      } catch (error) {
        AppCore.ui.toast(AppCore.ui.describeError(error), "error");
      } finally {
        send.disabled = false;
        attach.disabled = false;
      }
    });
    composerHost.append(form);
  }
  async function renderCurrentTab() { tabButtons.forEach((tab, key) => tab.classList.toggle("is-active", key === activeTab)); if (activeTab === "comments") await renderCommentsTab(); else if (activeTab === "files") renderFilesTab(); else renderLogTab(); renderCommentComposer(); }
  AppCore.ui.openModal({ title: "", content: sheet, actions: [] });
  await renderCurrentTab();
}

function handleTaskCommentKeydown(event) {
  if (event.target.matches(".k-task-comment-input") && event.key === "Enter" && !event.shiftKey && !event.isComposing) {
    event.preventDefault();
    event.target.form?.requestSubmit();
  }
}

async function refresh(context) {
  state.context = context;
  if (context.resourceId) state.boardId = context.resourceId;
  await loadFolder();
}

const boardsModule = {
  name: "boards",
  async mount(container, context) {
    state.container = container;
    state.context = context;
    state.boardId = context.resourceId || null;
    state.offEvents.push(on('task:open',event=>{const task=state.tasks.find(t=>t.id===event.detail.taskId);if(task)openTaskDetail(task).catch(error=>AppCore.ui.toast(AppCore.ui.describeError(error),'error'));}));
    document.addEventListener("keydown", handleTaskCommentKeydown);
    state.offEvents.push(on("app:teardown", () => {
      unsubscribeByPrefix("tasks:board:");
      unsubscribeByPrefix("columns:board:");
    }));
    await loadFolder();
    if(state.context!==context)return;
    state.deadlineTimer=setInterval(()=>{document.querySelectorAll('[data-approval-due]').forEach(badge=>{const overdue=Date.now()>Date.parse(badge.dataset.approvalDue);badge.classList.toggle('is-overdue',overdue);badge.textContent=overdue?'Approval overdue':'Awaiting validation';});},30000);
  },
  async unmount() {
    clearTimeout(state.refreshTimer);clearInterval(state.deadlineTimer);
    state.offEvents.splice(0).forEach((off) => off?.());
    unsubscribeByPrefix("tasks:board:");
    unsubscribeByPrefix("columns:board:");
    state.container?.replaceChildren();
    document.removeEventListener("keydown", handleTaskCommentKeydown);
    state.container = null;
    state.context = null;
    state.boards = [];
    state.boardId = null;
    state.columns = [];
    state.tasks = [];
    state.profiles = new Map();
    state.assignees = [];
    state.draggedTaskId = null;
    state.draggedColumnId = null;
    state.refreshPending = false;
    state.inlineTaskSubmissions.clear();
    state.inlineTaskDrafts.clear();
  },
  async refresh(context) {
    await refresh(context);
  }
};

export default boardsModule;
