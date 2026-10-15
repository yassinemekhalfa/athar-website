import { openCreateFolder } from "./folderTree.js";
import { getState } from "../core/state.js";
import { workspaceIcon } from "../views/workspaceIcons.js";

function createButton({
  label,
  icon,
  active = false,
  onClick
}) {
  const button = document.createElement("button");

  button.type = "button";
  button.className = "v-sidebar-tool";

  if (active) {
    button.classList.add("is-active");
  }

  button.append(
    workspaceIcon(icon),
    document.createTextNode(label)
  );

  if (onClick) {
    button.addEventListener("click", onClick);
  }

  return button;
}

function dispatchWorkspaceView(view) {
  const target = document.querySelector(
    `[data-workspace-view="${view}"]`
  );

  if (target) {
    target.click();
  }
}

export function mountSidebarTools() {
  const sidebar = document.getElementById("workspace-sidebar");
  const nav = sidebar?.querySelector(".ap-workspace-nav");

  if (!sidebar || !nav) {
    return;
  }

  /*
   * ==========================================================
   * TOP NAVIGATION
   * ==========================================================
   */

  nav.replaceChildren();

  const homeButton = createButton({
    label: "Home",
    icon: "home",
    active: true,
    onClick: () => {
      dispatchWorkspaceView("home");
    }
  });

  const tasksButton = createButton({
    label: "My Tasks",
    icon: "checkCircle",
    onClick: () => {
      dispatchWorkspaceView("my-tasks");
    }
  });

  const libraryButton = createButton({
    label: "Library",
    icon: "library",
    onClick: () => {
      const libraryLink = document.querySelector(
        '[data-global-view="library-everything"]'
      );

      if (libraryLink) {
        libraryLink.click();
        return;
      }

      window.location.hash = "#/library-everything";
    }
  });

  nav.append(
    homeButton,
    tasksButton,
    libraryButton
  );

  /*
   * ==========================================================
   * BOTTOM CREATE ACTIONS
   * Inserted after folder tree so they look exactly like the
   * supplied reference image.
   * ==========================================================
   */

  sidebar
    .querySelector(".v-sidebar-create-area")
    ?.remove();

  const createArea = document.createElement("div");
  createArea.className = "v-sidebar-create-area";

  if (getState().role !== "client") {
    const newBoard = document.createElement("button");

    newBoard.type = "button";
    newBoard.className = "v-sidebar-create-button";

    newBoard.append(
      workspaceIcon("board"),
      document.createTextNode("New Board")
    );

    newBoard.addEventListener("click", () => {
      /*
       * For now this reproduces the UI.
       * Existing board creation functionality can be connected
       * during the next stage.
       */
      document.dispatchEvent(
        new CustomEvent("athar:new-board")
      );
    });

    const newConversation = document.createElement("button");

    newConversation.type = "button";
    newConversation.className = "v-sidebar-create-button";

    newConversation.append(
      workspaceIcon("conversation"),
      document.createTextNode("New Conversation")
    );

    newConversation.addEventListener("click", () => {
      document.dispatchEvent(
        new CustomEvent("athar:new-conversation")
      );
    });

    const newFolder = document.createElement("button");

    newFolder.type = "button";
    newFolder.className = "v-sidebar-create-button";

    newFolder.append(
      workspaceIcon("folderFilled"),
      document.createTextNode("New folder")
    );

    newFolder.addEventListener("click", () => {
      openCreateFolder();
    });

    createArea.append(
      newBoard,
      newConversation,
      newFolder
    );
  }

  const folderTree = document.getElementById("folder-tree");

  if (folderTree) {
    folderTree.insertAdjacentElement(
      "afterend",
      createArea
    );
  } else {
    sidebar.append(createArea);
  }
}