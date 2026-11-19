/* dnd-shared dice.js v1.0.2 (canonical copy: WernerCD/dnd shared/dice.js). Copy unchanged to site/dice.js.
 * Click-to-roll dice for every D&D Toolbox page (STYLE.md 6k). Styles are the .dd- rules in the dnd-shared
 * CSS block (v1.11+). The roll log is shared by every tool (localStorage dnd.rolls, last 30 rolls).
 *
 * What becomes rollable, with no work on the page's part:
 *   - inside any .dsb stat block or any element with a data-dice attribute:
 *     "+5 to hit", "Attack Roll: +5" (rolls 1d20+5) and dice like "2d6 + 3", "1d8", "d20"
 *   - any element with data-roll="1d20+4" (and optionally data-roll-label="Dex save")
 *     statblock.js v1.1 marks its ability modifiers, saves, skills and initiative this way.
 *   Labels: the nearest data-roll-ctx (statblock.js sets the creature's name) plus the stat block entry's
 *   name ("Goblin: Scimitar"). Content added later is picked up automatically.
 *
 *   DndDice.roll(expr, label)  -> {expr, label, total, dice: [..], adv, dis, nat}  (also shows it and logs it)
 *   DndDice.parse(expr)        -> [{n, d, s}, {k}] or null
 *   DndDice.apply(root)        -> mark up rolls inside root now (normally not needed)
 *   DndDice.open()             -> show the roll tray (free-form roller and log)
 * d20 rolls always roll two d20: the tray shows the plain result and the advantage / disadvantage result.
 * v1.0.1: a roll from inside an open modal <dialog> shows the tray inside that dialog (top layer); data-roll
 *   must contain a die ("1d20+2"), so other uses of data-roll (e.g. data-roll="0") are left alone.
 */
