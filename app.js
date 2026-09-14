const modules={
  redline:{title:'REDLINE NEXUS — NEXUS CONTROL',text:'Canon et personnages chargés directement depuis Airtable.'},
  nexarcana:{title:'NEXARCANA',text:'Bibliothèque Tarot, sources et méthodes de tirage chargées depuis Airtable.'},
  forge:{title:'FORGE DE PERSONNAGES',text:'Fiches personnages et registre Character Forge chargés depuis Airtable.'},
  nexcreate:{title:'NEXCREATE — OMNI DRAW & BRUSH ENGINE',text:'Fonctions dessin, Brush Lab, Apple Pencil, calques, export et workflow tattoo chargés depuis Airtable.'},
  live:{title:'KRYVELL LIVE CORE',text:'Connexion des services et état du système. Le diagnostic Airtable ne révèle jamais les valeurs des secrets.'}
};

const panel=document.getElementById('modulePanel');
const title=document.getElementById('moduleTitle');
const text=document.getElementById('moduleText');
const actions=document.getElementById('moduleActions');
const missionOutput=document.getElementById('missionOutput');
const coreStatus=document.querySelector('.status');
const cache={};
let currentModule='';

function escapeHtml(value=''){return String(value).replace(/[&<>'\"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','\"':'&quot;'}[c]));}
function asText(value){if(Array.isArray(value))return value.join(' · ');if(typeof value==='boolean')return value?'Oui':'Non';if(typeof value==='number'&&value>=0&&value<=1)return `${Math.round(value*100)} %`;return String(value??'');}
function recordTitle(fields){for(const key of ['Nom','Nom officiel','Character Name','Module','Module du cerveau','Feature ID','Canon ID','Tarot ID','Character ID']){if(fields[key])return asText(fields[key]);}const first=Object.values(fields)[0];return first?asText(first):'Entrée Airtable';}
function allRecords(data){return (data?.sections||[]).flatMap(section=>(section.records||[]).map(record=>({...record,sectionName:section.name})));}
function saveLocal(key,value){localStorage.setItem(`kryvell:${key}`,JSON.stringify(value));}
function loadLocal(key,fallback=[]){try{return JSON.parse(localStorage.getItem(`kryvell:${key}`))??fallback;}catch{return fallback;}}

function moduleQuickButtons(key){
  if(key==='nexarcana')return '<button class="ghost quick" data-quick="tarot">CHOISIR UNE MÉTHODE</button>';
  if(key==='forge')return '<button class="ghost quick" data-quick="character">NOUVEAU BROUILLON</button>';
  if(key==='nexcreate')return '<button class="ghost quick" data-quick="creation">NOUVEAU PLAN</button>';
  if(key==='redline')return '<button class="ghost quick" data-quick="locked">VOIR LES LOCK</button>';
  return '';
}

function matchesRecord(record,q){if(!q)return true;const hay=JSON.stringify(record.fields||{}).toLowerCase();return hay.includes(q.toLowerCase());}

function renderModuleData(data,query=''){
  if(!data?.ok||!Array.isArray(data.sections)){actions.innerHTML='<p class="output"><strong>DONNÉES AIRTABLE INDISPONIBLES ❌</strong></p>';return;}
  cache[data.module]=data; currentModule=data.module;
  const total=data.sections.reduce((sum,s)=>sum+(Number(s.count)||0),0);
  let html=`<div class="live-head"><span class="live-pill">AIRTABLE LIVE</span><span>${total} entrée${total>1?'s':''} chargée${total>1?'s':''}</span></div>`;
  html+=`<div class="module-tools"><input id="moduleSearch" class="search" type="search" placeholder="Rechercher dans ce module…" value="${escapeHtml(query)}">${moduleQuickButtons(data.module)}</div>`;
  for(const section of data.sections){
    const records=(section.records||[]).filter(r=>matchesRecord(r,query));
    html+=`<section class="data-section"><div class="data-section-head"><strong>${escapeHtml(section.name)}</strong><span>${records.length}/${Number(section.count)||0}</span></div>`;
    if(!records.length){html+='<p class="output">Aucun résultat.</p></section>';continue;}
    for(const record of records){
      const fields=record.fields||{}; const heading=recordTitle(fields);
      const rows=Object.entries(fields).filter(([k])=>!['Nom','Nom officiel','Character Name','Module','Module du cerveau'].includes(k)).map(([k,v])=>{
        const raw=asText(v); const compact=raw.length>1500?`${raw.slice(0,1500)}…`:raw;
        return `<div class="field-row"><span>${escapeHtml(k)}</span><p>${escapeHtml(compact)}</p></div>`;
      }).join('');
      html+=`<details class="data-item" data-record="${escapeHtml(record.id)}"><summary><strong>${escapeHtml(heading)}</strong><span>${escapeHtml(fields.Statut||fields['Statut canon']||fields.Status||fields['Statut réel']||'')}</span></summary><div class="data-body">${rows||'<p class="output">Entrée présente dans Airtable.</p>'}${data.module==='nexcreate'?`<button class="ghost add-plan" data-id="${escapeHtml(record.id)}">AJOUTER AU PLAN</button>`:''}</div></details>`;
    }
    html+='</section>';
  }
  html+='<button class="primary" id="refreshModule">ACTUALISER AIRTABLE</button>';
  actions.innerHTML=html;
  document.getElementById('refreshModule')?.addEventListener('click',()=>loadModule(data.module,true));
  document.getElementById('moduleSearch')?.addEventListener('input',e=>renderModuleData(cache[data.module],e.target.value));
  document.querySelectorAll('[data-quick]').forEach(b=>b.onclick=()=>runQuickAction(b.dataset.quick));
  document.querySelectorAll('.add-plan').forEach(b=>b.onclick=()=>addFeatureToPlan(b.dataset.id));
}

