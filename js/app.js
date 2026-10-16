import {openResourceRoute} from './workspace/resourceRoute.js';
import {isStaffRole,roleBadge,canManageRole,canCreate} from './core/permissions.js';
import './core/adaptive.js';
import { loadResources } from "./workspace/resources.js";
import { workspaceIcon } from "./views/workspaceIcons.js?v=library-reference-5";
import { restoreAuth, signOut } from "./auth/auth.js";
import { getState, setState } from "./core/state.js";
import { emit } from "./core/events.js";
import { activateAgency } from "./workspace/agencies.js";
import { renderFolderTree, openCreateFolder } from "./workspace/folderTree.js";
import { renderBreadcrumb, selectFolder } from "./workspace/folders.js";
import { openFolderSharing } from "./workspace/folderPermissions.js";
import { renderClientsView, renderClientSpaces } from "./workspace/clients.js?v=client-spaces-1";
import { selectModule, unmountActiveModule, hasActiveModule } from "./core/moduleRegistry.js";
import { mountGlobalSearch } from "./modules/search.js";
import { AppCore } from "./core/appCore.js";
import { db } from "./dataClient.js";
import { renderHome, renderTasksHub, renderInvoicesHub, renderLibrary, renderInbox, openTemplates, renderFolderOverview, renderProfileView, openFolderCreateMenu } from "./views/portalViews.js?v=password-library-2";
import { renderSettingsHub } from "./views/kitchenSettings.js?v=emailjs-2";
import { renderProfilePage, changePassword } from "./views/profilePage.js?v=password-library-1";
import { applyTheme } from "./workspace/preferences.js";

let currentView = "home";
let currentLibraryView = "everything";

function bindTabs() {
  document.querySelectorAll("#module-tabs [data-module]").forEach((btn) => btn.addEventListener("click", () => selectModule(btn.dataset.module)));
}

function renderAgencyIdentity() {
  const host = document.getElementById("agency-identity"); host.replaceChildren(); const s = getState();
  const logo = document.createElement("img"); logo.className = "ap-workspace-logo"; logo.alt = ""; if (s.agency.logo_url) logo.src = s.agency.logo_url; else logo.hidden = true;
  const memberships = s.memberships.filter((membership) => isStaffRole(membership.role));
  const picker = document.createElement("div"); picker.className = "ap-workspace-picker";
  const switcher = document.createElement("button"); switcher.type = "button"; switcher.className = "ap-workspace-switcher"; switcher.setAttribute("aria-label", "Workspace"); switcher.setAttribute("aria-haspopup", "listbox"); switcher.setAttribute("aria-expanded", "false");
  const name = document.createElement("span"); name.className = "ap-workspace-switcher__name"; name.textContent = s.agency.name || "Workspace";
  const chevron = workspaceIcon("chevronDown", "ap-workspace-switcher__chevron");
  switcher.append(name, chevron);
  const menu = document.createElement("div"); menu.className = "ap-workspace-picker__menu"; menu.setAttribute("role", "listbox"); menu.setAttribute("aria-label", "Switch workspace"); menu.hidden = true;
  const closeMenu = (restoreFocus = false) => {
    menu.hidden = true;
    switcher.setAttribute("aria-expanded", "false");
    document.removeEventListener("pointerdown", onOutsidePointerDown);
    document.removeEventListener("keydown", onPickerKeyDown);
    if (restoreFocus) switcher.focus();
  };
  const onOutsidePointerDown = (event) => { if (!picker.contains(event.target)) closeMenu(); };
  const onPickerKeyDown = (event) => { if (event.key === "Escape") { event.preventDefault(); closeMenu(true); } };
  const focusOption = (index) => {
    const options = [...menu.querySelectorAll(".ap-workspace-picker__option")];
    if (options.length) options[(index + options.length) % options.length].focus();
  };
  for (const membership of memberships) {
    const option = document.createElement("button"); option.type = "button"; option.className = "ap-workspace-picker__option"; option.setAttribute("role", "option");
    option.setAttribute("aria-selected", String(membership.agency_id === s.agency.id));
    const optionName = document.createElement("span"); optionName.className = "ap-workspace-picker__option-name"; optionName.textContent = membership.agencies?.name || "Workspace";
    option.append(workspaceIcon("home", "ap-workspace-picker__option-icon"), optionName);
    if (membership.agency_id === s.agency.id) option.append(workspaceIcon("checkCircle", "ap-workspace-picker__selected"));
    option.addEventListener("keydown", (event) => {
      const options = [...menu.querySelectorAll(".ap-workspace-picker__option")];
      const index = options.indexOf(option);
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        focusOption(index + (event.key === "ArrowDown" ? 1 : -1));
      } else if (event.key === "Home" || event.key === "End") {
        event.preventDefault();
        focusOption(event.key === "Home" ? 0 : options.length - 1);
      }
    });
    option.addEventListener("click", async () => {
      closeMenu();
      if (membership.agency_id === getState().agency?.id) return;
      option.disabled = true;
      try {
        emit("app:teardown", { reason: "agency-switch" });
        await unmountActiveModule();
        await activateAgency(membership.agency_id);
        renderShell();
        await showView("home");
      } catch (error) {
        AppCore.ui.toast(AppCore.ui.describeError(error), "error");
      } finally {
        option.disabled = false;
      }
    });
    menu.append(option);
  }
  switcher.addEventListener("click", () => {
    const open = menu.hidden;
    menu.hidden = !open;
    switcher.setAttribute("aria-expanded", String(open));
    if (open) {
      document.addEventListener("pointerdown", onOutsidePointerDown);
      document.addEventListener("keydown", onPickerKeyDown);
      focusOption([...menu.querySelectorAll(".ap-workspace-picker__option")].findIndex((option) => option.getAttribute("aria-selected") === "true"));
    } else {
      document.removeEventListener("pointerdown", onOutsidePointerDown);
      document.removeEventListener("keydown", onPickerKeyDown);
    }
  });
  picker.append(switcher, menu);
  const add = document.createElement("button"); add.type = "button"; add.className = "ap-icon-button ap-workspace-create"; add.title = "Create"; add.setAttribute("aria-label", "Create"); add.append(workspaceIcon("plus"));
  add.hidden=!canCreate(s.role);
  host.append(logo, picker, add);
}

