/* dnd-shared links.js v1.0.3 (canonical copy: WernerCD/dnd shared/links.js). Copy unchanged to site/links.js.
 * Links the tools to each other (STYLE.md 6k), using the search lists every tool already publishes (6j).
 * Works inside any .dsb stat block and any element with a data-links attribute; content added later is
 * picked up automatically. Links into the page's own site are left out (each tool links itself).
 *
 *   spell and magic item names in italics (<i>/<em>, as the SRD prints them)  -> Spell Planner / Item Finder
 *   conditions (blinded ... unconscious, exhaustion), first mention per paragraph -> Rules Reference
 *   creature types in a stat block's type line (.dsb-ctype, statblock.js v1.1)  -> Monster Lookup, filtered
 *   elements marked data-link="spell|item|condition|monster|feat" -> that entry, by their own text
 *
 *   DndLinks.url(kind, name) -> URL or '' (after DndLinks.load), DndLinks.load(kinds) -> Promise,
 *   DndLinks.apply(root)
 * v1.0.1: names of two or more words written in Title Case also link without italics (the 2024 SRD prints
 *   "cast Magic Missile"); italics ending in . or : are run-in headings ("Slow.") and never link;
 *   data-nolink works on the element itself as well as on a container.
 * v1.0.2: 2014 text links to a tool's 2014 entry when its search list gives one (u14, STYLE 6j). The edition is
 *   the nearest data-ed attribute (statblock.js v1.1.1 sets it), else the page's ?ed=, else 2024.
 * v1.0.3: Title Case names inside a bold run-in heading (<b>/<strong> ending in . or :, e.g. "Divine Smite.") never link.
 * Opt out inside a block with data-nolink. The lists come from wernercd.github.io (also when testing
 * locally); with no connection and nothing cached, the text simply stays plain.
 */
