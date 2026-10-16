import {openResourceRoute} from './workspace/resourceRoute.js';
import {renderProfilePage} from './views/profilePage.js?v=password-library-1';
import {isClientRole,roleBadge} from './core/permissions.js';
import './core/adaptive.js';
import { loadResources } from "./workspace/resources.js";

import {
  restoreAuth,
  signOut
} from "./auth/auth.js";

import {
  getState,
  setState
} from "./core/state.js";

import { emit } from "./core/events.js";

import {
  activateAgency
} from "./workspace/agencies.js";

import {
  renderFolderTree
} from "./workspace/folderTree.js";

import {
  renderBreadcrumb,
  selectFolder
} from "./workspace/folders.js";

import {
  selectModule,
  unmountActiveModule
} from "./core/moduleRegistry.js";

import {
  mountGlobalSearch
} from "./modules/search.js";

import {
  AppCore
} from "./core/appCore.js";

import {
  renderHome,
  renderTasksHub,
  renderInvoicesHub,
  renderLibrary,
  renderInbox,
  renderFolderOverview,
  renderProfileView
} from "./views/portalViews.js?v=client-conversation-1";

import {
  workspaceIcon
} from "./views/workspaceIcons.js";

let currentView = "home";

/* ==========================================================
   UTILITY
   ========================================================== */

function replaceIcon(
  selector,
  iconName
) {
  const host =
    document.querySelector(selector);

  if (!host) return;

  host.replaceChildren(
    workspaceIcon(iconName)
  );
}

/* ==========================================================
   STATIC ICONS
   ========================================================== */

function paintClientIcons() {
  replaceIcon(
    '[data-global-view="home"] .ap-rail-icon',
    "home"
  );

  replaceIcon(
    '[data-global-view="inbox"] .ap-rail-icon',
    "inbox"
  );

  replaceIcon(
    '[data-global-view="tasks"] .ap-rail-icon',
    "tasks"
  );

  replaceIcon(
    '[data-global-view="invoices"] .ap-rail-icon',
    "invoice"
  );

  replaceIcon(
    '[data-workspace-view="home"] .ap-workspace-icon',
    "home"
  );

  replaceIcon(
    '[data-workspace-view="my-tasks"] .ap-workspace-icon',
    "checkCircle"
  );

  replaceIcon(
    ".ap-library-toggle .ap-workspace-icon",
    "library"
  );

  replaceIcon(
    ".ap-library-toggle .ap-workspace-link__chev",
    "chevronDown"
  );

  const libraryIcons = {
    everything: "library",
    boards: "board",
    conversations: "conversation",
    docs: "document",
    embeds: "embed",
    files: "file"
  };

  Object.entries(
    libraryIcons
  ).forEach(
    ([view, icon]) => {
      const host =
        document.querySelector(
          `[data-library-view="${view}"] .ap-library-nav__icon`
        );

      if (!host) return;

      host.replaceChildren(
        workspaceIcon(icon)
      );
    }
  );

  replaceIcon(
    "#global-search .ap-search__icon",
    "search"
  );
}

/* ==========================================================
   IDENTITY
   ========================================================== */