function renderUserMenu() {
  const host = document.getElementById("user-menu");
  if (!host) return;
  host.replaceChildren();
  const s = getState();
  const displayName = s.profile?.full_name?.trim() || s.profile?.email?.split("@")[0] || s.user?.email?.split("@")[0] || "User";
  const email = s.profile?.email || s.user?.email || "";
  const initials = AppCore.utils.initials(displayName || email || "U");
  const trigger = document.createElement("button");
  trigger.type = "button";
  trigger.className = "ap-profile-trigger";
  trigger.setAttribute("aria-label", "Open profile menu");
  trigger.setAttribute("aria-expanded", "false");
  const avatar = document.createElement("span");
  avatar.className = "ap-profile-avatar";
  avatar.textContent = initials;
  trigger.append(avatar);
  const menu = document.createElement("div");
  menu.className = "ap-profile-menu ap-profile-menu--full";
  menu.hidden = true;
  const header = document.createElement("div");
  header.className = "ap-profile-menu__header";
  const headerAvatar = document.createElement("span");
  headerAvatar.className = "ap-profile-menu__avatar";
  headerAvatar.textContent = initials;
  const identity = document.createElement("div");
  identity.className = "ap-profile-menu__identity";
  identity.append(Object.assign(document.createElement("strong"), { textContent: displayName }), Object.assign(document.createElement("span"), { textContent: email }));
  identity.append(roleBadge(s.role));
  header.append(headerAvatar, identity);
  menu.append(header);
  const separator = () => { const line = document.createElement("div"); line.className = "ap-profile-menu__separator"; return line; };
  const closeMenu = () => { menu.hidden = true; trigger.setAttribute("aria-expanded", "false"); document.removeEventListener("mousedown", outsideClick); };
  const outsideClick = event => { if (!host.contains(event.target)) closeMenu(); };
  const createItem = ({ label, icon, onClick, danger = false }) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `ap-profile-menu__item${danger ? " ap-profile-menu__item--danger" : ""}`;
    button.append(workspaceIcon(icon, "ap-profile-menu__icon"), document.createTextNode(label));
    button.addEventListener("click", async () => { closeMenu(); try { await onClick?.(); } catch (error) { AppCore.ui.toast(AppCore.ui.describeError(error), "error"); } });
    return button;
  };
  menu.append(separator(), createItem({ label: "Profile", icon: "user", onClick: () => showView("profile") }), createItem({ label: "Change password", icon: "settings", onClick: () => changePassword() }), createItem({ label: "Notifications", icon: "bell", onClick: () => showView("settings", { settingsSection: "notifications" }) }), separator(), createItem({ label: "Chat with Support", icon: "support", onClick: () => openSupportChat() }), createItem({ label: "Get a 1:1 Demo", icon: "demo", onClick: () => openDemoDialog() }), separator(), createItem({ label: "Log out", icon: "logout", danger: true, onClick: () => signOut() }));
  function openMenu() { menu.hidden = false; trigger.setAttribute("aria-expanded", "true"); document.addEventListener("mousedown", outsideClick); }
  trigger.addEventListener("click", event => { event.stopPropagation(); menu.hidden ? openMenu() : closeMenu(); });
  menu.addEventListener("click", event => event.stopPropagation());
  host.append(trigger, menu);
}

function openSupportChat() {
  const name=getState().profile?.full_name?.trim()||getState().user?.email||"Athar client";
  const message=encodeURIComponent(`Hello Yassine Mekhalfa, I am ${name}. I need help with my Athar workspace.`);
  window.open(`https://wa.me/213798998842?text=${message}`,"_blank","noopener,noreferrer");
}

function openDemoDialog() {
  const wrap = document.createElement("div"); wrap.className = "k-account-action-dialog";
  const icon = document.createElement("div"); icon.className = "k-account-action-dialog__icon"; icon.append(workspaceIcon("demo"));
  const title = document.createElement("h3"); title.textContent = "Get a 1:1 Demo";
  const text = document.createElement("p"); text.textContent = "Explore your local workspace. No external demo booking service is connected.";
  const name = document.createElement("input"); name.className = "ap-input"; name.placeholder = "Your name"; name.value = getState().profile?.full_name || "";
  const email = document.createElement("input"); email.className = "ap-input"; email.type = "email"; email.placeholder = "Email"; email.value = getState().profile?.email || getState().user?.email || "";
  const send = document.createElement("button"); send.type = "button"; send.className = "ap-btn ap-btn--primary"; send.textContent = "Open workspace guide";
  send.addEventListener("click", () => { if (!name.value.trim() || !email.value.trim()) return AppCore.ui.toast("Please enter your name and email.", "warning"); AppCore.ui.closeModal(); location.hash="#/settings/permissions"; });
  wrap.append(icon, title, text, name, email, send); AppCore.ui.openModal({ title: "1:1 Demo", content: wrap, actions: [] });
}

