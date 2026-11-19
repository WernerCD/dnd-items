/* dnd-shared ui.js v1.0 (canonical copy: WernerCD/dnd shared/ui.js). Copy unchanged to site/ui.js.
 * Small motion layer for the D&D Toolbox sites, built on Motion (motion.dev, MIT; site/motion.js, the UMD build).
 * Load order:  <script src="motion.js?v=dev" defer></script> <script src="ui.js?v=dev" defer></script>
 * Everything is optional: without Motion, or with "reduce motion" set, content just shows, unanimated.
 *
 * Markup hooks (no JS needed in the site):
 *   data-reveal      on a container: its children fade and rise in, staggered, when they scroll into view
 *   data-spot        on a card: a soft light follows the pointer (CSS var --mx/--my), Kokonut-style
 * API (window.DndUI):
 *   reveal(root)     re-scan root (default document) for [data-reveal], e.g. after rendering a list
 *   enter(el)        animate a newly added element in (a toast, a dialog, a new card)
 *   pop(el)          a short attention pulse (for example on "Link copied")
 *   count(el, to, fmt?)  tween the number shown in el up or down to `to`
 *   reduced          true when the reader asked for reduced motion
 */
(function () {
  var M = function () { return window.Motion || null; };
  var reduced = false;
  try { reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { /* old browser */ }
  var root = document.documentElement;
  if (!reduced) root.classList.add('ui-anim');
  // never leave content hidden: if Motion fails to load, show everything after a moment
  var safety = setTimeout(function () { root.classList.remove('ui-anim'); }, 2500);

  var seen = typeof WeakSet === 'function' ? new WeakSet() : { has: function () { return false; }, add: function () {} };
  function show(els) { els.forEach(function (el) { el.style.opacity = ''; el.style.transform = ''; el.classList.add('ui-in'); }); }

  function reveal(scope) {
    var conts = (scope || document).querySelectorAll('[data-reveal]');
    var m = M();
    Array.prototype.forEach.call(conts, function (c) {
      var kids = Array.prototype.filter.call(c.children, function (k) { return !seen.has(k); });
      if (!kids.length) return;
      kids.forEach(function (k) { seen.add(k); });
      // only the first batch animates; re-renders of the same list just show (no flicker on every change)
      var again = c.hasAttribute('data-revealed'); c.setAttribute('data-revealed', '');
      if (again || reduced || !m || !m.animate) { show(kids); return; }
      pending = pending.concat(kids);
    });
    check();
  }
  // reveal what has reached the viewport; anything already scrolled past just shows (a fast scroll never skips one)
  var pending = [], ticking = false;
  function check() {
    ticking = false;
    var m = M(), vh = window.innerHeight || 800, batch = 0;
    pending = pending.filter(function (k) {
      if (!k.isConnected) return false;
      var r = k.getBoundingClientRect();
      if (r.top > vh * 0.92) return true;            // not there yet
      if (r.bottom < 0 || !m) { show([k]); return false; }
      var d = (batch++ % 8) * 0.05;
      m.animate(k, { opacity: [0, 1], y: [14, 0] }, { duration: 0.42, delay: d, ease: [0.22, 1, 0.36, 1] }).then(function () { show([k]); }, function () { show([k]); });
      return false;
    });
  }
  function soon() { if (!ticking && pending.length) { ticking = true; requestAnimationFrame(check); } }
  window.addEventListener('scroll', soon, { passive: true });
  window.addEventListener('resize', soon, { passive: true });

  function enter(el) {
    var m = M(); if (!el || reduced || !m) return;
    m.animate(el, { opacity: [0, 1], y: [-10, 0], scale: [0.98, 1] }, { duration: 0.28, ease: [0.22, 1, 0.36, 1] });
  }
  function pop(el) {
    var m = M(); if (!el || reduced || !m) return;
    m.animate(el, { scale: [1, 1.06, 1] }, { duration: 0.32 });
  }
  function count(el, to, fmt) {
    fmt = fmt || function (v) { return String(Math.round(v)); };
    var from = parseFloat(String(el.textContent).replace(/[^\d.-]/g, '')) || 0, m = M();
    if (reduced || !m || !m.animate || from === to) { el.textContent = fmt(to); return; }
    m.animate(from, to, { duration: 0.45, ease: 'easeOut', onUpdate: function (v) { el.textContent = fmt(v); } });
  }

  // pointer spotlight for [data-spot] cards (pure CSS vars, works without Motion)
  document.addEventListener('pointermove', function (e) {
    var c = e.target && e.target.closest && e.target.closest('[data-spot]'); if (!c) return;
    var r = c.getBoundingClientRect();
    c.style.setProperty('--mx', (e.clientX - r.left) + 'px');
    c.style.setProperty('--my', (e.clientY - r.top) + 'px');
  }, { passive: true });

  function start() {
    clearTimeout(safety);
    if (!M()) { root.classList.remove('ui-anim'); }
    reveal(document);
    // lists a site renders later (or re-renders) inside [data-reveal] are picked up automatically
    if (window.MutationObserver) new MutationObserver(function (recs) {
      for (var i = 0; i < recs.length; i++) {
        var t = recs[i].target, a = recs[i].addedNodes;
        if (t.nodeType === 1 && t.hasAttribute('data-reveal')) { reveal(t.parentNode || document); continue; }
        for (var j = 0; j < a.length; j++) if (a[j].nodeType === 1 && a[j].hasAttribute('data-reveal')) reveal(a[j].parentNode || document);
      }
    }).observe(document.body, { childList: true, subtree: true });
  }
  window.DndUI = { reveal: reveal, enter: enter, pop: pop, count: count, reduced: reduced };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
