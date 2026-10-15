import { getState } from '../core/state.js';
import { AppCore } from '../core/appCore.js';
import { saveBranding } from '../workspace/branding.js';
import { preferences, savePreferences, applyTheme, THEME_DEFAULTS, uploadBrandAsset } from '../workspace/preferences.js';
import { workspaceIcon } from './workspaceIcons.js';

function el(tag,cls='',text){const n=document.createElement(tag);n.className=cls;if(text!==undefined)n.textContent=text;return n;}
function button(text,fn,cls='k-btn k-btn--soft'){const b=el('button',cls,text);b.type='button';if(fn)b.addEventListener('click',fn);return b;}
function glyph(name){const iconMap={globe:'language',mail:'inbox',image:'image',palette:'palette',check:'checkCircle'};return workspaceIcon(iconMap[name]||'edit','v-setting-icon');}
function row(host,title,description,control,icon='name'){const r=el('div','v-setting-row');const copy=el('div','v-setting-copy');copy.append(el('strong','',title));if(description)copy.append(el('span','',description));r.append(glyph(icon),copy);if(control)r.append(control);host.append(r);return r;}
function group(host,title){host.append(el('h2','v-setting-group',title));}
function go(section){document.dispatchEvent(new CustomEvent('kitchen:settings-nav',{detail:{section}}));}
function report(error){AppCore.ui.toast(AppCore.ui.describeError(error),'error');}
async function persist(patch,done){try{await savePreferences(patch);AppCore.ui.toast('Changes saved.','success');done?.();}catch(error){report(error);}}
function field(label,value,type='text'){const wrap=el('label','k-form-field');const input=el('input','ap-input');input.type=type;input.value=value||'';wrap.append(el('span','k-form-label',label),input);return {wrap,input};}
function edit(title,label,value,onSave,type='text'){
 const f=el('form','ap-stack'),control=field(label,value,type);control.input.required=true;
 const actions=el('div','k-modal-actions');const save=button('Save',null,'k-btn k-btn--primary');save.type='submit';actions.append(button('Cancel',()=>AppCore.ui.closeModal(),'k-btn k-btn--ghost'),save);f.append(control.wrap,actions);
 f.addEventListener('submit',async e=>{e.preventDefault();save.disabled=true;try{await onSave(control.input.value.trim());AppCore.ui.closeModal();}catch(error){report(error);}finally{save.disabled=false;}});
 AppCore.ui.openModal({title,content:f});
}
function pencil(label,fn){const b=button('',fn,'k-icon-button v-edit');b.setAttribute('aria-label',`Edit ${label}`);b.append(workspaceIcon('edit'));return b;}
function upload(label,onFile){const wrap=el('span','v-upload');const input=el('input');input.type='file';input.accept='image/png,image/jpeg,image/webp,image/gif,image/svg+xml';input.hidden=true;input.setAttribute('aria-label',label);const b=button('Browse',()=>input.click());input.addEventListener('change',async()=>{if(!input.files[0])return;b.disabled=true;try{await onFile(input.files[0]);}catch(error){report(error);}finally{b.disabled=false;}});wrap.append(input,b);return wrap;}
function heading(host,name,sub){const h=el('div','v-settings-heading');if(name!=='General'){h.append(button('General',()=>go('home'),'v-breadcrumb'),' › ');}h.append(el('h1','',name));host.append(h);if(sub)host.append(el('p','v-settings-description',sub));}
function choice(title,key,options,rerender){const f=el('form','ap-stack');const label=el('label','k-form-field',title);const select=el('select','ap-input');for(const [value,text] of options){const o=el('option','',text);o.value=value;select.append(o);}select.value=preferences()[key]||options[0][0];label.append(select);const save=button('Save',null,'k-btn k-btn--primary');save.type='submit';f.append(label,save);f.addEventListener('submit',async e=>{e.preventDefault();save.disabled=true;try{await savePreferences({[key]:select.value});AppCore.ui.closeModal();rerender();}catch(error){report(error);}finally{save.disabled=false;}});AppCore.ui.openModal({title,content:f});}

function domain(kind,rerender){
 const email=kind==='email';
 edit(email?'Add sender address (1/3)':'Add a custom domain (1/2)',email?'Email address':'Domain name',preferences()[email?'sender_address':'custom_domain'],async value=>{
  if(!email&&!/^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/i.test(value))throw Object.assign(new Error('Enter a domain such as portal.example.com, without https://.'),{userMessage:true});
  await savePreferences(email?{sender_address:value,sender_status:'pending'}:{custom_domain:value.toLowerCase(),domain_status:'pending'});rerender();
  // A saved hostname is not a verified deployment or a verified email sender.
  setTimeout(()=>{const content=el('div','ap-stack');content.append(el('p','',email?'Sender address saved. Verify this sender with your email provider before sending branded emails.':'Domain saved. Add this hostname to your hosting provider and use the DNS records it supplies.'));content.append(el('code','',value),el('p','v-settings-description','Status: Pending verification'));AppCore.ui.openModal({title:email?'Sender verification':'Domain verification (2/2)',content,actions:[{label:'Done',onClick:()=>AppCore.ui.closeModal()}]});},0);
 },email?'email':'text');
}