function openProfile() {
  showView("profile");
}

function renderFolderActions() {
  const host = document.getElementById("folder-actions"); host.replaceChildren(); const s = getState(); if (!s.selectedFolderId) return;
  if(!canManageRole(s.role))return;
  const share = document.createElement("button"); share.className = "ap-btn ap-btn--primary ap-btn--sm"; share.type = "button"; share.textContent = "Share";
  share.addEventListener("click", () => openFolderSharing(s.selectedFolderId).catch((e) => AppCore.ui.toast(AppCore.ui.describeError(e), "error"))); host.append(share);
}

function renderSidebarAdmin() {
  const host = document.getElementById("sidebar-admin"); host.replaceChildren();
  for (const [label, handler, ownerOnly] of [["Clients", () => openAdmin("clients"), false], ["Team", () => openAdmin("team"), false], ["Website Admin", () => openAdmin("website"), true], ["Settings", () => openAdmin("settings"), true]]) {
    if (ownerOnly && getState().role !== "owner") continue;
    const b = document.createElement("button"); b.type = "button"; b.className = "ap-sidebar-admin-link"; b.append(workspaceIcon(label==="Website Admin"?"demo":label==="Clients"?"clients":label==="Team"?"user":"settings"),document.createTextNode(label)); b.addEventListener("click", handler); host.append(b);
  }
}

async function openAdmin(kind) {
  if (kind === "clients") return showView("clients");
  if (kind === "team") return showView("settings", { settingsSection: "members" });
  if (kind === "website") { location.assign("admin.html"); return; }
  if (kind === "settings") return showView("settings");
}

