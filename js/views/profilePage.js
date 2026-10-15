import {roleBadge} from '../core/permissions.js';
import { AppCore } from "../core/appCore.js";
import { getState, setState } from "../core/state.js";
import { db } from "../dataClient.js";
import { signOut } from "../auth/auth.js";
import { workspaceIcon } from "./workspaceIcons.js";

function el(tag, className = "", text = null) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== null) node.textContent = text;
  return node;
}

function profileMeta(){return getState().profile?.preferences||{};}
async function saveMeta(patch){const state=getState(),next={...profileMeta(),...patch};const {error}=await db.from('profiles').update({preferences:next}).eq('id',state.user.id);if(error)throw error;setState({profile:{...state.profile,preferences:next}});}

function initials(value) { return AppCore.utils.initials(value || "U"); }
function nameValue() { const state = getState(); return state.profile?.full_name || state.user?.email?.split("@")[0] || "User"; }

function openEditor({ title, label, value = "", type = "text", options = null, onSave }) {
  const form = el("form", "k-profile-editor");
  const field = el("label", "k-profile-editor__field");
  field.append(el("span", "k-profile-editor__label", label));
  let control;
  if (options) {
    control = document.createElement("select");
    control.className = "ap-input k-profile-editor__input";
    options.forEach(optionData => { const option = document.createElement("option"); option.value = optionData.value; option.textContent = optionData.label; option.selected = option.value === value; control.append(option); });
  } else {
    control = document.createElement("input");
    control.className = "ap-input k-profile-editor__input";
    control.type = type;
    control.value = value;
  }
  field.append(control);
  const actions = el("div", "k-profile-editor__actions");
  const cancel = el("button", "ap-btn ap-btn--secondary", "Cancel"); cancel.type = "button";
  const save = el("button", "ap-btn ap-btn--primary", "Save"); save.type = "submit";
  cancel.addEventListener("click", () => AppCore.ui.closeModal()); actions.append(cancel, save); form.append(field, actions);
  form.addEventListener("submit", async event => { event.preventDefault(); save.disabled = true; try { await onSave(control.value.trim()); AppCore.ui.closeModal(); AppCore.ui.toast("Saved successfully.", "success"); document.dispatchEvent(new CustomEvent("athar:profile-updated")); } catch (error) { AppCore.ui.toast(AppCore.ui.describeError(error), "error"); } finally { save.disabled = false; } });
  AppCore.ui.openModal({ title, content: form, actions: [] });
  requestAnimationFrame(() => control.focus());
}

function updateLocalMeta(key, value) { return saveMeta({ [key]: value }); }

function profileRow({ label, value, hint, action, icon = "edit", danger = false }) {
  const row = document.createElement(action ? "button" : "div");
  row.className = `k-profile-row${action ? " k-profile-row--action" : ""}${danger ? " k-profile-row--danger" : ""}`;
  if (action) { row.type = "button"; row.addEventListener("click", action); }
  const copy = el("span", "k-profile-row__copy"); copy.append(el("strong", "", label)); if (hint) copy.append(el("small", "", hint));
  const right = el("span", "k-profile-row__right"); right.append(el("span", "k-profile-row__value", value || "Not set")); if (action) right.append(workspaceIcon(icon, "k-profile-row__action-icon"));
  row.append(copy, right); return row;
}

function section(title) { const node = el("section", "k-profile-section"); node.append(el("h2", "k-profile-section__title", title)); return node; }

