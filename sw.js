const CACHE='kryvell-os-v0.6.1';
const SHELL=['/','/index.html','/kryvell-os.css','/kryvell-os.js','/nyxcore-life.js','/nyxcore-hybrid.js','/nyxcore-voice.js','/nyxcore-mobile-controls.js','/fusion-core.css','/fusion-core.js','/boot-fallback.js','/manifest.webmanifest','/kryvell-icon.svg','/kryvell-one.html','/styles.css','/app.js','/owner-session.js','/owner-session.css','/phone-auth.js','/phone-auth.css','/data-core-client.js','/nexcreate-plan.js'];
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(SHELL)).then(()=>self.skipWaiting()));});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));});
self.addEventListener('fetch',event=>{
  const req=event.request;
  if(req.method!=='GET')return;
  const url=new URL(req.url);
  if(url.pathname.startsWith('/api/')){event.respondWith(fetch(req));return;}
  if(req.mode==='navigate'){
    event.respondWith(fetch(req).then(res=>{const copy=res.clone();caches.open(CACHE).then(c=>c.put(req,copy));return res;}).catch(()=>caches.match(req).then(r=>r||caches.match('/index.html'))));
    return;
  }
  event.respondWith(caches.match(req).then(cached=>cached||fetch(req).then(res=>{if(res.ok&&url.origin===self.location.origin){const copy=res.clone();caches.open(CACHE).then(c=>c.put(req,copy));}return res;})));
});