async function renderProposalsHub(container) {
  container.replaceChildren();
  container.className = "ap-module-content k-page-panel k-proposals-page";
  const context = AppCore.getModuleContext();
  AppCore.ui.renderLoading(container, "Loading proposals…");

  try {
    const [proposalResult, clientResult] = await Promise.all([
      db.from("proposals").select("*").eq("agency_id", context.agencyId).order("created_at", { ascending: false }),
      db.from("clients").select("id,name").eq("agency_id", context.agencyId).is("archived_at", null).order("name")
    ]);
    if (proposalResult.error) throw proposalResult.error;
    if (clientResult.error) throw clientResult.error;

    const proposals = proposalResult.data || [];
    const clients = clientResult.data || [];
    const clientMap = new Map(clients.map((client) => [client.id, client.name]));
    const root = document.createElement("section");
    root.className = "k-proposals-hub";

    const head = document.createElement("div");
    head.className = "k-proposals-head";
    const titleWrap = document.createElement("div");
    titleWrap.className = "k-proposals-title";
    const title = document.createElement("h1");
    title.textContent = "Proposals";
    const subtitle = document.createElement("p");
    subtitle.textContent = `${proposals.length} proposal${proposals.length === 1 ? "" : "s"}`;
    titleWrap.append(title, subtitle);

    const create = document.createElement("button");
    create.type = "button";
    create.className = "k-btn k-btn--primary k-proposal-create";
    create.append(document.createTextNode("+ Create Proposal"));
    create.addEventListener("click", () => beginProposalCreate(clients, () => renderProposalsHub(container), create.dataset.folderId || null));
    head.append(titleWrap, create);
    root.append(head);

    const toolbar = document.createElement("div");
    toolbar.className = "k-proposals-toolbar";
    const searchWrap = document.createElement("label");
    searchWrap.className = "k-proposal-search";
    searchWrap.append(workspaceIcon("search"));
    const search = document.createElement("input");
    search.type = "search";
    search.placeholder = "Search proposals...";
    search.setAttribute("aria-label", "Search proposals");
    searchWrap.append(search);

    const status = document.createElement("select");
    status.className = "k-proposal-status-filter";
    status.setAttribute("aria-label", "Filter proposals by status");
    [["", "All statuses"], ["draft", "Draft"], ["sent", "Sent"], ["accepted", "Accepted"], ["declined", "Declined"]].forEach(([value, label]) => {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = label;
      status.append(option);
    });
    toolbar.append(searchWrap, status);
    root.append(toolbar);

    const host = document.createElement("div");
    root.append(host);
    container.replaceChildren(root);

    const draw = () => {
      const query = search.value.trim().toLowerCase();
      const rows = proposals.filter((proposal) =>
        (!query || `${proposal.title} ${proposal.description || ""} ${clientMap.get(proposal.client_id) || ""}`.toLowerCase().includes(query)) &&
        (!status.value || proposal.status === status.value)
      );
      host.replaceChildren();

      if (!rows.length) {
        const empty = document.createElement("div");
        empty.className = "k-proposals-empty";
        empty.append(workspaceIcon("proposal", "k-proposals-empty__icon"));
        const heading = document.createElement("h2");
        heading.textContent = proposals.length ? "No proposals found" : "No proposals yet";
        const message = document.createElement("p");
        message.textContent = proposals.length ? "Try another search or status." : "Create, send, and manage client proposals from here.";
        empty.append(heading, message);
        if (!proposals.length) {
          const emptyCreate = document.createElement("button");
          emptyCreate.type = "button";
          emptyCreate.className = "k-btn k-btn--primary";
          emptyCreate.textContent = "+ Create Proposal";
          emptyCreate.addEventListener("click", () => openProposalForm(null, clients, () => renderProposalsHub(container)));
          empty.append(emptyCreate);
        }
        host.append(empty);
        return;
      }

      const table = document.createElement("div");
      table.className = "k-proposal-table";
      const tableHead = document.createElement("div");
      tableHead.className = "k-proposal-row k-proposal-row--head";
      ["Proposal", "Client", "Amount", "Status", "Created", ""].forEach((text) => {
        const cell = document.createElement("span");
        cell.textContent = text;
        tableHead.append(cell);
      });
      table.append(tableHead);

      for (const proposal of rows) {
        const row = document.createElement("div");
        row.className = "k-proposal-row";
        const name = document.createElement("div");
        name.className = "k-proposal-name";
        name.append(workspaceIcon("proposal"));
        const copy = document.createElement("div");
        const proposalTitle = document.createElement("strong");
        proposalTitle.textContent = proposal.title;
        const description = document.createElement("small");
        description.textContent = proposal.description || "Proposal";
        copy.append(proposalTitle, description);
        name.append(copy);

        const amount = proposal.amount === null || proposal.amount === undefined
          ? "—"
          : `${Number(proposal.amount).toLocaleString()} ${proposal.currency || "DZD"}`;
        const badge = document.createElement("span");
        badge.className = `k-proposal-badge k-proposal-badge--${proposal.status}`;
        badge.textContent = proposal.status;

        const actions = document.createElement("button");
        actions.type = "button";
        actions.className = "k-icon-button";
        actions.setAttribute("aria-label", `Actions for ${proposal.title}`);
        actions.append(workspaceIcon("more"));
        actions.addEventListener("click", () => openProposalActions(proposal, clients, () => renderProposalsHub(container)));

        const date = AppCore.utils.formatDate(proposal.created_at, "short");
        const clientCell = document.createElement("span");
        clientCell.className = "k-proposal-client";
        clientCell.textContent = clientMap.get(proposal.client_id) || "—";
        const amountCell = document.createElement("span");
        amountCell.className = "k-proposal-amount";
        amountCell.textContent = amount;
        const dateCell = document.createElement("span");
        dateCell.className = "k-proposal-date";
        dateCell.textContent = date;
        [name, clientCell, amountCell, badge, dateCell, actions].forEach((cell) => row.append(cell));
        table.append(row);
      }
      host.append(table);
    };

    search.addEventListener("input", draw);
    status.addEventListener("change", draw);
    draw();
  } catch (error) {
    if (error?.code === "PGRST205") {
      AppCore.ui.renderEmpty(container, {
        title: "Proposals database is not set up",
        message: "Run supabase/migrations/0600_proposals.sql in Supabase SQL Editor, then retry.",
        actionLabel: "Retry",
        onAction: () => renderProposalsHub(container)
      });
      return;
    }
    AppCore.ui.renderError(container, error, () => renderProposalsHub(container));
  }
}

