/* KRYVELL OS — SERVICE WORKER · réseau d'abord
 *
 * Avant : le cache était servi AVANT le réseau et précachait des URL figées
 * (/nyxcore-safe.html?v=0.8.9). Après un déploiement, l'iPad continuait donc
 * d'exécuter l'ancien code tant que le nom du cache n'était pas changé à la main.
 *
 * Maintenant : en ligne → toujours la version fraîche. Hors ligne → dernière
 * version connue. Plus aucune version à éditer nulle part.
 *
 * Ce fichier ne touche QUE le cache HTTP. Ni IndexedDB, ni localStorage, ni la
 * population NYXCORE. Aucun RESET possible.
 */

const CACHE = 'kryvell-os';
const TIMEOUT = 3500;

/* Filet hors ligne uniquement — sans ?v=, car la fraîcheur vient du réseau. */
const SHELL = [
  '/', '/index.html', '/manifest.webmanifest', '/kryvell-icon.svg',
  '/kryvell-os.css', '/kryvell-os.js', '/boot-fallback.js',
  '/phone-auth.css', '/phone-auth.js',
  '/fusion-core.css', '/fusion-core.js',
  '/agentic-core.css', '/agentic-core.js', '/data-core-client.js',
  '/nyxcore-safe.html', '/nyxcore-loader.js', '/nyxcore-life.js',
  '/nyxcore-buttons.js', '/nyxcore-visuals.js', '/nyxcore-speed.js',
  '/nyxcore-thermal.js', '/nyxcore-nextral.js', '/nyxcore-hybrid.js', '/nyxcore-vision.js',
  '/nyxcore-voice.js', '/nyxcore-mobile-controls.js'
];

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    for (const u of SHELL) {
      try { await c.add(new Request(u, { cache: 'reload' })); } catch (_) {}
    }
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    /* Supprime les anciens caches versionnés (kryvell-os-v0.8.9, etc.). */
    try {
      const keys = await caches.keys();
      await Promise.all(
        keys.filter(k => k.startsWith('kryvell-os-v')).map(k => caches.delete(k))
      );
    } catch (_) {}
    await self.clients.claim();
  })());
});

/* Renvoie null si le réseau n'a pas répondu à temps, au lieu de bloquer. */
function raceNetwork(req) {
  return new Promise(resolve => {
    let done = false;
    const end = v => { if (!done) { done = true; resolve(v); } };
    setTimeout(() => end(null), TIMEOUT);
    fetch(req).then(end, () => end(null));
  });
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname.startsWith('/api/')) {
    e.respondWith(fetch(req));
    return;
  }

  e.respondWith((async () => {
    /* RÉSEAU D'ABORD — c'est ce qui fait apparaître tes modifications. */
    const fresh = await raceNetwork(req);
    if (fresh) {
      if (fresh.ok && fresh.type === 'basic' && !fresh.redirected) {
        const copy = fresh.clone();
        caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {});
      }
      return fresh;
    }

    /* Hors ligne → dernière copie connue. On réessaie en ignorant la
       chaîne ?v=, pour retrouver le fichier même si le HTML en demande
       une version précise. */
    const c = await caches.open(CACHE);
    const hit = (await c.match(req)) || (await c.match(req, { ignoreSearch: true }));
    if (hit) return hit;

    if (req.mode === 'navigate') {
      const shell = (await c.match('/index.html')) || (await c.match('/'));
      if (shell) return shell;
    }

    try {
      return await fetch(req);
    } catch (_) {
      return new Response('Hors ligne — ressource indisponible.', {
        status: 503,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' }
      });
    }
  })());
});
