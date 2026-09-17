const APPS={
  'kryvell-one':{name:'KRYVELL ONE',badge:'K1',desc:'Hub principal ACStudio. Ouvre les modules existants sans les remplacer.',mode:'iframe',url:'/kryvell-one.html'},
  fusion:{name:'FUSION CORE',badge:'∞',desc:'Orchestration unifiée Airtable, Supabase, GitHub, Vercel, Drive, Canva et workers créatifs IA.',mode:'fusion'},
  nyxcore:{name:'NYXCORE',badge:'NYX',desc:'Écosystème de vie artificielle local : ADN, énergie, reproduction, pooling, PocketPal et lignées.',mode:'iframe',url:'/nyxcore-safe.html'},
  redline:{name:'REDLINE NEXUS',badge:'RNX',desc:'Nexus Control, canon, personnages et éléments LOCK.',mode:'iframe',url:'/kryvell-one.html'},
  nexarcana:{name:'NEXARCANA',badge:'NXA',desc:'Bibliothèque tarot, méthodes de tirage et atelier.',mode:'iframe',url:'/kryvell-one.html'},
  inkarnyx:{name:'INKARNYX',badge:'INK',desc:'Studio dessin et tatouage : OMNI Draw, Brush Engine, stencil et PHOMEMO.',mode:'iframe',url:'/kryvell-one.html'},
  storyverse:{name:'STORYVERSE',badge:'SV',desc:'Pipeline narratif et production STORYVERSE.',mode:'info'},
  live:{name:'KRYVELL LIVE',badge:'LIVE',desc:'Data Core, Airtable Control Plane, synchronisation et diagnostics serveur.',mode:'health'},
  files:{name:'ASSETS',badge:'FILE',desc:'Point d’entrée vers les fichiers, références et assets ACStudio.',mode:'info'},
  settings:{name:'PARAMÈTRES',badge:'SYS',desc:'État PWA, réseau, compte KRYVELL, DATA CORE, session et version KRYVELL OS.',mode:'settings'}
};

const boot=document.getElementById('boot');
const os=document.getElementById('os');
const launcher=document.getElementById('launcher');
const control=document.getElementById('controlCenter');
const windowLayer=document.getElementById('windowLayer');
const launcherApps=document.getElementById('launcherApps');
const launcherSearch=document.getElementById('launcherSearch');
const airtableState=document.getElementById('airtableState');
const sessionState=document.getElementById('sessionState');
const installButton=document.getElementById('installButton');
let deferredInstall=null;
let lastPhoneStatus={configured:false,user_session:false,user_id:null};
let lastDataCoreStatus={supabase_configured:false,supabase_reachable:false,data_core:'transition-local-session'};

