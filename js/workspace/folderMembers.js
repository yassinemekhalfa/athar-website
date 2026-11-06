import {AppCore} from '../core/appCore.js?v=20261106-5';
import {openItemSharing} from './itemSharing.js?v=20261106-5';

export async function openFolderSharing(folderId){
  if(!folderId)return AppCore.ui.toast('Select a folder to manage access.','warning');
  return openItemSharing({id:folderId,type:'folder'},AppCore.getModuleContext());
}
