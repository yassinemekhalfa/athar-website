import {getLanguage,translate} from './landingI18n.js';
import './portfolio.js';

// Preserve workspace bookmarks created when the app used the root URL.
if(/^#\/(?:resource|folder|f|home|tasks|my-tasks|inbox|invoices|clients|proposals|library-[a-z]+|settings|profile)(?:\/|$)/.test(location.hash))location.replace('workspace.html'+location.hash);
const toggle=document.querySelector('.nav-toggle');
const nav=document.querySelector('.site-nav');
function closeNavigation(){toggle.setAttribute('aria-expanded','false');nav.classList.remove('is-open');}
toggle.addEventListener('click',()=>{const open=toggle.getAttribute('aria-expanded')!=='true';toggle.setAttribute('aria-expanded',String(open));nav.classList.toggle('is-open',open);});
nav.addEventListener('click',event=>{if(event.target.closest('a'))closeNavigation();});
document.addEventListener('keydown',event=>{if(event.key==='Escape'&&toggle.getAttribute('aria-expanded')==='true'){closeNavigation();toggle.focus();}});
document.addEventListener('click',event=>{if(!event.target.closest('.site-header'))closeNavigation();});
const tabs=[...document.querySelectorAll('[data-preview]')];
function selectPreview(tab){for(const item of tabs){const selected=item===tab;item.setAttribute('aria-selected',String(selected));item.tabIndex=selected?0:-1;document.getElementById(item.getAttribute('aria-controls')).hidden=!selected;}}
for(const tab of tabs){tab.addEventListener('click',()=>selectPreview(tab));tab.addEventListener('keydown',event=>{let next;const forward=getLanguage()==='en'?'ArrowRight':'ArrowLeft';const backward=getLanguage()==='en'?'ArrowLeft':'ArrowRight';if(event.key===forward)next=tabs[(tabs.indexOf(tab)+1)%tabs.length];else if(event.key===backward)next=tabs[(tabs.indexOf(tab)+tabs.length-1)%tabs.length];else if(event.key==='Home')next=tabs[0];else if(event.key==='End')next=tabs.at(-1);if(next){event.preventDefault();selectPreview(next);next.focus();}});}
document.getElementById('copyright-year').textContent=String(new Date().getFullYear());

// Prepare a shareable brief locally; this form does not send personal data.
const briefForm=document.getElementById('project-brief');
const briefStatus=document.getElementById('brief-status');
function updateBriefStatus(){
  briefStatus.textContent=getLanguage()==='en'
    ?'Your file is ready to download. Share it with the team through your usual contact channel. Your details have not been sent.'
    :'تم تجهيز الملف للتنزيل. يمكنك مشاركته مع الفريق عبر وسيلة التواصل التي تستخدمها. لم تُرسل بياناتك.';
}
document.addEventListener('landing-language-change',()=>{if(briefStatus.textContent)updateBriefStatus();closeNavigation();});
for(const link of document.querySelectorAll('[data-service]')){
  link.addEventListener('click',()=>{briefForm.elements.service.value=link.dataset.service;});
}
briefForm.addEventListener('submit',event=>{
  event.preventDefault();
  const data=new FormData(briefForm);
  const text=[getLanguage()==='en'?'Athar — Project brief':'أثر — ملخص مشروع','',`${translate('الاسم')}: ${data.get('name')}`,`${translate('البريد الإلكتروني')}: ${data.get('email')}`,`${translate('العلامة أو الشركة')}: ${data.get('company')||'—'}`,`${translate('الخدمة المطلوبة')}: ${translate(data.get('service'))}`,'',getLanguage()==='en'?'Project details:':'تفاصيل المشروع:',data.get('details')].join('\n');
  const url=URL.createObjectURL(new Blob(['\ufeff',text],{type:'text/plain;charset=utf-8'}));
  const link=document.createElement('a');
  link.href=url;link.download='athar-project-brief.txt';document.body.append(link);link.click();link.remove();
  window.setTimeout(()=>URL.revokeObjectURL(url),10000);
  updateBriefStatus();
});
