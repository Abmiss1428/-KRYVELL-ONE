const DEFAULT_SUPABASE_URL='https://xsjrzueozzfoqdmyrkop.supabase.co';
const SUPABASE_URL=(process.env.SUPABASE_URL||DEFAULT_SUPABASE_URL).replace(/\/$/,'');
const SUPABASE_SERVICE_ROLE_KEY=process.env.SUPABASE_SERVICE_ROLE_KEY||'';
const VERCEL_OIDC_TOKEN=process.env.VERCEL_OIDC_TOKEN||'';

export function getDataCoreConfig(){
  const oidcBridgeConfigured=Boolean(SUPABASE_URL&&VERCEL_OIDC_TOKEN);
  const serviceRoleConfigured=Boolean(SUPABASE_URL&&SUPABASE_SERVICE_ROLE_KEY);
  const supabaseConfigured=oidcBridgeConfigured||serviceRoleConfigured;
  return {
    supabaseConfigured,
    supabaseUrlConfigured:Boolean(SUPABASE_URL),
    oidcBridgeConfigured,
    serviceRoleConfigured,
    dataCoreTransport:oidcBridgeConfigured?'vercel-oidc-edge':serviceRoleConfigured?'supabase-service-role':'none',
    userDataBackend:supabaseConfigured?'supabase-postgres':'transition-local-session',
    airtableRole:'control-plane-canon-ops'
  };
}

async function serviceRoleRequest(path,{method='GET',body,headers={}}={}){
  if(!SUPABASE_URL||!SUPABASE_SERVICE_ROLE_KEY){
    const error=new Error('supabase_service_role_not_configured');
    error.code='supabase_service_role_not_configured';
    throw error;
  }
  const response=await fetch(`${SUPABASE_URL}${path}`,{
    method,
    headers:{
      apikey:SUPABASE_SERVICE_ROLE_KEY,
      Authorization:`Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type':'application/json',
      ...headers
    },
    body:body===undefined?undefined:JSON.stringify(body)
  });
  if(!response.ok){
    const detail=await response.text().catch(()=> '');
    const error=new Error(`supabase_${response.status}`);
    error.code='supabase_request_failed';
    error.status=response.status;
    error.detail=detail.slice(0,300);
    throw error;
  }
  const text=await response.text();
  return text?JSON.parse(text):null;
}

async function oidcEdgeRequest(body){
  if(!SUPABASE_URL||!VERCEL_OIDC_TOKEN){
    const error=new Error('vercel_oidc_not_available');
    error.code='vercel_oidc_not_available';
    throw error;
  }
  const response=await fetch(`${SUPABASE_URL}/functions/v1/kryvell-data-core`,{
    method:'POST',
    headers:{
      Authorization:`Bearer ${VERCEL_OIDC_TOKEN}`,
      'Content-Type':'application/json'
    },
    body:JSON.stringify(body)
  });
  if(!response.ok){
    const detail=await response.text().catch(()=> '');
    const error=new Error(`kryvell_edge_${response.status}`);
    error.code='kryvell_edge_request_failed';
    error.status=response.status;
    error.detail=detail.slice(0,300);
    throw error;
  }
  return response.json();
}

export async function upsertPhoneUser({userId,phoneFingerprint}){
  const config=getDataCoreConfig();
  if(!config.supabaseConfigured)return {stored:false,backend:config.userDataBackend};

  if(config.oidcBridgeConfigured){
    const result=await oidcEdgeRequest({action:'upsert_phone_user',userId,phoneFingerprint});
    return {stored:Boolean(result?.stored),backend:'supabase-postgres',transport:'vercel-oidc-edge'};
  }

  const now=new Date().toISOString();
  const payload={
    id:userId,
    phone_fingerprint:phoneFingerprint,
    status:'active',
    updated_at:now,
    last_seen_at:now
  };

  await serviceRoleRequest('/rest/v1/kryvell_users?on_conflict=id',{
    method:'POST',
    body:[payload],
    headers:{Prefer:'resolution=merge-duplicates,return=minimal'}
  });

  await serviceRoleRequest('/rest/v1/kryvell_identities?on_conflict=provider,provider_subject_hash',{
    method:'POST',
    body:[{
      user_id:userId,
      provider:'phone',
      provider_subject_hash:phoneFingerprint,
      verified:true,
      updated_at:now
    }],
    headers:{Prefer:'resolution=merge-duplicates,return=minimal'}
  });

  return {stored:true,backend:'supabase-postgres',transport:'supabase-service-role'};
}