async function loadModule(key,force=false){
  const m=modules[key]; if(!m)return;
  title.textContent=m.title; text.textContent=m.text; panel.hidden=false; panel.scrollIntoView({behavior:'smooth',block:'nearest'});
  if(key==='live'){renderLiveCore();return;}
  if(cache[key]&&!force){renderModuleData(cache[key]);return;}
  actions.innerHTML='<p class="output">Chargement Airtable…</p>';
  try{const r=await fetch(`/api/module-data?module=${encodeURIComponent(key)}`,{cache:'no-store'});const d=await r.json();renderModuleData(d);}catch{actions.innerHTML='<p class="output"><strong>DONNÉES AIRTABLE INDISPONIBLES ❌</strong><br>La route serveur ne répond pas.</p>';}
}

function runQuickAction(kind){
  if(kind==='tarot')chooseTarotMethod();
  if(kind==='character')openCharacterDraft();
  if(kind==='creation')openCreationPlan();
  if(kind==='locked')showLockedOnly();
}

function chooseTarotMethod(){
  const data=cache.nexarcana; if(!data)return;
  const methods=allRecords(data).filter(r=>String(r.fields?.Type||'').toLowerCase().includes('méthode')||String(r.fields?.Nom||'').toLowerCase().includes('tirage'));
  if(!methods.length){showModalBlock('Aucune méthode de tirage trouvée dans Airtable.');return;}
  const pick=methods[Math.floor(Math.random()*methods.length)]; const f=pick.fields||{};
  showModalBlock(`<span class="tag">NEXARCANA</span><h4>${escapeHtml(f.Nom||recordTitle(f))}</h4><p>${escapeHtml(f.Description||f['Utilisation dans NEXARCANA']||'Méthode sélectionnée depuis Airtable.')}</p><p class="muted">Source : ${escapeHtml(f['Source / provenance']||'Airtable')}</p>`);
}

function showLockedOnly(){
  const data=cache.redline;if(!data)return;
  const locked={...data,sections:data.sections.map(s=>({...s,records:(s.records||[]).filter(r=>r.fields?.LOCK===true||String(r.fields?.['Statut canon']||r.fields?.Statut||'').toLowerCase().includes('lock')),count:(s.records||[]).filter(r=>r.fields?.LOCK===true||String(r.fields?.['Statut canon']||r.fields?.Statut||'').toLowerCase().includes('lock')).length}))};
  renderModuleData(locked);
}