(function () {
  var BASE = location.hostname === 'wernercd.github.io' ? '/' : 'https://wernercd.github.io/';
  var HERE = (location.pathname.split('/')[1] || '');
  var KINDS = {   // kind: [repo, search.json kind label(s), tool name]
    spell: ['dnd-magic', ['Spell'], 'Spell Planner'],
    item: ['dnd-items', ['Item', 'Gear'], 'Item Finder'],
    condition: ['dnd-rules', ['Condition'], 'Rules Reference'],
    monster: ['dnd-monsters', ['Monster'], 'Monster Lookup'],
    feat: ['dnd-feats', ['Feat', 'Species', 'Background'], 'Feats & Origins']
  };
  var CONDS = ['blinded', 'charmed', 'deafened', 'exhaustion', 'frightened', 'grappled', 'incapacitated', 'invisible', 'paralyzed', 'petrified', 'poisoned', 'prone', 'restrained', 'stunned', 'unconscious'];
  var CRX = new RegExp('\\b(' + CONDS.join('|') + ')\\b', 'i');
  var SKIP = /^(A|BUTTON|SCRIPT|STYLE|INPUT|TEXTAREA|SELECT|OPTION|LABEL|SUMMARY|H1|H2|H3)$/;
  var idx = {}, loading = {}, titles = {}, TRX = null;
  var fold = function (s) { return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[‘’ʼ]/g, "'").toLowerCase().replace(/\s+/g, ' ').replace(/[\s.,;:!?]+$/, '').trim(); };
  var off = function (kind) { return !KINDS[kind] || KINDS[kind][0] === HERE; };

  function load(kinds) {
    var repos = {};
    kinds.forEach(function (k) { if (!off(k)) repos[KINDS[k][0]] = 1; });
    return Promise.all(Object.keys(repos).map(function (repo) {
      if (!loading[repo]) loading[repo] = fetch(BASE + repo + '/search.json').then(function (r) { return r.ok ? r.json() : null; }).then(function (d) {
        var m = {}, t = [];
        ((d && d.items) || []).forEach(function (it) {
          var f = fold(it.n); if (f && !m[f + '|' + it.k]) { m[f + '|' + it.k] = it.u || ''; if (it.u14) m[f + '|' + it.k + '|14'] = it.u14; }
          if ((it.k === 'Spell' || it.k === 'Item') && /^[A-Z][\w'\u2019-]*( (of|the|and|from|to|in|on|a|[A-Z][\w'\u2019-]*))* [A-Z][\w'\u2019-]*$/.test(it.n) && it.n.indexOf(' ') > 0) t.push(it.n);
        });
        idx[repo] = m; titles[repo] = t; TRX = null;
      }).catch(function () { idx[repo] = {}; });
      return loading[repo];
    }));
  }
  var PAGE_ED = (/[?&]ed=(2014|2024)/.exec(location.search) || [])[1] || '';
  function edOf(el) { var e = el && el.closest && el.closest('[data-ed]'); return (e && e.getAttribute('data-ed')) || PAGE_ED || '2024'; }
  function url(kind, name, ed) {
    if (off(kind)) return '';
    var K = KINDS[kind], m = idx[K[0]]; if (!m) return '';   // not loaded (yet): stays plain text
    var f = fold(name);
    for (var i = 0; i < K[1].length; i++) { var u = m[f + '|' + K[1][i]]; if (u != null) return BASE + K[0] + '/' + (ed === '2014' && m[f + '|' + K[1][i] + '|14'] != null ? m[f + '|' + K[1][i] + '|14'] : u); }
    return '';
  }
  function typeUrl(t) { var c = String(t || '').trim().toLowerCase(); return c && HERE !== 'dnd-monsters' ? BASE + 'dnd-monsters/?t=' + encodeURIComponent(c.charAt(0).toUpperCase() + c.slice(1)) : ''; }
  function link(el, href, kind) {
    var a = document.createElement('a');
    a.className = 'dlx'; a.href = href; a.title = 'Open in ' + (kind === 'type' ? 'Monster Lookup' : KINDS[kind][2]);
    while (el.firstChild) a.appendChild(el.firstChild);
    el.appendChild(a);
  }
  function titleRx() {   // multi-word Title Case spell and magic item names, longest first
    if (TRX !== null) return TRX;
    var n = [];
    ['spell', 'item'].forEach(function (k) { if (!off(k)) n = n.concat(titles[KINDS[k][0]] || []); });
    n.sort(function (a, b) { return b.length - a.length; });
    TRX = n.length ? new RegExp('(^|[^\\w])(' + n.map(function (x) { return x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }).join('|') + ')(?![\\w])') : false;
    return TRX;
  }
  function blocked(el, root) {
    for (var p = el; p && p !== root.parentNode; p = p.parentNode) if (p.nodeType === 1 && (SKIP.test(p.nodeName) || p.hasAttribute('data-nolink') || p.classList.contains('dd-roll'))) return true;
    return false;
  }

  function scan(root) {
    // explicit marks and creature types
    root.querySelectorAll('[data-link]:not([data-dlx])').forEach(function (el) {
      el.setAttribute('data-dlx', '1'); var k = el.getAttribute('data-link'), u = url(k, el.getAttribute('data-link-name') || el.textContent, edOf(el));
      if (u && !blocked(el, root)) link(el, u, k);
    });
    root.querySelectorAll('.dsb-ctype:not([data-dlx])').forEach(function (el) {
      el.setAttribute('data-dlx', '1'); var u = typeUrl(el.getAttribute('data-ctype') || el.textContent); if (u) link(el, u, 'type');
    });
    // italic names: spells first, then magic items
    root.querySelectorAll('i:not([data-dlx]), em:not([data-dlx])').forEach(function (el) {
      el.setAttribute('data-dlx', '1');
      if (el.children.length || blocked(el, root)) return;
      var t = el.textContent; if (t.length > 60 || /[.:]\s*$/.test(t)) return;   // "Slow." is a run-in heading
      var e = edOf(el), u = url('spell', t, e), k = 'spell'; if (!u) { u = url('item', t, e); k = 'item'; }
      if (u) link(el, u, k);
    });
    // Title Case names in plain text: first mention of each in a paragraph
    var rx = titleRx();
    if (rx) {
      var tw = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, { acceptNode: function (n) { var h = n.parentNode.closest && n.parentNode.closest('b, strong'); return rx.test(n.nodeValue) && !blocked(n.parentNode, root) && !(h && /[.:]\s*$/.test(h.textContent)) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT; } }), tn = [];
      while (tw.nextNode()) tn.push(tw.currentNode);
      var one = function (n) {   // every name in the node; each one once per paragraph
        var m = rx.exec(n.nodeValue); if (!m) return;
        var name = m[2], at = m.index + m[1].length, blk = n.parentNode.closest('p, li, td, dd, .dsb-blk, div') || root, seen = (blk.getAttribute('data-dln') || '').split('|');
        var e = edOf(n.parentNode), u = seen.indexOf(name) >= 0 ? '' : url('spell', name, e), k = 'spell'; if (!u && seen.indexOf(name) < 0) { u = url('item', name, e); k = 'item'; }
        var rest = n.splitText(at + name.length);
        if (u) {
          seen.push(name); blk.setAttribute('data-dln', seen.join('|'));
          var a = document.createElement('a'); a.className = 'dlx'; a.href = u; a.title = 'Open in ' + KINDS[k][2]; a.textContent = name;
          n.nodeValue = n.nodeValue.slice(0, at); n.parentNode.insertBefore(a, rest);
        }
        one(rest);
      };
      tn.forEach(one);
    }
    // conditions: first mention in each paragraph / entry
    if (off('condition')) return;
    var w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, { acceptNode: function (n) { return CRX.test(n.nodeValue) && !blocked(n.parentNode, root) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT; } }), nodes = [];
    while (w.nextNode()) nodes.push(w.currentNode);
    nodes.forEach(function (n) {
      var blk = n.parentNode.closest('p, li, td, dd, .dsb-blk, div') || root, seen = (blk.getAttribute('data-dlc') || '').split(',');
      var m = CRX.exec(n.nodeValue), c = m[1].toLowerCase();
      if (seen.indexOf(c) >= 0) return;
      var u = url('condition', c, edOf(n.parentNode)); if (!u) return;
      seen.push(c); blk.setAttribute('data-dlc', seen.join(','));
      var a = document.createElement('a'); a.className = 'dlx'; a.href = u; a.title = 'Open in Rules Reference'; a.textContent = m[1];
      var rest = n.splitText(m.index); rest.nodeValue = rest.nodeValue.slice(m[1].length);
      n.parentNode.insertBefore(a, rest);
    });
  }

  var obs = null, pending = false;
  function roots(root) {
    var list = [];
    if (root.matches && root.matches('.dsb, [data-links]')) list.push(root);
    root.querySelectorAll('.dsb, [data-links]').forEach(function (e) { list.push(e); });
    return list;
  }
  function apply(root) {
    root = root || document.body; if (!root || !root.querySelectorAll) return Promise.resolve();
    var list = roots(root); if (!list.length) return Promise.resolve();
    var need = { condition: 1 };   // load only the lists this content can use (the item list is the big one)
    list.forEach(function (r) {
      need.spell = 1; need.item = 1;   // italics and Title Case names
      r.querySelectorAll('[data-link]').forEach(function (e) { need[e.getAttribute('data-link')] = 1; });
    });
    return load(Object.keys(need).filter(function (k) { return KINDS[k]; })).then(function () {
      if (obs) obs.disconnect();
      roots(root).forEach(scan);
      if (obs) obs.observe(document.body, { childList: true, subtree: true });
    });
  }
  function start() {
    apply(document.body);
    if (!window.MutationObserver) return;
    obs = new MutationObserver(function () {
      if (pending) return; pending = true;
      setTimeout(function () { pending = false; apply(document.body); }, 50);
    });
    obs.observe(document.body, { childList: true, subtree: true });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();

  window.DndLinks = { load: function (k) { return load(k || Object.keys(KINDS)); }, url: url, typeUrl: typeUrl, apply: apply, kinds: KINDS };
})();
