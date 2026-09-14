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

function escapeHtml(value=''){
  return String(value).replace(/[&<>'"]/g,(c)=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
}

function asText(value){
  if(Array.isArray(value)) return value.join(' · ');
  if(typeof value==='boolean') return value?'Oui':'Non';
  if(typeof value==='number'&&value>=0&&value<=1) return `${Math.round(value*100)} %`;
  return String(value??'');
}

function recordTitle(fields){
  const keys=['Nom','Nom officiel','Character Name','Module','Module du cerveau','Feature ID','Canon ID','Tarot ID','Character ID'];
  for(const key of keys){if(fields[key]) return asText(fields[key]);}
  const first=Object.values(fields)[0];
  return first?asText(first):'Entrée Airtable';
}

function renderModuleData(data){
  if(!data?.ok||!Array.isArray(data.sections)){
    actions.innerHTML='<p class="output"><strong>DONNÉES AIRTABLE INDISPONIBLES ❌</strong></p>';
    return;
  }
  const total=data.sections.reduce((sum,s)=>sum+(Number(s.count)||0),0);
  let html=`<div class="live-head"><span class="live-pill">AIRTABLE LIVE</span><span>${total} entrée${total>1?'s':''} chargée${total>1?'s':''}</span></div>`;
  for(const section of data.sections){
    html+=`<section class="data-section"><div class="data-section-head"><strong>${escapeHtml(section.name)}</strong><span>${Number(section.count)||0}</span></div>`;
    if(!section.records?.length){html+='<p class="output">Aucune donnée dans cette table.</p></section>';continue;}
    for(const record of section.records){
      const fields=record.fields||{};
      const heading=recordTitle(fields);
      const rows=Object.entries(fields).filter(([k])=>!['Nom','Nom officiel','Character Name','Module','Module du cerveau'].includes(k)).map(([k,v])=>{
        const raw=asText(v);
        const compact=raw.length>900?`${raw.slice(0,900)}…`:raw;
        return `<div class="field-row"><span>${escapeHtml(k)}</span><p>${escapeHtml(compact)}</p></div>`;
      }).join('');
      html+=`<details class="data-item"><summary><strong>${escapeHtml(heading)}</strong><span>${escapeHtml(fields.Statut||fields['Statut canon']||fields.Status||fields['Statut réel']||'')}</span></summary><div class="data-body">${rows||'<p class="output">Entrée présente dans Airtable.</p>'}</div></details>`;
    }
    html+='</section>';
  }
  html+=`<button class="primary" id="refreshModule">ACTUALISER AIRTABLE</button>`;
  actions.innerHTML=html;
  document.getElementById('refreshModule')?.addEventListener('click',()=>loadModule(data.module));
}

async function loadModule(key){
  const m=modules[key];
  if(!m)return;
  title.textContent=m.title;
  text.textContent=m.text;
  panel.hidden=false;
  panel.scrollIntoView({behavior:'smooth',block:'nearest'});
  if(key==='live'){
    actions.innerHTML='<button class="primary" id="airtableCheck">VÉRIFIER AIRTABLE</button>';
    document.getElementById('airtableCheck').onclick=checkAirtable;
    return;
  }
  actions.innerHTML='<p class="output">Chargement Airtable…</p>';
  try{
    const r=await fetch(`/api/module-data?module=${encodeURIComponent(key)}`,{cache:'no-store'});
    const d=await r.json();
    renderModuleData(d);
  }catch(e){
    actions.innerHTML='<p class="output"><strong>DONNÉES AIRTABLE INDISPONIBLES ❌</strong><br>La route serveur ne répond pas.</p>';
  }
}

document.querySelectorAll('.card').forEach(btn=>btn.addEventListener('click',()=>loadModule(btn.dataset.module)));
document.getElementById('closePanel').onclick=()=>panel.hidden=true;

async function loadNyxcoreSummary(){
  try{
    const r=await fetch('/api/module-data?module=nyxcore',{cache:'no-store'});
    const d=await r.json();
    const count=d?.sections?.reduce((n,s)=>n+(Number(s.count)||0),0)||0;
    const first=d?.sections?.[0]?.records?.[0]?.fields||{};
    const updated=first['Mise à jour']||'';
    missionOutput.textContent=d.ok?`NYXCORE · Airtable LIVE · ${count} modules du cerveau${updated?` · mise à jour ${updated}`:''}`:'NYXCORE · Airtable indisponible';
  }catch(e){missionOutput.textContent='NYXCORE · diagnostic indisponible';}
}

document.getElementById('sendMission').onclick=async()=>{
  const v=document.getElementById('mission').value.trim();
  if(!v){missionOutput.textContent='Écris une mission pour NYXCORE.';return;}
  missionOutput.textContent='Chargement du contexte NYXCORE depuis Airtable…';
  try{
    const r=await fetch('/api/module-data?module=nyxcore',{cache:'no-store'});
    const d=await r.json();
    const count=d?.sections?.reduce((n,s)=>n+(Number(s.count)||0),0)||0;
    missionOutput.textContent=d.ok?`Mission préparée : « ${v} » · contexte NYXCORE chargé depuis ${count} entrées Airtable. L’exécution autonome de missions n’est pas encore branchée à ce bouton.`:`Mission non envoyée : NYXCORE Airtable indisponible.`;
  }catch(e){missionOutput.textContent='Mission non envoyée : route NYXCORE indisponible.';}
};

const navButtons=document.querySelectorAll('.bottom-nav button');
function setActive(button){navButtons.forEach(b=>b.classList.remove('active'));button.classList.add('active');}
navButtons.forEach(button=>button.addEventListener('click',()=>{
  setActive(button);
  const open=button.dataset.open;
  if(!open){panel.hidden=true;window.scrollTo({top:0,behavior:'smooth'});return;}
  if(open==='create')loadModule('nexcreate');
  if(open==='library')loadModule('nexarcana');
  if(open==='profile')loadModule('forge');
}));

async function checkAirtable(){
  actions.innerHTML='<p class="output">Vérification Airtable réelle en cours…</p>';
  try{
    const r=await fetch('/api/airtable-status',{cache:'no-store'});
    const d=await r.json();
    if(d.airtable_connected){
      const names=Array.isArray(d.tables)?d.tables.map(t=>escapeHtml(t.name)).join(', '):'';
      actions.innerHTML=`<p class="output"><strong>AIRTABLE CONNECTÉ ✅</strong><br>PAT présent : oui<br>BASE_ID présent : oui<br>Tables accessibles : <strong>${Number(d.table_count)||0}</strong>${names?`<br>${names}`:''}</p>`;
    }else{
      const reason={missing_configuration:'configuration manquante',invalid_pat:'PAT invalide',base_access_denied:'PAT sans accès à cette base',base_not_found:'BASE_ID introuvable',airtable_request_failed:'requête Airtable refusée',network_error:'erreur réseau'}[d.error]||'connexion impossible';
      actions.innerHTML=`<p class="output"><strong>AIRTABLE NON CONNECTÉ ❌</strong><br>PAT présent : ${d.pat_present?'oui':'non'}<br>BASE_ID présent : ${d.base_id_present?'oui':'non'}<br>Diagnostic : ${escapeHtml(reason)}</p>`;
    }
  }catch(e){actions.innerHTML='<p class="output"><strong>AIRTABLE NON CONNECTÉ ❌</strong><br>Diagnostic indisponible sur cet hébergement.</p>';}
}

async function syncCoreStatus(){
  try{
    const r=await fetch('/api/airtable-status',{cache:'no-store'});
    const d=await r.json();
    if(d.airtable_connected) coreStatus.innerHTML='<span class="dot"></span> NYXCORE + AIRTABLE EN LIGNE';
    else coreStatus.innerHTML='<span class="dot warn"></span> AIRTABLE À VÉRIFIER';
  }catch(e){coreStatus.innerHTML='<span class="dot warn"></span> CORE À VÉRIFIER';}
}

syncCoreStatus();
loadNyxcoreSummary();
