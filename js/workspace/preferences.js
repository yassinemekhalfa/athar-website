import { db } from '../dataClient.js';
import { getState, setState } from '../core/state.js';

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
  const path=`${getState().agency.id}/${kind}/${crypto.randomUUID()}.${file.name.split('.').pop().replace(/[^a-z0-9]/gi,'')}`;
  const {error}=await db.storage.from('agency-branding').upload(path,file);
  if(error)throw error;
  return db.storage.from('agency-branding').getPublicUrl(path).data.publicUrl;
}
