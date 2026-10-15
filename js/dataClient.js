// Local SQLite API. No hosted-service dependency.
async function request(endpoint,payload) {
  try {const response=await fetch(`/api/${endpoint}`,{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload||{})});return await response.json();}
  catch{return {data:null,error:{message:'The local server is unavailable. Start it with npm run dev.',code:'LOCAL_OFFLINE'}};}
}
class Query {
  constructor(table){this.q={table,op:'select',filters:[],orders:[]};}
  select(columns='*',options={}){Object.assign(this.q,{columns,...options});return this;}
  insert(values){Object.assign(this.q,{op:'insert',values});return this;}
  upsert(values,options={}){Object.assign(this.q,{op:'upsert',values,options});return this;}
  update(values){Object.assign(this.q,{op:'update',values});return this;}
  delete(){this.q.op='delete';return this;}
  eq(k,v){return this.filter('eq',k,v);}
  neq(k,v){return this.filter('neq',k,v);}
  is(k,v){return this.filter('is',k,v);}
  in(k,v){return this.filter('in',k,v);}
  not(k,op,v){this.q.filters.push(['not',k,op,v]);return this;}
  ilike(k,v){return this.filter('ilike',k,v);}
  gt(k,v){return this.filter('gt',k,v);}
  gte(k,v){return this.filter('gte',k,v);}
  lt(k,v){return this.filter('lt',k,v);}
  lte(k,v){return this.filter('lte',k,v);}
  filter(op,k,v){this.q.filters.push([op,k,v]);return this;}
  order(key,options={}){this.q.orders.push({key,...options});return this;}
  limit(limit){this.q.limit=limit;return this;}
  range(start,end){this.q.range=[start,end];return this;}
  single(){this.q.single='one';return this;}
  maybeSingle(){this.q.single='maybe';return this;}
  then(resolve,reject){return request('query',this.q).then(resolve,reject);}
}
const listeners=new Set();
const notify=(event,session)=>listeners.forEach(fn=>fn(event,session));
async function authRequest(action,args,event){const result=await request(`auth/${action}`,args);if(!result.error&&event)notify(event,result.data?.session||null);return result;}
const fileURL=(bucket,key)=>`/api/storage/${encodeURIComponent(bucket)}/${key.split('/').map(encodeURIComponent).join('/')}`;
const channels=new Set();let revision=-1,poll=null;
const localDb={
  from:table=>new Query(table),
  rpc:(name,args)=>request('rpc',{name,args}),
  functions:{invoke:(name,{body}={})=>request('functions',{name,body})},
  auth:{
    getSession:async()=>{const r=await request('auth/session');return {...r,data:r.data||{session:null}};},
    getUser:async()=>{const r=await request('auth/session');return {...r,data:{user:r.data?.session?.user||null}};},
    signInWithPassword:args=>authRequest('signin',args,'SIGNED_IN'),
    signUp:args=>authRequest('signup',args,'SIGNED_IN'),
    signOut:()=>authRequest('signout',{},'SIGNED_OUT'),
    updateUser:args=>request('auth/update',args),
    resetPasswordForEmail:email=>request('auth/reset',{email}),
    onAuthStateChange(fn){listeners.add(fn);return {data:{subscription:{unsubscribe:()=>listeners.delete(fn)}}};}
  },
  storage:{from:bucket=>({
    async upload(key,file){try{const r=await fetch(fileURL(bucket,key),{method:'POST',body:file});return await r.json();}catch{return {error:{message:'Local file upload failed'}};}},
    getPublicUrl:key=>({data:{publicUrl:fileURL(bucket,key)}}),
    createSignedUrl:async key=>({data:{signedUrl:fileURL(bucket,key)},error:null}),
    async remove(keys){for(const key of keys){const r=await fetch(fileURL(bucket,key),{method:'DELETE'});const result=await r.json();if(result.error)return result;}return {data:keys,error:null};}
  })},
  channel(){const channel={callbacks:[],on(type,filter,fn){this.callbacks.push(fn);return this;},subscribe(){channels.add(this);if(!poll)poll=setInterval(async()=>{try{const {data}=await(await fetch('/api/revision')).json();if(data!==revision)for(const c of channels)for(const fn of c.callbacks)fn({eventType:'UPDATE'});revision=data;}catch{/* Reconnect on the next poll. */}},2500);return this;}};return channel;},
  removeChannel(channel){channels.delete(channel);if(!channels.size){clearInterval(poll);poll=null;revision=-1;}return Promise.resolve('ok');}
};
const runtime=globalThis.ATHAR_CONFIG||{};
export const isSupabaseMode=runtime.mode==='supabase';
let db=localDb;
if(isSupabaseMode){
  if(!/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(runtime.supabaseUrl||'')||!runtime.supabasePublishableKey)throw new Error('Supabase runtime configuration is incomplete.');
  const {createClient}=await import('https://esm.sh/@supabase/supabase-js@2.78.0');
  db=createClient(runtime.supabaseUrl,runtime.supabasePublishableKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true},realtime:{params:{eventsPerSecond:10}}});
}
export {db};
export default db;
