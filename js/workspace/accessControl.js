import { ROLE_DEFINITIONS } from "../core/permissions.js";
import { workspaceIcon } from "../views/workspaceIcons.js";

const OPTIONS = [
  ["private", "Private", "Only invited members", "lock"],
  ["shared", "Shared with Clients", "Only invited clients and members", "share"],
  ["internal", "Internal", "Any member invited to your workspace", "library"]
];
const INTERNAL_ROLES = ["admin", "manager", "creator", "uploader", "commenter", "downloader", "viewer"];

export function createAccessControl({ name, privacy = "private", internalRole = "viewer" }) {
  const fieldset = document.createElement("fieldset"); fieldset.className = "ap-folder-access";
  const legend = document.createElement("legend"); legend.textContent = "Who can access"; fieldset.append(legend);
  let selectedPrivacy = privacy;
  const roleSelect = document.createElement("select"); roleSelect.className = "ap-access-role ap-select"; roleSelect.setAttribute("aria-label", "Internal access level");
  for (const role of INTERNAL_ROLES) { const option = document.createElement("option"); option.value = role; option.textContent = ROLE_DEFINITIONS[role].label; option.title = ROLE_DEFINITIONS[role].description; option.selected = role === internalRole; roleSelect.append(option); }
  const sync = () => { roleSelect.hidden = selectedPrivacy !== "internal"; roleSelect.disabled = selectedPrivacy !== "internal"; };
  for (const [value, title, note, iconName] of OPTIONS) {
    const label = document.createElement("label"); label.className = "ap-folder-access__option";
    const radio = document.createElement("input"); radio.type = "radio"; radio.name = name; radio.value = value; radio.checked = value === selectedPrivacy;
    const copy = document.createElement("span"); copy.className = "ap-folder-access__copy"; const strong = document.createElement("strong"); strong.textContent = title; const small = document.createElement("small"); small.textContent = note; copy.append(strong, small);
    label.append(radio, workspaceIcon(iconName, "ap-folder-access__icon"), copy); if (value === "internal") label.append(roleSelect);
    radio.addEventListener("change", () => { if (radio.checked) { selectedPrivacy = value; sync(); } }); fieldset.append(label);
  }
  roleSelect.addEventListener("click", event => event.stopPropagation()); sync();
  return { element: fieldset, get privacy() { return selectedPrivacy; }, get internalRole() { return roleSelect.value; } };
}
