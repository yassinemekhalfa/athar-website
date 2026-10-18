import { getState, setState } from "./state.js";
import { emit } from "./events.js";
import { AppCore } from "./appCore.js";

const MODULE_LOADERS = {
  embeds:()=>import("../modules/embeds.js?v=home-create-1"),
  conversation:()=>import("../modules/conversation.js?v=client-conversation-1"),
  boards:()=>import("../modules/boards.js?v=task-complete-1"),
  docs:()=>import("../modules/docs.js"),
  files:()=>import("../modules/files.js"),
  invoices:()=>import("../modules/invoices.js")
};
let activeModule=null;let activeFolderId=null;let navigationVersion=0;
export const MODULE_NAMES=Object.freeze(Object.keys(MODULE_LOADERS));

async function safeUnmount() {
  if(!activeModule) return;
  const name=activeModule.name;
  try { await activeModule.unmount?.(); } catch(error){ console.error(error); }
  activeModule=null;activeFolderId=null; emit("module:unmounted",{module:name});
}
export async function selectModule(moduleName, resourceId=null) {
  if(!MODULE_LOADERS[moduleName]) { console.warn("Unknown module",moduleName); return; }
  const requestVersion=++navigationVersion;
  const s=getState(); if(s.selectedModule===moduleName&&s.selectedResourceId===resourceId&&activeModule&&activeFolderId===s.selectedFolderId) return;
  const previousModule=s.selectedModule; emit("module:selected",{module:moduleName,previousModule,folderId:s.selectedFolderId,agencyId:s.agency?.id||null});
  await safeUnmount(); if(requestVersion!==navigationVersion)return; const container=document.getElementById("module-content"); if(!container)return; container.replaceChildren(); setState({selectedModule:moduleName,selectedResourceId:resourceId});
  history.replaceState(null,"",s.selectedFolderId?`#/f/${s.selectedFolderId}/${moduleName}${resourceId?`/${resourceId}`:""}`:resourceId?`#/resource/${({boards:"board",conversation:"conversation",docs:"doc",files:"file",embeds:"embed"})[moduleName]}/${resourceId}`:`#/${moduleName}`);
  try { const mod=await MODULE_LOADERS[moduleName](); if(requestVersion!==navigationVersion)return; if(typeof mod.default?.mount!=="function") throw new TypeError("Module contract missing mount()"); activeModule=mod.default;activeFolderId=s.selectedFolderId; await activeModule.mount(container,AppCore.getModuleContext()); if(requestVersion!==navigationVersion)return; emit("module:mounted",{module:moduleName,folderId:getState().selectedFolderId}); }
  catch(error){ if(requestVersion!==navigationVersion)return; console.error(error); if(/Failed to fetch dynamically imported module|Importing a module script failed/i.test(String(error))) AppCore.ui.renderEmpty(container,{title:`${moduleName} module`,message:"This module will load here."}); else AppCore.ui.renderError(container,error,()=>selectModule(moduleName)); }
  updateTabs();
}
export async function refreshActiveModule(){ if(activeModule?.refresh) { try{await activeModule.refresh(AppCore.getModuleContext()); return;}catch(error){console.error(error);} } const name=getState().selectedModule,resourceId=getState().selectedResourceId; if(name){await safeUnmount();setState({selectedModule:null});await selectModule(name,resourceId);} }
export async function unmountActiveModule(){navigationVersion++;await safeUnmount();}
export function hasActiveModule(){return Boolean(activeModule);}
export function updateTabs(){const selected=getState().selectedModule;document.querySelectorAll("#module-tabs [data-module]").forEach(btn=>{const on=btn.dataset.module===selected;btn.classList.toggle("ap-tab--active",on);btn.setAttribute("aria-selected",String(on));});}
