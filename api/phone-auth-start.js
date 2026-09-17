function normalizePhone(input=''){
  let value=String(input||'').trim().replace(/[\s().-]/g,'');
  if(value.startsWith('00'))value=`+${value.slice(2)}`;
  return /^\+[1-9]\d{7,14}$/.test(value)?value:null;
}
function maskPhone(phone){
  if(!phone)return '';
  const tail=phone.slice(-2);const head=phone.slice(0,Math.min(4,phone.length-2));
  return `${head}${'•'.repeat(Math.max(4,phone.length-head.length-2))}${tail}`;
}
export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='POST')return res.status(405).json({ok:false,error:'method_not_allowed'});
  const sid=process.env.TWILIO_ACCOUNT_SID;
  const token=process.env.TWILIO_AUTH_TOKEN;
  const service=process.env.TWILIO_VERIFY_SERVICE_SID;
  const authSecret=process.env.KRYVELL_AUTH_SECRET;
  if(!sid||!token||!service||!authSecret)return res.status(503).json({ok:false,error:'phone_auth_not_configured'});
  const phone=normalizePhone(req.body?.phone);
  if(!phone)return res.status(400).json({ok:false,error:'invalid_phone'});
  try{
    const body=new URLSearchParams({To:phone,Channel:'sms'});
    const r=await fetch(`https://verify.twilio.com/v2/Services/${encodeURIComponent(service)}/Verifications`,{
      method:'POST',headers:{Authorization:`Basic ${Buffer.from(`${sid}:${token}`).toString('base64')}`,'Content-Type':'application/x-www-form-urlencoded'},body
    });
    const data=await r.json().catch(()=>({}));
    if(!r.ok)return res.status(502).json({ok:false,error:'sms_provider_error'});
    return res.status(200).json({ok:true,status:data.status||'pending',masked_phone:maskPhone(phone)});
  }catch{return res.status(502).json({ok:false,error:'sms_provider_unavailable'});}
}
