/* dnd-shared version check v1: tells a long-open tab that a newer version of the site is live.
   Load it on every page, after theme.js:  <script src="version.js?v=dev"></script>
   CI already stamps ?v=dev with the commit id, so this script knows which build it belongs to.
   It re-fetches the page (bypassing the cache) when the tab becomes visible again and every
   15 minutes, and if the live page links a different build it shows a small Reload bar.
   On a local copy (?v=dev) it does nothing. No settings, no per-site edits. */
(function () {
  var me = document.currentScript && document.currentScript.src;
  var built = me ? new URL(me).searchParams.get('v') : null;
  if (!built || built === 'dev' || !window.fetch) return;

  var CHECK_EVERY = 15 * 60 * 1000, MIN_GAP = 2 * 60 * 1000, last = Date.now(), shown = false;

  function check() {
    if (shown || document.visibilityState === 'hidden' || Date.now() - last < MIN_GAP) return;
    last = Date.now();
    fetch(location.pathname + '?vcheck=' + last, { cache: 'no-store' }).then(function (r) {
      return r.ok ? r.text() : '';
    }).then(function (html) {
      var m = /version\.js\?v=([0-9a-z]+)/.exec(html);
      if (m && m[1] !== built && m[1] !== 'dev') show();
    }).catch(function () { /* offline: try again later */ });
  }

  function show() {
    shown = true;
    var bar = document.createElement('div');
    bar.setAttribute('role', 'status');
    bar.style.cssText = 'position:fixed;left:50%;bottom:16px;transform:translateX(-50%);z-index:1000;' +
      'display:flex;align-items:center;gap:12px;max-width:calc(100vw - 32px);padding:10px 12px 10px 16px;' +
      'background:var(--surface,#fff);color:var(--ink,#222);border:1px solid var(--accent,#2f6b4f);' +
      'border-radius:12px;box-shadow:0 6px 24px rgba(0,0,0,.25);font:500 .9rem/1.35 Inter,system-ui,sans-serif;';
    var msg = document.createElement('span');
    msg.textContent = 'A new version of this page is available.';
    var go = document.createElement('button');
    go.type = 'button';
    go.textContent = 'Reload';
    go.style.cssText = 'font:inherit;font-weight:600;border:0;border-radius:8px;padding:6px 14px;cursor:pointer;' +
      'background:var(--accent,#2f6b4f);color:var(--accent-ink,#fff);';
    go.onclick = function () { location.reload(); };
    var x = document.createElement('button');
    x.type = 'button';
    x.setAttribute('aria-label', 'Dismiss');
    x.textContent = String.fromCharCode(215); /* multiplication sign; ASCII-only source */
    x.style.cssText = 'font:inherit;font-size:1.2rem;line-height:1;border:0;background:none;color:var(--muted,#666);cursor:pointer;padding:2px 4px;';
    x.onclick = function () { bar.remove(); };
    bar.appendChild(msg); bar.appendChild(go); bar.appendChild(x);
    document.body.appendChild(bar);
  }

  document.addEventListener('visibilitychange', check);
  setInterval(check, CHECK_EVERY);
})();
