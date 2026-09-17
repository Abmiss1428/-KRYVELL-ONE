import crypto from 'node:crypto';

const SESSION_SECONDS=60*60*24*30;
const COOKIE_NAME='kryvell_user_session';

function configured(){
  return Boolean(process.env.TWILIO_ACCOUNT_SID&&process.env.TWILIO_AUTH_TOKEN&&process.env.TWILIO_VERIFY_SERVICE_SID&&process.env.KRYVELL_AUTH_SECRET);
}
function parseCookies(header=''){
  return Object.fromEntries(String(header||'').split(';').map(v=>v.trim()).filter(Boolean).map(part=>{
    const i=part.indexOf('=');
    return i<0?[part,'']:[part.slice(0,i),decodeURIComponent(part.slice(i+1))];
  }));
}
function signature(secret,userId,expires){
  return crypto.createHmac('sha256',secret).update(`user:${userId}:${expires}`).digest('base64url');
}
function safeEqual(a,b){
  const left=Buffer.from(String(a||''));
  const right=Buffer.from(String(b||''));
  if(left.length!==right.length)return false;
  return crypto.timingSafeEqual(left,right);
}
function readSession(req){
  const secret=process.env.KRYVELL_AUTH_SECRET;
  if(!secret)return null;
  const raw=parseCookies(req.headers.cookie)[COOKIE_NAME];
  if(!raw)return null;
  const [expiresRaw,userId,sig]=raw.split('.');
  const expires=Number(expiresRaw);
  if(!Number.isFinite(expires)||!userId||!sig||expires<=Math.floor(Date.now()/1000))return null;
  if(!safeEqual(sig,signature(secret,userId,expires)))return null;
  return {userId,expires};
}
function clearCookie(res){
  res.setHeader('Set-Cookie',`${COOKIE_NAME}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`);
}

export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(req.method==='DELETE'){
    clearCookie(res);
    return res.status(200).json({ok:true,configured:configured(),user_session:false});
  }
  if(req.method!=='GET')return res.status(405).json({ok:false,error:'method_not_allowed'});
  const isConfigured=configured();
  if(!isConfigured)return res.status(200).json({ok:true,configured:false,user_session:false});
  const session=readSession(req);
  if(!session){
    clearCookie(res);
    return res.status(200).json({ok:true,configured:true,user_session:false});
  }
  return res.status(200).json({ok:true,configured:true,user_session:true,user_id:session.userId,expires_at:session.expires,session_seconds:SESSION_SECONDS});
}
