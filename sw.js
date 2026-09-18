const CACHE='kryvell-os-v0.8.9';
const CORE=[
  '/','/index.html',
  '/kryvell-os.css?v=0.8.9','/kryvell-os.js?v=0.8.9',
  '/phone-auth.css?v=0.8.9','/phone-auth.js?v=0.8.9',
  '/fusion-core.css?v=0.8.9','/fusion-core.js?v=0.8.9',
  '/agentic-core.css?v=0.8.9','/agentic-core.js?v=0.8.9',
  '/data-core-client.js?v=0.8.9','/boot-fallback.js?v=0.8.9',
  '/manifest.webmanifest','/kryvell-icon.svg',
  '/nyxcore-safe.html?v=0.8.9','/nyxcore-loader.js?v=0.8.9',
  '/nyxcore-life.js?v=0.8.9','/nyxcore-speed.js?v=0.8.9',
  '/nyxcore-thermal.js?v=0.8.9','/nyxcore-visuals.js?v=0.8.9',
  '/nyxcore-hybrid.js?v=0.8.9','/nyxcore-vision.js?v=0.8.9',
  '/nyxcore-voice.js?v=0.8.9','/nyxcore-mobile-controls.js?v=0.8.9'
];
self.addEventListener('install',event=>{
  event.waitUntil(caches.open(CACHE).then(async cache=>{
    for(const url of CORE){try{await cache.add(url);}catch{}}
  }).then(()=>self.skipWaiting()));
});
self.addEventListener('activate',event=>{
  event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));
});
self.addEventListener('fetch',event=>{
  const req=event.request;if(req.method!=='GET')return;
  const url=new URL(req.url);
  if(url.pathname.startsWith('/api/')){event.respondWith(fetch(req));return;}
  if(req.mode==='navigate'){
    event.respondWith(fetch(req).then(res=>{const copy=res.clone();caches.open(CACHE).then(c=>c.put(req,copy));return res;}).catch(()=>caches.match(req).then(r=>r||caches.match('/index.html'))));
    return;
  }
  event.respondWith(caches.open(CACHE).then(async cache=>{
    const cached=await cache.match(req);
    const network=fetch(req).then(res=>{if(res.ok&&url.origin===self.location.origin)cache.put(req,res.clone());return res;}).catch(()=>null);
    if(cached){event.waitUntil(network);return cached;}
    return (await network)||Response.error();
  }));
});