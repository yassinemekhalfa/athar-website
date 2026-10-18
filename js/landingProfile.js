import { db } from './dataClient.js';

const photo=document.getElementById('profile-photo');
const heading=document.getElementById('profile-heading');
const name=document.getElementById('profile-name');
const role=document.getElementById('profile-role');
const bio=document.getElementById('profile-bio');
const socials=document.getElementById('profile-socials');
let profile=null;

function applyProfile(){
 if(!profile)return;
 const lang=document.documentElement.lang==='en'?'en':'ar';
 const localized=(key)=>profile[`${key}_${lang}`]||profile[`${key}_${lang==='en'?'ar':'en'}`]||'';
 const profileName=localized('name'),profileRole=localized('role'),profileBio=localized('bio');
 if(profile.photo_url){photo.src=profile.photo_url;photo.alt=profileName||'Athar';photo.style.width='100%';photo.style.height='100%';photo.style.objectFit='cover';}
 heading.hidden=Boolean(profileName);name.textContent=profileName;name.hidden=!profileName;role.textContent=profileRole;role.hidden=!profileRole;if(profileBio)bio.textContent=profileBio;
 let visible=false;
 for(const platform of ['tiktok','facebook','instagram','linkedin']){const link=socials.querySelector(`[data-social="${platform}"]`),url=profile[`${platform}_url`];let safeUrl='';try{const parsed=new URL(url);if(['http:','https:'].includes(parsed.protocol))safeUrl=parsed.href;}catch{}link.hidden=!safeUrl;if(safeUrl){link.href=safeUrl;visible=true;}else link.removeAttribute('href');}
 socials.hidden=!visible;
}

try{
 const {data,error}=await db.from('website_profile').select('photo_url,name_ar,name_en,role_ar,role_en,bio_ar,bio_en,tiktok_url,facebook_url,instagram_url,linkedin_url').eq('published',true).limit(1).maybeSingle();
 if(error)throw error;profile=data;applyProfile();document.addEventListener('landing-language-change',applyProfile);
}catch(error){console.warn('Public profile unavailable',error?.message||error);}
