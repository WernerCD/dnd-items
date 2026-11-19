/* dnd-shared sw.js v1.0 (canonical copy: WernerCD/dnd shared/sw.js). Copy unchanged to site/sw.js.
 * Offline cache for one D&D Toolbox site (STYLE.md 6h). offline.js registers it as sw.js?v=<deploy id>, so
 * every deploy installs a fresh copy, which saves the whole site again:
 *   - the start page, every same-site file it links to, and the files listed in offline.json (optional)
 *   - pages: network first (3 s), then the saved copy, so you always get the newest page when online
 *   - other same-origin files: saved copy first, refreshed in the background; one copy per file path
 *   - Google Fonts: saved copy first
 */
var SCOPE = self.registration.scope;
var CACHE = 'dnd:' + new URL(SCOPE).pathname;
var FONTS = /^https:\/\/fonts\.(googleapis|gstatic)\.com\//;

function sameOrigin(u) { return new URL(u, SCOPE).origin === self.location.origin; }
function keyOf(u) { var x = new URL(u, SCOPE); return x.origin + x.pathname; }

// store a response, dropping older copies of the same file (other ?v= values)
function put(c, req, res) {
  var url = typeof req === 'string' ? req : req.url;
  if (!res || !(res.ok || res.type === 'opaque')) return Promise.resolve();
  return c.keys().then(function (ks) {
    var k = keyOf(url);
    return Promise.all(ks.filter(function (r) { return r.url !== url && keyOf(r.url) === k && sameOrigin(r.url); }).map(function (r) { return c.delete(r); }));
  }).then(function () { return c.put(url, res); });
}

function warm(extra) {
  return caches.open(CACHE).then(function (c) {
    var urls = {};
    (extra || []).forEach(function (u) { if (sameOrigin(u)) urls[new URL(u, SCOPE).href] = 1; });
    return fetch(SCOPE, { cache: 'no-cache' }).then(function (r) {
      if (!r.ok) return;
      return r.clone().text().then(function (html) {
        html.replace(/(?:src|href)="([^"#]+)"/g, function (m, u) {
          var x = new URL(u.replace(/&amp;/g, '&'), SCOPE);
          if (x.href.indexOf(SCOPE) === 0) urls[x.href] = 1;
        });
        return put(c, SCOPE, r);
      });
    }).then(function () {
      return fetch(SCOPE + 'offline.json', { cache: 'no-cache' }).then(function (r) { return r.ok ? r.json() : []; }).catch(function () { return []; });
    }).then(function (list) {
      (list || []).forEach(function (u) { urls[new URL(u, SCOPE).href] = 1; });
      delete urls[SCOPE];
      return Promise.all(Object.keys(urls).map(function (u) {
        return fetch(u).then(function (r) { return put(c, u, r); }).catch(function () {});
      }));
    });
  });
}

self.addEventListener('install', function (e) {
  self.skipWaiting();
  e.waitUntil(warm().catch(function () {}));
});
self.addEventListener('activate', function (e) { e.waitUntil(self.clients.claim()); });

// offline.js sends the files the page already loaded, so they are saved even on the very first visit
self.addEventListener('message', function (e) {
  var d = e.data || {};
  if (d.type === 'cache' && d.urls) e.waitUntil(caches.open(CACHE).then(function (c) {
    return Promise.all(d.urls.filter(sameOrigin).map(function (u) {
      return c.match(u).then(function (hit) { return hit || fetch(u).then(function (r) { return put(c, u, r); }); }).catch(function () {});
    }));
  }).then(function () { if (e.source) e.source.postMessage({ type: 'cached', scope: SCOPE }); }));
});

function fromCache(req) {
  return caches.open(CACHE).then(function (c) {
    return c.match(req).then(function (hit) { return hit || c.match(req, { ignoreSearch: true }); });
  });
}

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = req.url;

  if (req.mode === 'navigate') {
    e.respondWith(new Promise(function (resolve) {
      var done = false;
      function fallback() {
        if (done) return;
        fromCache(req).then(function (hit) {
          if (done) return;
          if (hit) { done = true; resolve(hit); return; }
          return caches.open(CACHE).then(function (c) { return c.match(SCOPE); }).then(function (start) { if (!done && start) { done = true; resolve(start); } });
        });
      }
      var t = setTimeout(fallback, 3000);
      fetch(req).then(function (r) {
        clearTimeout(t);
        if (r.ok && url.indexOf(SCOPE) === 0) { var copy = r.clone(); caches.open(CACHE).then(function (c) { put(c, url.split('#')[0], copy); }); }
        if (!done) { done = true; resolve(r); }
      }).catch(function () {
        clearTimeout(t); fallback();
        setTimeout(function () { if (!done) { done = true; resolve(Response.error()); } }, 4000);
      });
    }));
    return;
  }

  if (sameOrigin(url) || FONTS.test(url)) {
    e.respondWith(caches.open(CACHE).then(function (c) {
      return c.match(req).then(function (hit) {
        var net = fetch(req).then(function (r) { put(c, url, r.clone()); return r; });
        if (hit) { if (!FONTS.test(url)) e.waitUntil(net.catch(function () {})); return hit; }
        return net.catch(function () { return c.match(req, { ignoreSearch: true }).then(function (old) { return old || Response.error(); }); });
      });
    }));
  }
});
