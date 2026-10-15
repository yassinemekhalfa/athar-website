import { db } from "../dataClient.js";
import { AppCore } from "../core/appCore.js";
import { on } from "../core/events.js";
import { workspaceIcon } from "../views/workspaceIcons.js";

const MODULE_BY_ENTITY = Object.freeze({
  folder: null,
  board: "boards",
  task: "boards",
  doc: "docs",
  conversation: "conversation",
  file: "files",
  embed: "embeds",
  message: "conversation",
  invoice: "invoices"
});

const state = {
  container: null,
  context: null,
  input: null,
  handler: null,
  inputHandler: null,
  keyHandler: null,
  focusHandler: null,
  outsideHandler: null,
  offEvents: [],
  requestId: 0,
  selectedIndex: -1,
  results: []
};

function el(tag, className = "", text = null) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== null) node.textContent = text;
  return node;
}

function clear() {
  state.requestId += 1;
  state.results = [];
  state.selectedIndex = -1;
  state.input?.setAttribute('aria-expanded','false');
  state.container?.replaceChildren();
  document.getElementById("global-search")?.classList.remove("is-open");
}

function clearForNavigation() {
  clear();
  if (state.input) {
    state.input.value = "";
    state.input.blur();
  }
}

function searchButtons() {
  return [...(state.container?.querySelectorAll(".ap-search-result") || [])];
}

function highlight(index) {
  const buttons = searchButtons();
  buttons.forEach((button) => button.classList.remove("ap-search-result--selected"));
  if (!buttons.length) {
    state.selectedIndex = -1;
    return;
  }
  if (index < 0) index = buttons.length - 1;
  if (index >= buttons.length) index = 0;
  state.selectedIndex = index;
  const current = buttons[index];
  current.classList.add("ap-search-result--selected");
  state.input?.setAttribute('aria-activedescendant',current.id);
  current.scrollIntoView({ block: "nearest" });
}

function typeLabel(type) {
  return {
    folder: "Folder",
    board: "Board",
    task: "Task",
    doc: "Document",
    conversation: "Conversation",
    file: "File",
    embed: "Embed",
    invoice: "Invoice",client:"Client",proposal:"Proposal"
  }[type] || type;
}

async function openResult(result) {
  clear();
  if (state.input) state.input.value = "";

  try {
    if (result.entity_type === "folder") {
      await AppCore.selectFolder(result.entity_id);
      return;
    }
    if(result.entity_type==='client'){location.hash='#/clients';return;}
    if(result.entity_type==='proposal'){location.hash='#/proposals';return;}

    if (result.folder_id) {
      await AppCore.selectFolder(result.folder_id, {
        skipOverview: true,
        refreshModule: false
      });
    }

    const moduleName = MODULE_BY_ENTITY[result.entity_type];
    if (!moduleName) return;
    let resourceId = result.entity_id;
    if(result.entity_type==="message")resourceId=result.resource_id;
    if (result.entity_type === "task") {
      const { data, error } = await db
        .from("tasks")
        .select("folder_id,board_id")
        .eq("id", result.entity_id)
        .single();
      if (error) throw error;
      if (data.folder_id) {
        await AppCore.selectFolder(data.folder_id, {
          skipOverview: true,
          refreshModule: false
        });
      }
      resourceId = data.board_id;
    }
    await AppCore.selectModule(moduleName, resourceId);
    if(result.entity_type==="task")document.dispatchEvent(new CustomEvent("task:open",{detail:{taskId:result.entity_id}}));
  } catch (error) {
    AppCore.ui.toast(AppCore.ui.describeError(error), "error");
  }
}

function renderResults(results, { suggestions = false, query = "" } = {}) {
  state.results = results;
  state.selectedIndex = -1;
  const root = el("div", "ap-search-results");
  if (!results.length) {
    root.append(el("div", "ap-search-empty", query ? `No results for “${query}”. Try a title, message, task, document, file, or invoice.` : "No recent workspace items yet."));
    state.container.replaceChildren(root);state.input?.setAttribute("aria-expanded","true");
    document.getElementById("global-search")?.classList.add("is-open");
    return;
  }

  const heading = el("div", "ap-search-results__heading");
  heading.append(el("strong", "", suggestions ? "Suggested workspace items" : `${results.length} result${results.length === 1 ? "" : "s"}`));
  heading.append(el("span", "", suggestions ? "Start typing to search inside your workspace" : "Titles and content"));
  root.append(heading);
  const list = el("div", "ap-search-results__list");
  for (const result of results) {
    const item = el("button", "ap-search-result");
    item.type = "button";item.id="search-result-"+state.results.indexOf(result);item.setAttribute("role","option");
    item.dataset.entityType = result.entity_type;
    item.dataset.entityId = result.entity_id;
    item.setAttribute("aria-label", `${result.title || "Untitled"}, ${typeLabel(result.entity_type)}`);
    const iconName = {
      folder: "folder",
      board: "board",
      task: "checkCircle",
      doc: "doc",
      conversation: "chat",
      file: "file",
      embed: "link",
      invoice: "invoice",client:"clients",proposal:"proposal"
    }[result.entity_type] || "search";
    const icon = el("span", "ap-search-result__icon");
    icon.append(workspaceIcon(iconName));
    const content = el("span", "ap-search-result__content");
    content.append(el("strong", "", result.title || "Untitled"));
    content.append(el("small", "", typeLabel(result.entity_type)));
    if (result.snippet) content.append(el("span", "ap-search-result__snippet", result.snippet));
    item.append(icon, content);
    item.addEventListener("click", () => openResult(result));
    list.append(item);
  }
  root.append(list, el("div", "ap-search-results__hint", "↑↓ Navigate   Enter Open   Esc Close"));
  state.container.replaceChildren(root);
  document.getElementById("global-search")?.classList.add("is-open");
}

