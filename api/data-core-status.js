import {getDataCoreConfig} from '../lib/kryvell-data.js';

const DEFAULT_SUPABASE_URL='https://xsjrzueozzfoqdmyrkop.supabase.co';

async function probeSupabase(url){
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),2500);
  try{
    const response=await fetch(`${url.replace(/\/$/,'')}/auth/v1/health`,{cache:'no-store',signal:controller.signal});
    return {reachable:response.status<500,status:response.status};
  }catch{
    return {reachable:false,status:null};
  }finally{
    clearTimeout(timer);
  }
}

export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='GET')return res.status(405).json({ok:false,error:'method_not_allowed'});
  const config=getDataCoreConfig();
  const supabaseUrl=(process.env.SUPABASE_URL||DEFAULT_SUPABASE_URL).replace(/\/$/,'');
  const probe=await probeSupabase(supabaseUrl);
  return res.status(200).json({
    ok:true,
    data_core:config.userDataBackend,
    supabase_configured:config.supabaseConfigured,
    supabase_reachable:probe.reachable,
    supabase_health_status:probe.status,
    supabase_url_configured:config.supabaseUrlConfigured,
    vercel_oidc_bridge_configured:config.oidcBridgeConfigured,
    service_role_fallback_configured:config.serviceRoleConfigured,
    transport:config.dataCoreTransport,
    state:config.supabaseConfigured?'live':probe.reachable?'project-live-bridge-prepared':'prepared',
    airtable_control_plane_configured:Boolean(process.env.ACSTUDIO_AIRTABLE_PAT&&process.env.ACSTUDIO_AIRTABLE_BASE_ID),
    roles:{
      user_scale:'Supabase/PostgreSQL',
      canon_and_operations:'Airtable',
      app_runtime:'Vercel'
    }
  });
}