function escapeHtml(v=''){return String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function closePanels(){launcher.hidden=true;control.hidden=true;}
function updateClock(){document.getElementById('clockButton').textContent=new Date().toLocaleTimeString('fr-CA',{hour:'2-digit',minute:'2-digit'});}
function updateNetwork(){const online=navigator.onLine;document.getElementById('networkState').innerHTML=`<i style="background:${online?'var(--ok)':'#e45454'}"></i>${online?'EN LIGNE':'HORS LIGNE'}`;document.getElementById('controlNetwork').textContent=online?'Connecté':'Hors ligne';}

function renderLauncher(filter=''){
  const q=filter.trim().toLowerCase();
  launcherApps.innerHTML=Object.entries(APPS).filter(([,a])=>!q||`${a.name} ${a.desc}`.toLowerCase().includes(q)).map(([key,a])=>`<button data-launch="${key}"><strong>${escapeHtml(a.name)}</strong><small>${escapeHtml(a.desc)}</small></button>`).join('')||'<p>Aucune app trouvée.</p>';
}

function windowChrome(appKey,body){
  const app=APPS[appKey];
  windowLayer.innerHTML=`<article class="os-window" data-window="${appKey}"><header class="window-bar"><div><span class="window-badge">${escapeHtml(app.badge)}</span><strong>${escapeHtml(app.name)}</strong></div><div class="window-actions"><button data-home>Accueil OS</button><button data-close-window>×</button></div></header><div class="window-body">${body}</div></article>`;
  windowLayer.querySelector('[data-close-window]').onclick=()=>windowLayer.innerHTML='';
  windowLayer.querySelector('[data-home]').onclick=()=>windowLayer.innerHTML='';
}

function phoneLabel(u){if(!u?.configured)return'SMS à configurer';if(u.user_session)return'Connecté';return'Non connecté';}
function dataCoreLabel(d){if(d?.supabase_configured)return'Supabase/Postgres · LIVE';if(d?.supabase_reachable)return'Supabase · LIVE / bridge prêt';if(d?.data_core==='unavailable')return'Indisponible';return'Scalable core à connecter';}
function bindAccountButtons(){
  const login=document.getElementById('settingsPhoneLogin');
  const logout=document.getElementById('settingsPhoneLogout');
  if(login)login.onclick=()=>window.KryvellPhoneAuth?.open();
  if(logout)logout.onclick=async()=>{await window.KryvellPhoneAuth?.logout();lastPhoneStatus={configured:true,user_session:false,user_id:null};healthCheck();openApp('settings');};
}

function openApp(appKey){
  const app=APPS[appKey];if(!app)return;
  closePanels();
  if(app.mode==='iframe'){
    windowChrome(appKey,`<iframe src="${app.url}" title="${escapeHtml(app.name)}" loading="eager"></iframe>`);
    return;
  }
  if(app.mode==='fusion'){
    windowChrome(appKey,'<div id="fusionCoreMount" class="fusion-loading">Chargement du FUSION CORE…</div>');
    const mount=document.getElementById('fusionCoreMount');
    if(window.KryvellFusionCore?.render)window.KryvellFusionCore.render(mount);else mount.textContent='Fusion Core indisponible.';
    return;
  }
  if(app.mode==='nyxcore'){
    windowChrome(appKey,'<div id="nyxcoreMount" style="height:100%">Chargement de NYXCORE…</div>');
    const mount=document.getElementById('nyxcoreMount');
    if(window.KryvellNyxcore?.render)window.KryvellNyxcore.render(mount);else mount.textContent='NYXCORE Life Engine indisponible.';
    return;
  }
  if(app.mode==='health'){
    windowChrome(appKey,`<div class="window-placeholder"><p class="eyebrow">DIAGNOSTIC LIVE</p><h2>KRYVELL LIVE</h2><p id="liveWindowStatus">Vérification en cours…</p><div class="window-links"><button id="liveRefresh">Actualiser</button><a href="/kryvell-one.html">Ouvrir KRYVELL ONE</a></div></div>`);
    document.getElementById('liveRefresh').onclick=()=>healthCheck(true);healthCheck(true);return;
  }
  if(app.mode==='settings'){
    const standalone=window.matchMedia('(display-mode: standalone)').matches||navigator.standalone===true;
    const accountAction=lastPhoneStatus.configured?(lastPhoneStatus.user_session?'<button id="settingsPhoneLogout">Déconnecter KRYVELL ID</button>':'<button id="settingsPhoneLogin">Se connecter par téléphone</button>'):'<button disabled>Connexion SMS à configurer</button>';
    windowChrome(appKey,`<div class="window-placeholder"><p class="eyebrow">SYSTÈME</p><h2>KRYVELL OS 0.8.2</h2><p>Couche Web OS / PWA au-dessus de KRYVELL ONE. NYXCORE LIFE tourne localement avec simulation mathématique, population active bornée, cohortes virtuelles, IndexedDB et accès PocketPal priorisé.</p><div class="control-card"><span>DATA CORE</span><strong>${dataCoreLabel(lastDataCoreStatus)}</strong></div><div class="control-card"><span>KRYVELL ID</span><strong>${phoneLabel(lastPhoneStatus)}</strong></div><div class="control-card"><span>NYXCORE</span><strong>${window.KryvellNyxcore?'LIFE ENGINE · LOCAL':'NON CHARGÉ'}</strong></div><div class="control-card"><span>Affichage</span><strong>${standalone?'PWA installée':'Navigateur'}</strong></div><div class="control-card"><span>Service worker</span><strong>${'serviceWorker'in navigator?'Compatible':'Non compatible'}</strong></div><div class="control-card"><span>Réseau</span><strong>${navigator.onLine?'En ligne':'Hors ligne'}</strong></div><div class="window-links">${accountAction}<button id="settingsInstall" ${deferredInstall?'':'disabled'}>Installer la PWA</button><button data-app="nyxcore">Ouvrir NYXCORE</button><button data-app="fusion">Ouvrir Fusion Core</button><a href="/kryvell-one.html">KRYVELL ONE</a></div></div>`);
    const b=document.getElementById('settingsInstall');if(b)b.onclick=installPwa;bindAccountButtons();return;
  }
  windowChrome(appKey,`<div class="window-placeholder"><p class="eyebrow">APP KRYVELL OS</p><h2>${escapeHtml(app.name)}</h2><p>${escapeHtml(app.desc)}</p><p>Cette app est enregistrée dans la couche système. Son interface dédiée sera branchée ici sans retirer les données ni les modules existants.</p><div class="window-links"><a href="/kryvell-one.html">Ouvrir le hub KRYVELL ONE</a></div></div>`);
}

async function healthCheck(updateWindow=false){
  airtableState.textContent='AIRTABLE · TEST';
  document.getElementById('controlDataCore').textContent='Vérification…';
  document.getElementById('controlAirtable').textContent='Vérification…';
  document.getElementById('controlUser').textContent='Vérification…';
  document.getElementById('controlOwner').textContent='Vérification…';
  try{
    const[a,o,u,d]=await Promise.all([
      fetch('/api/airtable-status',{cache:'no-store'}).then(r=>r.json()),
      fetch('/api/owner-action',{cache:'no-store',credentials:'same-origin'}).then(r=>r.json()).catch(()=>({owner_write_configured:false,owner_session:false})),
      fetch('/api/phone-auth-status',{cache:'no-store',credentials:'same-origin'}).then(r=>r.json()).catch(()=>({configured:false,user_session:false})),
      fetch('/api/data-core-status',{cache:'no-store'}).then(r=>r.json()).catch(()=>({supabase_configured:false,supabase_reachable:false,data_core:'unavailable'}))
    ]);
    lastPhoneStatus=u;lastDataCoreStatus=d;
    const connected=Boolean(a.airtable_connected);
    airtableState.textContent=connected?'AIRTABLE · CONTROL':'AIRTABLE · À VÉRIFIER';
    document.getElementById('controlDataCore').textContent=dataCoreLabel(d);
    document.getElementById('controlAirtable').textContent=connected?'Control Plane connecté':'À vérifier';
    document.getElementById('controlUser').textContent=phoneLabel(u);
    document.getElementById('controlOwner').textContent=o.owner_session?'Propriétaire active':o.owner_write_configured?'Verrouillée':'Non configurée';
    sessionState.textContent=o.owner_session?'PROPRIÉTAIRE':u.user_session?'KRYVELL ID':'STANDARD';
    if(updateWindow){
      const e=document.getElementById('liveWindowStatus');
      const dc=d.supabase_configured?'SUPABASE/POSTGRES LIVE ✅':d.supabase_reachable?'SUPABASE PROJECT LIVE ✅ · BRIDGE APP À FINALISER 🟡':'À CONNECTER 🟡';
      const nx=window.KryvellNyxcore?.stats?.();
      if(e)e.innerHTML=`DATA CORE : <strong>${dc}</strong><br>Airtable : <strong>${connected?'CONTROL PLANE CONNECTÉ ✅':'À VÉRIFIER ❌'}</strong><br>NYXCORE : <strong>${nx?`LOCAL ✅ · ${nx.active} actifs · GEN ${nx.generation}`:'NON CHARGÉ'}</strong><br>KRYVELL ID : <strong>${u.user_session?'CONNECTÉ ✅':u.configured?'NON CONNECTÉ':'SMS À CONFIGURER'}</strong><br>Session propriétaire : <strong>${o.owner_session?'ACTIVE ✅':o.owner_write_configured?'VERROUILLÉE 🔒':'NON CONFIGURÉE'}</strong>`;
    }
  }catch{
    airtableState.textContent='AIRTABLE · INDISPONIBLE';
    document.getElementById('controlDataCore').textContent='Indisponible';
    document.getElementById('controlAirtable').textContent='Indisponible';
    document.getElementById('controlUser').textContent='Indisponible';
    document.getElementById('controlOwner').textContent='Indisponible';
    if(updateWindow){const e=document.getElementById('liveWindowStatus');if(e)e.textContent='Le diagnostic serveur ne répond pas.';}
  }
}

async function installPwa(){if(!deferredInstall)return;deferredInstall.prompt();await deferredInstall.userChoice;deferredInstall=null;installButton.hidden=true;document.getElementById('installState').textContent='PWA';}
window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();deferredInstall=e;installButton.hidden=false;});
window.addEventListener('appinstalled',()=>{deferredInstall=null;installButton.hidden=true;document.getElementById('installState').textContent='PWA INSTALLÉE';document.getElementById('controlPwa').textContent='Installée';});
window.addEventListener('online',updateNetwork);window.addEventListener('offline',updateNetwork);
window.addEventListener('kryvell:phone-session',e=>{const s=e.detail||{};lastPhoneStatus={configured:Boolean(s.configured),user_session:Boolean(s.session),user_id:s.userId||null};const el=document.getElementById('controlUser');if(el)el.textContent=phoneLabel(lastPhoneStatus);if(!document.getElementById('controlOwner')?.textContent?.includes('Propriétaire'))sessionState.textContent=s.session?'KRYVELL ID':'STANDARD';});

