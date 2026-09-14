async function kryvellOwnerStatus(){
  try{
    const r=await fetch('/api/owner-action',{cache:'no-store',credentials:'same-origin'});
    return await r.json();
  }catch{return {ok:false,owner_write_configured:false,owner_session:false};}
}

async function kryvellOwnerLogin(key){
  const r=await fetch('/api/owner-login',{
    method:'POST',
    credentials:'same-origin',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({key})
  });
  const d=await r.json().catch(()=>({ok:false}));
  if(!r.ok||!d.ok) throw new Error(d.error||'owner_auth_failed');
  return d;
}

function ownerCharacterForm(status){
  const ready=Boolean(status?.owner_session);
  const auth=status?.owner_write_configured
    ? ready
      ? '<div class="owner-banner ok"><strong>MODE PROPRIÉTAIRE CONNECTÉ ✅</strong><span>Session sécurisée active. La clé n’est pas stockée dans le navigateur.</span></div>'
      : '<div class="owner-banner"><strong>MODE PROPRIÉTAIRE 🔒</strong><span>Entre ta clé une seule fois pour ouvrir une session sécurisée de 8 heures.</span><input id="ownerKeyField" class="search" type="password" autocomplete="current-password" placeholder="Clé propriétaire"><button class="ghost" id="ownerLoginBtn">DÉVERROUILLER</button><p id="ownerLoginMsg" class="output"></p></div>'
    : '<div class="owner-banner"><strong>ÉCRITURE NON CONFIGURÉE ❌</strong><span>KRYVELL_OWNER_KEY manque côté serveur.</span></div>';

  showModalBlock(`<span class="tag">CHARACTER FORGE</span><h4>Nouveau brouillon personnage</h4>${auth}<div class="form-grid"><label>Nom<input id="draftName" class="search"></label><label>Espèce<input id="draftSpecies" class="search"></label><label>Type de corps<textarea id="draftBody" class="search" rows="2"></textarea></label><label>Visage<textarea id="draftFace" class="search" rows="2"></textarea></label><label>Fourrure / cheveux<textarea id="draftHair" class="search" rows="2"></textarea></label><label>Règles négatives<textarea id="draftNeg" class="search" rows="2"></textarea></label></div><button class="primary" id="saveOwnerCharacter" ${ready?'':'disabled'}>${ready?'ENREGISTRER DANS AIRTABLE':'DÉVERROUILLE LE MODE PROPRIÉTAIRE'}</button><p id="ownerSaveMsg" class="output">Nouveau brouillon = In Progress · Pending Approval · Protected = Non. Les fiches protégées existantes ne sont jamais modifiées.</p>`);

  const loginBtn=document.getElementById('ownerLoginBtn');
  if(loginBtn) loginBtn.onclick=async()=>{
    const key=document.getElementById('ownerKeyField').value;
    const msg=document.getElementById('ownerLoginMsg');
    if(!key){msg.textContent='Entre ta clé propriétaire.';return;}
    loginBtn.disabled=true;msg.textContent='Vérification…';
    try{
      await kryvellOwnerLogin(key);
      document.getElementById('ownerKeyField').value='';
      const banner=loginBtn.closest('.owner-banner');
      banner.className='owner-banner ok';
      banner.innerHTML='<strong>MODE PROPRIÉTAIRE CONNECTÉ ✅</strong><span>Session sécurisée active pour 8 heures.</span>';
      const save=document.getElementById('saveOwnerCharacter');
      save.disabled=false;save.textContent='ENREGISTRER DANS AIRTABLE';
    }catch{
      msg.textContent='Clé refusée. Rien n’a été envoyé à Airtable.';
      loginBtn.disabled=false;
    }
  };

  const saveBtn=document.getElementById('saveOwnerCharacter');
  saveBtn.onclick=async()=>{
    const name=document.getElementById('draftName').value.trim();
    const msg=document.getElementById('ownerSaveMsg');
    if(!name){msg.textContent='Ajoute au minimum le nom du personnage.';return;}
    saveBtn.disabled=true;saveBtn.textContent='ENREGISTREMENT…';
    const payload={
      action:'create_character_draft',
      name,
      species:document.getElementById('draftSpecies').value.trim(),
      bodyType:document.getElementById('draftBody').value.trim(),
      face:document.getElementById('draftFace').value.trim(),
      hairFur:document.getElementById('draftHair').value.trim(),
      negativeRules:document.getElementById('draftNeg').value.trim()
    };
    try{
      const r=await fetch('/api/owner-action',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
      const d=await r.json().catch(()=>({ok:false}));
      if(r.status===401){msg.innerHTML='<strong>SESSION EXPIRÉE 🔒</strong><br>Ferme puis rouvre Nouveau brouillon pour te reconnecter.';return;}
      if(!r.ok||!d.ok) throw new Error(d.error||'save_failed');
      try{delete cache.forge;}catch{}
      msg.innerHTML=`<strong>ENREGISTRÉ DANS AIRTABLE ✅</strong><br>${escapeHtml(name)} · In Progress · Pending Approval · Protected = Non`;
      saveBtn.textContent='ENREGISTRÉ ✅';
      return;
    }catch{
      msg.innerHTML='<strong>ERREUR D’ENREGISTREMENT ❌</strong><br>Aucune fiche protégée n’a été modifiée.';
    }finally{
      if(saveBtn.textContent!=='ENREGISTRÉ ✅'){saveBtn.disabled=false;saveBtn.textContent='ENREGISTRER DANS AIRTABLE';}
    }
  };
}

async function openOwnerCharacterDraft(){
  showModalBlock('<p class="output">Vérification du mode propriétaire…</p>');
  const status=await kryvellOwnerStatus();
  ownerCharacterForm(status);
}

document.addEventListener('click',(event)=>{
  const button=event.target.closest?.('[data-quick="character"]');
  if(!button)return;
  event.preventDefault();
  event.stopImmediatePropagation();
  openOwnerCharacterDraft();
},true);
