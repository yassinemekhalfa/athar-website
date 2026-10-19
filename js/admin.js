import {googleDrivePreview,googleDriveImage} from './drive-video.js';
import {db,isSupabaseMode} from './dataClient.js';
const $=id=>document.getElementById(id);
const form=$('project-form'),status=$('status');
let projects=[],current=null,dirty=false,busy=false,trustedClients=[],presentationSettings=null,profileSettings=null,uploadedTrustedLogo='';
const node=(tag,text)=>{const el=document.createElement(tag);if(text!==undefined)el.textContent=text;return el;};
function notify(text,error=false){status.textContent=text;status.classList.toggle('error',error);}
async function api(url,options={}){
 if(isSupabaseMode)return supabaseApi(url,options);
 const response=await fetch(url,{credentials:'same-origin',...options});const result=await response.json();
 if(!response.ok||result.error){const error=new Error(result.error?.message||'Request failed. Please try again.');error.status=response.status;throw error;}return result.data;
}
let ownerContext=null;
async function getOwnerContext(){if(ownerContext)return ownerContext;const {data:{user},error:authError}=await db.auth.getUser();if(authError||!user)throw Object.assign(new Error('Sign in with the owner account.'),{status:401});const {data:membership,error}=await db.from('agency_members').select('agency_id,role').eq('profile_id',user.id).eq('role','owner').limit(1).maybeSingle();if(error||!membership)throw Object.assign(new Error('Owner access is required.'),{status:403});return ownerContext={user,membership};}
const projectId=value=>{const base=String(value||'project').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,56)||'project';return `${base}-${globalThis.ATHAR_UUID().slice(0,8)}`;};
async function supabaseApi(url,options={}){const {user,membership}=await getOwnerContext();if(url==='/api/auth/signout'){await db.auth.signOut();return null;}if(url!=='/api/website/admin')throw new Error('This operation is not available in Supabase mode.');if(!options.method){const {data,error}=await db.from('website_projects').select('*').eq('agency_id',membership.agency_id).order('updated_at',{ascending:false});if(error)throw error;return{email:user.email,projects:(data||[]).map(row=>({project:row.draft,published:Boolean(row.published),hasChanges:Boolean(row.published)&&JSON.stringify(row.draft)!==JSON.stringify(row.published)}))};}const input=JSON.parse(options.body||'{}'),id=input.id||projectId(input.project?.name);if(input.action==='delete'){const {error}=await db.from('website_projects').delete().eq('id',id).eq('agency_id',membership.agency_id);if(error)throw error;return{id};}if(input.action==='unpublish'){const {error}=await db.from('website_projects').update({published:null,published_at:null,updated_at:new Date().toISOString()}).eq('id',id).eq('agency_id',membership.agency_id);if(error)throw error;return{id};}const project={...input.project,id};const now=new Date().toISOString();const values={id,agency_id:membership.agency_id,draft:project,updated_at:now,...(input.action==='publish'?{published:project,published_at:now}:{})};const {error}=await db.from('website_projects').upsert(values,{onConflict:'id'});if(error)throw error;return{id};}
function confirmLeave(){return !dirty||confirm('Discard your unsaved changes?');}
function setBusy(value){busy=value;for(const control of document.querySelectorAll('#studio button,#studio input,#studio textarea,#studio select,#new-project'))control.disabled=value;}
function image(src){const el=node('img');el.src=src;el.alt='Project image';return el;}
const defaultCrop=()=>({ratio:'landscape',x:50,y:50,zoom:1});
const defaultVideoFrame=()=>({ratio:'auto'});
function cropFor(kind){return {...defaultCrop(),...(current.presentation?.[kind]||{})};}
function cropRatio(value){return value==='portrait'?'4 / 5':value==='square'?'1 / 1':'16 / 10';}
function applyCrop(host,media,crop){host.style.aspectRatio=cropRatio(crop.ratio);media.style.objectFit='cover';media.style.objectPosition=`${crop.x}% ${crop.y}%`;media.style.transform=`scale(${crop.zoom})`;media.style.transformOrigin=`${crop.x}% ${crop.y}%`;}
function videoFrame(){return {...defaultVideoFrame(),...(current.presentation?.video||{})};}
function videoAspect(frame=videoFrame()){
 if(frame.ratio==='auto'&&Number(frame.aspect)>0)return String(frame.aspect);
 return {vertical:'9 / 16',portrait:'4 / 5',square:'1 / 1',standard:'4 / 3',landscape:'16 / 9'}[frame.ratio]||'16 / 9';
}
function applyVideoFrame(host,media,frame=videoFrame()){
 host.style.aspectRatio=videoAspect(frame);media.style.objectFit='contain';media.style.objectPosition='center';media.style.transform='none';
}
function readVideoDimensions(file){return new Promise((resolve,reject)=>{const src=URL.createObjectURL(file),video=document.createElement('video');video.preload='metadata';video.onloadedmetadata=()=>{const width=video.videoWidth,height=video.videoHeight;URL.revokeObjectURL(src);if(!width||!height)return reject(new Error('The video dimensions could not be read.'));resolve({width,height,aspect:Number((width/height).toFixed(6))});};video.onerror=()=>{URL.revokeObjectURL(src);reject(new Error('The selected video could not be read.'));};video.src=src;});}
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
 if(current.video?.type==='video/google-drive'){const frame=node('iframe');frame.src=current.video.src;frame.title='Google Drive project video preview';frame.allow='autoplay; encrypted-media; picture-in-picture';frame.allowFullscreen=true;frame.referrerPolicy='strict-origin-when-cross-origin';applyVideoFrame(video,frame);video.append(frame);}else if(current.video){const player=node('video');player.src=current.video.src;player.controls=true;player.preload='metadata';player.playsInline=true;player.poster=current.cover||'';applyVideoFrame(video,player);video.append(player);}else video.append(node('span','Optional project film'));
 const frame=videoFrame(),dimensions=$('video-dimensions');dimensions.textContent=frame.width&&frame.height?`Detected ${frame.width} × ${frame.height}px${frame.ratio==='auto'?' — using natural format':''}`:frame.ratio==='auto'?'Auto detects uploaded video dimensions.':'Selected format is used; the full video remains visible.';
 $('remove-video').hidden=!current.video;
 $('gallery-preview').replaceChildren(...current.images.map((src,index)=>{
  const wrap=node('div');wrap.className='gallery-item';const remove=node('button','×');remove.type='button';remove.setAttribute('aria-label',`Remove gallery image ${index+1}`);remove.addEventListener('click',()=>{current.images.splice(index,1);dirty=true;renderMedia();});wrap.append(image(src),remove);return wrap;
 }));
}
function select(project){
 current=structuredClone(project);current.presentation={cover:{...defaultCrop(),...(current.presentation?.cover||{})},video:{...defaultVideoFrame(),...(current.presentation?.video||{})}};dirty=false;form.reset();$('editor-empty').hidden=true;form.hidden=false;
 for(const key of ['name','year','category','sector'])form.elements[key].value=current[key]||'other';
 form.elements.concept.checked=!!current.concept;
 for(const lang of ['en','ar'])for(const key of ['title','summary','description','services'])form.elements[`${key}_${lang}`].value=key==='services'?(current.services?.[lang]||[]).join('\n'):current[key]?.[lang]||'';
 $('editor-title').textContent=current.name||'New project';
 $('video-drive-url').value=current.video?.type==='video/google-drive'?current.video.src:'';
 $('cover-drive-url').value=current.cover?.startsWith('https://drive.google.com/thumbnail?')?current.cover:'';
 $('gallery-drive-urls').value='';
 const coverCrop=cropFor('cover');$('cover-ratio').value=coverCrop.ratio;$('cover-x').value=String(coverCrop.x);$('cover-y').value=String(coverCrop.y);$('cover-zoom').value=String(Math.round(coverCrop.zoom*100));$('video-ratio').value=videoFrame().ratio;
 const entry=projects.find(p=>p.project.id===current.id);$('publication-state').textContent=entry?.published?'Published':'Draft';$('unpublish').hidden=!entry?.published;$('delete-project').hidden=!entry;
 renderList();renderMedia();
}
function readProject(){
 const project={...current};for(const key of ['name','year','category','sector'])project[key]=form.elements[key].value.trim();project.concept=form.elements.concept.checked;
 for(const key of ['title','summary','description','services']){project[key]={};for(const lang of ['en','ar']){const value=form.elements[`${key}_${lang}`].value.trim();project[key][lang]=key==='services'?value.split('\n').map(v=>v.trim()).filter(Boolean):value;}}
 const drive=$('video-drive-url').value.trim();
 if(drive){const preview=googleDrivePreview(drive);if(!preview)throw new Error('Paste a valid Google Drive file sharing link. Set access to “Anyone with the link”.');project.video={src:preview,type:'video/google-drive',poster:project.cover};}
 else if(project.video?.type==='video/google-drive')delete project.video;
 project.presentation={cover:{ratio:$('cover-ratio').value,x:Number($('cover-x').value),y:Number($('cover-y').value),zoom:Number($('cover-zoom').value)/100},video:{...videoFrame(),ratio:$('video-ratio').value}};
 if(project.video)project.video={...project.video,poster:project.cover};return project;
}
async function refresh(){const data=await api('/api/website/admin');projects=data.projects;renderList();return data;}
async function refreshTrustedClients(){
 const {membership}=await getOwnerContext();const {data,error}=await db.from('website_trusted_clients').select('*').eq('agency_id',membership.agency_id).order('position').order('created_at');
 if(error)throw error;trustedClients=data||[];renderTrustedClients();
}
async function uploadPublicFile(file){
 if(file.size>25*1024*1024)throw new Error('The file must be 25 MB or smaller.');
 if(isSupabaseMode){const {membership}=await getOwnerContext(),safe=file.name.replace(/[^a-zA-Z0-9._-]/g,'-'),path=`${membership.agency_id}/${globalThis.ATHAR_UUID()}-${safe}`;const {error}=await db.storage.from('website-media').upload(path,file,{contentType:file.type||'application/octet-stream',upsert:false});if(error)throw error;const {data}=db.storage.from('website-media').getPublicUrl(path);return{src:data.publicUrl,type:file.type||'application/octet-stream'};}
 return api('/api/website/media',{method:'POST',headers:{'Content-Type':file.type||'application/octet-stream'},body:file});
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
 event.preventDefault();const {membership}=await getOwnerContext(),rawLogo=$('trusted-client-logo').value.trim(),logo=uploadedTrustedLogo||googleDriveImage(rawLogo)||rawLogo,submit=event.submitter;
 submit.disabled=true;const {error}=await db.from('website_trusted_clients').insert({agency_id:membership.agency_id,name:$('trusted-client-name').value.trim(),logo_url:logo||null,website_url:$('trusted-client-website').value.trim()||null,position:Number($('trusted-client-position').value)||0,published:$('trusted-client-published').checked});submit.disabled=false;
 if(error)return notify(error.message,true);uploadedTrustedLogo='';event.currentTarget.reset();$('trusted-client-position').value='0';$('trusted-client-published').checked=true;await refreshTrustedClients();notify('Trusted client added to the website bar.');
});
$('trusted-client-logo-upload').addEventListener('change',async event=>{const file=event.target.files?.[0];if(!file)return;try{notify('Uploading client logo…');uploadedTrustedLogo=(await uploadPublicFile(file)).src;$('trusted-client-logo').value='';notify('Logo uploaded. Add the client to publish it.');}catch(error){notify(error.message,true);}finally{event.target.value='';}});