(function () {
  var KEY = 'dnd.rolls', MAX = 30, DIE = '(?:4|6|8|10|12|20|100)';
  var RX = new RegExp('([+\\-\\u2212]\\s?\\d+)(?=\\s+to\\s+hit)|(Attack Roll:\\s*)([+\\-\\u2212]\\d+)|(^|[^\\w])(\\d{0,2}d' + DIE + '(?:\\s*[+\\-\\u2212]\\s*\\d+)?)(?![\\w])', 'g');
  var SKIP = /^(A|BUTTON|SCRIPT|STYLE|INPUT|TEXTAREA|SELECT|OPTION|LABEL|SUMMARY)$/;
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  var norm = function (e) { return String(e).replace(/[−–]/g, '-').replace(/\s+/g, '').toLowerCase(); };
  var sg = function (n) { return (n < 0 ? '−' : '+') + Math.abs(n); };

  function parse(expr) {
    var s = norm(expr);
    if (!/^[+-]?(\d*d\d+|\d+)([+-](\d*d\d+|\d+))*$/.test(s)) return null;
    var out = [], bad = false;
    s.replace(/([+-]?)(?:(\d*)d(\d+)|(\d+))/g, function (_, sign, n, d, k) {
      var m = sign === '-' ? -1 : 1;
      if (d) { n = n === '' ? 1 : +n; d = +d; if (n < 1 || n > 100 || d < 2 || d > 1000) bad = true; out.push({ n: n, d: d, s: m }); }
      else out.push({ k: m * +k });
    });
    return bad || !out.length ? null : out;
  }
  function rnd(d) {
    if (window.crypto && crypto.getRandomValues) { var a = new Uint32Array(1), lim = 4294967296 - 4294967296 % d; do { crypto.getRandomValues(a); } while (a[0] >= lim); return a[0] % d + 1; }
    return Math.floor(Math.random() * d) + 1;
  }

  // ---------- log ----------
  function getLog() { try { var l = JSON.parse(localStorage.getItem(KEY) || '[]'); return Array.isArray(l) ? l : []; } catch (e) { return []; } }
  function setLog(l) { try { localStorage.setItem(KEY, JSON.stringify(l.slice(0, MAX))); } catch (e) {} }

  function roll(expr, label, opt) {
    var terms = parse(expr); if (!terms) return null;
    opt = opt || {};
    var dice = [], k = 0, total = 0, d20 = terms.filter(function (t) { return t.d; }).length === 1 && terms.some(function (t) { return t.d === 20 && t.n === 1 && t.s === 1; });
    terms.forEach(function (t) {
      if (t.k != null) { k += t.k; return; }
      var n = t.n * (opt.crit ? 2 : 1), rs = [];
      for (var i = 0; i < n; i++) rs.push(rnd(t.d));
      dice.push({ d: t.d, s: t.s, r: rs });
      total += t.s * rs.reduce(function (a, b) { return a + b; }, 0);
    });
    total += k;
    var res = { expr: String(expr).replace(/\s+/g, ' ').trim(), label: label || '', total: total, dice: dice, k: k, crit: !!opt.crit, t: Date.now() };
    if (d20) {
      var a = dice[0].r[0], b = rnd(20);
      res.nat = a; res.second = b; res.adv = Math.max(a, b) + k; res.dis = Math.min(a, b) + k;
    }
    var l = getLog(); l.unshift({ t: res.t, l: res.label, e: res.expr + (res.crit ? ' (crit)' : ''), v: total, a: res.adv, b: res.dis, n: res.nat, r: dice.map(function (x) { return x.r.join(', '); }).join(' | ') });
    setLog(l);
    show(res, opt.from);
    return res;
  }

  // ---------- tray ----------
  var tray, lastRes;
  function build() {
    if (tray) return tray;
    tray = document.createElement('div');
    tray.className = 'dd-tray'; tray.setAttribute('role', 'region'); tray.setAttribute('aria-label', 'Dice rolls'); tray.hidden = true;
    tray.innerHTML = '<div class="dd-head"><b>Dice</b><button type="button" class="dd-x" aria-label="Close the dice tray">&times;</button></div>' +
      '<div class="dd-last" aria-live="polite" aria-atomic="true"><p class="dd-hint">Tap a roll on the page, or type one below.</p></div>' +
      '<form class="dd-free"><label class="dd-sr" for="ddExpr">Dice to roll</label><input id="ddExpr" autocomplete="off" spellcheck="false" placeholder="2d6+3" maxlength="40">' +
      '<button type="submit" class="dd-btn">Roll</button></form>' +
      '<div class="dd-quick">' + [4, 6, 8, 10, 12, 20, 100].map(function (d) { return '<button type="button" class="dd-btn" data-q="1d' + d + '">d' + d + '</button>'; }).join('') + '</div>' +
      '<details class="dd-more"><summary>Recent rolls</summary><ol class="dd-log"></ol><button type="button" class="dd-link dd-clear">Clear the log</button></details>';
    document.body.appendChild(tray);
    tray.querySelector('.dd-x').addEventListener('click', function () { tray.hidden = true; });
    tray.querySelector('.dd-free').addEventListener('submit', function (e) {
      e.preventDefault(); var i = tray.querySelector('#ddExpr'), v = i.value.trim(); if (!v) return;
      if (!roll(v, '', { from: i })) { tray.querySelector('.dd-last').innerHTML = '<p class="dd-hint">Try dice like 2d6+3, d20 or 4d6.</p>'; }
    });
    tray.addEventListener('click', function (e) {
      var q = e.target.closest('[data-q]'); if (q) { roll(q.getAttribute('data-q'), '', { from: q }); return; }
      if (e.target.closest('.dd-crit') && lastRes) { roll(lastRes.expr, (lastRes.label ? lastRes.label + ', ' : '') + 'critical hit', { crit: true, from: e.target }); return; }
      if (e.target.closest('.dd-clear')) { setLog([]); renderLog(); }
    });
    tray.querySelector('.dd-more').addEventListener('toggle', renderLog);
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !tray.hidden && tray.contains(document.activeElement)) tray.hidden = true; });
    return tray;
  }
  function renderLog() {
    var l = getLog(), ol = tray.querySelector('.dd-log');
    ol.innerHTML = l.length ? l.map(function (x) {
      return '<li><span class="dd-lv">' + x.v + '</span> <span class="dd-le">' + esc((x.l ? x.l + ': ' : '') + x.e) + '</span>' +
        (x.a != null ? ' <span class="dd-ad">adv ' + x.a + ' &middot; dis ' + x.b + '</span>' : '') + '</li>';
    }).join('') : '<li class="dd-hint">No rolls yet.</li>';
  }
  function show(r, from) {
    build(); lastRes = r;
    var dlg = from && from.closest && from.closest('dialog[open]'), host = dlg || document.body;   // a modal dialog is in the top layer: the tray must be inside it to be seen
    if (tray.parentNode !== host && !(from && tray.contains(from))) host.appendChild(tray);
    var parts = r.dice.map(function (x) { return (x.s < 0 ? '−' : '') + '[' + x.r.join(', ') + ']'; }).join(' ') + (r.k ? ' ' + sg(r.k) : '');
    var nat = r.nat === 20 ? ' <span class="dd-nat hi">natural 20</span>' : r.nat === 1 ? ' <span class="dd-nat lo">natural 1</span>' : '';
    var h = (r.label ? '<p class="dd-lbl">' + esc(r.label) + '</p>' : '') +
      '<p class="dd-res"><span class="dd-total">' + r.total + '</span><span class="dd-expr">' + esc(r.expr) + (r.crit ? ' (crit)' : '') + '</span></p>' +
      '<p class="dd-parts">' + esc(parts) + nat + '</p>';
    if (r.adv != null) h += '<p class="dd-advdis"><span>With advantage <b>' + r.adv + '</b></span><span>With disadvantage <b>' + r.dis + '</b></span><span class="dd-sub">second d20: ' + r.second + '</span></p>';
    else if (r.dice.length && !r.crit) h += '<p><button type="button" class="dd-link dd-crit">Roll again as a critical hit (double dice)</button></p>';
    tray.querySelector('.dd-last').innerHTML = h;
    tray.hidden = false;
    if (!tray.querySelector('.dd-more').open) return; renderLog();
  }

  // ---------- marking up the page ----------
  function ctxLabel(el, extra) {
    var c = el.closest('[data-roll-ctx]'), who = c ? c.getAttribute('data-roll-ctx') : '';
    var blk = el.closest('.dsb-blk, [data-roll-entry]'), what = '';
    if (blk) { var b = blk.getAttribute('data-roll-entry') || (blk.querySelector('b') || {}).textContent || ''; what = b.replace(/[.:]\s*$/, '').trim(); }
    return [who, [what, extra].filter(Boolean).join(', ')].filter(Boolean).join(': ');
  }
  function mk(expr, text, label) {
    var b = document.createElement('span');
    b.className = 'dd-roll'; b.setAttribute('role', 'button'); b.tabIndex = 0;
    b.setAttribute('data-roll', expr); if (label) b.setAttribute('data-roll-label', label);
    b.setAttribute('title', 'Roll ' + expr.replace(/-/g, '−')); b.textContent = text;
    return b;
  }
  function marks(root) {   // explicit data-roll elements, anywhere on the page
    root.querySelectorAll('[data-roll]:not(.dd-roll)').forEach(function (el) {
      if (!/d/i.test(el.getAttribute('data-roll') || '') || !parse(el.getAttribute('data-roll'))) return;
      el.classList.add('dd-roll'); el.setAttribute('role', 'button'); el.tabIndex = 0;
      if (!el.title) el.title = 'Roll ' + el.getAttribute('data-roll').replace(/-/g, '−');
    });
  }
  function scan(root) {   // dice written in the text, only inside .dsb and [data-dice]
    var w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: function (n) {
        for (var p = n.parentNode; p && p !== root.parentNode; p = p.parentNode) {
          if (p.nodeType === 1 && (SKIP.test(p.nodeName) || p.classList.contains('dd-roll') || p.hasAttribute('data-roll') || p.hasAttribute('data-nodice'))) return NodeFilter.FILTER_REJECT;
        }
        RX.lastIndex = 0; return RX.test(n.nodeValue) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
      }
    }), nodes = [];
    while (w.nextNode()) nodes.push(w.currentNode);
    nodes.forEach(function (n) {
      var s = n.nodeValue, frag = document.createDocumentFragment(), at = 0, m;
      RX.lastIndex = 0;
      while ((m = RX.exec(s))) {
        var start = m.index, text, expr, label;
        if (m[1]) { text = m[1]; expr = '1d20' + norm(m[1]); label = ctxLabel(n.parentNode, 'to hit'); }
        else if (m[3]) { start += m[2].length; text = m[3]; expr = '1d20' + norm(m[3]); label = ctxLabel(n.parentNode, 'attack'); }
        else { start += m[4].length; text = m[5]; expr = norm(m[5]); label = ctxLabel(n.parentNode, ''); }
        if (!parse(expr)) continue;
        frag.appendChild(document.createTextNode(s.slice(at, start)));
        frag.appendChild(mk(expr, text, label));
        at = start + text.length;
      }
      if (!at) return;
      frag.appendChild(document.createTextNode(s.slice(at)));
      n.parentNode.replaceChild(frag, n);
    });
  }
  function apply(root) {
    root = root || document.body; if (!root || !root.querySelectorAll) return;
    var list = [];
    if (root.matches && root.matches('.dsb, [data-dice]')) list.push(root);
    root.querySelectorAll('.dsb, [data-dice]').forEach(function (e) { list.push(e); });
    var any = root.querySelector('[data-roll]:not(.dd-roll)');
    if (!list.length && !any) return;
    if (obs) obs.disconnect();
    if (any) marks(root);
    list.forEach(scan);
    if (obs) watch();
  }

  function fire(el) {
    var label = el.getAttribute('data-roll-label') || ctxLabel(el, '');
    roll(el.getAttribute('data-roll'), label, { from: el });
  }
  document.addEventListener('click', function (e) {
    var el = e.target.closest && e.target.closest('.dd-roll'); if (!el || (tray && tray.contains(el))) return;
    e.preventDefault(); fire(el);
  });
  document.addEventListener('keydown', function (e) {
    if ((e.key === 'Enter' || e.key === ' ') && e.target.classList && e.target.classList.contains('dd-roll')) { e.preventDefault(); fire(e.target); }
  });

  var obs = null, pending = false;
  function watch() { obs.observe(document.body, { childList: true, subtree: true }); }
  function start() {
    apply(document.body);
    if (!window.MutationObserver) return;
    obs = new MutationObserver(function () {
      if (pending) return; pending = true;
      setTimeout(function () { pending = false; apply(document.body); }, 50);   // v1.0.2: not rAF, which never runs in a hidden tab
    });
    watch();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();

  window.DndDice = { roll: roll, parse: parse, apply: apply, open: function () { build(); var d = document.querySelector('dialog[open]'); if (tray.parentNode !== (d || document.body)) (d || document.body).appendChild(tray); tray.hidden = false; var i = tray.querySelector('#ddExpr'); if (i) i.focus(); }, log: getLog };
})();