document.getElementById('launcherButton').onclick=()=>{control.hidden=true;launcher.hidden=!launcher.hidden;if(!launcher.hidden)launcherSearch.focus();};
document.getElementById('closeLauncher').onclick=()=>launcher.hidden=true;
document.getElementById('clockButton').onclick=()=>{launcher.hidden=true;control.hidden=!control.hidden;if(!control.hidden)healthCheck();};
document.getElementById('closeControl').onclick=()=>control.hidden=true;
document.getElementById('runHealthCheck').onclick=()=>healthCheck();
launcherSearch.addEventListener('input',e=>renderLauncher(e.target.value));
document.addEventListener('click',e=>{const b=e.target.closest?.('[data-app],[data-launch]');if(!b)return;openApp(b.dataset.app||b.dataset.launch);});
installButton.onclick=installPwa;

if('serviceWorker'in navigator){window.addEventListener('load',()=>navigator.serviceWorker.register('/sw.js').catch(()=>{}));}
renderLauncher();updateClock();updateNetwork();setInterval(updateClock,30000);
document.getElementById('controlPwa').textContent=(window.matchMedia('(display-mode: standalone)').matches||navigator.standalone===true)?'Installée':'Web';
healthCheck();
setTimeout(()=>{boot.hidden=true;os.hidden=false;},650);

// Deep links from NYXCORE Safe Mode / external launcher.
const deepApp=new URLSearchParams(location.search).get('app');
if(deepApp&&APPS[deepApp]) setTimeout(()=>openApp(deepApp),180);
