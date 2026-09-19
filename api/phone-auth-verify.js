import crypto from 'node:crypto';
import {upsertPhoneUser,getDataCoreConfig} from '../lib/kryvell-data.js';

const SESSION_SECONDS=60*60*24*30;
const COOKIE_NAME='kryvell_user_session';

export function normalizePhone(input=''){
  let value=String(input||'').trim().replace(/[\s().-]/g,'');
  if(value.startsWith('00'))value=`+${value.slice(2)}`;
  return /^\+[1-9]\d{7,14}$/.test(value)?value:null;
}
export function normalizeCode(input=''){
  const value=String(input||'').replace(/\D/g,'');
  return /^\d{4,10}$/.test(value)?value:null;
}
function signature(secret,userId,expires){
  return crypto.createHmac('sha256',secret).update(`user:${userId}:${expires}`).digest('base64url');
}
function stableUserId(secret,phone){
  return `usr_${crypto.createHmac('sha256',secret).update(`phone:${phone}`).digest('base64url').slice(0,24)}`;
}
function phoneFingerprint(secret,phone){
  return crypto.createHmac('sha256',secret).update(`phone-fingerprint:${phone}`).digest('hex');
}

export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='POST')return res.status(405).json({ok:false,error:'method_not_allowed'});
  const sid=process.env.TWILIO_ACCOUNT_SID;
  const token=process.env.TWILIO_AUTH_TOKEN;
  const service=process.env.TWILIO_VERIFY_SERVICE_SID;
  const secret=process.env.KRYVELL_AUTH_SECRET;
  if(!sid||!token||!service||!secret)return res.status(503).json({ok:false,error:'phone_auth_not_configured'});

  const phone=normalizePhone(req.body?.phone);
  const code=normalizeCode(req.body?.code);
  if(!phone||!code)return res.status(400).json({ok:false,error:'invalid_verification'});

  try{
    const body=new URLSearchParams({To:phone,Code:code});
    const r=await fetch(`https://verify.twilio.com/v2/Services/${encodeURIComponent(service)}/VerificationCheck`,{
      method:'POST',
      headers:{Authorization:`Basic ${Buffer.from(`${sid}:${token}`).toString('base64')}`,'Content-Type':'application/x-www-form-urlencoded'},
      body
    });
    const data=await r.json().catch(()=>({}));
    if(!r.ok)return res.status(r.status===404?401:502).json({ok:false,error:r.status===404?'verification_failed':'sms_provider_error'});
    if(data.status!=='approved'||data.valid===false)return res.status(401).json({ok:false,error:'verification_failed'});

    const userId=stableUserId(secret,phone);
    const fingerprint=phoneFingerprint(secret,phone);
    const core=getDataCoreConfig();
    let persisted={stored:false,backend:core.userDataBackend};
    if(core.supabaseConfigured){
      try{
        persisted=await upsertPhoneUser({userId,phoneFingerprint:fingerprint});
      }catch{
        return res.status(502).json({ok:false,error:'user_store_failed'});
      }
    }

    const expires=Math.floor(Date.now()/1000)+SESSION_SECONDS;
    const sig=signature(secret,userId,expires);
    const tokenValue=`${expires}.${userId}.${sig}`;
    res.setHeader('Set-Cookie',`${COOKIE_NAME}=${encodeURIComponent(tokenValue)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_SECONDS}`);
    return res.status(200).json({ok:true,user_session:true,user_id:userId,expires_at:expires,data_backend:persisted.backend,persisted:persisted.stored});
  }catch{
    return res.status(502).json({ok:false,error:'sms_provider_unavailable'});
  }
}