function openNotifications(){const current=getState().profile?.notification_preferences||{};const form=el('form','ap-stack');form.append(el('p','','In-app preferences. Email and push delivery are not connected in local mode.'));const inputs={};for(const [key,label] of [['messages','New messages'],['tasks','Task updates'],['files','File updates'],['invoices','Invoice updates'],['invitations','Invitations']]){const wrap=el('label','ap-settings-item'),input=el('input');input.type='checkbox';input.checked=current[key]!==false;inputs[key]=input;wrap.append(label,input);form.append(wrap);}const save=el('button','ap-btn ap-btn--primary','Save preferences');save.type='submit';form.append(save);form.addEventListener('submit',async e=>{e.preventDefault();save.disabled=true;try{const preferences=Object.fromEntries(Object.entries(inputs).map(([k,v])=>[k,v.checked]));const {error}=await db.from('profiles').update({notification_preferences:preferences}).eq('id',getState().user.id);if(error)throw error;setState({profile:{...getState().profile,notification_preferences:preferences}});AppCore.ui.closeModal();AppCore.ui.toast('Preferences saved.','success');}catch(error){AppCore.ui.toast(AppCore.ui.describeError(error),'error');}finally{save.disabled=false;}});AppCore.ui.openModal({title:'Notification Preferences',content:form,actions:[]});}
function changePassword(){const form=el('form','ap-stack');const controls=[];for(const title of ['Current password','New password','Confirm new password']){const label=el('label','ap-field'),input=el('input','ap-input');input.type='password';input.required=true;input.minLength=title==='Current password'?1:8;input.autocomplete=title==='Current password'?'current-password':'new-password';label.append(el('span','',title),input);form.append(label);controls.push(input);}const save=el('button','ap-btn ap-btn--primary','Change password');save.type='submit';form.append(save);form.addEventListener('submit',async e=>{e.preventDefault();if(controls[1].value!==controls[2].value)return AppCore.ui.toast('New passwords do not match.','warning');save.disabled=true;try{const {error}=await db.auth.updateUser({current_password:controls[0].value,password:controls[1].value});if(error)throw error;AppCore.ui.closeModal();AppCore.ui.toast('Password updated. Other sessions have been signed out.','success');}catch(error){AppCore.ui.toast(AppCore.ui.describeError(error),'error');}finally{save.disabled=false;}});AppCore.ui.openModal({title:'Change password',content:form,actions:[]});}

