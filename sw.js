var CACHE = 'rotina-v3-enc-2026-06-30';

var PRECACHE = [
  './',
  './index.html',
  './marked.min.js',
  './crypto-config.json',
  './manifest.json',
  './icon.svg',
  './data/manifest.enc.json',
  './data/serie-academia.enc.json',
  './data/plano-nutricional.enc.json',
  './data/rotina-pedaladas.enc.json',
  './data/dados-saude.enc.json',
  './data/parecer-multidisciplinar.enc.json',
  './data/laudos-medicos.enc.json',
  './data/laudo-ultra-tireoide.enc.json',
  './data/laudo-paaf-tireoide.enc.json',
  './data/dermatologia.enc.json',
  './data/changelog.enc.json',
  './data/bio-2025-08-24.enc.json',
  './data/bio-2026-02-08.enc.json',
  './data/bio-2026-02-22.enc.json',
  './data/bio-2026-03-08.enc.json',
  './data/bio-2026-04-04.enc.json'
];

self.addEventListener('install', function(e) {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE).then(function(cache) {
      return cache.addAll(PRECACHE);
    }).catch(function() {})
  );
});

self.addEventListener('activate', function(e) {
  e.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(
        keys.filter(function(k) { return k !== CACHE; })
            .map(function(k) { return caches.delete(k); })
      );
    }).then(function() {
      return self.clients.claim();
    })
  );
});

self.addEventListener('fetch', function(e) {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request).then(function(response) {
      var clone = response.clone();
      caches.open(CACHE).then(function(cache) {
        cache.put(e.request, clone);
      });
      return response;
    }).catch(function() {
      return caches.match(e.request);
    })
  );
});