function openProposalForm(proposal, clients, done, preferredFolderId = null) {
  const context = AppCore.getModuleContext();
  const form = document.createElement("form");
  form.className = "ap-stack k-proposal-form";
  const field = (label, control) => {
    const wrapper = document.createElement("label");
    wrapper.className = "k-form-field";
    const caption = document.createElement("span");
    caption.className = "k-form-label";
    caption.textContent = label;
    wrapper.append(caption, control);
    return wrapper;
  };

  const folders = AppCore.getFolders().filter(folder => !folder.system_key && !folder.archived_at && !folder.trashed_at);
  const folder = document.createElement("select");
  folder.className = "ap-input";
  folder.setAttribute("aria-label", "Folder");
  const noFolder = document.createElement("option"); noFolder.value = ""; noFolder.textContent = "No folder"; folder.append(noFolder);
  for (const item of folders) {
    const option = document.createElement("option");
    option.value = item.id;
    option.textContent = item.name;
    option.selected = item.id === (proposal?.folder_id || preferredFolderId || context.folderId);
    folder.append(option);
  }

  const title = document.createElement("input");
  title.className = "ap-input";
  title.placeholder = "Proposal title";
  title.required = true;
  title.maxLength = 200;
  title.value = proposal?.title || "";

  const client = document.createElement("select");
  client.className = "ap-input";
  const noClient = document.createElement("option");
  noClient.value = "";
  noClient.textContent = "No client";
  client.append(noClient);
  clients.forEach((item) => {
    const option = document.createElement("option");
    option.value = item.id;
    option.textContent = item.name;
    option.selected = item.id === proposal?.client_id;
    client.append(option);
  });

  const description = document.createElement("textarea");
  description.className = "ap-textarea";
  description.rows = 4;
  description.placeholder = "Description";
  description.value = proposal?.description || "";

  const amount = document.createElement("input");
  amount.className = "ap-input";
  amount.type = "number";
  amount.min = "0";
  amount.step = "0.01";
  amount.placeholder = "Amount";
  amount.value = proposal?.amount ?? "";

  const currency = document.createElement("select");
  currency.className = "ap-input";
  ["DZD", "EUR", "USD"].forEach((value) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = value;
    option.selected = value === (proposal?.currency || "DZD");
    currency.append(option);
  });

  const status = document.createElement("select");
  status.className = "ap-input";
  [["draft", "Draft"], ["sent", "Sent"], ["accepted", "Accepted"], ["declined", "Declined"]].forEach(([value, label]) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    option.selected = value === (proposal?.status || "draft");
    status.append(option);
  });

  const amountFields = document.createElement("div");
  amountFields.className = "k-form-grid-2";
  amountFields.append(field("Amount", amount), field("Currency", currency));
  const actions = document.createElement("div");
  actions.className = "k-modal-actions";
  const cancel = document.createElement("button");
  cancel.type = "button";
  cancel.className = "ap-btn ap-btn--secondary";
  cancel.textContent = "Cancel";
  cancel.addEventListener("click", () => AppCore.ui.closeModal());
  const save = document.createElement("button");
  save.type = "submit";
  save.className = "ap-btn ap-btn--primary";
  save.textContent = proposal ? "Save Proposal" : "Create Proposal";
  actions.append(cancel, save);
  form.append(field("Folder", folder), field("Title", title), field("Client", client), field("Description", description), amountFields, field("Status", status), actions);

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    save.disabled = true;
    try {
      const payload = {
        folder_id: folder.value || null,
        client_id: client.value || null,
        title: title.value.trim(),
        description: description.value.trim() || null,
        amount: amount.value ? Number(amount.value) : null,
        currency: currency.value,
        status: status.value,
        updated_at: new Date().toISOString()
      };
      let result;
      if (proposal) {
        result = await db.from("proposals").update(payload).eq("id", proposal.id);
      } else {
        result = await db.from("proposals").insert({ ...payload, agency_id: context.agencyId, created_by: context.user.id });
      }
      if (result.error) throw result.error;
      AppCore.ui.closeModal();
      AppCore.ui.toast(proposal ? "Proposal updated." : "Proposal created.", "success");
      await done?.();
    } catch (error) {
      AppCore.ui.toast(AppCore.ui.describeError(error), "error");
    } finally {
      save.disabled = false;
    }
  });
  AppCore.ui.openModal({ title: proposal ? "Edit Proposal" : "New Proposal", content: form, actions: [] });
}

function beginProposalCreate(clients, done, preferredFolderId = null) {
  openProposalForm(null, clients, done, preferredFolderId);
}

function openProposalActions(proposal, clients, done) {
  const wrap = document.createElement("div");
  wrap.className = "ap-stack";
  const edit = document.createElement("button");
  edit.type = "button";
  edit.className = "ap-btn ap-btn--secondary";
  edit.textContent = "Edit proposal";
  edit.addEventListener("click", () => {
    AppCore.ui.closeModal();
    openProposalForm(proposal, clients, done);
  });
  wrap.append(edit);
  if (getState().role === "owner") {
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "ap-btn ap-btn--danger";
    remove.textContent = "Delete proposal";
    remove.addEventListener("click", async () => {
      if (!await AppCore.ui.confirm({ title: "Delete proposal?", message: "This proposal will be permanently deleted.", confirmLabel: "Delete", danger: true })) return;
      remove.disabled = true;
      try {
        const { error } = await db.from("proposals").delete().eq("id", proposal.id);
        if (error) throw error;
        AppCore.ui.closeModal();
        AppCore.ui.toast("Proposal deleted.", "success");
        await done?.();
      } catch (error) {
        AppCore.ui.toast(AppCore.ui.describeError(error), "error");
      } finally {
        remove.disabled = false;
      }
    });
    wrap.append(remove);
  }
  AppCore.ui.openModal({ title: proposal.title, content: wrap, actions: [] });
}

async function renderInboxPage(container, context) {
  container.replaceChildren();
  container.className = "ap-module-content k-inbox-page-shell";

  const layout = document.createElement("div");
  layout.className = "k-inbox-layout";

  const left = document.createElement("section");
  left.className = "k-inbox-left ap-inbox-page";
  left.dataset.page = "true";

  const right = document.createElement("section");
  right.className = "k-inbox-right";

  layout.append(left, right);
  container.append(layout);

  await Promise.all([
    renderInbox(left, context),
    renderHome(right, context)
  ]);
}

function hideFolderChrome() { document.getElementById("page-header").hidden = true; document.getElementById("module-tabs").hidden = true; }
function showModuleChrome() { currentView="folder"; markNavigation("folder"); document.getElementById("page-header").hidden = false; document.getElementById("module-tabs").hidden = true; renderBreadcrumb(); renderFolderActions(); }