function openCharacterDraft(){
  const drafts=loadLocal('character-drafts',[]);
  showModalBlock(`<span class="tag">CHARACTER FORGE</span><h4>Nouveau brouillon personnage</h4><div class="form-grid"><label>Nom<input id="draftName" class="search"></label><label>Espèce<input id="draftSpecies" class="search"></label><label>Type de corps<textarea id="draftBody" class="search" rows="2"></textarea></label><label>Visage<textarea id="draftFace" class="search" rows="2"></textarea></label><label>Fourrure / cheveux<textarea id="draftHair" class="search" rows="2"></textarea></label><label>Règles négatives<textarea id="draftNeg" class="search" rows="2"></textarea></label></div><button class="primary" id="saveCharacterDraft">SAUVEGARDER LE BROUILLON</button><p class="output">${drafts.length} brouillon${drafts.length!==1?'s':''} local${drafts.length!==1?'aux':''} déjà sauvegardé${drafts.length!==1?'s':''}. Aucun LOCK Airtable n’est modifié.</p>`);
  document.getElementById('saveCharacterDraft').onclick=()=>{
    const name=document.getElementById('draftName').value.trim();if(!name){alert('Ajoute un nom.');return;}
    const item={id:`local-${Date.now()}`,name,species:document.getElementById('draftSpecies').value.trim(),bodyType:document.getElementById('draftBody').value.trim(),face:document.getElementById('draftFace').value.trim(),hairFur:document.getElementById('draftHair').value.trim(),negativeRules:document.getElementById('draftNeg').value.trim(),createdAt:new Date().toISOString()};
    const list=loadLocal('character-drafts',[]);list.unshift(item);saveLocal('character-drafts',list);showModalBlock(`<strong>Brouillon sauvegardé ✅</strong><p>${escapeHtml(name)}</p><p class="muted">Stocké localement sur cet appareil. L’écriture Airtable propriétaire est préparée mais reste verrouillée tant que l’authentification propriétaire n’est pas configurée.</p>`);
  };
}

function addFeatureToPlan(recordId){
  const record=allRecords(cache.nexcreate).find(r=>r.id===recordId); if(!record)return;
  const plan=loadLocal('creation-plan',[]); if(!plan.find(x=>x.id===recordId))plan.push({id:recordId,title:recordTitle(record.fields||{}),fields:record.fields}); saveLocal('creation-plan',plan);
  showModalBlock(`<strong>Ajouté au plan ✅</strong><p>${escapeHtml(recordTitle(record.fields||{}))}</p><button class="ghost" id="openPlanNow">OUVRIR LE PLAN (${plan.length})</button>`);document.getElementById('openPlanNow').onclick=openCreationPlan;
}

function openCreationPlan(){
  const plan=loadLocal('creation-plan',[]);
  const items=plan.length?plan.map((x,i)=>`<div class="plan-row"><span>${i+1}</span><strong>${escapeHtml(x.title)}</strong><button class="ghost remove-plan" data-id="${escapeHtml(x.id)}">Retirer</button></div>`).join(''):'<p class="output">Ton plan est vide. Ouvre une fonction NEXCREATE et appuie sur AJOUTER AU PLAN.</p>';
  showModalBlock(`<span class="tag">NEXCREATE</span><h4>Plan de création</h4>${items}<button class="primary" id="copyPlan">COPIER LE PLAN</button>`);
  document.querySelectorAll('.remove-plan').forEach(b=>b.onclick=()=>{const next=loadLocal('creation-plan',[]).filter(x=>x.id!==b.dataset.id);saveLocal('creation-plan',next);openCreationPlan();});
  document.getElementById('copyPlan').onclick=async()=>{const txt=loadLocal('creation-plan',[]).map((x,i)=>`${i+1}. ${x.title}`).join('\n');try{await navigator.clipboard.writeText(txt);showModalBlock('<strong>Plan copié ✅</strong>');}catch{showModalBlock(`<pre>${escapeHtml(txt)}</pre>`);}};
}

function showModalBlock(inner){let box=document.getElementById('toolResult');if(!box){box=document.createElement('div');box.id='toolResult';box.className='tool-result';actions.prepend(box);}box.innerHTML=inner;box.scrollIntoView({behavior:'smooth',block:'nearest'});}

async function renderLiveCore(){
  actions.innerHTML='<p class="output">Vérification du système…</p>';
  try{
    const [a,o]=await Promise.all([fetch('/api/airtable-status',{cache:'no-store'}).then(r=>r.json()),fetch('/api/owner-action',{cache:'no-store'}).then(r=>r.json()).catch(()=>({owner_write_configured:false}))]);
    actions.innerHTML=`<div class="live-status-grid"><div><span class="live-pill">AIRTABLE</span><strong>${a.airtable_connected?'CONNECTÉ ✅':'À VÉRIFIER ❌'}</strong></div><div><span class="live-pill secondary">ÉCRITURE</span><strong>${o.owner_write_configured?'PROPRIÉTAIRE PRÊTE ✅':'VERROUILLÉE 🔒'}</strong></div></div><button class="primary" id="airtableCheck">VÉRIFIER AIRTABLE</button><p class="output">L’écriture canon reste bloquée par défaut. Aucun élément LOCK ne peut être modifié par les outils préparés ici.</p>`;
    document.getElementById('airtableCheck').onclick=checkAirtable;
  }catch{actions.innerHTML='<p class="output">Diagnostic indisponible.</p>';}
}

