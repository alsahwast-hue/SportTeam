const CACHE = 'court-booking-v3';   // ← رفعنا الرقم لإجبار المتصفح على تحديث الـ SW
const ASSETS = [
  './', './index.html', './manifest.json',
  './icon-192.png', './icon-512.png', './soccer_ball.gif'
];

/* تخزين كل ملف على حدة: فشل ملف واحد لا يُفشل البقية */
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c =>
      Promise.allSettled(ASSETS.map(a =>
        c.add(new Request(a, { cache: 'reload' }))
          .catch(err => console.warn('SW: تعذّر تخزين', a, err))
      ))
    )
  );
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

function fetchWithTimeout(req, ms) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout')), ms);
    fetch(req).then(
      r => { clearTimeout(t); resolve(r); },
      err => { clearTimeout(t); reject(err); }
    );
  });
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // لا نخزّن طلبات السيرفر (Google Apps Script)
  if (url.hostname.includes('script.google.com') ||
      url.hostname.includes('googleusercontent.com')) return;

  // فتح الصفحة: الشبكة أولاً بمهلة 3 ثوانٍ، ثم الكاش
  if (req.mode === 'navigate') {
    e.respondWith(
      fetchWithTimeout(req, 3000)
        .then(res => {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put('./index.html', copy));
          return res;
        })
        .catch(() => caches.match('./index.html'))
    );
    return;
  }

  // باقي الملفات (الكرة، الأيقونات، الخطوط...): الكاش أولاً ثم تحديث بالخلفية
  e.respondWith(
    caches.match(req, { ignoreSearch: true }).then(cached => {
      const network = fetch(req)
        .then(res => {
          if (res && (res.ok || res.type === 'opaque')) {
            const copy = res.clone();
            caches.open(CACHE).then(c => c.put(req, copy));
          }
          return res;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
