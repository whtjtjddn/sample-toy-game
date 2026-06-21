// 네온 테트리스 PWA service worker
const CACHE = 'neon-tetris-v8';

// 앱 셸: 설치 시 미리 캐시 (오프라인에서 솔로 플레이 가능)
const APP_SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './mqtt.min.js',
  './icon-180.png',
  './icon-192.png',
  './icon-512.png',
  './icon-512-maskable.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(APP_SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // MQTT 브로커(wss) 등 실시간 통신은 절대 캐시하지 않음
  if (url.protocol === 'ws:' || url.protocol === 'wss:') return;
  if (url.hostname.includes('emqx')) return;

  // 랭킹 API는 항상 네트워크 (캐시 금지 → 최신 순위 반영)
  if (url.origin === self.location.origin && url.pathname.startsWith('/api/')) return;

  // 구글 폰트: 런타임 캐시 (cache-first, 백그라운드 갱신)
  if (url.hostname.includes('fonts.googleapis.com') || url.hostname.includes('fonts.gstatic.com')) {
    e.respondWith(
      caches.open(CACHE).then(async (cache) => {
        const cached = await cache.match(req);
        const network = fetch(req).then((res) => {
          if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone());
          return res;
        }).catch(() => cached);
        return cached || network;
      })
    );
    return;
  }

  // 앱 셸 동일 출처: cache-first, 네트워크 폴백
  if (url.origin === self.location.origin) {
    e.respondWith(
      caches.match(req).then((cached) => {
        return cached || fetch(req).then((res) => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        }).catch(() => caches.match('./index.html'));
      })
    );
  }
});
