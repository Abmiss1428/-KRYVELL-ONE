const SUPABASE_URL=(process.env.SUPABASE_URL||'').replace(/\/$/,'');
const SUPABASE_SERVICE_ROLE_KEY=process.env.SUPABASE_SERVICE_ROLE_KEY||'';

export function getDataCoreConfig(){
  const supabaseConfigured=Boolean(SUPABASE_URL&&SUPABASE_SERVICE_ROLE_KEY);
  return {
    supabaseConfigured,
    userDataBackend:supabaseConfigured?'supabase-postgres':'transition-local-session',
    airtableRole:'control-plane-canon-ops'
  };
}

async function supabaseRequest(path,{method='GET',body,headers={}}={}){
  if(!SUPABASE_URL||!SUPABASE_SERVICE_ROLE_KEY){
    const error=new Error('supabase_not_configured');
    error.code='supabase_not_configured';
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

export async function upsertPhoneUser({userId,phoneFingerprint}){
  const config=getDataCoreConfig();
  if(!config.supabaseConfigured)return {stored:false,backend:config.userDataBackend};

  const now=new Date().toISOString();
  const payload={
    id:userId,
    phone_fingerprint:phoneFingerprint,
    status:'active',
    updated_at:now,
    last_seen_at:now
  };

  await supabaseRequest('/rest/v1/kryvell_users?on_conflict=id',{
    method:'POST',
    body:[payload],
    headers:{Prefer:'resolution=merge-duplicates,return=minimal'}
  });

  await supabaseRequest('/rest/v1/kryvell_identities?on_conflict=provider,provider_subject_hash',{
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

  return {stored:true,backend:'supabase-postgres'};
}
