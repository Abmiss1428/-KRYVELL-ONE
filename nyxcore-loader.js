/* NYXCORE SMART LOADER v1.3.0 — KRYVELL OS 0.8.8 */
(() => {
  'use strict';
  if (window.KryvellNyxLoader) return;
  const VERSION='0.8.8';
  const LIFE=`/nyxcore-life.js?v=${VERSION}`;
  const EXTRAS=[
    `/nyxcore-speed.js?v=${VERSION}`,
    `/nyxcore-thermal.js?v=${VERSION}`,
    `/nyxcore-visuals.js?v=${VERSION}`,
    `/nyxcore-hybrid.js?v=${VERSION}`,
    `/nyxcore-vision.js?v=${VERSION}`,
    `/nyxcore-voice.js?v=${VERSION}`,
    `/nyxcore-mobile-controls.js?v=${VERSION}`
  ];
  let coreLoading=null,extrasLoading=null,ambientRaf=0,ambientLast=0,ambientRunning=false,dots=[];
  const isReal=()=>Boolean(window.KryvellNyxcore&&!window.KryvellNyxcore.__lazyStub);
  const readyFor=src=>{
    if(src.includes('nyxcore-life')) return isReal();
    if(src.includes('nyxcore-speed')) return Boolean(window.__NYXCORE_SPEED__);
    if(src.includes('nyxcore-thermal')) return Boolean(window.__NYXCORE_THERMAL__);
    if(src.includes('nyxcore-visuals')) return Boolean(window.__NYXCORE_VISUAL_MATRIX__);
    if(src.includes('nyxcore-hybrid')) return Boolean(window.__NYXCORE_HYBRID__);
    if(src.includes('nyxcore-vision')) return Boolean(window.__NYXCORE_VISION__);
    if(src.includes('nyxcore-voice')) return Boolean(window.__NYXCORE_VOICE__);
    if(src.includes('nyxcore-mobile-controls')) return Boolean(window.__NYXCORE_MOBILE_CONTROLS__);
    return false;
  };
  function loadScript(src,timeoutMs=8000){
    if(readyFor(src)) return Promise.resolve();
    return new Promise((resolve,reject)=>{
      let settled=false;
      let timer=null;
      const done=(err)=>{
        if(settled)return;
        settled=true;
        if(timer)clearTimeout(timer);
        err?reject(err):resolve();
      };
      const base=src.split('?')[0];
      const existing=[...document.scripts].find(s=>s.src&&s.src.includes(base));
      timer=setTimeout(()=>{
        if(readyFor(src)) return done();
        done(new Error('load_timeout:'+src));
      },timeoutMs);
      if(existing){
        if(readyFor(src)||existing.dataset.nyxLoaded==='1'||existing.readyState==='complete') return done();
        existing.addEventListener('load',()=>{existing.dataset.nyxLoaded='1';done();},{once:true});
        existing.addEventListener('error',()=>done(new Error('load_failed:'+src)),{once:true});
        return;
      }
      const s=document.createElement('script');
      s.src=src;s.async=false;s.dataset.nyxLazy='1';
      s.onload=()=>{s.dataset.nyxLoaded='1';done();};
      s.onerror=()=>done(new Error('load_failed:'+src));
      document.head.appendChild(s);
    });
  }
  function resize(canvas){
    const r=canvas.getBoundingClientRect();
    const dpr=Math.min(window.devicePixelRatio||1,1.5);
    const w=Math.max(1,Math.round(r.width*dpr)),h=Math.max(1,Math.round(r.height*dpr));
    if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}
    return {w,h};
  }
  function seed(w,h){
    const count=Math.max(70,Math.min(180,Math.round((w*h)/9000)));
    dots=Array.from({length:count},(_,i)=>({x:Math.random()*w,y:Math.random()*h,vx:(Math.random()-.5)*.11,vy:(Math.random()-.5)*.11,r:.7+Math.random()*1.6,hue:(i*47+Math.random()*55)%360,phase:Math.random()*Math.PI*2}));
  }
  function drawAmbient(t){
    if(!ambientRunning)return;
    const canvas=document.getElementById('lifeCanvas');
    if(!canvas){ambientRaf=requestAnimationFrame(drawAmbient);return;}
    if(t-ambientLast<80){ambientRaf=requestAnimationFrame(drawAmbient);return;}
    ambientLast=t;
    const {w,h}=resize(canvas);if(!dots.length)seed(w,h);
    const ctx=canvas.getContext('2d',{alpha:false});ctx.fillStyle='#07070a';ctx.fillRect(0,0,w,h);
    ctx.strokeStyle='rgba(125,20,45,.10)';ctx.lineWidth=1;
    for(let x=0;x<w;x+=56){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,h);ctx.stroke();}
    for(let y=0;y<h;y+=56){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(w,y);ctx.stroke();}
    for(const d of dots){
      d.x+=d.vx;d.y+=d.vy;d.phase+=.05;
      if(d.x<0)d.x=w;if(d.x>w)d.x=0;if(d.y<0)d.y=h;if(d.y>h)d.y=0;
      ctx.beginPath();ctx.arc(d.x,d.y,d.r*(1+Math.sin(d.phase)*.18),0,Math.PI*2);
      ctx.fillStyle=`hsla(${d.hue},78%,62%,.80)`;ctx.fill();
    }
    ctx.fillStyle='rgba(225,215,219,.60)';
    ctx.font='700 9px ui-monospace,SFMono-Regular,Menlo,monospace';
    ctx.fillText('NYXCORE · PREVIEW LÉGER',14,h-14);
    ambientRaf=requestAnimationFrame(drawAmbient);
  }
  function startAmbient(){if(ambientRunning||isReal())return;ambientRunning=true;ambientRaf=requestAnimationFrame(drawAmbient);}
  function stopAmbient(){ambientRunning=false;if(ambientRaf)cancelAnimationFrame(ambientRaf);ambientRaf=0;dots=[];}
  async function ensureCore(){
    if(isReal()) return window.KryvellNyxcore;
    if(coreLoading) return coreLoading;
    stopAmbient();
    coreLoading=(async()=>{
      await loadScript(LIFE,9000);
      const started=Date.now();
      while(!isReal()&&Date.now()-started<5000) await new Promise(r=>setTimeout(r,40));
      if(!isReal()) throw new Error('nyxcore_life_not_ready');
      const migrationKey='nyxcore:migration:0.8.8-resume';
      if(!localStorage.getItem(migrationKey)){
        try{
          localStorage.removeItem('nyxcore:safeMode');
          window.KryvellNyxcore?.start?.();
          localStorage.setItem(migrationKey,'1');
        }catch{}
      }
      return window.KryvellNyxcore;
    })().catch(err=>{coreLoading=null;startAmbient();throw err;});
    return coreLoading;
  }
  function loadExtras(){
    if(extrasLoading) return extrasLoading;
    extrasLoading=(async()=>{
      const errors=[];
      for(const src of EXTRAS){
        try{await loadScript(src,7000);}
        catch(err){errors.push(String(err?.message||err));console.warn('[NYX LOADER]',err);}
      }
      window.dispatchEvent(new CustomEvent('nyxcore:extras-ready',{detail:{errors}}));
      return {errors};
    })();
    return extrasLoading;
  }
  async function ensureFull(){
    const real=await ensureCore();
    loadExtras();
    return real;
  }
  function prefetchWhenIdle(){
    if(!navigator.onLine||isReal())return;
    const run=()=>{
      if('connection'in navigator&&(navigator.connection?.saveData||/2g/.test(navigator.connection?.effectiveType||'')))return;
      [LIFE,...EXTRAS.slice(0,1)].forEach(src=>{
        const l=document.createElement('link');
        l.rel='prefetch';l.as='script';l.href=src;
        document.head.appendChild(l);
      });
    };
    if('requestIdleCallback'in window)requestIdleCallback(run,{timeout:5000});else setTimeout(run,3500);
  }
  startAmbient();
  window.KryvellNyxcore={
    __lazyStub:true,
    version:'lazy',
    render(mount){
      if(!mount)return;
      mount.innerHTML='<div style="min-height:260px;display:grid;place-items:center;background:#09090c;color:#f3f3f5;font:700 13px system-ui;text-align:center;padding:24px">🧬 Chargement du moteur vivant…<br><small style="font-weight:500;color:#aaa;margin-top:8px">La vie locale démarre avant les modules optionnels.</small></div>';
      ensureCore().then(real=>{real.render?.(mount);loadExtras();}).catch(()=>{
        mount.innerHTML='<div style="padding:24px;color:#ff8aa0">NYXCORE LIFE n’a pas pu démarrer. Aucune donnée locale n’a été supprimée.</div>';
      });
    },
    stats(){return null;}
  };
  window.addEventListener('resize',()=>{dots=[];},{passive:true});
  document.addEventListener('visibilitychange',()=>{if(document.hidden)stopAmbient();else if(!isReal())startAmbient();});
  window.addEventListener('load',prefetchWhenIdle,{once:true});
  window.KryvellNyxLoader={version:VERSION,ensureCore,ensureFull,loadExtras,startAmbient,stopAmbient,get loading(){return Boolean(coreLoading);}};
})();