document.querySelectorAll('.card').forEach(btn=>btn.addEventListener('click',()=>loadModule(btn.dataset.module)));
document.getElementById('closePanel').onclick=()=>panel.hidden=true;

async function loadNyxcoreSummary(){
  try{const r=await fetch('/api/module-data?module=nyxcore',{cache:'no-store'});const d=await r.json();cache.nyxcore=d;const count=d?.sections?.reduce((n,s)=>n+(Number(s.count)||0),0)||0;const first=d?.sections?.[0]?.records?.[0]?.fields||{};missionOutput.textContent=d.ok?`NYXCORE · Airtable LIVE · ${count} modules du cerveau${first['Mise à jour']?` · mise à jour ${first['Mise à jour']}`:''}`:'NYXCORE · Airtable indisponible';}catch{missionOutput.textContent='NYXCORE · diagnostic indisponible';}
}

function routeMission(v){const s=v.toLowerCase();if(/tarot|carte|tirage|nexarcana/.test(s))return'NEXARCANA';if(/dessin|image|pinceau|brush|tattoo|stencil|nexcreate|inkarnyx/.test(s))return'NEXCREATE';if(/personnage|character|abmiss|serranyx|warden/.test(s))return'CHARACTER FORGE';if(/canon|redline|nexus|monde|nexroom/.test(s))return'NEXUS CONTROL';return'NYXCORE / MISSION CONTROL';}

document.getElementById('sendMission').onclick=()=>{
  const v=document.getElementById('mission').value.trim();if(!v){missionOutput.textContent='Écris une mission pour NYXCORE.';return;}
  const route=routeMission(v);const drafts=loadLocal('missions',[]);drafts.unshift({id:`mission-${Date.now()}`,text:v,route,createdAt:new Date().toISOString()});saveLocal('missions',drafts);
  missionOutput.textContent=`Mission classée ✅ · Route : ${route} · brouillon sauvegardé sur cet appareil. L’exécution IA autonome n’est pas encore activée par ce bouton.`;
};

const navButtons=document.querySelectorAll('.bottom-nav button');
function setActive(button){navButtons.forEach(b=>b.classList.remove('active'));button.classList.add('active');}
navButtons.forEach(button=>button.addEventListener('click',()=>{setActive(button);const open=button.dataset.open;if(!open){panel.hidden=true;window.scrollTo({top:0,behavior:'smooth'});return;}if(open==='create')loadModule('nexcreate');if(open==='library')loadModule('nexarcana');if(open==='profile')loadModule('forge');}));

async function checkAirtable(){actions.innerHTML='<p class="output">Vérification Airtable réelle en cours…</p>';try{const r=await fetch('/api/airtable-status',{cache:'no-store'});const d=await r.json();if(d.airtable_connected){actions.innerHTML=`<p class="output"><strong>AIRTABLE CONNECTÉ ✅</strong><br>PAT présent : oui<br>BASE_ID présent : oui<br>Tables accessibles : <strong>${Number(d.table_count)||0}</strong></p>`;}else{const reason={missing_configuration:'configuration manquante',invalid_pat:'PAT invalide',base_access_denied:'PAT sans accès à cette base',base_not_found:'BASE_ID introuvable',airtable_request_failed:'requête Airtable refusée',network_error:'erreur réseau'}[d.error]||'connexion impossible';actions.innerHTML=`<p class="output"><strong>AIRTABLE NON CONNECTÉ ❌</strong><br>Diagnostic : ${escapeHtml(reason)}</p>`;}}catch{actions.innerHTML='<p class="output"><strong>AIRTABLE NON CONNECTÉ ❌</strong><br>Diagnostic indisponible.</p>';}}

async function syncCoreStatus(){try{const r=await fetch('/api/airtable-status',{cache:'no-store'});const d=await r.json();coreStatus.innerHTML=d.airtable_connected?'<span class="dot"></span> NYXCORE + AIRTABLE EN LIGNE':'<span class="dot warn"></span> AIRTABLE À VÉRIFIER';}catch{coreStatus.innerHTML='<span class="dot warn"></span> CORE À VÉRIFIER';}}

syncCoreStatus();loadNyxcoreSummary();