function renderIdentity() {
  const s =
    getState();

  const brand =
    document.querySelector(
      ".ap-rail-brand"
    );

  if (brand) {
    brand.replaceChildren();

    if (s.agency?.logo_url) {
      const image =
        document.createElement(
          "img"
        );

      image.src =
        s.agency.logo_url;

      image.alt =
        s.agency.name ||
        "Workspace";

      brand.append(image);
    } else {
      const initial =
        document.createElement(
          "span"
        );

      initial.className =
        "ap-client-brand-fallback";

      initial.textContent =
        (
          s.agency?.name ||
          "A"
        )
          .charAt(0)
          .toUpperCase();

      brand.append(initial);
    }
  }

  const host =
    document.getElementById(
      "agency-identity"
    );

  host.replaceChildren();

  if (s.agency?.logo_url) {
    const img =
      document.createElement(
        "img"
      );

    img.className =
      "ap-workspace-logo";

    img.src =
      s.agency.logo_url;

    img.alt =
      s.agency.name || "";

    host.append(img);
  } else {
    const logo =
      document.createElement(
        "span"
      );

    logo.className =
      "ap-workspace-logo ap-workspace-logo--fallback";

    logo.textContent =
      (
        s.agency?.name ||
        "A"
      )
        .charAt(0)
        .toUpperCase();

    host.append(logo);
  }

  const name =
    document.createElement(
      "strong"
    );

  name.className =
    "ap-client-workspace-name";

  name.textContent =
    s.agency?.name ||
    "Workspace";

  host.append(name);

  const user =
    document.getElementById(
      "user-menu"
    );

  user.replaceChildren();

  const trigger =
    document.createElement(
      "button"
    );

  trigger.type =
    "button";

  trigger.className =
    "ap-profile-trigger";

  trigger.setAttribute(
    "aria-label",
    "Open profile menu"
  );

  trigger.setAttribute(
    "aria-expanded",
    "false"
  );

  const avatar =
    document.createElement(
      "span"
    );

  avatar.className =
    "ap-profile-avatar";

  avatar.textContent =
    AppCore.utils.initials(
      s.profile?.full_name ||
      s.user?.email ||
      "U"
    );

  trigger.append(avatar);

  const menu =
    document.createElement(
      "div"
    );

  menu.className =
    "ap-profile-menu";

  menu.hidden =
    true;

  const profile =
    document.createElement(
      "button"
    );

  profile.type =
    "button";

  profile.className =
    "ap-profile-menu__item";

  profile.append(
    workspaceIcon("user"),
    document.createTextNode(
      "Profile"
    )
  );

  profile.addEventListener(
    "click",
    async () => {
      closeMenu();
      await showView("profile");
    }
  );

  const logout =
    document.createElement(
      "button"
    );

  logout.type =
    "button";

  logout.className =
    "ap-profile-menu__item";

  logout.append(
    workspaceIcon("logout"),
    document.createTextNode(
      "Log out"
    )
  );

  logout.addEventListener(
    "click",
    async () => {
      closeMenu();
      await signOut();
    }
  );

  const identity = document.createElement("div");
  identity.className = "ap-client-profile-identity";
  const identityCopy = document.createElement("span");
  identityCopy.textContent = s.profile?.full_name || s.user?.email || "Client";
  identity.append(identityCopy, roleBadge(s.role));

  menu.append(
    identity,
    profile,
    logout
  );

  function closeMenu() {
    menu.hidden = true;
    trigger.setAttribute(
      "aria-expanded",
      "false"
    );
  }

  trigger.addEventListener(
    "click",
    event => {
      event.stopPropagation();
      menu.hidden = !menu.hidden;
      trigger.setAttribute(
        "aria-expanded",
        String(!menu.hidden)
      );
    }
  );

  document.addEventListener(
    "click",
    event => {
      if (
        !user.contains(
          event.target
        )
      ) {
        closeMenu();
      }
    }
  );

  user.append(
    trigger,
    menu
  );
}

/* ==========================================================
   CHROME
   ========================================================== */

function hideChrome() {
  document.getElementById(
    "page-header"
  ).hidden = true;

  document.getElementById(
    "module-tabs"
  ).hidden = true;
}

function showModuleChrome() {
  document.getElementById(
    "page-header"
  ).hidden = false;

  document.getElementById(
    "module-tabs"
  ).hidden = false;

  renderBreadcrumb();
}

/* ==========================================================
   ACTIVE STATES
   ========================================================== */

function mark(view) {
  document
    .querySelectorAll(
      "[data-global-view]"
    )
    .forEach(button => {
      let active = false;
      const item =
        button.dataset.globalView;

      if (
        view === "home" &&
        item === "home"
      ) {
        active = true;
      }

      if (
        view === "inbox" &&
        item === "inbox"
      ) {
        active = true;
      }

      if (
        (
          view === "tasks" ||
          view === "my-tasks"
        ) &&
        item === "tasks"
      ) {
        active = true;
      }

      if (
        view === "invoices" &&
        item === "invoices"
      ) {
        active = true;
      }

      button.classList.toggle(
        "ap-rail-item--active",
        active
      );

      if (active) {
        button.setAttribute(
          "aria-current",
          "page"
        );
      } else {
        button.removeAttribute(
          "aria-current"
        );
      }
    });

  document
    .querySelectorAll(
      "[data-workspace-view]"
    )
    .forEach(button => {
      const active =
        button.dataset.workspaceView ===
        view;

      button.classList.toggle(
        "ap-workspace-link--active",
        active
      );
    });

  const isLibrary =
    view.startsWith(
      "library-"
    );

  document
    .querySelector(
      ".ap-library-toggle"
    )
    ?.classList.toggle(
      "ap-workspace-link--active",
      isLibrary
    );

  document
    .querySelectorAll(
      "[data-library-view]"
    )
    .forEach(button => {
      const active =
        view ===
        `library-${button.dataset.libraryView}`;

      button.classList.toggle(
        "ap-library-nav__active",
        active
      );

      if (active) {
        button.setAttribute(
          "aria-current",
          "page"
        );
      } else {
        button.removeAttribute(
          "aria-current"
        );
      }
    });
}

