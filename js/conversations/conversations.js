import { db } from "../dataClient.js";
import { getState } from "../core/state.js";

export async function listConversations(folderId){const {data,error}=await db.from("conversations").select("*").eq("agency_id",getState().agency.id).eq("folder_id",folderId||null).is("archived_at",null).is("trashed_at",null).order("last_message_at",{ascending:false,nullsFirst:false}).order("created_at",{ascending:false});if(error)throw error;return data||[];}
export async function createConversation({folderId,title,description="",privacy="private",internalRole="viewer",clientVisible=privacy==="shared"}){const s=getState();const {data,error}=await db.from("conversations").insert({agency_id:s.agency.id,folder_id:folderId,title:title.trim(),description:description.trim()||null,privacy,internal_role:internalRole,client_visible:clientVisible,created_by:s.user.id}).select().single();if(error)throw error;return data;}
export async function updateConversation(id,changes){const {data,error}=await db.from("conversations").update(changes).eq("id",id).select().single();if(error)throw error;return data;}