function renderWebsiteProfilePhoto(){
 const profile=profileSettings||{},preview=$('website-profile-preview');preview.replaceChildren();
 if(profile.photo_url){const photo=node('img');photo.src=profile.photo_url;photo.alt='Profile preview';preview.append(photo);}else preview.append(node('span','Add your photo'));
}
function renderWebsiteProfile(){
 const profile=profileSettings||{};renderWebsiteProfilePhoto();
 for(const key of ['name_en','role_en','bio_en','name_ar','role_ar','bio_ar','tiktok_url','facebook_url','instagram_url','linkedin_url']){
  const id=`website-profile-${key.replaceAll('_','-').replace('-url','')}`;if($(id))$(id).value=profile[key]||'';
 }
 $('website-profile-photo-url').value=profile.photo_url||'';$('website-profile-published').checked=!!profile.published;
}
async function refreshWebsiteProfile(){
 const {membership}=await getOwnerContext();const {data,error}=await db.from('website_profile').select('*').eq('agency_id',membership.agency_id).maybeSingle();if(error)throw error;
 profileSettings=data||{agency_id:membership.agency_id,published:false};renderWebsiteProfile();
}
$('website-profile-photo-url').addEventListener('input',event=>{profileSettings.photo_url=event.target.value.trim();renderWebsiteProfilePhoto();});
$('website-profile-photo').addEventListener('change',async event=>{const file=event.target.files?.[0];if(!file)return;try{notify('Uploading your profile photo…');profileSettings.photo_url=(await uploadPublicFile(file)).src;$('website-profile-photo-url').value=/^https?:\/\//i.test(profileSettings.photo_url)?profileSettings.photo_url:'';renderWebsiteProfilePhoto();notify('Photo uploaded. Save the profile to publish it.');}catch(error){notify(error.message,true);}finally{event.target.value='';}});
$('website-profile-form').addEventListener('submit',async event=>{
 event.preventDefault();const {membership}=await getOwnerContext(),submit=event.submitter;submit.disabled=true;
 const values={agency_id:membership.agency_id,photo_url:$('website-profile-photo-url').value.trim()||profileSettings.photo_url||null,name_en:$('website-profile-name-en').value.trim(),role_en:$('website-profile-role-en').value.trim(),bio_en:$('website-profile-bio-en').value.trim(),name_ar:$('website-profile-name-ar').value.trim(),role_ar:$('website-profile-role-ar').value.trim(),bio_ar:$('website-profile-bio-ar').value.trim(),tiktok_url:$('website-profile-tiktok').value.trim()||null,facebook_url:$('website-profile-facebook').value.trim()||null,instagram_url:$('website-profile-instagram').value.trim()||null,linkedin_url:$('website-profile-linkedin').value.trim()||null,published:$('website-profile-published').checked,updated_at:new Date().toISOString()};
 const {error}=await db.from('website_profile').upsert(values,{onConflict:'agency_id'});submit.disabled=false;if(error)return notify(error.message,true);await refreshWebsiteProfile();notify('Homepage profile and social links saved.');
});

function renderPresentationVideo(){const host=$('presentation-video-preview');host.replaceChildren();const url=presentationSettings?.presentation_video_url;if(!url){host.hidden=true;return;}host.hidden=false;if(presentationSettings.presentation_video_type==='video/google-drive'){const frame=node('iframe');frame.src=url;frame.title='Presentation video preview';frame.allow='autoplay; encrypted-media; picture-in-picture';frame.allowFullscreen=true;host.append(frame);}else{const video=node('video');video.src=url;video.controls=true;video.playsInline=true;host.append(video);}}
async function refreshPresentationVideo(){const {membership}=await getOwnerContext();const {data,error}=await db.from('website_settings').select('*').eq('agency_id',membership.agency_id).maybeSingle();if(error)throw error;presentationSettings=data||{agency_id:membership.agency_id,presentation_video_url:null,presentation_video_type:null,presentation_video_published:false};$('presentation-video-link').value=presentationSettings.presentation_video_type==='video/google-drive'?presentationSettings.presentation_video_url||'':'';$('presentation-video-published').checked=!!presentationSettings.presentation_video_published;renderPresentationVideo();}
$('presentation-video-link').addEventListener('input',event=>{const value=event.target.value.trim(),preview=googleDrivePreview(value);event.target.setCustomValidity(value&&!preview?'Paste a valid Google Drive video link.':'');if(preview){presentationSettings.presentation_video_url=preview;presentationSettings.presentation_video_type='video/google-drive';renderPresentationVideo();}});
$('presentation-video-upload').addEventListener('change',async event=>{const file=event.target.files?.[0];if(!file)return;try{notify('Uploading presentation video…');const media=await uploadPublicFile(file);presentationSettings.presentation_video_url=media.src;presentationSettings.presentation_video_type=media.type;$('presentation-video-link').value='';renderPresentationVideo();notify('Video uploaded. Press Save video to publish the setting.');}catch(error){notify(error.message,true);}finally{event.target.value='';}});
$('presentation-video-form').addEventListener('submit',async event=>{event.preventDefault();const {membership}=await getOwnerContext(),drive=$('presentation-video-link').value.trim();if(drive){const preview=googleDrivePreview(drive);if(!preview)return;presentationSettings.presentation_video_url=preview;presentationSettings.presentation_video_type='video/google-drive';}const values={agency_id:membership.agency_id,presentation_video_url:presentationSettings.presentation_video_url||null,presentation_video_type:presentationSettings.presentation_video_type||null,presentation_video_published:$('presentation-video-published').checked,updated_at:new Date().toISOString()};const {error}=await db.from('website_settings').upsert(values,{onConflict:'agency_id'});if(error)return notify(error.message,true);await refreshPresentationVideo();notify('Homepage presentation video saved.');});
$('remove-presentation-video').addEventListener('click',async()=>{const {membership}=await getOwnerContext();const {error}=await db.from('website_settings').upsert({agency_id:membership.agency_id,presentation_video_url:null,presentation_video_type:null,presentation_video_published:false,updated_at:new Date().toISOString()},{onConflict:'agency_id'});if(error)return notify(error.message,true);await refreshPresentationVideo();notify('Presentation video removed.');});
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
  notify(`Uploading ${index+1} of ${files.length}…`);const dimensions=kind==='video'?await readVideoDimensions(file):null;const media=await uploadPublicFile(file);
  if(kind==='video'){current.video={src:media.src,type:media.type,poster:current.cover};current.presentation.video={ratio:'auto',...dimensions};$('video-ratio').value='auto';}else if(kind==='cover')current.cover=media.src;else current.images.push(media.src);dirty=true;
 }if(kind==='video')$('video-drive-url').value='';notify('Upload complete. Save your draft or publish to keep these changes in the project.');}catch(error){notify(error.message,true);}finally{renderMedia();setBusy(false);input.value='';}
}
form.addEventListener('input',event=>{dirty=true;if(event.target.closest('.crop-controls'))current.presentation.cover={ratio:$('cover-ratio').value,x:Number($('cover-x').value),y:Number($('cover-y').value),zoom:Number($('cover-zoom').value)/100};if(event.target.closest('[data-video-format]'))current.presentation.video={...videoFrame(),ratio:$('video-ratio').value};if(event.target.closest('.crop-controls')||event.target.closest('[data-video-format]'))renderMedia();});form.addEventListener('submit',event=>{event.preventDefault();save('save');});
const driveInput=$('video-drive-url');
driveInput.addEventListener('input',()=>{
 const value=driveInput.value.trim(),preview=googleDrivePreview(value);
 driveInput.setCustomValidity(value&&!preview?'Paste a valid Google Drive file link. Set access to “Anyone with the link”.':'');
 if(preview){current.video={src:preview,type:'video/google-drive',poster:current.cover};current.presentation.video={ratio:$('video-ratio').value||'auto'};dirty=true;renderMedia();}
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
$('new-project').addEventListener('click',()=>{if(confirmLeave()){select({name:'',year:String(new Date().getFullYear()),category:'identity',sector:'other',concept:false,title:{},summary:{},description:{},services:{en:[],ar:[]},cover:'',images:[],presentation:{cover:defaultCrop(),video:defaultVideoFrame()}});notify('Add your project details, then save a draft.');}});
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
try{const data=await refresh();await Promise.all([refreshTrustedClients(),refreshPresentationVideo(),refreshWebsiteProfile()]);$('studio').hidden=false;$('trusted-clients-admin').hidden=false;$('presentation-video-admin').hidden=false;$('website-profile-admin').hidden=false;$('new-project').disabled=false;notify(`Signed in as ${data.email}. Only published content is public.`);}catch(error){if(error.status===401)location.replace('login.html?next=admin');else{$('access-denied').hidden=false;notify(error.message,true);}}