function general(host,rerender){
 const state=getState(),settings=preferences();heading(host,'General');
 const identity=el('div','v-workspace-identity');const logo=el('img');logo.src=state.agency.logo_url||'assets/images/workspace-logo.svg';logo.alt='';const copy=el('div');copy.append(el('strong','',state.agency.name),el('span','',`Created ${new Date(state.agency.created_at).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})}  ·  ${settings.custom_domain||location.host}`));identity.append(logo,copy);host.append(identity);
 group(host,'General');
 row(host,'Workspace name','Change the name of your workspace.',pencil('workspace name',()=>edit('Workspace name','Name',state.agency.name,async name=>{await saveBranding({name,primaryColor:state.agency.primary_color,logoFile:null});rerender();})));
 row(host,'Custom Domain','Configure the domain name of your workspace.',pencil('custom domain',()=>domain('domain',rerender)),'globe');
 row(host,'Custom Email Domain','Configure how emails are sent from your workspace.',button('···',()=>domain('email',rerender),'k-icon-button'),'mail');
 group(host,'Appearance & Branding');
 const logoControl=upload('Workspace logo',async file=>{await saveBranding({name:state.agency.name,primaryColor:state.agency.primary_color,logoFile:file});rerender();});
 if(state.agency.logo_url){const thumbnail=el('img','v-preview-logo');thumbnail.src=state.agency.logo_url;thumbnail.alt='Current workspace logo';const remove=button('×',async()=>{try{await saveBranding({name:state.agency.name,primaryColor:state.agency.primary_color,removeLogo:true});rerender();}catch(error){report(error);}},'k-icon-button');remove.setAttribute('aria-label','Remove workspace logo');logoControl.append(thumbnail,remove);}
 row(host,'Logo icon','Change the logo displayed on your workspace, login pages, and emails.',logoControl,'image');
 const themeRow=row(host,'Theme & Colors','Customize the look and feel of your workspace.',button('→',()=>go('theme'),'k-icon-button'),'palette');
 const loginRow=row(host,'Login page','Change the style and colors of your login page.',button('→',()=>go('login'),'k-icon-button'),'palette');
 for(const [target,section,label] of [[themeRow,'theme','Theme & Colors'],[loginRow,'login','Login page']]){target.classList.add('v-setting-link');const link=target.querySelector('button');link.setAttribute('aria-label',label);target.addEventListener('click',e=>{if(!e.target.closest('button'))go(section);});}
 group(host,'Localization');
 const currency=el('span','v-setting-value');currency.append(el('span','',settings.currency||'USD'),pencil('currency',()=>choice('Currency','currency',[['USD','USD — US Dollar'],['EUR','EUR — Euro'],['DZD','DZD — Algerian Dinar']],rerender)));row(host,'Currency','Set the default currency for Invoices and Quotes.',currency,'currency');
 const language=el('span','v-setting-value');language.append(el('span','',settings.language==='fr'?'French':settings.language==='ar'?'Arabic':'English (United States)'),pencil('language',()=>choice('Language','language',[['en-US','English (United States)'],['fr','French'],['ar','Arabic']],rerender)));row(host,'Language','Set the default language of your workspace.',language);
}
function colorControl(value,onChange,label){const wrap=el('label','v-color-control');const picker=el('input');picker.type='color';picker.value=value;picker.setAttribute('aria-label',label);const hex=el('input');hex.value=value.toUpperCase();hex.pattern='#[0-9A-Fa-f]{6}';hex.setAttribute('aria-label',`${label} hex`);picker.addEventListener('input',()=>{hex.value=picker.value.toUpperCase();onChange(picker.value);});hex.addEventListener('change',()=>{if(hex.checkValidity()){picker.value=hex.value;onChange(hex.value);}else hex.reportValidity();});wrap.append(picker,hex);return wrap;}
function toggle(value,change,label){const l=el('label','k-switch');const input=el('input');input.type='checkbox';input.checked=value;input.setAttribute('aria-label',label);input.addEventListener('change',()=>change(input.checked));l.append(input,el('span','k-switch__track'));return l;}
function theme(host){
 heading(host,'Theme & colors','Customize the look and feel of your workspace.');const draft={...THEME_DEFAULTS,...preferences().theme};
 const form=el('form');host.append(form);
 for(const [title,items] of [['Appearance',[['accent','Accent color']]],['Navigation',[['navigation_bg','Navigation BG'],['navigation_text','Navigation text'],['navigation_accent','Navigation accent']]],['Sidebar',[['sidebar_bg','Sidebar BG'],['sidebar_text','Sidebar text'],['sidebar_accent','Sidebar accent']]]]){group(form,title);for(const [key,label] of items)row(form,label,'',colorControl(draft[key],v=>{draft[key]=v;applyTheme({theme:draft});},label),'palette');}
 group(form,'Other');row(form,'Rounded Corners','',toggle(draft.rounded,v=>{draft.rounded=v;applyTheme({theme:draft});},'Rounded Corners'),'check');
 const actions=el('div','v-save-actions');const save=button('Save Changes',null,'k-btn k-btn--primary');save.type='submit';actions.append(save,button('Restore Defaults',async()=>{await persist({theme:{...THEME_DEFAULTS}},()=>go('theme'));},'k-btn k-btn--ghost'));form.append(actions);
 form.addEventListener('submit',async e=>{e.preventDefault();save.disabled=true;await persist({theme:draft});save.disabled=false;});
}
function appearance(host,kind){
 const login=kind==='login',settings=preferences(),draft={...(login?{accent:'#3078f6',text:'#333333',position:'Center',image_position:'Center',background:'#ffffff',title:'Log in to your account',powered:true}: {header_bg:'#eeeeee',header_text:'#333333',title:'Invoice',numbering:'0000000000'}),...settings[kind]};
 heading(host,login?'Login page':'Invoices',login?'Customize your login page.':null);
 const editor=el('div','v-appearance-editor'),form=el('form','v-appearance-fields'),preview=el('aside','v-appearance-preview');preview.append(el('span','v-preview-label','Preview'));const paper=el('div',login?'v-login-preview':'v-invoice-preview');preview.append(paper);editor.append(form,preview);host.append(editor);host.classList.add('v-settings-wide');
 const draw=()=>{paper.replaceChildren();paper.style.background=login?draft.background:'#fff';paper.style.color=login?draft.text:'#333';if(login){paper.dataset.position=draft.position;const card=el('div','v-preview-login-card');if(draft.logo||getState().agency.logo_url){const img=el('img','v-preview-logo');img.src=draft.logo||getState().agency.logo_url;card.append(img);}card.append(el('strong','',draft.title),el('span','',getState().agency.name),el('div','v-preview-input','Email address'),el('div','v-preview-input','Password'));const submit=el('div','v-preview-submit','Log in');submit.style.background=draft.accent;card.append(submit,el('small','','Forgot password?'));if(draft.powered)card.append(el('small','','Powered by Athar'));if(draft.image){const img=el('img','v-login-image');img.src=draft.image;img.style.objectPosition=draft.image_position.toLowerCase();paper.append(img);}paper.append(card);}else{const head=el('div','v-invoice-preview-head');head.style.background=draft.header_bg;head.style.color=draft.header_text;head.append(el('strong','',draft.title),el('strong','',getState().agency.name),el('span','',draft.numbering));if(draft.logo){const img=el('img','v-preview-logo');img.src=draft.logo;head.append(img);}paper.append(head,el('p','',draft.billing||'Your billing information'),el('h3','','Invoice preview'),el('p','',draft.memo||'Memo'));const table=el('div','v-preview-invoice-lines');for(const line of ['Description                         Amount','Design services                     $400.00','Subtotal                             $400.00','Total                                $400.00'])table.append(el('p','',line));paper.append(table,el('small','',draft.footer||''));}};
 group(form,'Appearance');row(form,'Logo','',upload('Login or invoice logo',async f=>{draft.logo=await uploadBrandAsset(f,kind);draw();}),'image');
 for(const [key,label] of (login?[['accent','Accent color'],['text','Text color']]:[['header_bg','Header BG color'],['header_text','Header text color']]))row(form,label,'',colorControl(draft[key],v=>{draft[key]=v;draw();},label),'palette');
 const selectRow=(key,label,values)=>{const select=el('select','ap-input v-small-select');for(const value of values)select.append(el('option','',value));select.value=draft[key];select.addEventListener('change',()=>{draft[key]=select.value;draw();});row(form,label,'',select);};
 if(login){selectRow('position','Login position',['Left','Center','Right']);row(form,'Image','',upload('Login background image',async f=>{draft.image=await uploadBrandAsset(f,'login-background');draw();}),'image');selectRow('image_position','Image position',['Left','Center','Right']);row(form,'Image background color','',colorControl(draft.background,v=>{draft.background=v;draw();},'Image background color'),'palette');}
 group(form,login?'Other':'Information');
 for(const [key,label] of (login?[['title','Title']]:[['title','Title'],['billing','Your billing information'],['memo','Memo'],['footer','Footer'],['numbering','Numbering']]))row(form,label,draft[key]||'',pencil(label,()=>edit(label,label,draft[key],async value=>{draft[key]=value;draw();})), 'name');
 if(login)row(form,'Show “Powered by Athar”','',toggle(draft.powered,v=>{draft.powered=v;draw();},'Show powered by'),'check');
 const save=button('Save Changes',null,'k-btn k-btn--primary');save.type='submit';form.append(save);form.addEventListener('submit',async e=>{e.preventDefault();save.disabled=true;await persist({[kind]:draft});save.disabled=false;});draw();
}
export function renderCustomization(main,section,rerender){
 main.replaceChildren();const host=el('div','v-settings-inner');main.append(host);
 if(section==='theme')theme(host);else if(section==='login'||section==='invoices')appearance(host,section);else general(host,rerender);
}