function setLibraryOpen(open) {
  const toggle =
    document.querySelector(
      ".ap-library-toggle"
    );

  const nav =
    document.querySelector(
      ".ap-library-nav"
    );

  if (!toggle || !nav) {
    return;
  }

  toggle.setAttribute(
    "aria-expanded",
    String(open)
  );

  nav.hidden = !open;

  toggle.classList.toggle(
    "is-open",
    open
  );
}

async function showView(
  view,
  noHash = false
) {
  currentView = view;
  document.body.dataset.workspaceView = view;

  await unmountActiveModule();

  setState({
    selectedModule: null,
    selectedFolderId: null
  });

  renderFolderTree();
  hideChrome();
  mark(view);

  if (view.startsWith("library-")) {
    setLibraryOpen(true);
  }

  const content =
    document.getElementById(
      "module-content"
    );

  content.classList.remove(
    "ap-inbox-page"
  );

  const context =
    AppCore.getModuleContext();

  if (view === "home") {
    await renderHome(content, context);
  } else if (view === "inbox") {
    await renderInbox(content, context);
  } else if (
    view === "my-tasks" ||
    view === "tasks"
  ) {
    await renderTasksHub(content, context, {
      mineOnly: true
    });
  } else if (view === "invoices") {
    await renderInvoicesHub(content, context);
  } else if (view === "profile") {
    renderProfilePage(content, context, {
      onBack: () => showView("home"),
      onLogout: signOut
    });
  } else if (view.startsWith("library-")) {
    await renderLibrary(
      content,
      context,
      view.slice(8)
    );
  }

  if (!noHash) {
    history.replaceState(
      null,
      "",
      `#/${view}`
    );
  }
}

async function showFolder(id) {
  currentView = "folder";
  document.body.dataset.workspaceView = "folder";

  await unmountActiveModule();

  setState({
    selectedModule: null,
    selectedFolderId: id
  });

  hideChrome();
  mark("folder");
  renderFolderTree();

  await renderFolderOverview(
    document.getElementById("module-content"),
    AppCore.getModuleContext(),
    id
  );

  history.replaceState(
    null,
    "",
    `#/folder/${id}`
  );
}

