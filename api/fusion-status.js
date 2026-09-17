import {getDataCoreConfig} from '../lib/kryvell-data.js';

function hasAny(...names){return names.some(name=>Boolean(process.env[name]));}
function service(state,mode,note){return {state,mode,note};}

export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='GET') return res.status(405).json({ok:false,error:'method_not_allowed'});

  const dataCore=getDataCoreConfig();
  const airtable=Boolean(process.env.ACSTUDIO_AIRTABLE_PAT&&process.env.ACSTUDIO_AIRTABLE_BASE_ID);
  const vercel=Boolean(process.env.VERCEL||process.env.VERCEL_ENV||process.env.VERCEL_URL);

  const services={
    airtable:service(airtable?'configured':'prepared','control-plane',airtable?'Server credentials detected':'Server adapter prepared'),
    supabase:service(dataCore.supabaseConfigured?'live':'prepared','data-core',dataCore.supabaseConfigured?'Supabase/PostgreSQL active':'Data Core adapter prepared'),
    github:service(hasAny('KRYVELL_GITHUB_TOKEN','GITHUB_TOKEN')?'configured':'prepared','code-adapter','GitHub remains the code source; runtime token is optional and never exposed to the client'),
    vercel:service(vercel?'live':'prepared','runtime',vercel?'Running inside Vercel':'Runtime adapter prepared'),
    google_drive:service(hasAny('KRYVELL_GOOGLE_DRIVE_CREDENTIALS','GOOGLE_DRIVE_CLIENT_ID','GOOGLE_SERVICE_ACCOUNT_JSON')?'configured':'prepared','server-adapter','Google Drive adapter requires server-side OAuth/service credentials'),
    canva:service(hasAny('KRYVELL_CANVA_TOKEN','CANVA_ACCESS_TOKEN','CANVA_CLIENT_ID')?'configured':'prepared','server-adapter','Canva integration must use an authorized API/app connection'),
    picsart:service(hasAny('KRYVELL_PICSART_API_KEY','PICSART_API_KEY')?'configured':'prepared','server-adapter','Picsart adapter prepared; provider credentials stay server-side'),
    higgsfield:service(hasAny('KRYVELL_HIGGSFIELD_API_KEY','HIGGSFIELD_API_KEY')?'configured':'prepared','server-adapter','Higgsfield adapter prepared; provider capability depends on authorized API access'),
    openart:service(hasAny('KRYVELL_OPENART_API_KEY','OPENART_API_KEY')?'configured':'prepared','server-adapter','OpenArt adapter prepared; provider credentials stay server-side'),
    ai_voice:service(hasAny('KRYVELL_VOICE_PROVIDER_KEY','AI_VOICE_API_KEY')?'configured':'prepared','server-adapter','Voice provider adapter prepared; ChatGPT connector access is not treated as an app API credential'),
    ads_manager:service(hasAny('KRYVELL_ADS_PROVIDER_KEY','OPENAI_ADS_API_KEY')?'configured':'prepared','server-adapter','Ads adapter prepared; ChatGPT Ads Manager connector access is separate from app runtime credentials'),
    deep_research:service('prepared','orchestration-adapter','Deep Research is available as an orchestration capability; direct app execution requires a supported server/API path')
  };

  return res.status(200).json({
    ok:true,
    version:'0.2.0',
    architecture:{
      control_plane:'Airtable',
      data_core:'Supabase/PostgreSQL',
      code_source:'GitHub',
      runtime:'Vercel',
      shell:'KRYVELL ONE / KRYVELL OS'
    },
    services,
    security:{
      secrets_in_frontend:false,
      secret_values_exposed:false,
      adapters_isolated:true
    }
  });
}
