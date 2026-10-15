import { workspaceIcon } from "../views/workspaceIcons.js";
import { AppCore } from "../core/appCore.js";

let activeMenu = null;

function closeActiveMenu() {
  if (!activeMenu) return;
  const { menu, onKeyDown, onPointerDown } = activeMenu;
  menu.remove();
  document.removeEventListener("keydown", onKeyDown);
  document.removeEventListener("pointerdown", onPointerDown);
  activeMenu = null;
}

export function openWorkspaceActionMenu(anchor, groups, options = {}) {
  closeActiveMenu();
  const menu = document.createElement("div");
  menu.className = `ap-item-action-menu ${options.className || ""}`;
  menu.setAttribute("role", "menu");
  menu.setAttribute("aria-label", "Item actions");
  const run = async action => {
    closeActiveMenu();
    try { await action(); }
    catch (error) { AppCore.ui.toast(AppCore.ui.describeError(error), "error"); }
  };
  const render = (sections, parent = null) => {
  menu.replaceChildren();
  if (parent) sections = [[{ label: "Back", icon: "arrowLeft", children: parent }], ...sections];
  for (const [groupIndex, group] of sections.entries()) {
    if (groupIndex) {
      const separator = document.createElement("div");
      separator.className = "ap-item-action-menu__separator";
      separator.setAttribute("role", "separator");
      menu.append(separator);
    }
    for (const action of group) {
      if (action.colors) {
        const palette = document.createElement("div");
        palette.className = "ap-item-action-menu__colors";
        palette.setAttribute("aria-label", action.label);
        for (const color of action.colors) {
          const swatch = document.createElement("button");
          swatch.type = "button";
          swatch.className = "ap-menu-swatch";
          swatch.style.setProperty("--swatch", color.value === "none" ? "#fff" : color.value);
          swatch.setAttribute("role", "menuitemradio");
          swatch.setAttribute("aria-label", `${action.label}: ${color.label}`);
          swatch.setAttribute("aria-checked", String(color.value === action.value));
          if (color.value === action.value) swatch.append(workspaceIcon("check"));
          swatch.addEventListener("click", () => run(() => action.run(color.value)));
          palette.append(swatch);
        }
        menu.append(palette);
        continue;
      }
      const item = document.createElement("button");
      item.type = "button";
      item.className = `ap-item-action-menu__item${action.danger ? " is-danger" : ""}`;
      item.setAttribute("role", "menuitem");
      item.append(workspaceIcon(action.icon || "more"), document.createTextNode(action.label));
      if (action.disabled) item.disabled = true;
      if (action.children) {
        item.setAttribute("aria-haspopup", "menu");
        item.append(workspaceIcon("chevronRight", "ap-menu-chevron"));
      }
      item.addEventListener("click", () => {
        if (action.children) {
          render(action.children, action.label === "Back" ? null : sections);
          menu.querySelector("button:not(:disabled)")?.focus();
        } else run(action.run);
      });
      menu.append(item);
    }
  }
  };
  render(groups);
  document.body.append(menu);

  const rect = anchor.getBoundingClientRect();
  const width = menu.offsetWidth;
  const below = window.innerHeight - rect.bottom - 12;
  const above = rect.top - 12;
  const placeBelow = below >= Math.min(menu.offsetHeight, 300) || below >= above;
  menu.style.setProperty("max-height", `${Math.max(80, Math.min(menu.offsetHeight, placeBelow ? below : above))}px`, "important");
  const height = menu.offsetHeight;
  const left = Math.max(8, Math.min(rect.left, window.innerWidth - width - 8));
  const top = placeBelow
    ? rect.bottom + 4
    : Math.max(8, rect.top - height - 4);
  menu.style.left = `${left}px`;
  menu.style.top = `${top}px`;

  const onKeyDown = event => {
    if (event.key === "Escape") {
      event.preventDefault();
      closeActiveMenu();
      anchor.focus();
    }
    if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
      event.preventDefault();
      const items = [...menu.querySelectorAll("button:not(:disabled)")];
      const index = items.indexOf(document.activeElement);
      const next = event.key === "Home" ? 0 : event.key === "End" ? items.length - 1 : (index + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
      items[next]?.focus();
    }
    if (event.key === "Tab") closeActiveMenu();
  };
  const onPointerDown = event => {
    if (!menu.contains(event.target) && !anchor.contains(event.target)) closeActiveMenu();
  };
  activeMenu = { menu, onKeyDown, onPointerDown };
  document.addEventListener("keydown", onKeyDown);
  document.addEventListener("pointerdown", onPointerDown);
}
