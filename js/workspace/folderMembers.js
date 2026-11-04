import {AppCore} from '../core/appCore.js?v=20261104-1';
import {openItemSharing} from './itemSharing.js?v=20261104-1';

export async function openFolderSharing(folderId){
  if(!folderId)return AppCore.ui.toast('Select a folder to manage access.','warning');
  return openItemSharing({id:folderId,type:'folder'},AppCore.getModuleContext());
}
