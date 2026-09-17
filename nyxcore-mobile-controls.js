/* NYXCORE MOBILE CONTROLS v1.0.0
 * Always-visible iPhone/iPad controls for voice + simulated inner-state inspection.
 * Reuses NYXCORE VOICE public API and never exposes hidden chain-of-thought.
 */
(() => {
  'use strict';
  if (window.__NYXCORE_MOBILE_CONTROLS__) return;

  const wait = ms => new Promise(r => setTimeout(r, ms));
  const esc = s => String(s ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  const clamp01 = v => Math.max(0, Math.min(1, Number(v) || 0));
  let modal = null;
  let inspectorTimer = null;
  let recognition = null;

  function ensureStyles(){
    if(document.getElementById('nyx-mobile-controls-style')) return;
    const s=document.createElement('style');
    s.id='nyx-mobile-controls-style';
    s.textContent=`
      .nyx-mobile-quick{display:flex;gap:7px;flex-wrap:wrap}
      .nyx-mobile-quick button{border:1px solid #5a2632;background:#241016;color:#fff;border-radius:10px;padding:8px 10px;font-weight:900;font-size:11px}
      .nyx-mobile-quick button[data-nyx-mobile="mic"]{background:#5a0d22;border-color:#8e1836}
      .nyx-mobile-modal{position:fixed;inset:0;z-index:2147483000;background:rgba(0,0,0,.72);backdrop-filter:blur(10px);display:flex;align-items:flex-end;justify-content:center;padding:max(14px,env(safe-area-inset-top)) 12px max(14px,env(safe-area-inset-bottom))}
      .nyx-mobile-sheet{width:min(680px,100%);max-height:82vh;overflow:auto;background:#0d0d12;border:1px solid #3a2730;border-radius:24px 24px 18px 18px;color:#f7f7f8;box-shadow:0 24px 80px rgba(0,0,0,.6)}
      .nyx-mobile-head{position:sticky;top:0;z-index:2;display:flex;justify-content:space-between;align-items:center;gap:12px;padding:14px;background:#111117;border-bottom:1px solid #2c2c34}
      .nyx-mobile-head strong{font-size:15px}.nyx-mobile-head button{border:1px solid #383842;background:#1a1a21;color:#fff;border-radius:10px;width:38px;height:38px;font-size:22px}
      .nyx-mobile-body{padding:14px}.nyx-mobile-text{width:100%;min-height:90px;resize:vertical;background:#08080c;color:#fff;border:1px solid #303039;border-radius:14px;padding:12px;font-size:16px}
      .nyx-mobile-send{width:100%;margin-top:10px;border:1px solid #7b1730;background:#5a0d22;color:#fff;border-radius:12px;padding:12px;font-weight:900}
      .nyx-mobile-status{font-size:12px;color:#b9b7bd;line-height:1.5;margin:8px 0}
      .nyx-inspect-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}
      .nyx-inspect-grid div{background:#14141a;border:1px solid #292931;border-radius:12px;padding:9px}.nyx-inspect-grid span{display:block;color:#8f8f99;font-size:10px}.nyx-inspect-grid strong{display:block;margin-top:3px;font-size:12px;word-break:break-word}
      .nyx-gene{display:grid;grid-template-columns:90px 1fr 42px;gap:8px;align-items:center;margin:8px 0;font-size:11px}.nyx-gene i{height:7px;border-radius:999px;background:#23232a;overflow:hidden}.nyx-gene b{display:block;height:100%;background:linear-gradient(90deg,#7d0d28,#ff375f)}
      @media(max-width:760px){.nyx-mobile-quick{width:100%}.nyx-mobile-quick button{flex:1 1 42%}}
    `;
    document.head.appendChild(s);
  }

  function voice(){ return window.__NYXCORE_VOICE__ || null; }
  function selected(){ return voice()?.getSelectedAgent?.() || null; }

  function closeModal(){
    if(inspectorTimer){clearInterval(inspectorTimer);inspectorTimer=null;}
    try{recognition?.stop?.();}catch{}
    recognition=null;
    modal?.remove(); modal=null;
  }

  function shell(title){
    closeModal();
    ensureStyles();
    modal=document.createElement('div');
    modal.className='nyx-mobile-modal';
    modal.innerHTML=`<section class="nyx-mobile-sheet"><div class="nyx-mobile-head"><strong>${esc(title)}</strong><button type="button" data-close>×</button></div><div class="nyx-mobile-body" data-body></div></section>`;
    modal.querySelector('[data-close]').onclick=closeModal;
    modal.addEventListener('click',e=>{if(e.target===modal)closeModal();});
    document.body.appendChild(modal);
    return modal.querySelector('[data-body]');
  }

  function openTalk(){
    const a=selected();
    const body=shell(a?`🎙 Parler à ${a.nom||'NYX'}`:'🎙 Parler à NYXCORE');
    body.innerHTML=`<p class="nyx-mobile-status" data-status>${a?'Entité sélectionnée: '+esc(a.nom||a.id):'Recherche d’une entité active…'}</p><textarea class="nyx-mobile-text" data-input placeholder="Parle ou écris ton message…"></textarea><button class="nyx-mobile-send" data-mic>🎙 DÉMARRER LE MICRO</button><button class="nyx-mobile-send" data-send>ENVOYER LE TEXTE</button><p class="nyx-mobile-status">La première utilisation peut déclencher l’autorisation micro iOS. Si la reconnaissance vocale n’est pas offerte, le champ texte fonctionne toujours.</p>`;
    const input=body.querySelector('[data-input]');
    const status=body.querySelector('[data-status]');
    body.querySelector('[data-send]').onclick=async()=>{
      const txt=input.value.trim(); if(!txt)return;
      status.textContent='NYXCORE réfléchit…';
      try{await voice()?.talk?.(txt);status.textContent='Réponse envoyée à la mémoire NYXCORE.';}catch(e){status.textContent='Erreur: '+(e?.message||e);}
    };
    body.querySelector('[data-mic]').onclick=()=>{
      const C=window.SpeechRecognition||window.webkitSpeechRecognition;
      if(!C){status.textContent='Reconnaissance vocale indisponible ici. Utilise le champ texte.';return;}
      try{recognition?.stop?.();}catch{}
      const r=new C(); recognition=r; r.lang='fr-CA';r.continuous=false;r.interimResults=true;r.maxAlternatives=1;
      let finalText='';
      r.onstart=()=>status.textContent='🎙 J’écoute…';
      r.onresult=e=>{let interim='';for(let i=e.resultIndex;i<e.results.length;i++){const t=e.results[i][0]?.transcript||'';if(e.results[i].isFinal)finalText+=t;else interim+=t;}input.value=(finalText||interim).trim();};
      r.onerror=e=>status.textContent=e.error==='not-allowed'?'Autorise le micro pour KRYVELL dans iOS/Safari.':'Micro: '+(e.error||'erreur');
      r.onend=async()=>{const txt=(finalText||input.value||'').trim();if(!txt){status.textContent='Micro arrêté.';return;}status.textContent='NYXCORE réfléchit…';try{await voice()?.talk?.(txt);status.textContent='Message reçu par NYXCORE.';}catch(e){status.textContent='Erreur: '+(e?.message||e);}};
      try{r.start();}catch(e){status.textContent='Micro: '+(e?.message||e);}
    };
  }

  function gene(label,v){const p=Math.round(clamp01(v)*100);return `<div class="nyx-gene"><span>${esc(label)}</span><i><b style="width:${p}%"></b></i><strong>${p}%</strong></div>`;}
  function openInspector(){
    const body=shell('🔬 Voir à l’intérieur · état simulé');
    const render=()=>{
      const a=selected(); const h=window.__NYXCORE_HYBRID__; if(!a){body.innerHTML='<p>Aucune entité active.</p>';return;}
      const g=a.genes||{}; const parents=Array.isArray(a.parentIds)&&a.parentIds.length?a.parentIds.map(x=>String(x).slice(0,8)).join(' · '):'origine';
      body.innerHTML=`<div class="nyx-inspect-grid"><div><span>Nom</span><strong>${esc(a.nom||a.id)}</strong></div><div><span>Génération</span><strong>G${Number(a.generation||1).toLocaleString('fr-CA')}</strong></div><div><span>Énergie</span><strong>${Math.round(a.energy||0)}</strong></div><div><span>Âge simulé</span><strong>${Number(a.age||0).toFixed(1)}</strong></div><div><span>Action</span><strong>${esc(a.intent||'wander')}</strong></div><div><span>Moteur</span><strong>${esc(a.lastDialogueProvider||h?.state?.mode||'—')}</strong></div><div><span>Parents</span><strong>${esc(parents)}</strong></div><div><span>Queue IA</span><strong>${h?.queue?.heap?.size??0} · actif ${h?.queue?.running??0}</strong></div></div><p class="nyx-mobile-status"><strong>Mémoire visible</strong><br>${esc(String(a.memory||a.memoire||'Aucune mémoire narrative.').slice(0,350))}</p>${gene('Curiosité',g.curiosity)}${gene('Sociabilité',g.sociability)}${gene('Fertilité',g.fertility)}${gene('Métabolisme',g.metabolism)}${gene('Affinité IA',g.brainAffinity)}${gene('Mutation',Math.min(1,(Number(g.mutationRate)||0)/0.25))}<p class="nyx-mobile-status">Cette vue montre les variables de simulation et la mémoire enregistrée, pas une chaîne de raisonnement privée.</p>`;
    };
    render(); inspectorTimer=setInterval(render,700);
  }

  function install(){
    ensureStyles();
    const actions=document.querySelector('.nyx-life .nyx-actions');
    if(!actions) return false;
    if(actions.querySelector('[data-nyx-mobile="mic"]')) return true;
    const wrap=document.createElement('div');wrap.className='nyx-mobile-quick';
    wrap.innerHTML='<button type="button" data-nyx-mobile="mic">🎙 PARLER</button><button type="button" data-nyx-mobile="inside">🔬 INTÉRIEUR</button>';
    wrap.querySelector('[data-nyx-mobile="mic"]').onclick=openTalk;
    wrap.querySelector('[data-nyx-mobile="inside"]').onclick=openInspector;
    actions.appendChild(wrap);
    return true;
  }

  const obs=new MutationObserver(()=>install());
  obs.observe(document.documentElement,{childList:true,subtree:true});
  (async()=>{for(let i=0;i<300;i++){if(window.__NYXCORE_VOICE__&&install())break;await wait(50);}setInterval(install,1500);})();
  window.__NYXCORE_MOBILE_CONTROLS__={openTalk,openInspector,install};
})();
