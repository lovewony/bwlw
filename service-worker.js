// BWLW 서비스 워커 — 홈화면 앱(PWA) 구동
// 핵심: 화면(HTML)은 "항상 최신"으로 가져옵니다. 옛날 화면/끝난 딜이 남지 않게요.
var CACHE = "bwlw-v3";
var SHELL = ["./manifest.json", "./icon-192.png", "./icon-512.png", "./og-image.png"];

self.addEventListener("install", function (e) {
  e.waitUntil(
    caches.open(CACHE)
      .then(function (c) { return c.addAll(SHELL).catch(function () {}); })
      .then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener("activate", function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) { if (k !== CACHE) return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener("fetch", function (e) {
  var req = e.request;
  if (req.method !== "GET") return;
  var url = new URL(req.url);

  // 1) 딜 데이터는 절대 캐시하지 않음 — 항상 최신 (끝난 딜이 남지 않게)
  if (url.pathname.indexOf("/.netlify/functions/") > -1) {
    e.respondWith(
      fetch(req).catch(function () {
        return new Response('{"deals":[]}', { headers: { "Content-Type": "application/json" } });
      })
    );
    return;
  }

  // 2) 화면(HTML)은 네트워크 우선 — 새 버전 올리면 바로 반영
  var isHtml = req.mode === "navigate" ||
               (req.headers.get("accept") || "").indexOf("text/html") > -1;
  if (isHtml) {
    e.respondWith(
      fetch(req)
        .then(function (res) {
          if (res && res.status === 200 && url.origin === location.origin) {
            var copy = res.clone();
            caches.open(CACHE).then(function (c) { c.put(req, copy); });
          }
          return res;
        })
        .catch(function () {
          return caches.match(req).then(function (hit) {
            return hit || caches.match("./index.html");
          });
        })
    );
    return;
  }

  // 3) 아이콘·이미지는 캐시 우선 (빠르게)
  e.respondWith(
    caches.match(req).then(function (hit) {
      return hit || fetch(req).then(function (res) {
        if (res && res.status === 200 && url.origin === location.origin) {
          var copy = res.clone();
          caches.open(CACHE).then(function (c) { c.put(req, copy); });
        }
        return res;
      });
    })
  );
});

// 새 버전 즉시 적용 요청 받기
self.addEventListener("message", function (e) {
  if (e.data && e.data.type === "SKIP_WAITING") self.skipWaiting();
});
