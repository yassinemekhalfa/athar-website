import {getLanguage,translate as t} from './landingI18n.js';
import {portalOrigin,conceptMode,publishedProject} from './public-hosting.js';
import {db,isSupabaseMode} from './dataClient.js';
import {googleDriveDownload} from './drive-video.js?v=20261029-1';
let portfolioProjects=[];

const grid=document.getElementById('portfolio-grid');
const preview=document.getElementById('portfolio-preview');
const filters=document.getElementById('portfolio-filters');
const search=document.getElementById('portfolio-search');
const count=document.getElementById('portfolio-count');
const dialog=document.getElementById('project-dialog');
const categories={all:'كل المشاريع',identity:'هوية بصرية',digital:'تجارب رقمية',motion:'موشن وفيديو'};
const sectors={all:{ar:'كل المشاريع',en:'All projects'},medical:{ar:'القطاع الطبي',en:'Medical'},realestate:{ar:'العقارات',en:'Real estate'},industry:{ar:'الصناعة',en:'Industry'},other:{ar:'قطاعات أخرى',en:'Other sectors'}};
let category='all',activeProject=null,returnFocus=null,loaded=false,loadError=false;
const localized=value=>typeof value==='string'?value:value?.[getLanguage()]||value?.en||value?.ar||'';
const sectorLabels={medical:{ar:'القطاع الطبي',en:'Medical'},realestate:{ar:'العقارات',en:'Real estate'},industry:{ar:'الصناعة',en:'Industry'},other:{ar:'قطاعات أخرى',en:'Other sectors'}};
const legacyConceptSectors={nova:'medical',form:'realestate',atelier:'realestate',orbit:'industry',north:'other',luma:'other'};
const sectorKey=project=>project.sector||legacyConceptSectors[project.id]||'other';
const sectorLabel=project=>sectorLabels[sectorKey(project)][getLanguage()];
function element(tag,className,text){const node=document.createElement(tag);if(className)node.className=className;if(text!==undefined)node.textContent=text;return node;}
function projectUrl(project){const url=new URL('projects.html',location.href);url.searchParams.set('lang',getLanguage());url.searchParams.set('project',project.id);return url.href;}
const cropFor=(project,kind)=>({ratio:'landscape',x:50,y:50,zoom:1,...(project.presentation?.[kind]||{})});
const cropRatio=value=>value==='portrait'?'4 / 5':value==='square'?'1 / 1':'16 / 10';
function applyCrop(host,item,crop,{useRatio=true}={}){if(useRatio)host.style.aspectRatio=cropRatio(crop.ratio);item.style.setProperty('--media-x',`${crop.x}%`);item.style.setProperty('--media-y',`${crop.y}%`);item.style.setProperty('--media-zoom',crop.zoom);}
const videoFrame=project=>{const saved=project.presentation?.video||{};return saved.x!==undefined||saved.y!==undefined||saved.zoom!==undefined?{ratio:'auto'}:{ratio:'auto',...saved};};
function frameAspect(frame){if(frame.ratio==='auto'&&Number(frame.aspect)>0)return Number(frame.aspect);return{vertical:9/16,portrait:4/5,square:1,standard:4/3,landscape:16/9}[frame.ratio]||16/9;}
function applyVideoFrame(host,project){const aspect=frameAspect(videoFrame(project));host.style.aspectRatio=String(aspect);host.style.setProperty('--video-ratio',String(aspect));}
function projectVideo(project,{autoplay=false}={}){
 const video=element('video','portfolio-video');video.playsInline=true;video.setAttribute('playsinline','');video.setAttribute('webkit-playsinline','');video.preload=autoplay?'auto':'metadata';video.poster=project.video.poster||project.cover;video.muted=autoplay;video.defaultMuted=autoplay;video.loop=autoplay;video.autoplay=autoplay;
 if(autoplay){video.setAttribute('muted','');video.setAttribute('autoplay','');video.setAttribute('loop','');video.setAttribute('aria-hidden','true');video.tabIndex=-1;}else video.controls=true;
 video.src=project.video.type==='video/google-drive'?(googleDriveDownload(project.video.src)||project.video.src):project.video.src;
 video.addEventListener('loadedmetadata',()=>{const frame=videoFrame(project);if(frame.ratio==='auto'&&video.videoWidth&&video.videoHeight){const host=video.closest('.portfolio-art,.project-film-frame');if(host){const aspect=video.videoWidth/video.videoHeight;host.style.aspectRatio=String(aspect);host.style.setProperty('--video-ratio',String(aspect));}}});
 if(autoplay){const play=()=>video.play().catch(()=>{});video.addEventListener('canplay',play,{once:true});queueMicrotask(play);}
 return video;
}
function manageCoverPlayback(video){
 if(!('IntersectionObserver' in window))return video.play().catch(()=>{});
 const observer=new IntersectionObserver(entries=>{for(const entry of entries){if(entry.isIntersecting&&entry.intersectionRatio>=.2)video.play().catch(()=>{});else video.pause();}},{threshold:[0,.2,.6]});
 observer.observe(video);video.addEventListener('error',()=>observer.disconnect(),{once:true});
}
function videoTime(value){if(!Number.isFinite(value))return'0:00';const minutes=Math.floor(value/60),seconds=Math.floor(value%60);return`${minutes}:${String(seconds).padStart(2,'0')}`;}
function customVideoControls(video){
 video.controls=false;
 const controls=element('div','project-video-controls');
 const control=(className,label,icon)=>{const button=element('button',className);button.type='button';button.setAttribute('aria-label',label);button.innerHTML=icon;return button;};
 const playIcon='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 7 8 5-8 5Z"/></svg>',pauseIcon='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 7v10M15 7v10"/></svg>';
 const soundIcon='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 10v4h3l4 3V7l-4 3H5Zm10.5-.5a4 4 0 0 1 0 5M18 7a7 7 0 0 1 0 10"/></svg>',muteIcon='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 10v4h3l4 3V7l-4 3H5Zm10 0 4 4m0-4-4 4"/></svg>';
 const play=control('project-video-toggle','Pause video',pauseIcon),mute=control('project-video-mute','Turn sound on',muteIcon);
 const progressWrap=element('div','project-video-progress-wrap'),progress=element('input','project-video-progress'),time=element('output','project-video-time','0:00 / 0:00');progress.type='range';progress.min='0';progress.max='1000';progress.step='1';progress.value='0';progress.setAttribute('aria-label','Video progress');progressWrap.append(progress,time);
 const sync=()=>{const paused=video.paused,duration=video.duration||0,percent=duration?video.currentTime/duration*100:0;play.innerHTML=paused?playIcon:pauseIcon;play.setAttribute('aria-label',paused?'Play video':'Pause video');progress.value=duration?String(Math.round(percent*10)):'0';progress.style.setProperty('--video-progress',`${percent}%`);time.textContent=`${videoTime(video.currentTime)} / ${videoTime(duration)}`;mute.innerHTML=video.muted?muteIcon:soundIcon;mute.setAttribute('aria-label',video.muted?'Turn sound on':'Mute video');};
 const toggle=()=>video.paused?video.play().catch(()=>{}):video.pause();
 play.addEventListener('click',toggle);video.addEventListener('click',toggle);progress.addEventListener('input',()=>{if(video.duration)video.currentTime=Number(progress.value)/1000*video.duration;});mute.addEventListener('click',()=>{video.muted=!video.muted;sync();});
 for(const event of ['loadedmetadata','durationchange','timeupdate','play','pause','volumechange','ended'])video.addEventListener(event,sync);sync();controls.append(play,progressWrap,mute);return controls;
}
function media(src,alt,className){const image=element('img',className);image.src=src;image.alt=alt;image.loading='lazy';image.width=1200;image.height=900;return image;}
function card(project,teaser=false){
 const article=element('article','portfolio-card');const link=element('a','portfolio-card-link');link.href=projectUrl(project);
 const art=element('div','portfolio-art');
 let durationBadge=null;
 if(teaser&&project.video){article.classList.add('portfolio-card--video');applyVideoFrame(art,project);const video=projectVideo(project,{autoplay:true});video.addEventListener('error',()=>{const cover=media(project.cover,`${project.name} — ${localized(project.title)}`);applyCrop(art,cover,cropFor(project,'cover'),{useRatio:false});video.replaceWith(cover);});durationBadge=element('span','portfolio-duration','0:00');video.addEventListener('loadedmetadata',()=>{if(!Number.isFinite(video.duration))return;const minutes=Math.floor(video.duration/60),seconds=Math.floor(video.duration%60);durationBadge.textContent=`${minutes}:${String(seconds).padStart(2,'0')}`;});art.append(video);manageCoverPlayback(video);}else{const cover=media(project.cover,`${project.name} — ${localized(project.title)}`);applyCrop(art,cover,cropFor(project,'cover'),{useRatio:false});art.append(cover);}
 if(project.concept)art.append(element('span','portfolio-concept',t('تصور إبداعي')));
 if(project.video)art.append(element('span','portfolio-play',`▶ ${t('فيلم قصير')}`));
 const body=element('div','portfolio-card-body');const meta=element('div','portfolio-meta');meta.append(element('span','',t(categories[project.category])),element('span','',project.year));
 body.append(meta,element('h3','',project.name),element('p','',localized(project.title)),element('span','portfolio-card-action',`${t('افتح المشروع')} ${getLanguage()==='en'?'↗':'↖'}`));
 meta.prepend(element('span','',sectorLabel(project)));
 if(teaser&&project.video){article.classList.add('portfolio-card--portrait');const top=element('div','portfolio-card-top');top.append(durationBadge,element('span','portfolio-card-sector',sectorLabel(project)));art.append(top,element('span','portfolio-center-play','▶'),body);link.append(art);}else link.append(art,body);article.append(link);
 if(dialog)link.addEventListener('click',event=>{if(event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;event.preventDefault();returnFocus=link;openProject(project,{updateUrl:!teaser});});
 return article;
}
function updateGrid(){
 if(!grid)return;
 if(!loaded){renderLoadState();return;}
 const query=search.value.trim().toLocaleLowerCase();
 const found=portfolioProjects.filter(project=>(category==='all'||sectorKey(project)===category)&&[project.name,sectorLabel(project),...Object.values(project.title),...Object.values(project.summary),...Object.values(project.services).flat()].join(' ').toLocaleLowerCase().includes(query));
 grid.replaceChildren(...found.map(project=>card(project)));
 count.textContent=getLanguage()==='en'?`${found.length} ${found.length===1?'project':'projects'}`:`${found.length} مشاريع`;
 if(!found.length){const empty=element('div','portfolio-empty');empty.append(element('h2','',t(portfolioProjects.length?'لا توجد نتائج مطابقة':'لم ننشر مشاريع بعد')),element('p','',t(portfolioProjects.length?'جرّب كلمة أخرى أو اعرض كل المشاريع.':'عد قريباً للاطلاع على أعمالنا الجديدة.')));if(portfolioProjects.length){const reset=element('button','button button-outline',t('مسح البحث والتصفية'));reset.type='button';reset.addEventListener('click',()=>{category='all';search.value='';updateFilters();updateGrid();search.focus();});empty.append(reset);}grid.append(empty);}
}
function updateFilters(){
 if(!filters)return;filters.replaceChildren();
 for(const [id,label] of Object.entries(sectors)){const button=element('button','portfolio-filter',localized(label));button.type='button';button.dataset.category=id;button.setAttribute('aria-pressed',String(category===id));button.addEventListener('click',()=>{category=id;for(const item of filters.children)item.setAttribute('aria-pressed',String(item===button));updateGrid();});filters.append(button);}
}
function fillProject(project){
 const body=dialog.querySelector('.project-dialog-body');for(const video of body.querySelectorAll('video'))video.pause();body.replaceChildren();
 body.append(element('span','section-kicker',sectorLabel(project)));
 dialog.querySelector('.project-dialog-close').setAttribute('aria-label',t('إغلاق المشروع'));
 body.append(element('span','section-kicker',`${t(categories[project.category])} / ${project.year}`));
 const heading=element('h2','',project.name);heading.id='project-title';body.append(heading,element('p','project-subtitle',localized(project.title)));
 if(project.concept)body.append(element('p','project-disclaimer',t('كل الأعمال المعروضة هنا مشاريع تصورية للعرض، وليست أعمال عملاء حقيقية.')));
 const hero=element('div','project-hero-media');const heroImage=media(project.cover,`${project.name} — ${localized(project.title)}`,'project-hero-image');applyCrop(hero,heroImage,cropFor(project,'cover'));hero.append(heroImage);body.append(hero);
 const intro=element('div','project-intro');const about=element('div');about.append(element('h3','',t('عن المشروع')),element('p','',localized(project.description)));
 const scope=element('div');scope.append(element('h3','',t('نطاق العمل')));const list=element('ul');for(const service of localized(project.services))list.append(element('li','',service));scope.append(list);intro.append(about,scope);body.append(intro);
 if(project.video){
  const section=element('section','project-film');section.append(element('h3','',t('معاينة الفيديو')));
  const filmFrame=element('div','project-film-frame');applyVideoFrame(filmFrame,project);
  const video=projectVideo(project,{autoplay:true});video.preload='auto';video.setAttribute('aria-label',`${project.name} — ${t('معاينة الفيديو')}`);filmFrame.append(video,customVideoControls(video));
  if(project.video.type!=='video/google-drive'){
   const download=element('a','small-link',t('تنزيل الفيديو'));download.href=project.video.src;download.download=project.video.src.split('/').at(-1);section.append(download);
  }
  section.insertBefore(filmFrame,section.querySelector('.small-link'));body.append(section);
 }
 const gallery=element('section','project-gallery');gallery.append(element('h3','',t('معرض الصور')));
 for(const [index,src] of project.images.entries()){
  const figure=element('figure');const link=element('a');link.href=src;link.target='_blank';link.rel='noopener';link.setAttribute('aria-label',`${t('فتح الصورة بالحجم الكامل')} — ${project.name} ${index+1}`);link.append(media(src,`${project.name} — ${t('صور المشروع')} ${index+1}`));figure.append(link,element('figcaption','',`${project.name} / ${String(index+1).padStart(2,'0')}`));gallery.append(figure);
 }
 body.append(gallery);
}
function openProject(project,{updateUrl=true}={}){
 activeProject=project;fillProject(project);
 if(!dialog.open){dialog.showModal();document.body.classList.add('project-open');}
 dialog.scrollTop=0;dialog.querySelector('.project-dialog-close').focus();
 if(updateUrl){const url=new URL(location.href);url.searchParams.set('project',project.id);history.replaceState(null,'',url.pathname+url.search);}
}
function refresh(){
 if(!loaded){updateFilters();renderLoadState();return;}
 const concepts=portfolioProjects.filter(project=>project.concept).length;
 for(const notice of document.querySelectorAll('[data-concept-notice]')){
  notice.hidden=concepts===0;
  notice.textContent=t(concepts===portfolioProjects.length?'كل الأعمال المعروضة هنا مشاريع تصورية للعرض، وليست أعمال عملاء حقيقية.':'المشاريع الموسومة بتصور إبداعي أمثلة للعرض، وليست أعمال عملاء حقيقية.');
 }
 if(preview){const withVideo=portfolioProjects.filter(project=>project.video);const featured=(withVideo.length?withVideo:portfolioProjects).slice(0,4);preview.replaceChildren(...featured.map(project=>card(project,true)));}
 updateFilters();updateGrid();if(activeProject&&dialog?.open)fillProject(activeProject);
}
if(dialog){
 dialog.querySelector('.project-dialog-close').addEventListener('click',()=>dialog.close());
 dialog.addEventListener('click',event=>{if(event.target===dialog){const bounds=dialog.getBoundingClientRect();if(event.clientX<bounds.left||event.clientX>bounds.right||event.clientY<bounds.top||event.clientY>bounds.bottom)dialog.close();}});
 dialog.addEventListener('close',()=>{for(const video of dialog.querySelectorAll('video'))video.pause();document.body.classList.remove('project-open');activeProject=null;const url=new URL(location.href);if(url.searchParams.has('project')){url.searchParams.delete('project');history.replaceState(null,'',url.pathname+url.search);}if(returnFocus?.isConnected)returnFocus.focus();else search?.focus();});
}
const toggle=document.querySelector('.nav-toggle'),nav=document.querySelector('.site-nav');
if(toggle&&nav){
 function closeNavigation(){toggle.setAttribute('aria-expanded','false');nav.classList.remove('is-open');}
 toggle.addEventListener('click',()=>{const open=toggle.getAttribute('aria-expanded')!=='true';toggle.setAttribute('aria-expanded',String(open));nav.classList.toggle('is-open',open);});
 nav.addEventListener('click',closeNavigation);document.addEventListener('click',event=>{if(!event.target.closest('.site-header'))closeNavigation();});
 document.addEventListener('keydown',event=>{if(event.key==='Escape'&&toggle.getAttribute('aria-expanded')==='true'){closeNavigation();toggle.focus();}});
 document.addEventListener('landing-language-change',closeNavigation);
 matchMedia('(max-width: 760px)').addEventListener('change',closeNavigation);
}
const copyrightYear=document.getElementById('copyright-year');if(copyrightYear)copyrightYear.textContent=String(new Date().getFullYear());
if(search)search.addEventListener('input',updateGrid);
document.addEventListener('landing-language-change',refresh);
function renderLoadState(){
 const target=grid||preview;if(!target)return;
 target.setAttribute('aria-busy',String(!loadError));
 target.replaceChildren(element('p','project-disclaimer',t(loadError?'تعذر تحميل المشاريع. حاول مرة أخرى.':'جارٍ تحميل المشاريع…')));
 if(count)count.textContent='';
 for(const notice of document.querySelectorAll('[data-concept-notice]'))notice.hidden=true;
 if(loadError){const retry=element('button','button',t('إعادة المحاولة'));retry.type='button';retry.addEventListener('click',loadProjects);target.append(retry);}
}
async function loadProjects(){
 loaded=false;loadError=false;refresh();
 try{let data;if(conceptMode){data=(await import('./portfolioProjects.js')).portfolioProjects;}else if(isSupabaseMode){const {data:rows,error}=await db.from('website_projects').select('published').not('published','is',null).order('published_at',{ascending:false});if(error)throw error;data=(rows||[]).map(row=>row.published);}else{const response=await fetch(new URL('/api/website/projects',portalOrigin),{credentials:'omit'});if(!response.ok)throw new Error('Projects unavailable');const result=await response.json();data=result.data;}if(!Array.isArray(data))throw new Error('Invalid project response');if(!data.length)data=(await import('./portfolioProjects.js')).portfolioProjects;portfolioProjects=data.map(publishedProject);loaded=true;(grid||preview)?.setAttribute('aria-busy','false');refresh();
if(dialog){const requested=new URL(location.href).searchParams.get('project');const project=portfolioProjects.find(item=>item.id===requested);if(project)openProject(project,{updateUrl:false});else if(requested){const notice=element('p','project-disclaimer',`${t('مشروع غير موجود')}. ${t('يمكنك استكشاف المشاريع الأخرى في المعرض.')}`);grid.before(notice);}}

 }catch{loaded=false;loadError=true;renderLoadState();}
}
loadProjects();