function bind() {
  document.addEventListener('athar:profile-updated',()=>{renderIdentity();if(currentView==='profile')renderProfilePage(document.getElementById('module-content'));});
  window.addEventListener('hashchange', async()=>{try{const hash=location.hash;if(await openResourceRoute(hash))return;const module=hash.match(/^#\/f\/([0-9a-f-]+)\/(conversation|boards|docs|files|invoices|embeds)(?:\/([0-9a-f-]+))?$/i);const folder=hash.match(/^#\/folder\/([0-9a-f-]+)$/i);if(module){await selectFolder(module[1],{skipOverview:true,refreshModule:false});await selectModule(module[2],module[3]||null);}else if(folder)await selectFolder(folder[1],{force:true});else if(['home','inbox','tasks','my-tasks','invoices','profile'].includes(hash.slice(2))||hash.startsWith('#/library-'))await showView(hash.slice(2),true);}catch(error){AppCore.ui.toast(AppCore.ui.describeError(error),'error');}});
  document.addEventListener('resources:loaded',renderFolderTree);
  document.addEventListener('data:changed',()=>loadResources().catch(console.error));
  document.addEventListener(
    "workspace:home",
    () => showView("home")
  );

  document
    .querySelectorAll(
      "#module-tabs [data-module]"
    )
    .forEach(button => {
      button.addEventListener(
        "click",
        () => selectModule(button.dataset.module)
      );
    });

  const libraryToggle =
    document.querySelector(
      ".ap-library-toggle"
    );

  libraryToggle?.addEventListener(
    "click",
    () => {
      const open =
        libraryToggle.getAttribute(
          "aria-expanded"
        ) !== "false";

      setLibraryOpen(!open);
    }
  );

  document
    .querySelectorAll(
      "[data-workspace-view]"
    )
    .forEach(button => {
      button.addEventListener(
        "click",
        () => showView(button.dataset.workspaceView)
      );
    });

  document
    .querySelectorAll(
      "[data-library-view]"
    )
    .forEach(button => {
      button.addEventListener(
        "click",
        async () => {
          setLibraryOpen(true);
          await showView(
            `library-${button.dataset.libraryView}`
          );
        }
      );
    });

  document
    .querySelectorAll(
      "[data-global-view]"
    )
    .forEach(button => {
      button.addEventListener(
        "click",
        () => {
          const view =
            button.dataset.globalView;
          showView(view);
        }
      );
    });

  document
    .getElementById("back-to-folder")
    ?.addEventListener(
      "click",
      () => {
        const id = getState().selectedFolderId;
        if (id) {
          showFolder(id);
        }
      }
    );

  document
    .getElementById("sidebar-toggle")
    ?.addEventListener(
      "click",
      () => {
        document.body.classList.toggle(
          "ap-sidebar-open"
        );
      }
    );

  document
    .getElementById("sidebar-backdrop")
    ?.addEventListener(
      "click",
      () => {
        document.body.classList.remove(
          "ap-sidebar-open"
        );
      }
    );

  document.addEventListener(
    "folder:selected",
    event => {
      renderFolderTree();
      renderBreadcrumb();
      document.body.classList.remove(
        "ap-sidebar-open"
      );

      if (
        event.detail?.folderId &&
        !event.detail?.skipOverview
      ) {
        showFolder(event.detail.folderId);
      } else if (
        !event.detail?.folderId &&
        currentView === "folder"
      ) {
        showView("home");
      }
    }
  );

  document.addEventListener(
    "module:mounted",
    () => {
      currentView = "folder";
      document.body.dataset.workspaceView = "folder";
      mark("folder");
      showModuleChrome();
    }
  );

  document.addEventListener(
    "inbox:close",
    () => showView("home")
  );

  document.addEventListener(
    "keydown",
    event => {
      if (event.key === "Escape") {
        document.body.classList.remove(
          "ap-sidebar-open"
        );

        document
          .getElementById("inbox-panel")
          ?.classList.remove(
            "ap-inbox-panel--open"
          );
      }
    }
  );
}

async function boot() {
  try {
    const session =
      await restoreAuth("client");

    if (!session) {
      location.replace('login.html'+(location.hash?'?next='+encodeURIComponent(location.hash):''));
      return;
    }

    const memberships =
      getState().memberships.filter(
        membership =>
          isClientRole(membership.role)
      );

    if (!memberships.length) {
      location.replace("workspace.html"+location.hash);
      return;
    }

    const remembered =
      localStorage.getItem("ap.lastAgencyId");

    const member =
      memberships.find(
        membership =>
          membership.agency_id === remembered
      ) || memberships[0];

    await activateAgency(member.agency_id);
    await loadResources();

    if (!isClientRole(getState().role)) {
      location.replace("workspace.html"+location.hash);
      return;
    }

    setState({ surface: "client" });

    bind();
    renderIdentity();
    paintClientIcons();
    renderFolderTree();
    renderBreadcrumb();

    await mountGlobalSearch(
      AppCore.getModuleContext()
    );

    setState({ ready: true });

    emit("app:ready", {
      agencyId: getState().agency.id,
      userId: getState().user.id,
      role: getState().role,
      surface: "client"
    });

    const hash = location.hash;
    if(await openResourceRoute(hash))return;
    const folderMatch =
      hash.match(/^#\/folder\/([0-9a-f-]+)$/i);

    const moduleMatch =
      hash.match(
        /^#\/f\/([0-9a-f-]+)\/(conversation|boards|docs|files|invoices|embeds)(?:\/([0-9a-f-]+))?$/i
      );

    if (
      moduleMatch &&
      getState().folders.some(
        folder => folder.id === moduleMatch[1]
      )
    ) {
      currentView = "folder";
      document.body.dataset.workspaceView = "folder";
      mark("folder");

      await selectFolder(moduleMatch[1], {
        skipOverview: true
      });

      await selectModule(
        moduleMatch[2],
        moduleMatch[3] || null
      );
    } else if (
      folderMatch &&
      getState().folders.some(
        folder => folder.id === folderMatch[1]
      )
    ) {
      await showFolder(folderMatch[1]);
    } else if (/^#\/library-/.test(hash)) {
      await showView(hash.slice(2), true);
    } else if (
      [
        "#/home",
        "#/inbox",
        "#/my-tasks",
        "#/tasks",
        "#/invoices",
        "#/profile"
      ].includes(hash)
    ) {
      await showView(hash.slice(2), true);
    } else {
      await showView("home");
    }
  } catch (error) {
    console.error(error);
    AppCore.ui.renderError(
      document.getElementById("module-content"),
      error,
      () => location.reload()
    );
  }
}

boot();