function markNavigation(view) {
  document.body.dataset.workspaceView=view;
  document.getElementById("workspace-sidebar")?.setAttribute("aria-hidden", String(innerWidth<=900?!document.body.classList.contains("ap-mobile-open"):!(["home","folder"].includes(view)||view.startsWith("library-"))));
  const rootView = view.startsWith("settings") ? "settings" : view;
  document.querySelectorAll("[data-global-view]").forEach((b) => b.classList.toggle("ap-rail-item--active", b.dataset.globalView === rootView || (rootView.startsWith("library-") && b.dataset.globalView === "library-everything")));
  document.querySelectorAll("[data-workspace-view]").forEach((b) => b.classList.toggle("ap-workspace-link--active", b.dataset.workspaceView === view));
  document.querySelectorAll("[data-library-view]").forEach((b) => b.classList.toggle("ap-library-nav__active", view === `library-${b.dataset.libraryView}`));
  if(rootView==="folder"||rootView.startsWith("library-"))document.querySelector('.ap-rail-nav [data-global-view="home"]')?.classList.add('ap-rail-item--active');
}

async function showView(view, options = {}) {
  applyTheme(getState().agency?.settings||{});
  currentView = view; await unmountActiveModule(); setState({ selectedModule: null, selectedResourceId: null, selectedFolderId: null }); renderFolderTree(); hideFolderChrome(); markNavigation(view);
  const content = document.getElementById("module-content"); content.className = "ap-module-content"; const context = AppCore.getModuleContext();
  if (view === "home") await renderHome(content, context);
  else if (view === "inbox") await renderInboxPage(content, context);
  else if (view === "proposals") await renderProposalsHub(content);
  else if (view === "clients") await renderClientsView(content);
  else if (view === "my-tasks" || view === "tasks") await renderTasksHub(content, context, { mineOnly: view === "my-tasks" });
  else if (view === "invoices") await renderInvoicesHub(content, context);
  else if (view === "settings") await renderSettingsHub(content, context, options.settingsSection || "home");
  else if (view === "profile") await renderProfilePage(content, AppCore.getModuleContext());
  else if (view.startsWith("library-")) { currentLibraryView = view.slice(8); await renderLibrary(content, context, currentLibraryView); }
  content.setAttribute("aria-busy", "false");
  if (!options.noHash) {
    if (view === "settings") history.replaceState(null, "", `#/settings/${options.settingsSection || "home"}`);
    else history.replaceState(null, "", `#/${view}`);
  }
}

async function showFolderOverview(folderId) {
  currentView = "folder"; await unmountActiveModule(); setState({ selectedModule: null, selectedResourceId: null, selectedFolderId: folderId }); hideFolderChrome(); markNavigation("folder"); renderFolderTree();
  const content = document.getElementById("module-content"); content.className = "ap-module-content";
  await renderFolderOverview(content, AppCore.getModuleContext(), folderId);
  content.setAttribute("aria-busy", "false");
  history.replaceState(null, "", `#/folder/${folderId}`);
}

function toggleLibrary() {
  const toggle = document.querySelector(".ap-library-toggle");
  const nav = document.querySelector(".ap-library-nav");
  if (!toggle || !nav) return;
  const open = toggle.getAttribute("aria-expanded") !== "false";
  toggle.setAttribute("aria-expanded", String(!open));
  nav.hidden = open;
}

function openMoreMenu() {
  const menu = document.getElementById("more-menu");
  if (!menu) return;
  if (!menu.hidden && menu.childElementCount) { menu.hidden = true; return; }
  menu.replaceChildren();
  const items = [
    ["Work", "home", () => showView("home")], ["Inbox", "inbox", () => showView("inbox")], ["Tasks", "tasks", () => showView("tasks")],
    ["Clients", "clients", () => showView("clients")], ["Proposals", "proposal", () => showView("proposals")], ["Library", "library", () => showView("library-everything")],
    ["Website Admin", "demo", () => openAdmin("website"), true], ["Settings", "settings", () => openAdmin("settings"), true], ["Archive", "archive", () => showView("library-archive")], ["Templates", "template", () => openTemplates(AppCore.getModuleContext())]
  ];
  items.forEach(([label, iconName, handler, ownerOnly]) => {
    if (ownerOnly && getState().role !== "owner") return;
    const item = document.createElement("button"); item.type = "button"; item.className = "ap-more-menu__item";
    const icon = document.createElement("span"); icon.className = "ap-more-menu__icon"; icon.append(workspaceIcon(iconName));
    const text = document.createElement("span"); text.className = "ap-more-menu__label"; text.textContent = label;
    item.append(icon, text); item.addEventListener("click", async event => { event.stopPropagation(); menu.hidden = true; await handler(); }); menu.append(item);
  });
  menu.hidden = false;
  menu.onclick = event => event.stopPropagation();
  setTimeout(() => document.addEventListener("click", () => { menu.hidden = true; }, { once: true }), 0);
}

function paintWorkspaceNavigationIcons() {
  const map = { home: "home", inbox: "inbox", proposals: "proposal", clients: "clients", tasks: "tasks", invoices: "invoice", more: "more", "library-everything": "library", settings: "settings" };
  Object.entries(map).forEach(([view, iconName]) => document.querySelectorAll(`[data-global-view="${view}"] .ap-rail-icon`).forEach(host => host.replaceChildren(workspaceIcon(iconName))));
  const homeIcon = document.querySelector('[data-workspace-view="home"] > span:first-child');
  if (homeIcon) homeIcon.replaceChildren(workspaceIcon("home"));
  const tasksIcon = document.querySelector('[data-workspace-view="my-tasks"] > span:first-child');
  if (tasksIcon) tasksIcon.replaceChildren(workspaceIcon("checkCircle"));
  const library = document.querySelector(".ap-library-toggle");
  const libraryIcon = library?.querySelector("span:first-child");
  if (libraryIcon) libraryIcon.replaceChildren(workspaceIcon("library"));
  const chevron = library?.querySelector(".ap-workspace-link__chev");
  if (chevron) chevron.replaceChildren(workspaceIcon("chevronDown"));
}

