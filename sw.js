/* HMD Neo · Hijo de Madre Diabética — service worker
   Cambia VERSION en cada actualización del index.html para forzar la recarga en los iPhone. */
const VERSION = 'hmd-neo-v1.0.0';
const CORE = ['./', './index.html'];
const FONT_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com'];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(VERSION);
    // Se agregan uno por uno: si alguno falla, la instalación no se cae.
    await Promise.all(CORE.map((url) =>
      fetch(new Request(url, { cache: 'reload' }))
        .then((res) => { if (res.ok) return cache.put(url, res); })
        .catch(() => {})
    ));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k.startsWith('hmd-neo-') && k !== VERSION).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

// Respuesta con tiempo límite: si la red tarda, se sirve la caché (evita la pantalla "cargando" eterna).
function timeout(ms) { return new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms)); }

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // 1) Navegación (abrir la app): red con límite de 3 s → caché → index.html en caché.
  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      const cache = await caches.open(VERSION);
      try {
        const res = await Promise.race([fetch(req), timeout(3000)]);
        if (res && res.ok) { cache.put('./index.html', res.clone()); return res; }
        throw new Error('bad');
      } catch (e) {
        return (await cache.match('./index.html')) ||
               (await cache.match('./')) ||
               (await caches.match(req, { ignoreSearch: true })) ||
               new Response('<h1>Sin conexión</h1><p>Abre la app una vez con internet para guardarla.</p>',
                            { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
      }
    })());
    return;
  }

  // 2) Fuentes de Google: caché primero, actualización en segundo plano.
  if (FONT_HOSTS.includes(url.hostname)) {
    event.respondWith((async () => {
      const cache = await caches.open(VERSION);
      const hit = await cache.match(req);
      const net = fetch(req).then((res) => { if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone()); return res; }).catch(() => null);
      return hit || (await net) || new Response('', { status: 504 });
    })());
    return;
  }

  // 3) Mismo origen: caché primero, luego red.
  if (url.origin === self.location.origin) {
    event.respondWith((async () => {
      const cache = await caches.open(VERSION);
      const hit = await cache.match(req, { ignoreSearch: true });
      if (hit) return hit;
      try {
        const res = await fetch(req);
        if (res && res.ok) cache.put(req, res.clone());
        return res;
      } catch (e) {
        return new Response('', { status: 504 });
      }
    })());
  }
});
