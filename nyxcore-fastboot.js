/* NYXCORE FASTBOOT v1.0.0 — KRYVELL OS 0.8.9
 * Goal: make NYXCORE feel instant without resetting or touching IndexedDB.
 * - warms browser cache for LIFE + essential UI/AI modules
 * - starts LIFE on first NYX intent (touch/pointer), before click finishes
 * - keeps the living engine in the KRYVELL OS page so reopening NYX does not reload the page
 */
(() => {
  'use strict';
  if(window.KryvellNyxFastBoot) return;

  const VERSION='0.8.9';
  const ASSETS=[
    `/nyxcore-life.js?v=${VERSION}`,
    `/nyxcore-speed.js?v=${VERSION}`,
    `/nyxcore-visuals.js?v=${VERSION}`,
    `/nyxcore-hybrid.js?v=${VERSION}`,
    `/nyxcore-voice.js?v=${VERSION}`,
    `/nyxcore-mobile-controls.js?v=${VERSION}`,
    `/nyxcore-vision.js?v=${VERSION}`,
    `/nyxcore-thermal.js?v=${VERSION}`
  ];
  let warmed=false;
  let starting=null;

  async function warm(){
    if(warmed) return true;
    warmed=true;
    // Download only; do not execute the modules yet.
    // This makes later script insertion use the HTTP/SW cache immediately.
    await Promise.allSettled(ASSETS.map(url=>fetch(url,{cache:'force-cache',credentials:'same-origin'})));
    return true;
  }

  function start(){
    if(starting) return starting;
    const loader=window.KryvellNyxLoader;
    if(!loader?.ensureCore) return Promise.resolve(null);
    starting=loader.ensureCore().catch(err=>{
      console.warn('[NYX FASTBOOT]',err);
      starting=null;
      return null;
    });
    return starting;
  }

  function bindIntent(){
    const handler=e=>{
      const target=e.target?.closest?.('[data-app="nyxcore"],[data-launch="nyxcore"]');
      if(!target) return;
      start();
    };
    document.addEventListener('pointerdown',handler,{passive:true,capture:true});
    document.addEventListener('touchstart',handler,{passive:true,capture:true});
  }

  function idleWarm(){
    const go=()=>warm();
    if('requestIdleCallback' in window) requestIdleCallback(go,{timeout:1200});
    else setTimeout(go,450);
  }

  bindIntent();
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',idleWarm,{once:true});
  else idleWarm();

  window.KryvellNyxFastBoot={version:'1.0.0',warm,start,get starting(){return Boolean(starting);}};
})();