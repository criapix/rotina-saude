// Service Worker — cache offline do shell público + dos blobs cifrados.
//
// Estratégia:
//   - shell (HTML/CSS/JS/ícones): stale-while-revalidate — abre rápido e
//     atualiza em segundo plano.
//   - data/*.enc.json e crypto-config.json: network-first com fallback ao
//     cache, para uma edição publicada aparecer assim que houver rede.
//
// O cache guarda apenas ciphertext dos documentos — a chave nunca é cacheada
// (fica no localStorage do dispositivo).

const VERSAO = 'rotina-v5-2026-07-30';
const CACHE_SHELL = `${VERSAO}-shell`;
const CACHE_DADOS = `${VERSAO}-dados`;

const SHELL = [
  './',
  './index.html',
  './manifest.json',
  './icon.svg',
  './app/styles.css',
  './app/main.js',
  './app/crypto.js',
  './app/store.js',
  './app/ui.js',
  './app/charts.js',
  './app/views/hoje.js',
  './app/views/treino.js',
  './app/views/pedal.js',
  './app/views/nutricao.js',
  './app/views/saude.js',
  './app/views/mais.js'
];

const ehDado = (url) =>
  url.pathname.endsWith('/crypto-config.json') || url.pathname.includes('/data/');

// Cacheia item por item: `cache.addAll` é atômico e um único recurso ausente
// descartaria o lote inteiro, deixando o app sem cache offline.
async function cachearCadaUm(cache, urls) {
  const r = await Promise.allSettled(urls.map((u) => cache.add(u)));
  const falhas = r.map((x, i) => (x.status === 'rejected' ? urls[i] : null)).filter(Boolean);
  if (falhas.length) console.warn('[sw] não cacheado:', falhas.join(', '));
}

self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil((async () => {
    await cachearCadaUm(await caches.open(CACHE_SHELL), SHELL);

    // Pré-cacheia os documentos listados no índice público.
    try {
      const r = await fetch('data/index.json', { cache: 'no-cache' });
      const { documentos } = await r.json();
      await cachearCadaUm(await caches.open(CACHE_DADOS), [
        'data/index.json', 'crypto-config.json', ...documentos.map((s) => `data/${s}.enc.json`)
      ]);
    } catch { /* segue sem pré-cache de dados */ }
  })());
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const manter = new Set([CACHE_SHELL, CACHE_DADOS]);
    for (const k of await caches.keys()) {
      if (!manter.has(k)) await caches.delete(k);
    }
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (ehDado(url)) {
    // network-first: prioriza a versão publicada mais recente
    e.respondWith((async () => {
      try {
        const resp = await fetch(req);
        if (resp.ok) {
          (await caches.open(CACHE_DADOS)).put(req, resp.clone());
          return resp;
        }
        // 404/5xx (portal cativo, deploy pela metade) não é motivo para
        // descartar um ciphertext válido que já está em cache.
        const cacheado = await caches.match(req);
        return cacheado || resp;
      } catch {
        const cacheado = await caches.match(req);
        if (cacheado) return cacheado;
        throw new Error('offline e sem cache: ' + url.pathname);
      }
    })());
    return;
  }

  // stale-while-revalidate para o shell
  e.respondWith((async () => {
    const cache = await caches.open(CACHE_SHELL);
    const cacheado = await cache.match(req, { ignoreSearch: true });
    const rede = fetch(req).then((resp) => {
      if (resp.ok) cache.put(req, resp.clone());
      return resp;
    }).catch(() => null);

    if (cacheado) {
      // O evento pode já não estar mais em despacho quando chegamos aqui; nesse
      // caso waitUntil lança e a revalidação segue sem prolongar o SW.
      try { e.waitUntil(rede); } catch { /* revalidação continua em background */ }
      return cacheado;
    }
    const resp = await rede;
    if (resp) return resp;
    // navegação offline sem cache do recurso: cai para o index
    if (req.mode === 'navigate') {
      const index = await cache.match('./index.html');
      if (index) return index;
    }
    throw new Error('offline e sem cache: ' + url.pathname);
  })());
});
