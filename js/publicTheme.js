const storageKey='athar.public.theme';
const root=document.documentElement;
const button=document.getElementById('theme-switch');
const colorMeta=document.querySelector('meta[name="theme-color"]');

function preferredTheme(){
  try{
    const saved=localStorage.getItem(storageKey);
    if(saved==='light'||saved==='dark')return saved;
  }catch{/* Storage can be unavailable in private browsing. */}
  return matchMedia('(prefers-color-scheme: light)').matches?'light':'dark';
}

function paint(theme,{save=false}={}){
  root.dataset.theme=theme;
  root.style.colorScheme=theme;
  if(colorMeta)colorMeta.content=theme==='light'?'#f7f5fa':'#17151d';
  if(button){
    const next=theme==='dark'?'light':'dark';
    button.dataset.theme=theme;
    button.setAttribute('aria-pressed',String(theme==='dark'));
    const language=root.lang==='en'?'En':'Ar';
    button.setAttribute('aria-label',button.dataset[`${next}Label${language}`]||`${next} mode`);
    button.title=button.getAttribute('aria-label');
  }
  if(save){try{localStorage.setItem(storageKey,theme);}catch{/* Keep the active theme for this page. */}}
  document.dispatchEvent(new CustomEvent('public-theme-change',{detail:{theme}}));
}

paint(root.dataset.theme||preferredTheme());
button?.addEventListener('click',()=>paint(root.dataset.theme==='dark'?'light':'dark',{save:true}));

document.addEventListener('landing-language-change',()=>paint(root.dataset.theme||preferredTheme()));