let workspaceNavigationBound = false;
function bindWorkspaceNavigation() {
  if (workspaceNavigationBound) return;
  const sidebar = document.getElementById("workspace-sidebar");
  if (!sidebar) return;
  workspaceNavigationBound = true;
  sidebar.addEventListener("click", async event => {
    const createMenu = event.target.closest(".ap-workspace-create");
    if (createMenu) { event.preventDefault(); const createType=currentView.startsWith("library-")?currentLibraryView:(hasActiveModule()?getState().selectedModule:"all"); openFolderCreateMenu({...AppCore.getModuleContext(),createType},getState().selectedFolderId,createMenu); return; }
    const newFolder = event.target.closest("#new-folder");
    if (newFolder) { event.preventDefault(); openCreateFolder(); return; }
    const workspaceButton = event.target.closest("button[data-workspace-view]");
    if (workspaceButton) { event.preventDefault(); await showView(workspaceButton.dataset.workspaceView); return; }
    const libraryToggle = event.target.closest(".ap-library-toggle");
    if (libraryToggle) {
      event.preventDefault();
      toggleLibrary();
      return;
    }
    const libraryItem = event.target.closest("[data-library-view]");
    if (libraryItem) { event.preventDefault(); await showView(`library-${libraryItem.dataset.libraryView}`); }
  });
}

function renderWorkspaceSidebarIcons() {
  const home = document.querySelector('[data-workspace-view="home"] > span:first-child');
  if (home) home.replaceChildren(workspaceIcon("home"));
  const tasks = document.querySelector('[data-workspace-view="my-tasks"] > span:first-child');
  if (tasks) tasks.replaceChildren(workspaceIcon("checkCircle"));
  const library = document.querySelector(".ap-library-toggle");
  const libraryIcon = library?.querySelector("span:first-child");
  if (libraryIcon) libraryIcon.replaceChildren(workspaceIcon("library"));
  const arrow = library?.querySelector(".ap-workspace-link__chev");
  if (arrow) arrow.replaceChildren(workspaceIcon("chevronDown"));
  const iconMap = { everything: "everything", favorites: "star", boards: "board", conversations: "conversation", docs: "document", embeds: "cube", files: "imageFile", archive: "archive", trash: "trash" };
  document.querySelectorAll(".ap-library-nav [data-library-view]").forEach(item => {
    const name = item.dataset.libraryView;
    let host = item.querySelector(".ap-library-nav__icon");
    if (!host) { host = document.createElement("span"); host.className = "ap-library-nav__icon"; item.prepend(host); }
    host.dataset.libraryIcon = iconMap[name] || "file";
    host.replaceChildren(workspaceIcon(iconMap[name] || "file"));
  });
  const newFolder = document.getElementById("new-folder");
  if (newFolder) newFolder.replaceChildren(workspaceIcon("plus"));
}

