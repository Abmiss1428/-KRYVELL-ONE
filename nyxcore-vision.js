/* NYXCORE VISION v1.0.0 — KRYVELL OS 0.8.0
 * Consent-based foreground camera observer for iPad/iPhone/PWA.
 * Camera stops when the page is hidden. Recent scene summaries are shared with NYXCORE brain prompts.
 */
(() => {
  'use strict';
  if(window.__NYXCORE_VISION__) return;
  const state={version:'1.0.0',active:false,stream:null,video:null,modal:null,timer:null,lastSummary:'',lastSeenAt:0,lastError:'',intervalMs:6500,patched:false};
  const wait=ms=>new Promise(r=>setTimeout(r,ms));
  const engine=()=>window.KryvellNyxcore?.engine||null;
  const thermal=()=>window.__NYXCORE_THERMAL__?.state||null;
  const esc=s=>String(s??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));

  function stopCamera(reason='arrêt'){
    if(state.timer){clearTimeout(state.timer);state.timer=null;}
    try{state.stream?.getTracks?.().forEach(t=>t.stop());}catch{}
    state.stream=null;state.active=false;
    if(state.video){try{state.video.srcObject=null;}catch{}}
    state.modal?.remove();state.modal=null;state.video=null;
    updateButtons(reason);
  }

  function ensureStyles(){
    if(document.getElementById('nyx-vision-style')) return;
    const s=document.createElement('style');s.id='nyx-vision-style';s.textContent=`
      .nyx-vision-btn{border-color:#50304f!important;background:#171017!important;color:#eec9ff!important}
      .nyx-vision-btn[data-active="true"]{border-color:#8c2854!important;color:#ff8fbd!important;background:#2a0d1b!important}
      .nyx-vision-modal{position:fixed;inset:0;z-index:2147483100;background:rgba(0,0,0,.82);display:grid;place-items:center;padding:16px}
      .nyx-vision-card{width:min(820px,100%);max-height:92vh;overflow:auto;background:#0b0b10;border:1px solid #3b2630;border-radius:22px;color:#fff;padding:14px;box-shadow:0 30px 90px rgba(0,0,0,.65)}
      .nyx-vision-head{display:flex;justify-content:space-between;gap:10px;align-items:center;margin-bottom:10px}.nyx-vision-head button{border:1px solid #4c3039;background:#1b1115;color:#fff;border-radius:10px;padding:8px 11px;font-weight:800}
      .nyx-vision-video{display:block;width:100%;max-height:58vh;object-fit:cover;border-radius:16px;background:#000}
      .nyx-vision-status{font-size:12px;line-height:1.5;color:#bbb8bf;margin:10px 0}.nyx-vision-summary{padding:10px;border:1px solid #34242b;border-radius:12px;background:#120d10;font-size:12px;line-height:1.5}
    `;document.head.appendChild(s);
  }

  function updateButtons(note=''){
    document.querySelectorAll('[data-nyx-vision]').forEach(b=>{b.dataset.active=String(state.active);b.textContent=state.active?'👁 CAM ON':'👁 CAMÉRA';b.title=note||'Caméra NYXCORE — visible et consentie';});
  }

  function patchBrain(){
    const e=engine();if(!e||state.patched||!e.brainPrompt)return;
    const original=e.brainPrompt.bind(e);
    e.brainPrompt=function(agent){
      const base=original(agent);
      if(!state.lastSummary||Date.now()-state.lastSeenAt>30000) return base;
      return `${base}; camera_context=${state.lastSummary.slice(0,360)}`;
    };
    state.patched=true;
  }

  function buildModal(){
    ensureStyles();
    const m=document.createElement('div');m.className='nyx-vision-modal';
    m.innerHTML=`<section class="nyx-vision-card"><div class="nyx-vision-head"><div><strong>👁 NYXCORE VISION</strong><div style="font-size:10px;color:#8f8a91">CAMÉRA AVANT-PLAN · ARRÊT AUTO EN ARRIÈRE-PLAN</div></div><button type="button" data-stop>ARRÊTER</button></div><video class="nyx-vision-video" playsinline muted autoplay></video><div class="nyx-vision-status" data-status>Ouverture de la caméra…</div><div class="nyx-vision-summary" data-summary>Aucune observation encore.</div></section>`;
    m.querySelector('[data-stop]').onclick=()=>stopCamera('arrêt manuel');
    document.body.appendChild(m);state.modal=m;state.video=m.querySelector('video');return m;
  }

  function captureFrame(){
    const v=state.video;if(!v||!v.videoWidth||!v.videoHeight)return null;
    const max=512,scale=Math.min(1,max/Math.max(v.videoWidth,v.videoHeight));
    const c=document.createElement('canvas');c.width=Math.max(1,Math.round(v.videoWidth*scale));c.height=Math.max(1,Math.round(v.videoHeight*scale));
    c.getContext('2d',{alpha:false}).drawImage(v,0,0,c.width,c.height);
    return c.toDataURL('image/jpeg',0.52).split(',')[1]||null;
  }

  async function analyzeOnce(){
    if(!state.active||document.hidden)return;
    const t=thermal();
    const status=state.modal?.querySelector('[data-status]');
    if(t?.level>=2){if(status)status.textContent='🌡️ Analyse caméra en pause: protection iPad active.';scheduleNext(14000);return;}
    const imageBase64=captureFrame();if(!imageBase64){scheduleNext(3000);return;}
    if(status)status.textContent='NYXCORE observe la scène…';
    try{
      const r=await fetch('/api/nyx-vision',{method:'POST',headers:{'Content-Type':'application/json'},cache:'no-store',body:JSON.stringify({imageBase64,prompt:'Describe only what is visibly happening in the scene in concise French. Focus on objects, actions, interface/screen context and spatial details useful to an artificial-life agent. Do not identify real people by name.'})});
      const d=await r.json().catch(()=>null);if(!r.ok||!d?.text)throw new Error(d?.error||`vision_${r.status}`);
      state.lastSummary=String(d.text).replace(/\s+/g,' ').trim().slice(0,700);state.lastSeenAt=Date.now();state.lastError='';
      const summary=state.modal?.querySelector('[data-summary]');if(summary)summary.textContent=state.lastSummary;
      if(status)status.textContent='👁 Observation partagée avec NYXCORE.';
      const e=engine(),a=e?.selectedAgent?.()||e?.active?.find(x=>!x.dead);if(a){a.visionMemory=state.lastSummary;a.lastVisionAt=state.lastSeenAt;window.__NYXCORE_HYBRID__?.vault?.saveAgent?.(a,'vision');}
    }catch(err){state.lastError=String(err?.message||err);if(status)status.textContent=`Vision indisponible: ${state.lastError}`;}
    scheduleNext(t?.level===1?11000:state.intervalMs);
  }

  function scheduleNext(ms){if(!state.active)return;if(state.timer)clearTimeout(state.timer);state.timer=setTimeout(analyzeOnce,ms);}

  async function startCamera(){
    if(state.active)return;
    if(!navigator.mediaDevices?.getUserMedia){updateButtons('Caméra non disponible dans ce navigateur');return;}
    buildModal();
    const status=state.modal.querySelector('[data-status]');
    try{
      const stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'},width:{ideal:1280},height:{ideal:720},frameRate:{ideal:15,max:24}},audio:false});
      state.stream=stream;state.video.srcObject=stream;state.active=true;updateButtons('Caméra active');
      status.textContent='Caméra active. NYXCORE analyse à basse fréquence pour limiter la chaleur.';
      await state.video.play().catch(()=>{});patchBrain();scheduleNext(1200);
    }catch(err){state.lastError=String(err?.name||err?.message||err);status.textContent=state.lastError==='NotAllowedError'?'Autorise la caméra pour KRYVELL dans Safari/iPadOS.':`Caméra: ${state.lastError}`;setTimeout(()=>stopCamera('permission caméra'),2200);}
  }

  function installUi(){
    ensureStyles();patchBrain();
    document.querySelectorAll('.nyx-life').forEach(root=>{
      const actions=root.querySelector('.nyx-actions');if(!actions||actions.querySelector('[data-nyx-vision]'))return;
      const b=document.createElement('button');b.className='nyx-vision-btn';b.type='button';b.dataset.nyxVision='1';b.onclick=e=>{e.preventDefault();e.stopPropagation();state.active?stopCamera('arrêt manuel'):startCamera();};actions.appendChild(b);
    });updateButtons();
  }

  document.addEventListener('visibilitychange',()=>{if(document.hidden&&state.active)stopCamera('caméra arrêtée en arrière-plan');});
  window.addEventListener('pagehide',()=>{if(state.active)stopCamera('page quittée');});
  const obs=new MutationObserver(installUi);obs.observe(document.documentElement,{childList:true,subtree:true});
  (async()=>{for(let i=0;i<300;i++){if(engine()){installUi();break;}await wait(50);}setInterval(installUi,1800);})();
  window.__NYXCORE_VISION__={state,start:startCamera,stop:stopCamera,analyze:analyzeOnce};
})();
