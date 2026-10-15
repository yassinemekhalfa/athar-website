import {ROLES,normalizeRole} from '../core/permissions.js';
import { db,isSupabaseMode } from "../dataClient.js";
import { getState } from "../core/state.js";


export async function acceptInvitation(token){const {data,error}=await db.rpc("accept_invitation",{p_token:token});if(error){if(error.message)throw Object.assign(new Error(error.message),{userMessage:true,code:error.code});throw error;}return data?.[0]||null;}

function invitationLink(token,email,folderId){const url=new URL("login.html",window.location.href);url.searchParams.set("invite",token);url.searchParams.set("email",email);if(folderId)url.searchParams.set("folder",folderId);if(getState().agency?.slug)url.searchParams.set("workspace",getState().agency.slug);return url.toString();}
async function deliverInvitation({link,invitationId}){if(isSupabaseMode){const {data,error}=await db.functions.invoke('send-invitation-email',{body:{invitation_id:invitationId}});if(error)throw error;if(data?.error)throw new Error(data.error);return data;}const token=new URL(link).searchParams.get('invite');const response=await fetch('/api/outbox',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token,link})});const result=await response.json();if(result.error)throw new Error(result.error.message);return result.data;}
async function createInvitation(payload){
  let {data,error}=await db.from("invitations").insert(payload).select().single();
  if(!error)return{data,resent:false};
  if(error.code!=="23505")throw error;
  const {data:pending,error:pendingError}=await db.from("invitations").select("*").eq("agency_id",payload.agency_id).eq("email",payload.email).eq("status","pending").maybeSingle();
  if(pendingError||!pending)throw error;
  const {error:revokeError}=await db.from("invitations").update({status:"revoked"}).eq("id",pending.id).eq("status","pending");
  if(revokeError)throw revokeError;
  ({data,error}=await db.from("invitations").insert(payload).select().single());
  if(error)throw error;
  return{data,resent:true};
}

export async function inviteMember({email,role="team",clientId=null,folderId=null}){
  const s=getState();
  if(!s.agency?.id||!s.user?.id)throw Object.assign(new Error("Sign in and select a workspace before inviting someone."),{userMessage:true});
  const normalizedEmail=String(email||"").trim().toLowerCase();
  if(!normalizedEmail)throw Object.assign(new Error("Enter an email address."),{userMessage:true});
  if(!ROLES.includes(normalizeRole(role)))throw new TypeError("Invalid invitation role");
  if(role==="client"&&!clientId)throw new TypeError("A client invitation requires a client company");
  const payload={agency_id:s.agency.id,email:normalizedEmail,intended_role:role,client_id:role==="client"?clientId:null,invited_by:s.user.id};
  const {data,resent}=await createInvitation(payload);
  const link=invitationLink(data.token,normalizedEmail,folderId);
  let delivery;
  try{delivery=await deliverInvitation({link,invitationId:data.id});}catch(emailError){delivery={action_link:link,email_sent:false,password_required:false,delivery_error:emailError?.message||"Email delivery is unavailable."};}
  const accessLink=isSupabaseMode&&delivery?.action_link?delivery.action_link:link;
  return {...data,link:accessLink,emailSent:isSupabaseMode?Boolean(delivery?.email_sent):false,localOnly:!isSupabaseMode||!delivery?.email_sent,passwordRequired:Boolean(delivery?.password_required),deliveryError:delivery?.delivery_error||null,resent};
}
export async function startClientAccess(token,folderId=null){const {data,error}=await db.functions.invoke("start-client-access",{body:{token,folderId}});if(error)throw error;if(!data?.action_link)throw Object.assign(new Error(data?.error||"Could not start client access."),{userMessage:true});location.replace(data.action_link);}
export async function listInvitations(){const agencyId=getState().agency?.id;if(!agencyId)return[];const {data,error}=await db.from("invitations").select("*").eq("agency_id",agencyId).order("created_at",{ascending:false});if(error)throw error;return data||[];}
export async function revokeInvitation(id){const {error}=await db.from("invitations").update({status:"revoked"}).eq("id",id);if(error)throw error;}
