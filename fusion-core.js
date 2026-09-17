(() => {
  const SERVICES = [
    {id:'airtable',name:'Airtable',group:'CONTROL PLANE',role:'Canon, Mission Control, projets et opérations ACStudio'},
    {id:'supabase',name:'Supabase',group:'DATA CORE',role:'Comptes, données applicatives, sessions et temps réel'},
    {id:'github',name:'GitHub',group:'CODE',role:'Code source, versions, commits et historique technique'},
    {id:'vercel',name:'Vercel',group:'RUNTIME',role:'Déploiement Web, API serverless et production'},
    {id:'google_drive',name:'Google Drive',group:'ASSETS',role:'Documents, fichiers collaboratifs et archives'},
    {id:'canva',name:'Canva',group:'CREATIVE',role:'Design, mise en page et exports visuels'},
    {id:'picsart',name:'Picsart',group:'CREATIVE',role:'Édition image, génération et retouche'},
    {id:'higgsfield',name:'Higgsfield',group:'CREATIVE',role:'Génération média, image et vidéo'},
    {id:'openart',name:'OpenArt',group:'CREATIVE',role:'Génération image/vidéo et workflows créatifs'},
    {id:'ai_voice',name:'AI Voice Generator',group:'AUDIO',role:'Voix, narration et doublage'},
    {id:'ads_manager',name:'ChatGPT Ads Manager',group:'GROWTH',role:'Campagnes, produits, performance et publicité'},
    {id:'deep_research',name:'Deep Research',group:'INTELLIGENCE',role:'Recherche approfondie et synthèse de sources'}
  ];

  function esc(value=''){
    return String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }

  function stateLabel(state){
    if(state==='live') return 'LIVE ✅';
    if(state==='configured') return 'CONFIGURÉ ✅';
    if(state==='connected') return 'CONNECTÉ ✅';
    if(state==='prepared') return 'PRÉPARÉ 🟡';
    return 'À CONNECTER';
  }

  function card(service,status={}){
    const state=status.state||'prepared';
    const mode=status.mode||'adapter';
    return `<article class="fusion-service" data-state="${esc(state)}"><div class="fusion-service-head"><div><span>${esc(service.group)}</span><strong>${esc(service.name)}</strong></div><b>${esc(stateLabel(state))}</b></div><p>${esc(service.role)}</p><small>${esc(mode)}</small></article>`;
  }

  async function getStatus(){
    try{
      const r=await fetch('/api/fusion-status',{cache:'no-store',credentials:'same-origin'});
      if(!r.ok) throw new Error('fusion_status_failed');
      return await r.json();
    }catch{
      return {ok:false,version:'0.2.0',services:{}};
    }
  }

  async function render(target){
    if(!target) return;
    target.innerHTML='<div class="fusion-loading">Synchronisation du FUSION CORE…</div>';
    const data=await getStatus();
    const services=data.services||{};
    const liveCount=SERVICES.filter(s=>['live','configured','connected'].includes(services[s.id]?.state)).length;
    target.innerHTML=`<section class="fusion-hub"><div class="fusion-hero"><p class="eyebrow">KRYVELL FUSION CORE · 0.2.0</p><h2>Un seul noyau. Tous les services.</h2><p>KRYVELL ONE orchestre chaque service sans déplacer le canon ni exposer les secrets. Airtable reste le Control Plane, Supabase le Data Core, GitHub le code et Vercel le runtime.</p><div class="fusion-summary"><strong>${liveCount}/${SERVICES.length}</strong><span>services actifs ou configurés</span><button id="fusionRefresh">Actualiser</button></div></div><div class="fusion-grid">${SERVICES.map(s=>card(s,services[s.id])).join('')}</div><div class="fusion-foot"><strong>Principe d’absorption :</strong> une identité KRYVELL, un registre de services, des adapters serveur isolés, aucune clé dans le frontend.</div></section>`;
    const refresh=target.querySelector('#fusionRefresh');
    if(refresh) refresh.onclick=()=>render(target);
  }

  window.KryvellFusionCore={version:'0.2.0',services:SERVICES,getStatus,render};
})();
