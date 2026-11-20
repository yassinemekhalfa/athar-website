import { db, isSupabaseMode } from '../dataClient.js?v=20261120-5';
import { getState, setState } from '../core/state.js?v=20261120-5';

export const THEME_DEFAULTS = { accent:'#3078f6', navigation_bg:'#ececec', navigation_text:'#484848', navigation_accent:'#3078f6', sidebar_bg:'#f7f7f7', sidebar_text:'#555555', sidebar_accent:'#3078f6', rounded:true };
export function preferences() { return getState().agency?.settings || {}; }
export function applyTheme(settings = {}) {
  const theme={...THEME_DEFAULTS,...settings.theme};
  for(const [key,value] of Object.entries(theme)) {
    if(/^#[0-9a-f]{6}$/i.test(value)) document.documentElement.style.setProperty(`--video-${key.replaceAll('_','-')}`,value);
  }
  document.documentElement.style.setProperty('--video-radius',theme.rounded?'4px':'0px');
  document.documentElement.style.setProperty('--color-primary',theme.accent);
  document.documentElement.style.setProperty('--color-primary-hover',theme.accent);
}
export async function savePreferences(patch) {
  const state=getState();
  if(state.role!=='owner') throw Object.assign(new Error('Only the workspace owner can change these settings.'),{userMessage:true});
  const {data,error}=await db.rpc('update_workspace_settings',{p_agency_id:state.agency.id,p_patch:patch});
  if(error) throw error;
  const agency={...state.agency,settings:data};setState({agency});applyTheme(data);
  return data;
}
export async function uploadBrandAsset(file,kind='logo') {
  if(!/^image\/(png|jpeg|webp|gif|svg\+xml)$/.test(file.type)||file.size>5*1024*1024) throw Object.assign(new Error('Choose an image smaller than 5 MB.'),{userMessage:true});
  if(isSupabaseMode){
    const state=getState();if(!state.agency?.id)throw new Error('Open a workspace before uploading its branding.');
    const invoke=async(action,payload={})=>{const {data,error}=await db.functions.invoke('google-drive',{body:{action,agency_id:state.agency.id,...payload}});if(error||data?.error){let detail=data?.error||error?.message;try{if(error?.context?.json)detail=(await error.context.json())?.error||detail;}catch{}throw new Error(detail||'Google Drive upload failed.');}return data?.data;};
    const status=await invoke('status');if(!status?.connected)throw new Error('Connect Google Drive in Settings → Google Drive before uploading a logo or cover.');
    const safeExt=(file.name.split('.').pop()||file.type.split('/').pop()||'img').replace(/[^a-z0-9]/gi,'').slice(0,10)||'img';
    const name=`${kind}-${globalThis.ATHAR_UUID()}.${safeExt}`;
    const started=await invoke('start-website-upload',{name,mime_type:file.type,size:file.size});
    const uploaded=await new Promise((resolve,reject)=>{const xhr=new XMLHttpRequest();xhr.open('PUT',started.session_url);xhr.setRequestHeader('Content-Type',file.type);xhr.onload=()=>xhr.status>=200&&xhr.status<300?resolve(JSON.parse(xhr.responseText)):reject(new Error(`Google Drive upload failed (${xhr.status}).`));xhr.onerror=()=>reject(new Error('Could not reach Google Drive.'));xhr.send(file);});
    const record=await invoke('complete-website-upload',{file:uploaded});return `https://drive.google.com/thumbnail?id=${encodeURIComponent(record.id)}&sz=w2000`;
  }
  const path=`${getState().agency.id}/${kind}/${globalThis.ATHAR_UUID()}.${file.name.split('.').pop().replace(/[^a-z0-9]/gi,'')}`;
  const {error}=await db.storage.from('agency-branding').upload(path,file,{cacheControl:'31536000'});
  if(error)throw error;
  return db.storage.from('agency-branding').getPublicUrl(path).data.publicUrl;
}
