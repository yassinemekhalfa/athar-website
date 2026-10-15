import {workspaceIcon} from '../views/workspaceIcons.js';
import {getState} from './state.js';
import {roleBadge,canManageRole} from './permissions.js';

const header=document.querySelector('.ap-header');
if(header){
 const toggle=document.createElement('button');toggle.id='mobile-navigation';toggle.type='button';toggle.append(workspaceIcon('menu'));toggle.setAttribute('aria-label','Open navigation');toggle.setAttribute('aria-expanded','false');toggle.setAttribute('aria-controls','global-rail workspace-sidebar');header.prepend(toggle);
 const backdrop=document.createElement('button');backdrop.type='button';backdrop.className='ap-mobile-backdrop';backdrop.setAttribute('aria-label','Close navigation');backdrop.hidden=true;document.body.append(backdrop);
 function close(){document.body.classList.remove('ap-mobile-open');toggle.setAttribute('aria-expanded','false');backdrop.hidden=true;const view=document.body.dataset.workspaceView||'';document.getElementById('workspace-sidebar')?.setAttribute('aria-hidden',String(innerWidth<=900||!(['home','folder'].includes(view)||view.startsWith('library-'))));}
 toggle.addEventListener('click',()=>{const open=document.body.classList.toggle('ap-mobile-open');toggle.setAttribute('aria-expanded',String(open));backdrop.hidden=!open;document.getElementById('workspace-sidebar')?.setAttribute('aria-hidden',String(!open));});backdrop.addEventListener('click',close);
 document.addEventListener('keydown',e=>{if(e.key==='Escape'&&document.body.classList.contains('ap-mobile-open')){close();toggle.focus();}});
 document.addEventListener('click',e=>{if(e.target.closest('[data-global-view],button[data-workspace-view],[data-library-view],.ap-folder-tree__label,.k-resource-link'))close();});
 const media=matchMedia('(min-width: 901px)');media.addEventListener('change',close);
}
function identity(){const s=getState();document.body.dataset.role=s.role||'';const host=document.querySelector('.ap-profile-menu__identity')||document.querySelector('#user-menu .ap-profile-menu');if(host&&!host.querySelector('.ap-role-badge'))host.prepend(roleBadge(s.role));document.querySelectorAll('[data-global-view="clients"],[data-global-view="proposals"]').forEach(b=>{b.hidden=!canManageRole(s.role);});}
document.addEventListener('app:ready',identity);document.addEventListener('agency:selected',()=>requestAnimationFrame(identity));
// Dynamic buttons need accessible names even when they only contain icons.
const observer=new MutationObserver(records=>{for(const record of records)for(const node of record.addedNodes){if(node.nodeType!==1)continue;const buttons=node.matches('button')?[node]:[...node.querySelectorAll('button')];for(const b of buttons){if(!b.hasAttribute('aria-label')&&!b.textContent.trim()&&b.title)b.setAttribute('aria-label',b.title);}}});observer.observe(document.body,{childList:true,subtree:true});
