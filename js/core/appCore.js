import {isStaffRole,isClientRole,canManageRole,hasCapability,normalizeRole} from './permissions.js';
import { db } from "../dataClient.js";
import { getState, subscribe } from "./state.js";
import * as ui from "./ui.js?v=invite-email-4";
import * as utils from "./utils.js";
import { selectFolder as selectFolderImpl } from "../workspace/folders.js";
import { selectModule as selectModuleImpl } from "./moduleRegistry.js";

export const AppCore = {
  db,
  getCurrentSession:()=>getState().session,
  getCurrentUser:()=>getState().user,
  getCurrentProfile:()=>getState().profile,
  getCurrentAgency:()=>getState().agency,
  getCurrentMembership:()=>getState().membership,
  getCurrentRole:()=>getState().role,
  getCurrentClientId:()=>getState().clientId,
  isStaff:()=>isStaffRole(getState().role),
  isOwner:()=>getState().role==="owner",
  isClient:()=>isClientRole(getState().role),
  getSelectedFolderId:()=>getState().selectedFolderId,
  getSelectedFolder:()=>getState().folders.find(f=>f.id===getState().selectedFolderId)||null,
  getFolders:()=>[...getState().folders],
  getFolderPath(folderId){ const rows=getState().folders; const map=new Map(rows.map(f=>[f.id,f])); const path=[]; let cur=map.get(folderId); const seen=new Set(); while(cur&&!seen.has(cur.id)){seen.add(cur.id);path.unshift(cur);cur=cur.parent_id?map.get(cur.parent_id):null;} return path; },
  selectFolder:selectFolderImpl,
  getSelectedModule:()=>getState().selectedModule,
  selectModule:selectModuleImpl,
  getModuleContext(){ const s=getState(),role=normalizeRole(s.role); return {db,agencyId:s.agency?.id||null,agency:s.agency,resourceId:s.selectedResourceId||null,folderId:s.selectedFolderId,folder:s.folders.find(f=>f.id===s.selectedFolderId)||null,role,membership:s.membership,clientId:s.clientId,user:s.user,profile:s.profile,isStaff:isStaffRole(role),isOwner:role==="owner",isClient:isClientRole(role),isAdmin:canManageRole(role),canManageMembers:hasCapability(role,'invite'),canManageBilling:hasCapability(role,'billing'),canManageAll:hasCapability(role,'manageAll'),canCreate:hasCapability(role,'create'),canShare:hasCapability(role,'share'),canUpload:hasCapability(role,'upload'),canComment:hasCapability(role,'comment'),canDownload:hasCapability(role,'download'),surface:s.surface,AppCore}; },
  getState,
  subscribe,
  ui,
  utils
};
window.AppCore=AppCore;
export default AppCore;
