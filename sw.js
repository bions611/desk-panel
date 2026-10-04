/* 日常生活工作台 · Service Worker
 * 策略：网络优先，网络失败回退缓存（不做 cache-first）。
 * /api/ 开头的请求一律放行、绝不缓存。
 * 跨域请求一律放行、不处理。
 */
var CACHE_NAME = "panel-v2";

var PRECACHE_URLS = [
  "./",
  "./index.html",
  "./merge.js",
  "./manifest.json",
  "./icon-192.png",
  "./icon-512.png"
];

self.addEventListener("install", function (event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function (cache) {
      return Promise.all(
        PRECACHE_URLS.map(function (url) {
          return cache.add(url).catch(function (err) {
            console.warn("[sw] precache failed:", url, err);
          });
        })
      );
    })
  );
});

self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(
        keys.map(function (key) {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    }).then(function () {
      return self.clients.claim();
    })
  );
});

self.addEventListener("fetch", function (event) {
  var req = event.request;
  if (req.method !== "GET") return;

  var url;
  try {
    url = new URL(req.url);
  } catch (e) {
    return;
  }
  if (url.origin !== self.location.origin) return;
  if (url.pathname.indexOf("/api/") === 0) return;

  event.respondWith(
    fetch(req).then(function (resp) {
      if (resp && resp.ok) {
        var copy = resp.clone();
        caches.open(CACHE_NAME).then(function (cache) {
          cache.put(req, copy);
        });
      }
      return resp;
    }).catch(function () {
      return caches.match(req).then(function (cached) {
        if (cached) return cached;
        return caches.match("./index.html");
      });
    })
  );
});
