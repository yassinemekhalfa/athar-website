import { db,isSupabaseMode } from "../dataClient.js";
import { getState, setState, resetState } from "../core/state.js";
import { emit } from "../core/events.js";
import { unsubscribeAll } from "../core/realtime.js";
import { unmountActiveModule } from "../core/moduleRegistry.js";

let authSubscription = null;
export async function restoreAuth(surface = null) {
  const { data:{ session }, error } = await db.auth.getSession();
  if(error) throw error;
  setState({session,user:session?.user||null,surface});
  if(session?.user) await loadIdentity();
  if(!authSubscription){
    const { data }=db.auth.onAuthStateChange((event,sessionNow)=>{
      setState({session:sessionNow,user:sessionNow?.user||null});
      emit("auth:changed",{event,userId:sessionNow?.user?.id||null,hasSession:Boolean(sessionNow)});
      if(!sessionNow?.user){
        setState({profile:null,memberships:[],agency:null,membership:null,role:null,clientId:null,folders:[],selectedFolderId:null,selectedModule:null,ready:false});
        if(getState().surface!=="login") location.replace("login.html");
      }else if(event!=="TOKEN_REFRESHED"){
        // Load identity after the session state has been published.
        setTimeout(()=>loadIdentity().catch(error=>console.error(error)),0);
      }
    });
    authSubscription=data.subscription;
  }
  return session;
}
export async function loadIdentity(){
  const user=getState().user; if(!user){setState({profile:null,memberships:[]});return;}
  if(isSupabaseMode){
    const {data,error}=await db.rpc("get_my_workspace_identity");
    if(error)throw error;
    setState({profile:data?.profile||null,memberships:data?.memberships||[]});
    return;
  }
  const [{data:profile,error:pErr},{data:memberships,error:mErr}]=await Promise.all([
    db.from("profiles").select("*").eq("id",user.id).maybeSingle(),
    db.from("agency_members").select("*, agencies(*)").eq("profile_id",user.id)
  ]);
  if(pErr)throw pErr;if(mErr)throw mErr;setState({profile:profile||null,memberships:memberships||[]});
}
export async function signIn(email,password){const {data,error}=await db.auth.signInWithPassword({email,password});if(error)throw error;setState({session:data.session,user:data.user});await loadIdentity();return data;}
export async function signUp(email,password,fullName,inviteToken=null){
  const options={data:{full_name:fullName}};
  if(isSupabaseMode&&inviteToken){const redirect=new URL('login.html',location.href);redirect.searchParams.set('invite',inviteToken);options.emailRedirectTo=redirect.toString();}
  const {data,error}=await db.auth.signUp({email,password,options});if(error)throw error;return data;
}
export async function requestPasswordReset(email){const {error}=await db.auth.resetPasswordForEmail(email,{redirectTo:`${location.origin}${location.pathname.replace(/[^/]+$/,"")}login.html?mode=reset`});if(error)throw error;}
export async function updatePassword(password){const {error}=await db.auth.updateUser({password});if(error)throw error;}
export async function signOut(destination="login.html"){emit("app:teardown",{reason:"signout"});await unmountActiveModule();unsubscribeAll();await db.auth.signOut();resetState();location.replace(destination);}
export function destroyAuthListener(){authSubscription?.unsubscribe?.();authSubscription=null;}
