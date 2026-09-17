/* NYXCORE THERMAL GUARD v1.0.0 — KRYVELL OS 0.8.0
 * Browser-safe heat protection for iPad/iPhone/PWA.
 * Web apps cannot read the device temperature directly, so this estimates pressure from FPS + event-loop lag.
 */
(() => {
  'use strict';
  if (window.__NYXCORE_THERMAL__) return;

  const state = {
    version: '1.0.0',
    level: 0,
    manualMax: false,
    reason: 'stable',
    fps: 0,
    lagMs: 0,
    hotHits: 0,
    coolHits: 0,
    lastChangeAt: 0,
    isIPad: /iPad/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1),
    baseline: null,
    patched: false,
    timer: null,
    uiTimer: null
  };

  const clamp = (v,a,b) => Math.max(a,Math.min(b,v));
  const engine = () => window.KryvellNyxcore?.engine || null;
  const cfg = () => window.KryvellNyxcore?.config || null;
  const speed = () => window.__NYXCORE_SPEED__ || null;

  function log(msg){
    console.log(`[NYX THERMAL] ${msg}`);
    const rt=document.getElementById('runtimeLogs');
    if(rt) rt.textContent=`🌡️ ${msg}`;
  }

  function ensureBaseline(){
    const c=cfg(); if(!c || state.baseline) return;
    state.baseline={
      renderHz:Number(c.renderHz||30),
      backgroundHz:Number(c.backgroundHz||1),
      agentBudgetMs:Number(c.agentBudgetMs||5),
      dprCap:Number(c.dprCap||2),
      maxBirthsPerBackgroundTick:Number(c.maxBirthsPerBackgroundTick||48)
    };
  }

  function patchBrainQueue(){
    const e=engine(); if(!e || state.patched) return;
    const original=e.maybeQueueBrain?.bind(e);
    if(original){
      e.maybeQueueBrain=function(agent){
        if(state.level>=3) return;
        if(state.level===2 && Math.random()<0.82) return;
        if(state.level===1 && Math.random()<0.45) return;
        return original(agent);
      };
    }
    const originalStats=e.stats?.bind(e);
    if(originalStats){
      e.stats=function(){return {...originalStats(),thermalLevel:state.level,thermalReason:state.reason,thermalLagMs:Math.round(state.lagMs),thermalGuard:true};};
    }
    state.patched=true;
  }

  function applyLevel(level, reason='auto'){
    ensureBaseline();
    const c=cfg(), e=engine(); if(!c || !state.baseline) return;
    level=clamp(Math.trunc(level),0,3);
    if(state.manualMax) level=Math.max(level,2);
    if(level===state.level && reason===state.reason) return;
    const prev=state.level; state.level=level; state.reason=reason; state.lastChangeAt=Date.now();
    const b=state.baseline;

    if(level===0){
      c.renderHz=b.renderHz; c.backgroundHz=b.backgroundHz; c.agentBudgetMs=b.agentBudgetMs; c.dprCap=b.dprCap; c.maxBirthsPerBackgroundTick=b.maxBirthsPerBackgroundTick;
      const s=speed(); if(s?.state){s.state.effective=Math.min(s.state.requested||1, Math.max(1,s.state.effective||1));}
    }else if(level===1){
      c.renderHz=Math.min(b.renderHz,22); c.backgroundHz=Math.min(b.backgroundHz,0.8); c.agentBudgetMs=Math.min(b.agentBudgetMs,3.5); c.dprCap=Math.min(b.dprCap,1.5); c.maxBirthsPerBackgroundTick=Math.min(b.maxBirthsPerBackgroundTick,22);
      const s=speed(); if(s?.state) s.state.effective=Math.min(s.state.effective||1,2);
    }else if(level===2){
      c.renderHz=Math.min(b.renderHz,15); c.backgroundHz=Math.min(b.backgroundHz,0.5); c.agentBudgetMs=Math.min(b.agentBudgetMs,2.2); c.dprCap=Math.min(b.dprCap,1.25); c.maxBirthsPerBackgroundTick=Math.min(b.maxBirthsPerBackgroundTick,8);
      const s=speed(); if(s?.state) s.state.effective=1;
    }else{
      c.renderHz=Math.min(b.renderHz,10); c.backgroundHz=Math.min(b.backgroundHz,0.25); c.agentBudgetMs=Math.min(b.agentBudgetMs,1.2); c.dprCap=1; c.maxBirthsPerBackgroundTick=0;
      const s=speed(); if(s?.state) s.state.effective=1;
    }
    e?.notifyStats?.();
    updateUi();
    if(prev!==level) log(level===0?'Protection thermique revenue à NORMAL.':`Protection thermique niveau ${level} (${reason}).`);
  }

  function scorePressure(){
    const e=engine();
    const fps=Number(e?.fps||0); state.fps=fps;
    let score=0;
    const fpsWarn=state.isIPad?24:21, fpsHot=state.isIPad?18:16;
    const lagWarn=state.isIPad?70:90, lagHot=state.isIPad?150:190;
    if(fps>0 && fps<fpsWarn) score++;
    if(fps>0 && fps<fpsHot) score+=2;
    if(state.lagMs>lagWarn) score++;
    if(state.lagMs>lagHot) score+=2;
    if(document.hidden) score=Math.max(score,2);
    return score;
  }

  function evaluate(){
    patchBrainQueue(); ensureBaseline();
    if(state.manualMax){applyLevel(2,'manuel');return;}
    const score=scorePressure();
    if(score>=4) {state.hotHits+=2;state.coolHits=0;}
    else if(score>=2){state.hotHits++;state.coolHits=0;}
    else {state.coolHits++;state.hotHits=Math.max(0,state.hotHits-1);}

    if(state.hotHits>=6) applyLevel(3,'pression critique');
    else if(state.hotHits>=3) applyLevel(2,'pression élevée');
    else if(state.hotHits>=1) applyLevel(1,'pression détectée');
    else if(state.coolHits>=8 && Date.now()-state.lastChangeAt>12000) applyLevel(0,'stable');
  }

  function installLagProbe(){
    let expected=performance.now()+1000;
    state.timer=setInterval(()=>{
      const now=performance.now();
      const drift=Math.max(0,now-expected);
      expected=now+1000;
      state.lagMs=state.lagMs*0.65+drift*0.35;
      evaluate();
    },1000);
  }

  function ensureStyles(){
    if(document.getElementById('nyx-thermal-style')) return;
    const s=document.createElement('style');s.id='nyx-thermal-style';s.textContent=`
      .nyx-thermal-btn{border-color:#5e3430!important;background:#1d1210!important;color:#ffd5ca!important}
      .nyx-thermal-btn[data-level="1"]{color:#ffd36a!important;border-color:#7b6327!important}
      .nyx-thermal-btn[data-level="2"],.nyx-thermal-btn[data-level="3"]{color:#ff8a9c!important;border-color:#8a263d!important;background:#2b0f17!important}
      .nyx-thermal-stat strong{color:#ffaf9d!important}
      .nyx-thermal-note{font-size:9px;color:#7f7f89;line-height:1.4;margin:5px 0 8px}
    `;document.head.appendChild(s);
  }

  function updateUi(){
    document.querySelectorAll('[data-nyx-thermal]').forEach(btn=>{
      btn.dataset.level=String(state.level);
      btn.textContent=state.manualMax?'🌡 MAX':state.level?`🌡 L${state.level}`:'🌡 AUTO';
      btn.title=`Thermal Guard — pression estimée ${state.level}/3 · ${state.reason}`;
    });
    document.querySelectorAll('[data-thermal-stat]').forEach(el=>{
      const label=state.level===0?'NORMAL':state.level===1?'ÉCO':state.level===2?'PROTECTION':'CRITIQUE';
      el.textContent=`${label} · ${state.fps||'—'} FPS`;
    });
  }

  function installUi(){
    ensureStyles();
    document.querySelectorAll('.nyx-life').forEach(root=>{
      const actions=root.querySelector('.nyx-actions');
      if(actions && !actions.querySelector('[data-nyx-thermal]')){
        const b=document.createElement('button');b.className='nyx-thermal-btn';b.type='button';b.dataset.nyxThermal='1';
        b.onclick=e=>{e.preventDefault();e.stopPropagation();state.manualMax=!state.manualMax;if(state.manualMax)applyLevel(2,'manuel');else{state.hotHits=0;state.coolHits=10;applyLevel(0,'auto');}updateUi();};
        actions.appendChild(b);
      }
      const side=root.querySelector('.nyx-side');
      if(side && !side.querySelector('[data-thermal-stat]')){
        const row=document.createElement('div');row.className='nyx-stat nyx-thermal-stat';row.innerHTML='<span>Protection iPad</span><strong data-thermal-stat>—</strong>';
        side.insertBefore(row,side.firstChild);
        const note=document.createElement('div');note.className='nyx-thermal-note';note.textContent='Le Web ne peut pas lire la température réelle. NYXCORE réduit automatiquement rendu, IA et évolution quand les signes de charge montent.';row.insertAdjacentElement('afterend',note);
      }
    });
    updateUi();
  }

  document.addEventListener('visibilitychange',()=>{
    if(document.hidden) applyLevel(Math.max(state.level,2),'arrière-plan');
    else {state.coolHits=0;state.hotHits=0;setTimeout(evaluate,1200);}
  });
  window.addEventListener('pagehide',()=>applyLevel(3,'page quittée'));

  const obs=new MutationObserver(installUi);obs.observe(document.documentElement,{childList:true,subtree:true});
  installLagProbe();
  state.uiTimer=setInterval(installUi,1500);
  (async()=>{for(let i=0;i<240;i++){if(engine()){patchBrainQueue();ensureBaseline();installUi();break;}await new Promise(r=>setTimeout(r,50));}})();
  window.__NYXCORE_THERMAL__={state,setLevel:applyLevel,setManualMax(v){state.manualMax=!!v;applyLevel(v?2:0,v?'manuel':'auto');},evaluate};
})();
