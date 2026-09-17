import {getDataCoreConfig} from '../lib/kryvell-data.js';

const DEFAULT_SUPABASE_URL='https://xsjrzueozzfoqdmyrkop.supabase.co';
const DEFAULT_GITHUB_REPO='Abmiss1428/-KRYVELL-ONE';

function hasAny(...names){return names.some(name=>Boolean(process.env[name]));}
function service(state,mode,note,detail={}){return {state,mode,note,...detail};}

async function probe(url,{headers={}}={}){
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),2500);
  try{
    const response=await fetch(url,{cache:'no-store',headers,signal:controller.signal});
    return {reachable:response.status<500,status:response.status,ok:response.ok};
  }catch{
    return {reachable:false,status:null,ok:false};
  }finally{
    clearTimeout(timer);
  }
}

function githubRepoName(){
  const owner=process.env.VERCEL_GIT_REPO_OWNER;
  const slug=process.env.VERCEL_GIT_REPO_SLUG;
  return process.env.KRYVELL_GITHUB_REPO||(owner&&slug?`${owner}/${slug}`:DEFAULT_GITHUB_REPO);
}

export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='GET') return res.status(405).json({ok:false,error:'method_not_allowed'});

  const dataCore=getDataCoreConfig();
  const airtable=Boolean(process.env.ACSTUDIO_AIRTABLE_PAT&&process.env.ACSTUDIO_AIRTABLE_BASE_ID);
  const vercel=Boolean(process.env.VERCEL||process.env.VERCEL_ENV||process.env.VERCEL_URL);
  const supabaseUrl=(process.env.SUPABASE_URL||DEFAULT_SUPABASE_URL).replace(/\/$/,'');
  const githubRepo=githubRepoName();
  const githubWriteConfigured=hasAny('KRYVELL_GITHUB_TOKEN','GITHUB_TOKEN');
  const githubGitBound=(process.env.VERCEL_GIT_PROVIDER||'').toLowerCase()==='github'||Boolean(process.env.VERCEL_GIT_COMMIT_SHA);

  const [supabaseProbe,githubProbe]=await Promise.all([
    probe(`${supabaseUrl}/auth/v1/health`),
    probe(`https://api.github.com/repos/${githubRepo.split('/').map(encodeURIComponent).join('/')}`,{headers:{Accept:'application/vnd.github+json','User-Agent':'KRYVELL-FUSION-CORE'}})
  ]);

  const supabaseReachable=supabaseProbe.reachable;
  const githubReachable=githubProbe.reachable;

  const services={
    airtable:service(airtable?'configured':'prepared','control-plane',airtable?'Airtable Control Plane credentials detected':'Server adapter prepared'),
    supabase:service(
      dataCore.supabaseConfigured?'live':supabaseReachable?'connected':'prepared',
      dataCore.supabaseConfigured?`data-core · ${dataCore.dataCoreTransport}`:supabaseReachable?'project-live · bridge-prepared':'data-core',
      dataCore.supabaseConfigured?'Supabase/PostgreSQL bridge active':supabaseReachable?'KRYVELL DATA CORE project reachable; authenticated app bridge not detected in this runtime':'Data Core adapter prepared',
      {project_reachable:supabaseReachable,bridge_configured:dataCore.supabaseConfigured,http_status:supabaseProbe.status}
    ),
    github:service(
      githubWriteConfigured?'configured':(githubGitBound||githubReachable)?'connected':'prepared',
      githubWriteConfigured?'code-adapter-write':(githubGitBound||githubReachable)?'git-source-live':'code-adapter',
      githubWriteConfigured?'GitHub runtime write adapter configured':(githubGitBound||githubReachable)?`GitHub code source connected: ${githubRepo}`:'GitHub code adapter prepared',
      {repository:githubRepo,repository_reachable:githubReachable,vercel_git_bound:githubGitBound,runtime_write_configured:githubWriteConfigured,http_status:githubProbe.status}
    ),
    vercel:service(vercel?'live':'prepared','runtime',vercel?'Running inside Vercel':'Runtime adapter prepared'),
    google_drive:service(hasAny('KRYVELL_GOOGLE_DRIVE_CREDENTIALS','GOOGLE_DRIVE_CLIENT_ID','GOOGLE_SERVICE_ACCOUNT_JSON')?'configured':'prepared','server-adapter','Google Drive adapter requires server-side OAuth/service credentials'),
    canva:service(hasAny('KRYVELL_CANVA_TOKEN','CANVA_ACCESS_TOKEN','CANVA_CLIENT_ID')?'configured':'prepared','server-adapter','Canva integration must use an authorized API/app connection'),
    picsart:service(hasAny('KRYVELL_PICSART_API_KEY','PICSART_API_KEY')?'configured':'prepared','server-adapter','Picsart adapter prepared; provider credentials stay server-side'),
    higgsfield:service(hasAny('KRYVELL_HIGGSFIELD_API_KEY','HIGGSFIELD_API_KEY')?'configured':'prepared','server-adapter','Higgsfield adapter prepared; provider capability depends on authorized API access'),
    openart:service(hasAny('KRYVELL_OPENART_API_KEY','OPENART_API_KEY')?'configured':'prepared','server-adapter','OpenArt adapter prepared; provider credentials stay server-side'),
    ai_voice:service(hasAny('KRYVELL_VOICE_PROVIDER_KEY','AI_VOICE_API_KEY')?'configured':'prepared','server-adapter','Voice provider adapter prepared; ChatGPT connector access is separate from app runtime credentials'),
    ads_manager:service(hasAny('KRYVELL_ADS_PROVIDER_KEY','OPENAI_ADS_API_KEY')?'configured':'prepared','server-adapter','Ads adapter prepared; ChatGPT Ads Manager connector access is separate from app runtime credentials'),
    deep_research:service('prepared','orchestration-adapter','Deep Research is registered as an orchestration capability; direct app execution requires a supported server/API path')
  };

  return res.status(200).json({
    ok:true,
    version:'0.2.1',
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
      adapters_isolated:true,
      live_probes_secretless:true
    }
  });
}
