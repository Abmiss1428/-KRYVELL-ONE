const GATEWAY_VERSION='1.0.0';
const GEMINI_API_KEY=process.env.GEMINI_API_KEY||'';
const MODEL=process.env.GEMINI_VISION_MODEL||process.env.GEMINI_MODEL||'gemini-2.5-flash-lite';
const BASE='https://generativelanguage.googleapis.com/v1beta/models';
const clean=(v,max)=>String(v??'').replace(/[\u0000-\u001f\u007f]/g,' ').trim().slice(0,max);

export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(req.method==='GET') return res.status(200).json({ok:true,configured:Boolean(GEMINI_API_KEY),provider:'google-gemini',model:MODEL,gatewayVersion:GATEWAY_VERSION});
  if(req.method!=='POST') return res.status(405).json({ok:false,error:'method_not_allowed'});
  if(!GEMINI_API_KEY) return res.status(503).json({ok:false,error:'gemini_not_configured'});
  const imageBase64=String(req.body?.imageBase64||'').replace(/^data:image\/\w+;base64,/,'');
  if(!imageBase64||imageBase64.length>5_500_000) return res.status(400).json({ok:false,error:'image_required_or_too_large'});
  const prompt=clean(req.body?.prompt||'Describe the visible scene concisely in French.',1800);
  const ctrl=new AbortController();const timer=setTimeout(()=>ctrl.abort(),18000);
  try{
    const r=await fetch(`${BASE}/${encodeURIComponent(MODEL)}:generateContent`,{method:'POST',headers:{'Content-Type':'application/json','x-goog-api-key':GEMINI_API_KEY},signal:ctrl.signal,body:JSON.stringify({contents:[{role:'user',parts:[{text:prompt},{inlineData:{mimeType:'image/jpeg',data:imageBase64}}]}],generationConfig:{temperature:0.2,maxOutputTokens:180}})});
    const d=await r.json().catch(()=>null);
    if(!r.ok) return res.status(502).json({ok:false,error:'gemini_vision_failed',status:r.status,model:MODEL,gatewayVersion:GATEWAY_VERSION});
    const text=(d?.candidates?.[0]?.content?.parts||[]).map(p=>p?.text||'').join('').trim();
    if(!text) return res.status(502).json({ok:false,error:'gemini_empty_response',model:MODEL,gatewayVersion:GATEWAY_VERSION});
    return res.status(200).json({ok:true,provider:'google-gemini',model:MODEL,text,gatewayVersion:GATEWAY_VERSION});
  }catch(err){return res.status(504).json({ok:false,error:err?.name==='AbortError'?'timeout':'vision_unreachable',model:MODEL,gatewayVersion:GATEWAY_VERSION});}
  finally{clearTimeout(timer);}
}
