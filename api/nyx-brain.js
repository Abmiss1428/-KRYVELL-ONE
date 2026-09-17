const GATEWAY_VERSION='1.1.1';
const DEFAULT_MODEL=process.env.GEMINI_MODEL||'gemini-3.8-flash';
const GEMINI_API_KEY=process.env.GEMINI_API_KEY||'';
const GEMINI_BASE='https://generativelanguage.googleapis.com/v1beta/models';

const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const clean=(v,max)=>String(v??'').replace(/[\u0000-\u001f\u007f]/g,' ').trim().slice(0,max);

export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(req.method==='GET'){
    return res.status(200).json({ok:true,configured:Boolean(GEMINI_API_KEY),provider:'google-gemini',model:DEFAULT_MODEL,gatewayVersion:GATEWAY_VERSION});
  }
  if(req.method!=='POST') return res.status(405).json({ok:false,error:'method_not_allowed'});
  if(!GEMINI_API_KEY) return res.status(503).json({ok:false,error:'gemini_not_configured'});

  const system=clean(req.body?.systemPrompt||'You are NYXCORE, a compact artificial-life narrative module.',2800);
  const prompt=clean(req.body?.prompt,5200);
  if(!prompt) return res.status(400).json({ok:false,error:'prompt_required'});
  const temperature=clamp(Number(req.body?.temperature)||0.4,0.4,1.9);
  const maxOutputTokens=clamp(Math.trunc(Number(req.body?.maxOutputTokens)||160),32,256);
  const model=clean(req.body?.model||DEFAULT_MODEL,80)||DEFAULT_MODEL;

  const ctrl=new AbortController();
  const timer=setTimeout(()=>ctrl.abort(),18000);
  try{
    const response=await fetch(`${GEMINI_BASE}/${encodeURIComponent(model)}:generateContent`,{
      method:'POST',
      headers:{'Content-Type':'application/json','x-goog-api-key':GEMINI_API_KEY},
      signal:ctrl.signal,
      body:JSON.stringify({
        contents:[{role:'user',parts:[{text:`${system}\n\n${prompt}`}]}],
        generationConfig:{temperature,maxOutputTokens}
      })
    });
    const data=await response.json().catch(()=>null);
    if(!response.ok){
      return res.status(502).json({ok:false,error:'gemini_request_failed',status:response.status,model,gatewayVersion:GATEWAY_VERSION});
    }
    const text=(data?.candidates?.[0]?.content?.parts||[]).map(p=>p?.text||'').join('').trim();
    if(!text) return res.status(502).json({ok:false,error:'gemini_empty_response',model,gatewayVersion:GATEWAY_VERSION});
    return res.status(200).json({ok:true,provider:'google-gemini',model,text,gatewayVersion:GATEWAY_VERSION});
  }catch(err){
    const error=err?.name==='AbortError'?'timeout':'cloud_unreachable';
    return res.status(504).json({ok:false,error,model,gatewayVersion:GATEWAY_VERSION});
  }finally{
    clearTimeout(timer);
  }
}
