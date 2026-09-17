(()=>{
  const state={configured:false,session:false,userId:null,expiresAt:null,phone:null};
  const api={status:'/api/phone-auth-status',start:'/api/phone-auth-start',verify:'/api/phone-auth-verify'};

  function emit(){window.dispatchEvent(new CustomEvent('kryvell:phone-session',{detail:{...state}}));}
  function setState(next){Object.assign(state,next);document.body.dataset.phoneAuth=state.session?'active':state.configured?'required':'unconfigured';emit();}
  function removeOverlay(){document.getElementById('kryvellPhoneAuthOverlay')?.remove();}
  function esc(v=''){return String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
  function normalize(code,number){
    const raw=String(number||'').trim();
    if(raw.startsWith('+')) return raw.replace(/[\s().-]/g,'');
    const prefix=String(code||'+1').trim().replace(/[\s().-]/g,'');
    return `${prefix.startsWith('+')?prefix:`+${prefix}`}${raw.replace(/\D/g,'')}`;
  }
  function message(root,text,ok=false){const e=root.querySelector('[data-auth-message]');if(!e)return;e.textContent=text||'';e.classList.toggle('ok',ok);}

  function renderPhone(){
    removeOverlay();
    const root=document.createElement('div');
    root.id='kryvellPhoneAuthOverlay';root.className='kryvell-auth-overlay';
    root.innerHTML=`<section class="kryvell-auth-card" role="dialog" aria-modal="true" aria-labelledby="kryvellAuthTitle"><div class="kryvell-auth-mark">NX</div><p class="kryvell-auth-eyebrow">KRYVELL ID · NEXSIGRAM READY</p><h1 id="kryvellAuthTitle">Ton numéro, c’est ton accès.</h1><p class="kryvell-auth-copy">Entre ton numéro de téléphone. KRYVELL envoie un code SMS et crée ta session sur cet appareil.</p><div class="kryvell-auth-grid"><div><label class="kryvell-auth-label" for="kryvellCountryCode">Indicatif</label><input class="kryvell-auth-input" id="kryvellCountryCode" inputmode="tel" autocomplete="tel-country-code" value="+1" aria-label="Indicatif pays"></div><div><label class="kryvell-auth-label" for="kryvellPhoneNumber">Numéro</label><input class="kryvell-auth-input" id="kryvellPhoneNumber" type="tel" inputmode="tel" autocomplete="tel" placeholder="514 555 1234"></div></div><button class="kryvell-auth-primary" data-auth-send>CONTINUER</button><p class="kryvell-auth-message" data-auth-message aria-live="polite"></p><p class="kryvell-auth-foot">Aucun mot de passe KRYVELL à retenir. Le code SMS sert à confirmer que le numéro t’appartient.</p></section>`;
    document.body.appendChild(root);
    const phone=root.querySelector('#kryvellPhoneNumber');phone.focus();
    root.querySelector('[data-auth-send]').onclick=async()=>{
      const button=root.querySelector('[data-auth-send]');const full=normalize(root.querySelector('#kryvellCountryCode').value,phone.value);
      if(!/^\+[1-9]\d{7,14}$/.test(full)){message(root,'Entre un numéro valide avec son indicatif.');return;}
      button.disabled=true;message(root,'Envoi du code…');
      try{
        const r=await fetch(api.start,{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({phone:full})});
        const d=await r.json().catch(()=>({ok:false}));
        if(!r.ok||!d.ok)throw new Error(d.error||'send_failed');
        state.phone=full;renderCode(d.masked_phone||full);
      }catch(e){message(root,e.message==='phone_auth_not_configured'?'Le service SMS n’est pas encore configuré côté serveur.':'Impossible d’envoyer le code pour le moment.');button.disabled=false;}
    };
    phone.addEventListener('keydown',e=>{if(e.key==='Enter')root.querySelector('[data-auth-send]').click();});
  }

  function renderCode(masked){
    removeOverlay();
    const root=document.createElement('div');root.id='kryvellPhoneAuthOverlay';root.className='kryvell-auth-overlay';
    root.innerHTML=`<section class="kryvell-auth-card" role="dialog" aria-modal="true" aria-labelledby="kryvellCodeTitle"><div class="kryvell-auth-mark">NX</div><p class="kryvell-auth-eyebrow">VÉRIFICATION SMS</p><h1 id="kryvellCodeTitle">Entre le code reçu.</h1><p class="kryvell-auth-copy">Code envoyé à <strong>${esc(masked)}</strong>.</p><label class="kryvell-auth-label" for="kryvellOtp">Code</label><input class="kryvell-auth-input kryvell-auth-code" id="kryvellOtp" inputmode="numeric" autocomplete="one-time-code" maxlength="10" placeholder="••••••"><button class="kryvell-auth-primary" data-auth-verify>SE CONNECTER</button><button class="kryvell-auth-secondary" data-auth-back>CHANGER DE NUMÉRO</button><p class="kryvell-auth-message" data-auth-message aria-live="polite"></p><p class="kryvell-auth-foot">La session KRYVELL est conservée de façon sécurisée dans un cookie HttpOnly.</p></section>`;
    document.body.appendChild(root);const code=root.querySelector('#kryvellOtp');code.focus();
    root.querySelector('[data-auth-back]').onclick=renderPhone;
    root.querySelector('[data-auth-verify]').onclick=async()=>{
      const button=root.querySelector('[data-auth-verify]');const value=code.value.replace(/\D/g,'');
      if(value.length<4){message(root,'Entre le code reçu par SMS.');return;}
      button.disabled=true;message(root,'Vérification…');
      try{
        const r=await fetch(api.verify,{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({phone:state.phone,code:value})});
        const d=await r.json().catch(()=>({ok:false}));
        if(!r.ok||!d.ok)throw new Error(d.error||'verify_failed');
        setState({configured:true,session:true,userId:d.user_id||null,expiresAt:d.expires_at||null});
        message(root,'Connexion réussie.',true);setTimeout(removeOverlay,240);
      }catch{message(root,'Code incorrect ou expiré. Réessaie.');button.disabled=false;}
    };
    code.addEventListener('keydown',e=>{if(e.key==='Enter')root.querySelector('[data-auth-verify]').click();});
  }

  async function status(){
    try{
      const r=await fetch(api.status,{cache:'no-store',credentials:'same-origin'});const d=await r.json();
      setState({configured:Boolean(d.configured),session:Boolean(d.user_session),userId:d.user_id||null,expiresAt:d.expires_at||null});
      if(state.configured&&!state.session)renderPhone();else removeOverlay();
      return {...state};
    }catch{setState({configured:false,session:false});return {...state};}
  }
  async function logout(){
    await fetch(api.status,{method:'DELETE',credentials:'same-origin'}).catch(()=>{});
    setState({session:false,userId:null,expiresAt:null,phone:null});if(state.configured)renderPhone();
  }
  function open(){if(state.configured&&!state.session)renderPhone();}
  window.KryvellPhoneAuth={status,logout,open,get state(){return {...state};}};
  const init=()=>status();
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
