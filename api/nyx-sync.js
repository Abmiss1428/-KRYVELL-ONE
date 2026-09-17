const DEFAULT_SUPABASE_URL='https://xsjrzueozzfoqdmyrkop.supabase.co';
const SUPABASE_URL=(process.env.SUPABASE_URL||DEFAULT_SUPABASE_URL).replace(/\/$/,'');
const VERCEL_OIDC_TOKEN=process.env.VERCEL_OIDC_TOKEN||'';

async function edge(body){
  if(!SUPABASE_URL||!VERCEL_OIDC_TOKEN) throw new Error('nyx_sync_bridge_not_configured');
  const response=await fetch(`${SUPABASE_URL}/functions/v1/kryvell-data-core`,{
    method:'POST',
    headers:{Authorization:`Bearer ${VERCEL_OIDC_TOKEN}`,'Content-Type':'application/json'},
    body:JSON.stringify(body),
    cache:'no-store'
  });
  const data=await response.json().catch(()=>({ok:false,error:'invalid_edge_response'}));
  if(!response.ok) throw new Error(data?.error||`edge_${response.status}`);
  return data;
}

export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(req.method==='GET') return res.status(200).json({ok:true,configured:Boolean(SUPABASE_URL&&VERCEL_OIDC_TOKEN),transport:'vercel-oidc-supabase'});
  if(req.method!=='POST') return res.status(405).json({ok:false,error:'method_not_allowed'});
  try{
    const action=req.body?.action;
    if(action==='push'){
      const data=await edge({action:'nyx_push_event',ecosystemId:req.body.ecosystemId,deviceId:req.body.deviceId,eventType:req.body.eventType,agentId:req.body.agentId,payload:req.body.payload});
      return res.status(200).json(data);
    }
    if(action==='pull'){
      const data=await edge({action:'nyx_pull_events',ecosystemId:req.body.ecosystemId,deviceId:req.body.deviceId,afterSeq:req.body.afterSeq,limit:req.body.limit||80});
      return res.status(200).json(data);
    }
    return res.status(400).json({ok:false,error:'unsupported_action'});
  }catch(err){
    const msg=String(err?.message||'nyx_sync_failed').slice(0,120);
    const status=msg==='nyx_sync_bridge_not_configured'?503:502;
    return res.status(status).json({ok:false,error:msg});
  }
}
