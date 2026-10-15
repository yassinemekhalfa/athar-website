import {googleDrivePreview,googleDriveImage} from './drive-video.js';
import {db,isSupabaseMode} from './dataClient.js';
const $=id=>document.getElementById(id);
const form=$('project-form'),status=$('status');
let projects=[],current=null,dirty=false,busy=false,trustedClients=[];
const node=(tag,text)=>{const el=document.createElement(tag);if(text!==undefined)el.textContent=text;return el;};
function notify(text,error=false){status.textContent=text;status.classList.toggle('error',error);}
async function api(url,options={}){
 if(isSupabaseMode)return supabaseApi(url,options);
 const response=await fetch(url,{credentials:'same-origin',...options});const result=await response.json();
 if(!response.ok||result.error){const error=new Error(result.error?.message||'Request failed. Please try again.');error.status=response.status;throw error;}return result.data;
}
let ownerContext=null;
async function getOwnerContext(){if(ownerContext)return ownerContext;const {data:{user},error:authError}=await db.auth.getUser();if(authError||!user)throw Object.assign(new Error('Sign in with the owner account.'),{status:401});const {data:membership,error}=await db.from('agency_members').select('agency_id,role').eq('profile_id',user.id).eq('role','owner').limit(1).maybeSingle();if(error||!membership)throw Object.assign(new Error('Owner access is required.'),{status:403});return ownerContext={user,membership};}
const projectId=value=>{const base=String(value||'project').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,56)||'project';return `${base}-${crypto.randomUUID().slice(0,8)}`;};
async function supabaseApi(url,options={}){const {user,membership}=await getOwnerContext();if(url==='/api/auth/signout'){await db.auth.signOut();return null;}if(url!=='/api/website/admin')throw new Error('This operation is not available in Supabase mode.');if(!options.method){const {data,error}=await db.from('website_projects').select('*').eq('agency_id',membership.agency_id).order('updated_at',{ascending:false});if(error)throw error;return{email:user.email,projects:(data||[]).map(row=>({project:row.draft,published:Boolean(row.published),hasChanges:Boolean(row.published)&&JSON.stringify(row.draft)!==JSON.stringify(row.published)}))};}const input=JSON.parse(options.body||'{}'),id=input.id||projectId(input.project?.name);if(input.action==='delete'){const {error}=await db.from('website_projects').delete().eq('id',id).eq('agency_id',membership.agency_id);if(error)throw error;return{id};}if(input.action==='unpublish'){const {error}=await db.from('website_projects').update({published:null,published_at:null,updated_at:new Date().toISOString()}).eq('id',id).eq('agency_id',membership.agency_id);if(error)throw error;return{id};}const project={...input.project,id};const now=new Date().toISOString();const values={id,agency_id:membership.agency_id,draft:project,updated_at:now,...(input.action==='publish'?{published:project,published_at:now}:{})};const {error}=await db.from('website_projects').upsert(values,{onConflict:'id'});if(error)throw error;return{id};}
function confirmLeave(){return !dirty||confirm('Discard your unsaved changes?');}
function setBusy(value){busy=value;for(const control of document.querySelectorAll('#studio button,#studio input,#studio textarea,#studio select,#new-project'))control.disabled=value;}
function image(src){const el=node('img');el.src=src;el.alt='Project image';return el;}
const defaultCrop=()=>({ratio:'landscape',x:50,y:50,zoom:1});
function cropFor(kind){return {...defaultCrop(),...(current.presentation?.[kind]||{})};}
function cropRatio(value){return value==='portrait'?'4 / 5':value==='square'?'1 / 1':'16 / 10';}
function applyCrop(host,media,crop){host.style.aspectRatio=cropRatio(crop.ratio);media.style.objectFit='cover';media.style.objectPosition=`${crop.x}% ${crop.y}%`;media.style.transform=`scale(${crop.zoom})`;media.style.transformOrigin=`${crop.x}% ${crop.y}%`;}
function renderList(){
 $('project-count').textContent=projects.length;
 $('project-list').replaceChildren(...projects.map(entry=>{
  const button=node('button');button.type='button';button.className='project-option';button.setAttribute('aria-current',String(entry.project.id===current?.id));
  if(entry.project.cover)button.append(image(entry.project.cover));
  const label=node('span');label.append(node('strong',entry.project.name),node('small',entry.published?(entry.hasChanges?'Published · draft changes':'Published'):'Draft'));button.append(label);
  button.addEventListener('click',()=>{if(!busy&&confirmLeave())select(entry.project);});return button;
 }));
}
function renderMedia(){
 const coverHost=$('cover-preview');coverHost.replaceChildren();if(current.cover){const cover=image(current.cover);applyCrop(coverHost,cover,cropFor('cover'));coverHost.append(cover);}else coverHost.append(node('span','Choose a cover image'));
 const video=$('video-preview');video.replaceChildren();
 if(current.video?.type==='video/google-drive'){const frame=node('iframe');frame.src=current.video.src;frame.title='Google Drive project video preview';frame.allow='autoplay; encrypted-media; picture-in-picture';frame.allowFullscreen=true;frame.referrerPolicy='strict-origin-when-cross-origin';applyCrop(video,frame,cropFor('video'));video.append(frame);}else if(current.video){const player=node('video');player.src=current.video.src;player.controls=true;player.preload='metadata';player.playsInline=true;player.poster=current.cover||'';applyCrop(video,player,cropFor('video'));video.append(player);}else video.append(node('span','Optional project film'));
 $('remove-video').hidden=!current.video;
 $('gallery-preview').replaceChildren(...current.images.map((src,index)=>{
  const wrap=node('div');wrap.className='gallery-item';const remove=node('button','×');remove.type='button';remove.setAttribute('aria-label',`Remove gallery image ${index+1}`);remove.addEventListener('click',()=>{current.images.splice(index,1);dirty=true;renderMedia();});wrap.append(image(src),remove);return wrap;
 }));
}
function select(project){
 current=structuredClone(project);current.presentation={cover:{...defaultCrop(),...(current.presentation?.cover||{})},video:{...defaultCrop(),...(current.presentation?.video||{})}};dirty=false;form.reset();$('editor-empty').hidden=true;form.hidden=false;
 for(const key of ['name','year','category','sector'])form.elements[key].value=current[key]||'other';
 form.elements.concept.checked=!!current.concept;
 for(const lang of ['en','ar'])for(const key of ['title','summary','description','services'])form.elements[`${key}_${lang}`].value=key==='services'?(current.services?.[lang]||[]).join('\n'):current[key]?.[lang]||'';
 $('editor-title').textContent=current.name||'New project';
 $('video-drive-url').value=current.video?.type==='video/google-drive'?current.video.src:'';
 $('cover-drive-url').value=current.cover?.startsWith('https://drive.google.com/thumbnail?')?current.cover:'';
 $('gallery-drive-urls').value='';
 for(const kind of ['cover','video']){const crop=cropFor(kind);$(`${kind}-ratio`).value=crop.ratio;$(`${kind}-x`).value=String(crop.x);$(`${kind}-y`).value=String(crop.y);$(`${kind}-zoom`).value=String(Math.round(crop.zoom*100));}
 const entry=projects.find(p=>p.project.id===current.id);$('publication-state').textContent=entry?.published?'Published':'Draft';$('unpublish').hidden=!entry?.published;$('delete-project').hidden=!entry;
 renderList();renderMedia();
}
function readProject(){
 const project={...current};for(const key of ['name','year','category','sector'])project[key]=form.elements[key].value.trim();project.concept=form.elements.concept.checked;
 for(const key of ['title','summary','description','services']){project[key]={};for(const lang of ['en','ar']){const value=form.elements[`${key}_${lang}`].value.trim();project[key][lang]=key==='services'?value.split('\n').map(v=>v.trim()).filter(Boolean):value;}}
 const drive=$('video-drive-url').value.trim();
 if(drive){const preview=googleDrivePreview(drive);if(!preview)throw new Error('Paste a valid Google Drive file sharing link. Set access to “Anyone with the link”.');project.video={src:preview,type:'video/google-drive',poster:project.cover};}
 else if(project.video?.type==='video/google-drive')delete project.video;
 project.presentation={};for(const kind of ['cover','video'])project.presentation[kind]={ratio:$(`${kind}-ratio`).value,x:Number($(`${kind}-x`).value),y:Number($(`${kind}-y`).value),zoom:Number($(`${kind}-zoom`).value)/100};
 if(project.video)project.video={...project.video,poster:project.cover};return project;
}
async function refresh(){const data=await api('/api/website/admin');projects=data.projects;renderList();return data;}
async function refreshTrustedClients(){
 const {membership}=await getOwnerContext();const {data,error}=await db.from('website_trusted_clients').select('*').eq('agency_id',membership.agency_id).order('position').order('created_at');
 if(error)throw error;trustedClients=data||[];renderTrustedClients();
}
function renderTrustedClients(){
 $('trusted-client-list').replaceChildren(...trustedClients.map(client=>{
  const row=node('article');row.className='trusted-client-admin-row';const logo=googleDriveImage(client.logo_url)||client.logo_url;
  if(logo){const image=node('img');image.src=logo;image.alt='';row.append(image);}else row.append(node('span','No logo'));
  const details=node('div');details.append(node('strong',client.name),node('small',client.published?'Visible on website':'Hidden from website'));row.append(details,node('span',`Order ${client.position}`));
  const remove=node('button','Delete');remove.type='button';remove.className='danger';remove.addEventListener('click',async()=>{if(!confirm(`Delete ${client.name} from the trusted clients bar?`))return;remove.disabled=true;const {error}=await db.from('website_trusted_clients').delete().eq('id',client.id);if(error){remove.disabled=false;return notify(error.message,true);}await refreshTrustedClients();notify('Trusted client deleted.');});row.append(remove);return row;
 }));
}
$('trusted-client-form').addEventListener('submit',async event=>{
 event.preventDefault();const {membership}=await getOwnerContext(),rawLogo=$('trusted-client-logo').value.trim(),logo=googleDriveImage(rawLogo)||rawLogo,submit=event.submitter;
 submit.disabled=true;const {error}=await db.from('website_trusted_clients').insert({agency_id:membership.agency_id,name:$('trusted-client-name').value.trim(),logo_url:logo||null,website_url:$('trusted-client-website').value.trim()||null,position:Number($('trusted-client-position').value)||0,published:$('trusted-client-published').checked});submit.disabled=false;
 if(error)return notify(error.message,true);event.currentTarget.reset();$('trusted-client-position').value='0';$('trusted-client-published').checked=true;await refreshTrustedClients();notify('Trusted client added to the website bar.');
});
async function save(action){
 if(busy||!form.reportValidity())return;
 if(action==='publish'&&!confirm('Publish this project on your public website?'))return;
 setBusy(true);notify(action==='publish'?'Publishing…':'Saving draft…');
 try{const data=await api('/api/website/admin',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:current.id,action,project:readProject()})});dirty=false;await refresh();select(projects.find(p=>p.project.id===data.id).project);notify(action==='publish'?'Published. Your project is now on the website.':'Draft saved. Your public website has not changed.');}catch(error){notify(error.message,true);}finally{setBusy(false);}
}
async function upload(input,kind){
 if(busy)return;const files=[...input.files];if(!files.length)return;
 if(files.some(file=>file.size>25*1024*1024)){notify('Each file must be 25 MB or smaller.',true);input.value='';return;}
 if(kind==='gallery'&&current.images.length+files.length>30){notify('You can add up to 30 gallery images.',true);input.value='';return;}
 setBusy(true);try{for(const [index,file] of files.entries()){
  notify(`Uploading ${index+1} of ${files.length}…`);let media;if(isSupabaseMode){const {membership}=await getOwnerContext(),safe=file.name.replace(/[^a-zA-Z0-9._-]/g,'-'),path=`${membership.agency_id}/${crypto.randomUUID()}-${safe}`;const {error}=await db.storage.from('website-media').upload(path,file,{contentType:file.type||'application/octet-stream',upsert:false});if(error)throw error;const {data}=db.storage.from('website-media').getPublicUrl(path);media={src:data.publicUrl,type:file.type||'application/octet-stream'};}else media=await api('/api/website/media',{method:'POST',headers:{'Content-Type':file.type||'application/octet-stream'},body:file});
  if(kind==='video')current.video={src:media.src,type:media.type,poster:current.cover};else if(kind==='cover')current.cover=media.src;else current.images.push(media.src);dirty=true;
 }if(kind==='video')$('video-drive-url').value='';notify('Upload complete. Save your draft or publish to keep these changes in the project.');}catch(error){notify(error.message,true);}finally{renderMedia();setBusy(false);input.value='';}
}
form.addEventListener('input',event=>{dirty=true;if(event.target.closest('.crop-controls')){const kind=event.target.closest('.crop-controls').dataset.crop;current.presentation[kind]={ratio:$(`${kind}-ratio`).value,x:Number($(`${kind}-x`).value),y:Number($(`${kind}-y`).value),zoom:Number($(`${kind}-zoom`).value)/100};renderMedia();}});form.addEventListener('submit',event=>{event.preventDefault();save('save');});
const driveInput=$('video-drive-url');
driveInput.addEventListener('input',()=>{
 const value=driveInput.value.trim(),preview=googleDrivePreview(value);
 driveInput.setCustomValidity(value&&!preview?'Paste a valid Google Drive file link. Set access to “Anyone with the link”.':'');
 if(preview){current.video={src:preview,type:'video/google-drive',poster:current.cover};dirty=true;renderMedia();}
 else if(!value&&current.video?.type==='video/google-drive'){delete current.video;dirty=true;renderMedia();}
});
document.getElementById('use-example-drive-video').addEventListener('click',()=>{
 driveInput.value='https://drive.google.com/file/d/1xC0rOuk4IPvCAlwX-j1pxkz-wHWCrMaT/view?usp=sharing';
 driveInput.dispatchEvent(new Event('input',{bubbles:true}));
});
const coverDriveInput=$('cover-drive-url');
coverDriveInput.addEventListener('input',()=>{
 const value=coverDriveInput.value.trim(),src=googleDriveImage(value);
 coverDriveInput.setCustomValidity(value&&!src?'Paste a valid Google Drive image link. Set access to “Anyone with the link”.':'');
 if(src){current.cover=src;if(current.video)current.video.poster=src;dirty=true;renderMedia();}
});
$('add-drive-images').addEventListener('click',()=>{
 const values=$('gallery-drive-urls').value.split(/\r?\n/).map(value=>value.trim()).filter(Boolean);
 if(!values.length)return;
 const images=values.map(googleDriveImage);
 if(images.some(src=>!src)){notify('One or more Google Drive image links are invalid.',true);return;}
 if(current.images.length+images.length>30){notify('You can add up to 30 gallery images.',true);return;}
 current.images.push(...images);$('gallery-drive-urls').value='';dirty=true;renderMedia();notify('Drive images added. Save or publish the project to keep them.');
});
for(const kind of ['cover','video','gallery'])$(`${kind}-upload`).addEventListener('change',event=>upload(event.target,kind));
$('remove-video').addEventListener('click',()=>{delete current.video;$('video-drive-url').value='';driveInput.setCustomValidity('');dirty=true;renderMedia();});
$('publish').addEventListener('click',()=>save('publish'));
$('new-project').addEventListener('click',()=>{if(confirmLeave()){select({name:'',year:String(new Date().getFullYear()),category:'identity',sector:'other',concept:false,title:{},summary:{},description:{},services:{en:[],ar:[]},cover:'',images:[],presentation:{cover:defaultCrop(),video:defaultCrop()}});notify('Add your project details, then save a draft.');}});
for(const action of ['unpublish','delete'])$(action==='delete'?'delete-project':'unpublish').addEventListener('click',async()=>{
 if(busy||!confirm(action==='delete'?'Delete this project and remove it from the public website?':'Remove this project from the public website? Your saved draft will remain.'))return;
 setBusy(true);try{await api('/api/website/admin',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:current.id,action})});dirty=false;await refresh();if(action==='delete'){current=null;form.hidden=true;$('editor-empty').hidden=false;}else select(projects.find(p=>p.project.id===current.id).project);notify(action==='delete'?'Project deleted.':'Project unpublished.');}catch(error){notify(error.message,true);}finally{setBusy(false);}
});
$('preview-project').addEventListener('click',()=>{
 const p=readProject(),body=$('preview-content');body.replaceChildren(node('p','Private preview · not published'),node('h1',p.name));
 if(p.cover)body.append(image(p.cover));
 for(const lang of ['en','ar'])if(p.title[lang]||p.description[lang]){const section=node('section');section.dir=lang==='ar'?'rtl':'ltr';section.append(node('h2',p.title[lang]),node('p',p.summary[lang]),node('p',p.description[lang]));const services=node('ul');for(const service of p.services[lang])services.append(node('li',service));section.append(services);body.append(section);}
 if(p.video?.type==='video/google-drive'){const frame=node('iframe');frame.src=p.video.src;frame.title='Google Drive project video preview';frame.allow='autoplay; encrypted-media; picture-in-picture';frame.allowFullscreen=true;frame.referrerPolicy='strict-origin-when-cross-origin';body.append(frame);}else if(p.video){const video=node('video');video.src=p.video.src;video.controls=true;video.playsInline=true;body.append(video);}for(const src of p.images)body.append(image(src));$('preview-dialog').showModal();
});
$('close-preview').addEventListener('click',()=>$('preview-dialog').close());$('preview-dialog').addEventListener('close',()=>{for(const video of $('preview-dialog').querySelectorAll('video'))video.pause();});
$('sign-out').addEventListener('click',async()=>{if(busy||!confirmLeave())return;try{await api('/api/auth/signout',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});dirty=false;location.assign('login.html?next=admin');}catch(error){notify(error.message,true);}});
window.addEventListener('beforeunload',event=>{if(dirty||busy){event.preventDefault();event.returnValue='';}});
try{const data=await refresh();await refreshTrustedClients();$('studio').hidden=false;$('trusted-clients-admin').hidden=false;$('new-project').disabled=false;notify(`Signed in as ${data.email}. Only published content is public.`);}catch(error){if(error.status===401)location.replace('login.html?next=admin');else{$('access-denied').hidden=false;notify(error.message,true);}}