async function runSearch(query, { suggestions = false } = {}) {
  const value = query.trim();
  if ((!value && !suggestions) || !state.context?.agencyId) {
    clear();
    return;
  }
  const requestId = ++state.requestId;
  const loading = el("div", "ap-search-results");
  loading.append(el("div", "ap-search-empty", "Searching…"));
  state.container.replaceChildren(loading);
  document.getElementById("global-search")?.classList.add("is-open");

  try {
    const { data, error } = await db.rpc("search_workspace", {
      p_agency: state.context.agencyId,
      p_query: value
    });
    if (requestId !== state.requestId) return;
    if (error) throw error;
    renderResults(data || [], { suggestions, query: value });
  } catch (error) {
    if (requestId !== state.requestId) return;
    console.error("Global search error:", error);
    state.container.replaceChildren(el("div", "ap-search-empty", "Search is unavailable."));
    document.getElementById("global-search")?.classList.add("is-open");
  }
}

function findInput() {
  return document.querySelector("#global-search input");
}

async function mount(container, context) {
  state.container = container;
  state.context = context;
  state.input = findInput();
  if (!state.input) {
    clear();
    console.warn("Agency Portal search: #global-search contains no input element.");
    return;
  }
  state.input.autocomplete = "off";state.input.setAttribute("role","combobox");state.input.setAttribute("aria-expanded","false");state.input.setAttribute("aria-autocomplete","list");state.container.setAttribute("role","listbox");
  state.input.placeholder = `Search ${state.context.agency?.name || "workspace"}...`;
  state.input.setAttribute("aria-controls", "global-search-results");
  state.handler = AppCore.utils.debounce((value) => runSearch(value), 180);
  state.inputHandler = (event) => { clear(); state.handler(event.target.value); };
  state.focusHandler = () => { if (!state.input.value.trim()) runSearch("", { suggestions: true }); };
  state.keyHandler = (event) => {
    const buttons = searchButtons();
    if (event.key === "ArrowDown" && buttons.length) {
      event.preventDefault();
      highlight(state.selectedIndex + 1);
    } else if (event.key === "ArrowUp" && buttons.length) {
      event.preventDefault();
      highlight(state.selectedIndex - 1);
    } else if (event.key === "Enter" && buttons.length) {
      event.preventDefault();
      const result = state.results[Math.max(0, state.selectedIndex)];
      if (result) openResult(result);
    } else if (event.key === "Escape") {
      clear();
      state.input.blur();
    }
  };
  state.outsideHandler = (event) => {
    if (!event.target.closest("#global-search")) clear();
  };
  state.input.addEventListener("input", state.inputHandler);
  state.input.addEventListener("focus", state.focusHandler);
  state.input.addEventListener("keydown", state.keyHandler);
  document.addEventListener("mousedown", state.outsideHandler);
  state.offEvents.push(on("agency:selected", ({ detail }) => {
    if (state.context) state.context = { ...state.context, agencyId: detail.agencyId, role: detail.role };
    clearForNavigation();
  }));
  state.offEvents.push(on("folder:selected", clearForNavigation));
  state.offEvents.push(on("module:mounted", clearForNavigation));
  state.offEvents.push(on("app:teardown", clear));
}

async function unmount() {
  state.handler?.cancel?.();
  if (state.input && state.inputHandler) state.input.removeEventListener("input", state.inputHandler);
  if (state.input && state.focusHandler) state.input.removeEventListener("focus", state.focusHandler);
  if (state.input && state.keyHandler) state.input.removeEventListener("keydown", state.keyHandler);
  if (state.outsideHandler) document.removeEventListener("mousedown", state.outsideHandler);
  state.offEvents.splice(0).forEach((off) => off?.());
  clear();
  state.container = null;
  state.context = null;
  state.input = null;
  state.handler = null;
  state.inputHandler = null;
  state.keyHandler = null;
  state.focusHandler = null;
  state.outsideHandler = null;
  state.requestId += 1;
}

async function refresh(context) {
  state.context = context;
  clear();
}

export async function mountGlobalSearch(context = AppCore.getModuleContext()) {
  const container = document.getElementById("global-search-results");
  if (!container || !context) return false;
  await searchModule.unmount();
  await searchModule.mount(container, context);
  return true;
}

const searchModule = { name: "search", mount, unmount, refresh };
export default searchModule;
