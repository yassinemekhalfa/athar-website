import { db } from '../dataClient.js';
let branding=null;
export async function loadLoginBranding(){
 const slug=new URLSearchParams(location.search).get('workspace');if(!slug)return;
 const {data,error}=await db.rpc('workspace_login_branding',{p_slug:slug});
 if(!error&&data){branding=data;document.title=`Sign in · ${data.name}`;}
}
export function styleLoginCard(card){
 if(!branding)return;const settings=branding.login||{};
 const safeColor=(value,fallback)=>/^#[0-9a-f]{6}$/i.test(value)?value:fallback;
 document.documentElement.style.setProperty('--color-primary',safeColor(settings.accent,'#3078f6'));
 document.body.style.backgroundColor=safeColor(settings.background,'#ffffff');
 card.style.color=safeColor(settings.text,'#333333');
 const root=document.getElementById('auth-root');root.style.justifyItems=settings.position==='Left'?'start':settings.position==='Right'?'end':'center';
 if(settings.image&&/^(https:\/\/|\/api\/storage\/)/.test(settings.image)){document.body.style.backgroundImage=`url(${JSON.stringify(settings.image)})`;document.body.style.backgroundSize='cover';document.body.style.backgroundPosition=['Left','Center','Right'].includes(settings.image_position)?settings.image_position.toLowerCase():'center';}
 const logo=card.querySelector('.ap-auth-logo');logo.classList.remove('ap-auth-logo--default');if(branding.logo_url||settings.logo){const img=document.createElement('img');img.src=settings.logo||branding.logo_url;img.alt=branding.name;img.style.cssText='width:40px;height:40px;object-fit:contain';logo.replaceChildren(img);}else logo.textContent=branding.name.slice(0,2).toUpperCase();
 if(settings.title&&card.querySelector('h1')?.textContent==='Welcome to The Workspace')card.querySelector('h1').textContent=settings.title;
 if(settings.powered){const foot=document.createElement('small');foot.textContent='Powered by Athar';foot.className='ap-login-powered';card.append(foot);}
}
