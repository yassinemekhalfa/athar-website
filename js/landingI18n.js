import { englishCopy } from './landingTranslations.js';
import { portfolioCopy } from './portfolioCopy.js';
const copy={...englishCopy,...portfolioCopy};

const preferenceKey='athar.landing.language';
const switcher=document.getElementById('language-switch');
const textNodes=[];
const attributes=[];
const walker=document.createTreeWalker(document.documentElement,NodeFilter.SHOW_TEXT);
let node;
while((node=walker.nextNode())){
  if(node.parentElement?.closest('script,style,svg,#language-switch'))continue;
  const source=node.textContent;
  if(Object.hasOwn(copy,source.trim())||source.trim()==='←')textNodes.push({node,source});
}
for(const element of document.querySelectorAll('[aria-label],[placeholder],meta[name="description"]')){
  for(const name of ['aria-label','placeholder','content']){
    const source=element.getAttribute(name);
    if(source&&Object.hasOwn(copy,source))attributes.push({element,name,source});
  }
}
// Keep form values stable when the option labels change language.
for(const option of document.querySelectorAll('#project-brief option'))option.value=option.textContent;
for(const use of document.querySelectorAll('use[href="#i-arrow"]'))use.parentElement.classList.add('directional-icon');
let language='ar';
export function translate(source){return language==='en'?(copy[source]??(source==='←'?'→':source)):source;}
export function getLanguage(){return language;}
function selectedLanguage(){
  const query=new URL(location.href).searchParams.get('lang');
  if(query==='ar'||query==='en')return query;
  try{return localStorage.getItem(preferenceKey)==='en'?'en':'ar';}catch{return 'ar';}
}
function applyLanguage(next,{updateUrl=false}={}){
  language=next;
  document.documentElement.lang=next;
  document.documentElement.dir=next==='en'?'ltr':'rtl';
  for(const {node,source} of textNodes){
    const trimmed=source.trim();
    node.textContent=source.replace(trimmed,translate(trimmed));
  }
  for(const {element,name,source} of attributes)element.setAttribute(name,translate(source));
  for(const link of document.querySelectorAll('a[href^="projects.html"],a[href^="landing.html"]')){
    if(link===switcher)continue;
    const url=new URL(link.getAttribute('href'),location.href);url.searchParams.set('lang',next);
    link.href=url.pathname+url.search+url.hash;
  }
  const target=next==='en'?'ar':'en';
  const targetUrl=new URL(location.href);targetUrl.searchParams.set('lang',target);
  switcher.href=targetUrl.pathname+targetUrl.search+targetUrl.hash;
  switcher.lang=target;switcher.hreflang=target;switcher.dir=target==='ar'?'rtl':'ltr';
  switcher.querySelector('span').textContent=next==='en'?'العربية':'English';
  switcher.setAttribute('aria-label',next==='en'?'Switch to Arabic':'Switch to English');
  try{localStorage.setItem(preferenceKey,next);}catch{/* Browsing without storage is supported. */}
  if(updateUrl){const url=new URL(location.href);url.searchParams.set('lang',next);history.replaceState(null,'',url.pathname+url.search+url.hash);}
  document.dispatchEvent(new CustomEvent('landing-language-change',{detail:{language:next}}));
}
switcher.addEventListener('click',event=>{
  if(event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;
  event.preventDefault();applyLanguage(language==='en'?'ar':'en',{updateUrl:true});
});
window.addEventListener('popstate',()=>applyLanguage(selectedLanguage()));
applyLanguage(selectedLanguage());
