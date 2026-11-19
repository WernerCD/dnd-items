/* dnd-shared offline.js v1.0 (canonical copy: WernerCD/dnd shared/offline.js). Copy unchanged to site/offline.js.
 * Makes the site work with no signal (STYLE.md 6h): registers sw.js with this script's own ?v= (the deploy id),
 * so each deploy re-saves the site, then hands the service worker the files this page already loaded.
 * Skipped under automated browsers unless the URL has ?sw=1 (the smoke test's offline check uses that).
 *
 *   DndOffline.supported              -> true when the browser can work offline
 *   DndOffline.saveAll(paths, onStep) -> Promise; saves other D&D Toolbox sites too (the hub's "Save every tool")
 *                                        paths like ['/dnd-items/', ...]; onStep(done, total, path)
 */
(function () {
  var me = document.currentScript, v = me && /[?&]v=([^&]+)/.exec(me.src);
  var ver = v ? v[1] : 'dev';
  var ok = 'serviceWorker' in navigator && (location.protocol === 'https:' || /^(localhost|127\.0\.0\.1)$/.test(location.hostname));
  var allowed = ok && (!navigator.webdriver || /[?&]sw=1\b/.test(location.search));

  function loaded() {
    return performance.getEntriesByType('resource').map(function (e) { return e.name; })
      .filter(function (u) { return u.indexOf(location.origin) === 0; })
      .concat([location.href.split('#')[0]]);
  }
  function register(script, scope) {
    return navigator.serviceWorker.register(script, { scope: scope });
  }
  function whenActive(reg) {
    return new Promise(function (resolve) {
      var w = reg.installing || reg.waiting;
      if (!w) return resolve(reg);
      w.addEventListener('statechange', function () { if (w.state === 'activated' || w.state === 'redundant') resolve(reg); });
    });
  }

  if (allowed) window.addEventListener('load', function () {
    register('sw.js?v=' + ver, './').then(whenActive).then(function (reg) {
      if (reg.active) reg.active.postMessage({ type: 'cache', urls: loaded() });
    }).catch(function () {});
  });

  window.DndOffline = {
    supported: ok,
    saveAll: function (paths, onStep) {
      if (!ok) return Promise.reject(new Error('This browser cannot save pages for offline use.'));
      var n = 0;
      return Promise.all(paths.map(function (p) {
        return register(p + 'sw.js?v=' + ver, p).then(whenActive).catch(function () {}).then(function () { n++; if (onStep) onStep(n, paths.length, p); });
      }));
    }
  };
})();
