import {getDataCoreConfig} from '../lib/kryvell-data.js';

export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='GET')return res.status(405).json({ok:false,error:'method_not_allowed'});
  const config=getDataCoreConfig();
  return res.status(200).json({
    ok:true,
    data_core:config.userDataBackend,
    supabase_configured:config.supabaseConfigured,
    airtable_control_plane_configured:Boolean(process.env.ACSTUDIO_AIRTABLE_PAT&&process.env.ACSTUDIO_AIRTABLE_BASE_ID),
    roles:{
      user_scale:'Supabase/PostgreSQL',
      canon_and_operations:'Airtable',
      app_runtime:'Vercel'
    }
  });
}
