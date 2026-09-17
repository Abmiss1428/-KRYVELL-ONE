(() => {
  const VERSION='0.3.0';
  const STORAGE_KEY='kryvell_absorbed_capabilities_v1';
  const SERVICES = [
    {id:'airtable',name:'Airtable',group:'CONTROL PLANE',role:'Canon, Mission Control, projets et opérations ACStudio',capabilities:['canon','mission-control','records']},
    {id:'supabase',name:'Supabase',group:'DATA CORE',role:'Comptes, données applicatives, sessions et temps réel',capabilities:['database','sessions','realtime']},
    {id:'github',name:'GitHub',group:'CODE',role:'Code source, versions, commits et historique technique',capabilities:['code','versions','commits']},
    {id:'vercel',name:'Vercel',group:'RUNTIME',role:'Déploiement Web, API serverless et production',capabilities:['deploy','serverless','runtime']},
    {id:'google_drive',name:'Google Drive',group:'ASSETS',role:'Documents, fichiers collaboratifs et archives',capabilities:['files','documents','archive']},
    {id:'canva',name:'Canva',group:'CREATIVE',role:'Design, mise en page et exports visuels',capabilities:['design','layout','export']},
    {id:'picsart',name:'Picsart',group:'CREATIVE',role:'Édition image, génération et retouche',capabilities:['image-edit','generation','retouch']},
    {id:'higgsfield',name:'Higgsfield',group:'CREATIVE',role:'Génération média, image et vidéo',capabilities:['image-generation','video-generation','media']},
    {id:'openart',name:'OpenArt',group:'CREATIVE',role:'Génération image/vidéo et workflows créatifs',capabilities:['image-generation','video-generation','creative-workflows']},
    {id:'ai_voice',name:'AI Voice Generator',group:'AUDIO',role:'Voix, narration et doublage',capabilities:['voice','narration','dubbing']},
    {id:'ads_manager',name:'ChatGPT Ads Manager',group:'GROWTH',role:'Campagnes, produits, performance et publicité',capabilities:['campaigns','ads','performance']},
    {id:'deep_research',name:'Deep Research',group:'INTELLIGENCE',role:'Recherche approfondie et synthèse de sources',capabilities:['research','sources','synthesis']}
  ];

  function esc(value=''){
    return String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }

  function activeState(state){
    return ['live','configured','connected'].includes(state);
  }

  function stateLabel(state){
    if(state==='live') return 'LIVE ✅';
    if(state==='configured') return 'CONFIGURÉ ✅';
    if(state==='connected') return 'CONNECTÉ ✅';
    if(state==='prepared') return 'PRÉPARÉ 🟡';
    return 'À CONNECTER';
  }

  function readRegistry(){
    try{
      const parsed=JSON.parse(localStorage.getItem(STORAGE_KEY)||'{}');
      return parsed&&typeof parsed==='object'&&!Array.isArray(parsed)?parsed:{};
    }catch{
      return {};
    }
  }

  function writeRegistry(registry){
    try{localStorage.setItem(STORAGE_KEY,JSON.stringify(registry));}catch{}
  }

  function normalizeService(id,status={}){
    const known=SERVICES.find(service=>service.id===id);
    if(known) return known;
    const pretty=String(status.name||id).replace(/[_-]+/g,' ').replace(/\b\w/g,m=>m.toUpperCase());
    return {
      id,
      name:pretty,
      group:status.group||'NEW CAPABILITY',
      role:status.role||status.note||'Nouvelle capacité détectée par KRYVELL',
      capabilities:Array.isArray(status.capabilities)?status.capabilities:[]
    };
  }

  function absorb(service,status={},source='fusion-status'){
    if(!service?.id||!activeState(status.state)) return null;
    const registry=readRegistry();
    const now=new Date().toISOString();
    const previous=registry[service.id];
    const entry={
      id:service.id,
      name:service.name,
      group:service.group,
      role:service.role,
      capabilities:Array.isArray(service.capabilities)?service.capabilities:[],
      state:status.state,
      mode:status.mode||'adapter',
      source,
      absorbedAt:previous?.absorbedAt||now,
      lastSeenAt:now
    };
    registry[service.id]=entry;
    writeRegistry(registry);
    if(!previous){
      window.dispatchEvent(new CustomEvent('kryvell:capability-absorbed',{detail:entry}));
      return entry;
    }
    return null;
  }

  function reconcile(serviceList,statuses){
    const newly=[];
    serviceList.forEach(service=>{
      const entry=absorb(service,statuses[service.id]||{},'fusion-status');
      if(entry) newly.push(entry);
    });
    return {registry:readRegistry(),newly};
  }

  function card(service,status={},registry={}){
    const state=status.state||'prepared';
    const mode=status.mode||'adapter';
    const note=status.note||'';
    const absorbed=Boolean(registry[service.id]);
    const skills=(service.capabilities||[]).slice(0,3).join(' · ');
    return `<article class="fusion-service" data-state="${esc(state)}" data-absorbed="${absorbed?'true':'false'}"><div class="fusion-service-head"><div><span>${esc(service.group)}</span><strong>${esc(service.name)}</strong></div><b>${esc(stateLabel(state))}</b></div>${absorbed?'<em class="absorb-badge">∞ ABSORBÉ DANS KRYVELL</em>':''}<p>${esc(service.role)}</p>${skills?`<small class="fusion-skills">COMPÉTENCES · ${esc(skills)}</small>`:''}<small>${esc(mode)}</small>${note?`<small title="${esc(note)}">${esc(note)}</small>`:''}</article>`;
  }

  function showAbsorbToast(target,newly){
    if(!newly.length||!target) return;
    const old=target.querySelector('.absorb-toast');
    if(old) old.remove();
    const toast=document.createElement('div');
    toast.className='absorb-toast';
    toast.setAttribute('role','status');
    toast.innerHTML=newly.length===1
      ? `<strong>∞ COMPÉTENCE ABSORBÉE</strong><span>${esc(newly[0].name)} fait maintenant partie de KRYVELL ONE.</span>`
      : `<strong>∞ ${newly.length} COMPÉTENCES ABSORBÉES</strong><span>KRYVELL ONE vient d’intégrer de nouvelles capacités.</span>`;
    target.appendChild(toast);
    setTimeout(()=>toast.classList.add('show'),40);
    setTimeout(()=>{toast.classList.remove('show');setTimeout(()=>toast.remove(),350);},3400);
  }

  async function getStatus(){
    try{
      const r=await fetch('/api/fusion-status',{cache:'no-store',credentials:'same-origin'});
      if(!r.ok) throw new Error('fusion_status_failed');
      return await r.json();
    }catch{
      return {ok:false,version:VERSION,services:{}};
    }
  }

  async function render(target){
    if(!target) return;
    target.innerHTML='<div class="fusion-loading">Synchronisation du FUSION CORE…</div>';
    const data=await getStatus();
    const statuses=data.services||{};
    const unknown=Object.keys(statuses).filter(id=>!SERVICES.some(service=>service.id===id)).map(id=>normalizeService(id,statuses[id]));
    const serviceList=[...SERVICES,...unknown];
    const {registry,newly}=reconcile(serviceList,statuses);
    const activeCount=serviceList.filter(service=>activeState(statuses[service.id]?.state)).length;
    const absorbedCount=serviceList.filter(service=>registry[service.id]).length;
    target.innerHTML=`<section class="fusion-hub"><div class="fusion-hero"><p class="eyebrow">KRYVELL FUSION CORE · ${esc(data.version||VERSION)}</p><h2>ABSORB ENGINE ∞</h2><p>Quand KRYVELL détecte une application réellement connectée ou une nouvelle capacité autorisée, il l’ajoute automatiquement à son registre de compétences. Il absorbe la capacité utilisable — jamais les mots de passe, les secrets ni le code propriétaire de l’application.</p><div class="fusion-summary"><strong>${absorbedCount}</strong><span>capacités absorbées</span><strong>${activeCount}/${serviceList.length}</strong><span>services actifs</span><button id="fusionRefresh">Scanner / absorber</button></div></div><div class="fusion-grid">${serviceList.map(service=>card(service,statuses[service.id],registry)).join('')}</div><div class="fusion-foot"><strong>Règle ABSORB :</strong> dès qu’un adapter passe à LIVE, CONNECTÉ ou CONFIGURÉ, sa compétence devient disponible dans le registre KRYVELL. Une app en PRÉPARÉ reste en attente de son autorisation officielle.</div></section>`;
    const refresh=target.querySelector('#fusionRefresh');
    if(refresh) refresh.onclick=()=>render(target);
    showAbsorbToast(target,newly);
  }

  function registerCapability(manifest={}){
    const service=normalizeService(manifest.id||manifest.name||'',manifest);
    if(!service.id) return null;
    const status={state:manifest.state||'connected',mode:manifest.mode||'capability-adapter'};
    return absorb(service,status,manifest.source||'runtime-touch');
  }

  function getAbsorbed(){
    return Object.values(readRegistry());
  }

  window.KryvellFusionCore={
    version:VERSION,
    services:SERVICES,
    getStatus,
    render,
    getAbsorbed,
    registerCapability,
    touchApplication:registerCapability
  };
})();
