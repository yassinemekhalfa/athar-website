import {db} from '../dataClient.js?v=20261104-9';
import {getState} from '../core/state.js?v=20261104-9';
import {AppCore} from '../core/appCore.js?v=20261104-9';

const el=(tag,cls='',text)=>{const node=document.createElement(tag);node.className=cls;if(text!==undefined)node.textContent=text;return node;};

async function edgeError(result,fallback){
 let message=result.data?.error||result.error?.message||fallback;
 try{if(result.error?.context&&typeof result.error.context.json==='function')message=(await result.error.context.json())?.error||message;}catch{}
 return Object.assign(new Error(message),{userMessage:true});
}

export function openManagedPassword({profileId=null,clientId=null,label='this account'}={}){
 const form=el('form','ap-stack'),intro=el('p','ap-muted-text',`Set a new sign-in password for ${label}. Their old password will stop working immediately.`),password=el('input','ap-input'),confirm=el('input','ap-input'),submit=el('button','ap-btn ap-btn--primary','Update password');
 password.type=confirm.type='password';password.required=confirm.required=true;password.minLength=confirm.minLength=8;password.maxLength=confirm.maxLength=128;password.autocomplete=confirm.autocomplete='new-password';password.placeholder='New password (minimum 8 characters)';confirm.placeholder='Confirm new password';submit.type='submit';
 form.append(intro,password,confirm,submit);
 form.addEventListener('submit',async event=>{event.preventDefault();form.querySelectorAll('.ap-inline-message').forEach(node=>node.remove());if(password.value!==confirm.value){form.prepend(el('p','ap-inline-message ap-inline-message--error','The two passwords do not match.'));return;}submit.disabled=true;try{const result=await db.functions.invoke('manage-user-password',{body:{agency_id:getState().agency.id,profile_id:profileId,client_id:clientId,password:password.value}});if(result.error||result.data?.error)throw await edgeError(result,'Could not update the password.');form.replaceChildren(el('p','ap-inline-message ap-inline-message--success',`Password updated for ${result.data.email||label}.`));const done=el('button','ap-btn ap-btn--primary','Done');done.type='button';done.addEventListener('click',()=>AppCore.ui.closeModal());form.append(done);done.focus();}catch(error){form.prepend(el('p','ap-inline-message ap-inline-message--error',AppCore.ui.describeError(error)));submit.disabled=false;}});
 AppCore.ui.openModal({title:'Change account password',content:form,actions:[],dismissible:false});password.focus();
}

