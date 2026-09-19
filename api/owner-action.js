import crypto from 'node:crypto';

const CHARACTER_TABLE='tblT7zLhkEldVDKkE';
const GENERATION_TABLE='tblnOmSlNQbkYHgEB';

function text(v,max=5000){return typeof v==='string'?v.trim().slice(0,max):'';}
function parseCookies(header=''){return Object.fromEntries(String(header).split(';').map(v=>v.trim()).filter(Boolean).map(v=>{const i=v.indexOf('=');return i<0?[v,'']:[v.slice(0,i),v.slice(i+1)];}));}
export function signature(ownerKey,expires){return crypto.createHmac('sha256',ownerKey).update(`owner:${expires}`).digest('base64url');}
export function hasOwnerSession(req,ownerKey){
  if(!ownerKey)return false;
  const token=parseCookies(req.headers.cookie||'').kryvell_owner_session;
  if(!token)return false;
  const [expRaw,sig]=token.split('.');
  const expires=Number(expRaw);
  if(!Number.isFinite(expires)||expires<Math.floor(Date.now()/1000)||!sig)return false;
  const expected=signature(ownerKey,expires);
  const a=Buffer.from(sig);const b=Buffer.from(expected);
  return a.length===b.length&&crypto.timingSafeEqual(a,b);
}
async function airtable(baseId,pat,tableId,fields){
  const r=await fetch(`https://api.airtable.com/v0/${encodeURIComponent(baseId)}/${encodeURIComponent(tableId)}`,{method:'POST',headers:{Authorization:`Bearer ${pat}`,'Content-Type':'application/json'},body:JSON.stringify({records:[{fields}]})});
  const data=await r.json().catch(()=>({}));
  if(!r.ok){const e=new Error('airtable_write_failed');e.status=r.status;throw e;}
  return data.records?.[0]||null;
}

export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  const ownerKey=process.env.KRYVELL_OWNER_KEY;
  const ownerSession=hasOwnerSession(req,ownerKey);
  if(req.method==='GET') return res.status(200).json({ok:true,owner_write_configured:Boolean(ownerKey),owner_session:ownerSession});
  if(req.method!=='POST') return res.status(405).json({ok:false,error:'method_not_allowed'});
  if(!ownerKey) return res.status(503).json({ok:false,error:'owner_auth_not_configured'});
  if(!ownerSession) return res.status(401).json({ok:false,error:'owner_auth_required'});

  const pat=process.env.ACSTUDIO_AIRTABLE_PAT; const baseId=process.env.ACSTUDIO_AIRTABLE_BASE_ID;
  if(!pat||!baseId) return res.status(503).json({ok:false,error:'airtable_not_configured'});
  const body=req.body||{}; const action=text(body.action,80);
  try{
    if(action==='create_character_draft'){
      const name=text(body.name,180); if(!name) return res.status(400).json({ok:false,error:'name_required'});
      const id=`KRYVELL-DRAFT-${Date.now()}`;
      const fields={
        fld6XHZihWdiPdquj:id,
        fld6RExWZ8AfVmOdt:name,
        fld1Fg5JZ89TOvWeh:'In Progress',
        fld2iASWP1myeye43:'Pending Approval',
        fldOXrNKFGoblRTcP:text(body.species,180),
        fld6TGN7ZyQ5kW1Rr:text(body.bodyType,500),
        fldMtu6vSLyId5c0j:text(body.face,3000),
        fldQlYisvBQHhvf1H:text(body.hairFur,3000),
        fldXTtaTO5lPGdDFY:text(body.clothing,3000),
        fld9czJYqxDOMNRtL:text(body.negativeRules,3000),
        fldIwcfhozPKDWWfo:false,
        fldRybsOKTZc5PqFq:new Date().toISOString()
      };
      Object.keys(fields).forEach(k=>{if(fields[k]==='') delete fields[k];});
      const record=await airtable(baseId,pat,CHARACTER_TABLE,fields);
      return res.status(200).json({ok:true,action,record_id:record?.id||null,draft_id:id,status:'In Progress',canon_status:'Pending Approval',protected:false});
    }
    if(action==='create_generation_draft'){
      const title=text(body.title,180)||'Brouillon KRYVELL';
      const input=text(body.input,5000); if(!input) return res.status(400).json({ok:false,error:'input_required'});
      const id=`KRYVELL-GEN-${Date.now()}`;
      const fields={
        fldZgNSgDTYJOKtoW:id,
        fld4fAEPeLRKsScPt:title,
        fld39b2cc7TpC4UNg:input,
        fldiwuDUBtx14YzLs:text(body.prompt,8000),
        fldoasuVjPyrZRTGX:text(body.negativeConstraints,5000),
        fldT9hSsl3igvTru4:false,
        fldObyUZshRKLmFeC:false
      };
      Object.keys(fields).forEach(k=>{if(fields[k]==='') delete fields[k];});
      const record=await airtable(baseId,pat,GENERATION_TABLE,fields);
      return res.status(200).json({ok:true,action,record_id:record?.id||null,draft_id:id});
    }
    return res.status(400).json({ok:false,error:'action_not_allowed'});
  }catch(e){return res.status(502).json({ok:false,error:'airtable_write_failed'});}
}