export async function renderProfilePage(container) {
  container.replaceChildren(); container.className = "ap-module-content k-profile-page-host";
  const state = getState(); const user = state.user || {}; const profile = state.profile || {}; const meta = profileMeta();
  const page = el("section", "k-profile-page"); const header = el("header", "k-profile-header");
  const back = el("button", "k-profile-back", "←"); back.type = "button"; back.setAttribute("aria-label", "Back to Home"); back.addEventListener("click", () => document.querySelector('[data-global-view="home"]')?.click() || window.location.assign("#/home"));
  const avatar = el("span", "k-profile-page-avatar", initials(nameValue())); const identity = el("div", "k-profile-header__identity"); identity.append(el("h1", "", nameValue()), roleBadge(state.role),el("p", "", user.email || "")); header.append(back, avatar, identity); page.append(header);

  const personal = section("Personal Information");
  personal.append(profileRow({ label: "Name", value: profile.full_name || nameValue(), hint: "Your full account name.", action: () => openEditor({ title: "Edit Name", label: "Full name", value: profile.full_name || "", onSave: async value => { if (!value) throw new Error("Name cannot be empty."); const result = await db.from("profiles").update({ full_name: value }).eq("id", user.id); if (result.error) throw result.error; setState({ profile: { ...getState().profile, full_name: value } }); await saveMeta({ full_name: value }); } }) }));
  personal.append(profileRow({ label: "Email", value: user.email, hint: "Used to sign in and receive account messages.", action: () => changeEmail(), icon: "edit" }));
  personal.append(profileRow({ label: "Display name", value: `@${meta.display_name || nameValue().toLowerCase().replace(/\s+/g, "")}`, hint: "The short name displayed around the workspace.", action: () => openEditor({ title: "Edit Display Name", label: "Display name", value: meta.display_name || "", onSave: async value => { const clean = value.replace(/^@/, "").trim(); if (!clean) throw new Error("Display name cannot be empty."); await updateLocalMeta("display_name", clean); } }) }));
  personal.append(profileRow({ label: "Phone number", value: meta.phone_number, hint: "Optional contact phone number.", action: () => openEditor({ title: "Edit Phone Number", label: "Phone number", type: "tel", value: meta.phone_number || "", onSave: value => updateLocalMeta("phone_number", value) }) })); page.append(personal);

  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "Africa/Algiers"; const localization = section("Localization");
  localization.append(profileRow({ label: "Interface Language", value: ({ en: "English", fr: "Français", ar: "العربية" })[meta.interface_language || "en"], hint: "Set your preferred workspace language.", action: () => openEditor({ title: "Interface Language", label: "Language", value: meta.interface_language || "en", options: [{ value: "en", label: "English" }, { value: "fr", label: "Français" }, { value: "ar", label: "العربية" }], onSave: async value => { await updateLocalMeta("interface_language", value); document.documentElement.lang = value; document.documentElement.dir = value === "ar" ? "rtl" : "ltr"; } }) }));
  localization.append(profileRow({ label: "Timezone", value: meta.timezone || timezone, hint: "Used for dates and activity times.", action: () => openEditor({ title: "Timezone", label: "Timezone", value: meta.timezone || timezone, options: [{ value: timezone, label: `Local — ${timezone}` }, { value: "Africa/Algiers", label: "Africa/Algiers" }, { value: "Europe/Paris", label: "Europe/Paris" }, { value: "UTC", label: "UTC" }], onSave: value => updateLocalMeta("timezone", value) }) }));
  localization.append(profileRow({ label: "Date Format", value: meta.date_format || "DD/MM/YYYY · 24-Hour", hint: "Controls how dates and time are displayed.", action: () => openEditor({ title: "Date Format", label: "Format", value: meta.date_format || "DD/MM/YYYY · 24-Hour", options: [{ value: "DD/MM/YYYY · 24-Hour", label: "DD/MM/YYYY · 24-Hour" }, { value: "MM/DD/YYYY · 12-Hour", label: "MM/DD/YYYY · 12-Hour" }, { value: "YYYY-MM-DD · 24-Hour", label: "YYYY-MM-DD · 24-Hour" }], onSave: value => updateLocalMeta("date_format", value) }) }));
  localization.append(profileRow({ label: "First Day of the Week", value: meta.first_day_of_week || "Monday", hint: "Used by calendars and scheduling views.", action: () => openEditor({ title: "First Day of the Week", label: "First day", value: meta.first_day_of_week || "Monday", options: [{ value: "Monday", label: "Monday" }, { value: "Saturday", label: "Saturday" }, { value: "Sunday", label: "Sunday" }], onSave: value => updateLocalMeta("first_day_of_week", value) }) })); page.append(localization);

  const notifications = section("Notifications"); notifications.append(profileRow({ label: "Notification Preferences", value: "Manage", hint: "Choose which workspace notifications you receive.", icon: "bell", action: openNotifications })); page.append(notifications);
  const account = section("Account");account.append(profileRow({label:"Password",value:"Change",hint:"Update your local account password.",action:changePassword})); account.append(profileRow({ label: "Log out", value: "", hint: "Sign out from this device.", icon: "logout", danger: true, action: async () => { if (!await AppCore.ui.confirm({ title: "Log out?", message: "You will need to sign in again to access this workspace.", confirmLabel: "Log out" })) return; await signOut(); } })); page.append(account);
  container.append(page);
}

function changeEmail(){const form=el('form','ap-stack');const emailLabel=el('label','ap-field'),passwordLabel=el('label','ap-field');const email=el('input','ap-input'),password=el('input','ap-input');email.type='email';email.value=getState().user.email;email.required=true;password.type='password';password.autocomplete='current-password';password.required=true;emailLabel.append('New email',email);passwordLabel.append('Current password',password);const save=el('button','ap-btn ap-btn--primary','Update email');save.type='submit';form.append(emailLabel,passwordLabel,save);form.addEventListener('submit',async e=>{e.preventDefault();save.disabled=true;try{const {data,error}=await db.auth.updateUser({email:email.value,current_password:password.value});if(error)throw error;setState({user:data.user,profile:{...getState().profile,email:data.user.email}});AppCore.ui.closeModal();document.dispatchEvent(new CustomEvent('athar:profile-updated'));AppCore.ui.toast('Local login email updated.','success');}catch(error){AppCore.ui.toast(AppCore.ui.describeError(error),'error');}finally{save.disabled=false;}});AppCore.ui.openModal({title:'Change email',content:form,actions:[]});}