function bindShell() {
  document.addEventListener("resources:loaded",()=>renderFolderTree());
  document.addEventListener("data:changed",()=>loadResources().catch(console.error));
  const rail = document.querySelector(".ap-rail-nav--main");
  if (rail) {
    const order = ["home", "inbox", "tasks", "invoices", "more"];
    order.forEach((view) => {
      const button = rail.querySelector(`[data-global-view="${view}"]`) || document.querySelector(`.ap-rail-nav--bottom [data-global-view="${view}"]`);
      if (button) rail.append(button);
    });
  }

  const railIconMap = {
    home: "home",
    inbox: "inbox",
    proposals: "proposal",
    clients: "clients",
    tasks: "tasks",
    invoices: "invoice",
    settings: "settings",
    more: "more",
    "library-everything": "library"
  };

  Object.entries(railIconMap).forEach(([view, iconName]) => {
    document
      .querySelectorAll(`[data-global-view="${view}"] .ap-rail-icon`)
      .forEach((host) => {
        const icon = workspaceIcon(iconName);
        const svg = icon.querySelector("svg");

        host.replaceChildren(svg);
      });
  });

  document.addEventListener("workspace:home",()=>showView("home"));
  window.addEventListener("hashchange", async () => {
    const hash=location.hash;
    try {
      if(await openResourceRoute(hash))return;
      const folder=hash.match(/^#\/folder\/([0-9a-f-]+)$/i);
      if(folder) return await selectFolder(folder[1],{force:true});
      const resource=hash.match(/^#\/f\/([0-9a-f-]+)\/(conversation|boards|docs|files|invoices|embeds)(?:\/([0-9a-f-]+))?$/i);
      if(resource){await selectFolder(resource[1],{skipOverview:true,refreshModule:false});return await selectModule(resource[2],resource[3]||null);}
      if(hash.startsWith("#/settings/")) return await showView("settings",{settingsSection:hash.split("/")[2],noHash:true});
      const view=hash.slice(2);
      if(["home","clients","inbox","tasks","my-tasks","invoices","profile","proposals"].includes(view)||view.startsWith("library-")) await showView(view,{noHash:true});
    } catch(error) { AppCore.ui.toast(AppCore.ui.describeError(error),"error"); }
  });
  bindTabs();
  bindWorkspaceNavigation();
  document.querySelectorAll("[data-global-view]").forEach((b) => b.addEventListener("click", () => {
    const view = b.dataset.globalView;
    if (view === "more") return openMoreMenu();
    showView(view);
  }));
  document.getElementById("back-to-folder")?.addEventListener("click", () => { const id = getState().selectedFolderId; if (id) showFolderOverview(id); });
  document.getElementById("sidebar-toggle")?.addEventListener("click", () => document.body.classList.toggle("ap-sidebar-open"));
  document.getElementById("sidebar-backdrop")?.addEventListener("click", () => document.body.classList.remove("ap-sidebar-open"));
  document.addEventListener("folder:selected", (event) => {
    renderFolderTree(); renderBreadcrumb(); renderFolderActions(); document.body.classList.remove("ap-sidebar-open");
    if (event.detail?.folderId && !event.detail?.skipOverview) showFolderOverview(event.detail.folderId);
    else if (!event.detail?.folderId && !event.detail?.skipOverview && currentView === "folder") showView("home");
  });
  document.addEventListener("module:mounted", () => { if(!hasActiveModule()||!getState().selectedModule||!["conversation","boards","docs","files","invoices","embeds"].includes(getState().selectedModule))return; document.getElementById("module-content").className = "ap-module-content"; showModuleChrome(); });
  document.addEventListener("inbox:close", () => showView("home"));
  document.addEventListener("kitchen:clients", () => showView("clients"));
  document.addEventListener("kitchen:settings-nav", (event) => showView("settings", { settingsSection: event.detail?.section || "home" }));
  document.addEventListener("athar:create-proposal", async event => { await showView("proposals"); requestAnimationFrame(() => { const createButton = document.querySelector(".k-proposal-create") || document.querySelector(".k-proposals-head .k-btn--primary"); if (createButton) { createButton.dataset.folderId = event.detail?.folderId || ""; createButton.click(); delete createButton.dataset.folderId; } else AppCore.ui.toast("Proposal creation is not available yet.","warning"); }); });
  document.addEventListener("workspace:clients-updated", () => showView("clients"));
  document.addEventListener("athar:profile-updated", async () => {
    if (document.body.dataset.workspaceView === "profile") await renderProfilePage(document.getElementById("module-content"), AppCore.getModuleContext());
    renderUserMenu();
  });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") { document.body.classList.remove("ap-sidebar-open"); document.getElementById("inbox-panel").classList.remove("ap-inbox-panel--open"); document.getElementById("more-menu").hidden = true; } });
}

function renderShell() { renderAgencyIdentity(); renderUserMenu(); renderFolderTree(); renderClientSpaces(); renderBreadcrumb(); renderFolderActions(); renderSidebarAdmin(); paintWorkspaceNavigationIcons(); renderWorkspaceSidebarIcons(); bindWorkspaceNavigation(); const newFolder=document.getElementById('new-folder');if(newFolder)newFolder.hidden=!canCreate(getState().role);const input=document.querySelector("#global-search input"); if (input) {
  input.placeholder = `Search ${getState().agency?.name || ""}...`;
} }

async function boot() {
  try {
    const session = await restoreAuth("team"); if (!session) { location.replace('login.html'+(location.hash?'?next='+encodeURIComponent(location.hash):'')); return; }
    const staff = getState().memberships.filter((m) => isStaffRole(m.role)); if (!staff.length) { location.replace("client-view.html"+location.hash); return; }
    const remembered = localStorage.getItem("ap.lastAgencyId"); const initial = staff.find((m) => m.agency_id === remembered) || staff[0];
    await activateAgency(initial.agency_id); await loadResources(); bindShell(); renderShell(); document.getElementById("app").inert=false; await mountGlobalSearch(AppCore.getModuleContext());
    setState({ ready: true }); emit("app:ready", { agencyId: getState().agency.id, userId: getState().user.id, role: getState().role, surface: "team" });
    const hash = location.hash;
    const folderMatch = hash.match(/^#\/folder\/([0-9a-f-]+)$/i);
    const moduleMatch = hash.match(/^#\/f\/([0-9a-f-]+)\/(conversation|boards|docs|files|invoices|embeds)(?:\/([0-9a-f-]+))?$/i);
    if(await openResourceRoute(hash))return;
    if (moduleMatch && getState().folders.some((f) => f.id === moduleMatch[1])) { await selectFolder(moduleMatch[1], { skipOverview: true }); await selectModule(moduleMatch[2],moduleMatch[3]||null); }
    else if (folderMatch && getState().folders.some((f) => f.id === folderMatch[1])) { await selectFolder(folderMatch[1]); }
    else if (/^#\/settings\//.test(hash)) await showView("settings", { settingsSection: hash.split("/")[2] || "home", noHash: true });
    else if (/^#\/library-/.test(hash)) await showView(hash.slice(2), { noHash: true });
    else if (["#/home", "#/inbox", "#/proposals", "#/clients", "#/my-tasks", "#/tasks", "#/invoices", "#/profile"].includes(hash)) await showView(hash.slice(2), { noHash: true });
    else await showView("home");
  } catch (error) {
    document.getElementById("app").inert=false; console.error(error); const content = document.getElementById("module-content"); if (content) AppCore.ui.renderError(content, error, () => location.reload());
  }
}
boot();
