/* dnd-shared character.js v1.5 (canonical copy: WernerCD/dnd shared/character.js). Copy unchanged to site/character.js.
 *
 * One list of characters shared by every D&D Toolbox site. All the sites are served from
 * wernercd.github.io, so they share localStorage: a Paladin built in the Multiclass Planner shows up,
 * with its classes, levels, subclasses and ability scores, in the Spell Planner, Wild Shape and Item Finder.
 *
 * Storage key 'dnd.characters' = { v: 1, active: id|null, list: [Character] }
 * Character = {
 *   id:      'c' + random, stable forever
 *   name:    'Aric'
 *   ed:      '2014' | '2024'
 *   classes: [{ cls: 'paladin', lvl: 6, sub: 'devotion', subName: 'Oath of Devotion' }, ...]   // cls = lowercase SRD class name
 *   ab:      [STR, DEX, CON, INT, WIS, CHA]   // scores, not modifiers
 *   updated: ISO time,  by: 'dnd-multiclass-planner' (repo that last wrote it)
 *   links:   { '<repo>': anything }   // each site keeps ITS OWN per-character data here, and only touches its own key
 *   share:   { '<repo>': json }       // optional: what that site wants a share link to carry (setShare), max 6000 chars each
 *   inbox:   { '<repo>': json }       // share data that arrived with a share link, waiting for that site (takeInbox)
 *   sheet:   { '<repo>': json }       // v1.4: that site's computed summary for the character sheet and party pages (setSheet), max 6000 chars each
 * }
 * Sites keep their detailed state in their own keys as before; this record is the shared summary they agree on.
 * Subclass ids differ between sites, so match with DndChar.sameSub() (id first, then name).
 *
 * API (window.DndChar):
 *   all() -> [Character]          active() -> Character|null      get(id)
 *   save(ch, repo) -> Character   (creates with an id if missing, merges, stamps updated/by, returns the stored copy)
 *   setLink(id, repo, data)       remove(id) (if it was active, active becomes null)      setActive(id|null)
 *   level(ch), levelIn(ch, cls), classOf(ch, cls) -> {cls,lvl,sub,subName}|null, mod(ch, 'wis'|'str'|...)
 *   summary(ch) -> 'Paladin 6 / Warlock 2'      short(ch) -> 'Pal 6 / Lock 2'
 *   sameSub(a, b) -> bool          url(repo, id) -> link to that tool opened on that character
 *   onChange(fn)                   fn(active, all) after any change, in this tab or another
 *   shareUrl(ch, repo) -> link that carries the character itself (#dndchar=...), for another browser or person
 *   copyShare(ch, repo, button)    copies shareUrl to the clipboard and says so on the button
 *   setShare(id, repo, data|null)  what your site adds to this character's share links (for example a spell list or a build)
 *   takeInbox(id, repo) -> data|null   share data that arrived for your site; returns it once and removes it
 *   setSheet(id, repo, data|null)  your site's read-only summary for the sheet/party pages (STYLE.md 6e); travels in share links
 *   mountPicker(el)                fills el (the header's <span class="char-pick" id="charPick">) with the switcher
 * Opening any tool with ?char=<id> makes that character active.
 * Opening any tool with #dndchar=<data> offers to add (or update) the shared character in this browser.
 * The data is in the #fragment, so it is never sent to the web server. Site links (links{}) are not shared.
 */
(function () {
  var KEY = 'dnd.characters', BASE = 'https://wernercd.github.io/';
  var ABIL = ['str', 'dex', 'con', 'int', 'wis', 'cha'];
  var SHORT = { barbarian: 'Barb', bard: 'Bard', cleric: 'Clr', druid: 'Dru', fighter: 'Ftr', monk: 'Monk', paladin: 'Pal',
    ranger: 'Rgr', rogue: 'Rog', sorcerer: 'Sorc', warlock: 'Lock', wizard: 'Wiz', artificer: 'Art' };
  var subs = [];

  function read() {
    try {
      var d = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (d && Array.isArray(d.list)) return { v: 1, active: d.active || null, list: d.list.map(clean).filter(Boolean) };
    } catch (e) { /* private mode or bad JSON */ }
    return { v: 1, active: null, list: [] };
  }
  function write(d) {
    try { localStorage.setItem(KEY, JSON.stringify(d)); } catch (e) { return false; }
    fire(); return true;
  }
  function clean(c) {
    if (!c || typeof c !== 'object' || !c.id) return null;
    var cl = (Array.isArray(c.classes) ? c.classes : []).map(function (x) {
      var lvl = Math.max(1, Math.min(20, parseInt(x && x.lvl, 10) || 1));
      return x && x.cls ? { cls: String(x.cls).toLowerCase().slice(0, 30), lvl: lvl,
        sub: x.sub ? String(x.sub).slice(0, 60) : null, subName: x.subName ? String(x.subName).slice(0, 80) : null } : null;
    }).filter(Boolean);
    var ab = Array.isArray(c.ab) && c.ab.length === 6 ? c.ab.map(function (n) { return Math.max(1, Math.min(30, parseInt(n, 10) || 10)); }) : [10, 10, 10, 10, 10, 10];
    return { id: String(c.id).slice(0, 40), name: String(c.name || 'Unnamed').slice(0, 60), ed: c.ed === '2014' ? '2014' : '2024',
      classes: cl, ab: ab, updated: c.updated || null, by: c.by || null, links: c.links && typeof c.links === 'object' ? c.links : {},
      share: box(c.share), inbox: box(c.inbox), sheet: box(c.sheet) };
  }
  function box(o) {   // { repo: small JSON value }, anything over 6000 characters is dropped
    var r = {}; if (!o || typeof o !== 'object') return r;
    for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k) && o[k] != null) { try { if (JSON.stringify(o[k]).length <= 6000) r[String(k).slice(0, 40)] = o[k]; } catch (e) { /* skip */ } }
    return r;
  }
  function uid() { return 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
  function find(d, id) { for (var i = 0; i < d.list.length; i++) if (d.list[i].id === id) return i; return -1; }

  var API = {
    all: function () { return read().list; },
    get: function (id) { var d = read(), i = find(d, id); return i < 0 ? null : d.list[i]; },
    active: function () { var d = read(), i = find(d, d.active); return i < 0 ? null : d.list[i]; },
    save: function (ch, repo) {
      var d = read(), i = ch.id ? find(d, ch.id) : -1, old = i < 0 ? {} : d.list[i];
      var m = {}; for (var k in old) m[k] = old[k]; for (var k2 in ch) if (k2 !== 'links') m[k2] = ch[k2];
      m.links = old.links || {}; if (ch.links) for (var k3 in ch.links) m.links[k3] = ch.links[k3];
      m.id = m.id || uid(); m.updated = new Date().toISOString(); m.by = repo || m.by || null;
      m = clean(m);
      if (i < 0) d.list.push(m); else d.list[i] = m;
      if (!d.active) d.active = m.id;
      write(d); return m;
    },
    setLink: function (id, repo, data) {
      var d = read(), i = find(d, id); if (i < 0) return false;
      d.list[i].links[repo] = data; return write(d);
    },
    remove: function (id) {
      var d = read(), i = find(d, id); if (i < 0) return false;
      d.list.splice(i, 1); if (d.active === id) d.active = null;   // never silently switch to another character
      return write(d);
    },
    setActive: function (id) { var d = read(); d.active = id && find(d, id) >= 0 ? id : null; return write(d); },
    level: function (ch) { return ch ? ch.classes.reduce(function (s, x) { return s + x.lvl; }, 0) : 0; },
    classOf: function (ch, cls) { if (!ch) return null; for (var i = 0; i < ch.classes.length; i++) if (ch.classes[i].cls === cls) return ch.classes[i]; return null; },
    levelIn: function (ch, cls) { var c = API.classOf(ch, cls); return c ? c.lvl : 0; },
    mod: function (ch, ab) { var i = ABIL.indexOf(ab); return ch && i >= 0 ? Math.floor((ch.ab[i] - 10) / 2) : 0; },
    summary: function (ch) { return ch ? ch.classes.map(function (x) { return x.cls.charAt(0).toUpperCase() + x.cls.slice(1) + ' ' + x.lvl; }).join(' / ') : ''; },
    short: function (ch) { return ch ? ch.classes.map(function (x) { return (SHORT[x.cls] || x.cls.slice(0, 4)) + ' ' + x.lvl; }).join(' / ') : ''; },
    sameSub: function (a, b) {
      if (!a || !b) return false;
      if (a.sub && b.sub && a.sub === b.sub) return true;
      var n = function (s) {
        return String(s || '').toLowerCase().replace(/\(.*?\)/g, '')
          .replace(/^(the|oath of( the)?|circle of( the)?|college of|path of( the)?|way of( the)?|school of|domain of|order of( the)?)\s+/, '')
          .replace(/\s+(domain|patron|bloodline|sorcery|soul|archetype|conclave|tradition|magic)$/, '')
          .replace(/[^a-z0-9]+/g, ' ').trim();
      };
      var x = n(a.subName || a.sub), y = n(b.subName || b.sub);
      return !!x && x === y;
    },
    url: function (repo, id) { return BASE + repo + '/' + (id ? '?char=' + encodeURIComponent(id) : ''); },
    onChange: function (fn) { subs.push(fn); },
    shareUrl: function (ch, repo) { return BASE + (repo || here()) + '/#dndchar=' + encode(ch); },
    copyShare: copyShare,
    setShare: function (id, repo, data) {
      var d = read(), i = find(d, id); if (i < 0) return false;
      var cur = d.list[i].share[repo];
      if (JSON.stringify(cur === undefined ? null : cur) === JSON.stringify(data == null ? null : data)) return true;
      if (data == null) delete d.list[i].share[repo]; else d.list[i].share[repo] = data;
      d.list[i] = clean(d.list[i]); return write(d);
    },
    setSheet: function (id, repo, data) {
      var d = read(), i = find(d, id); if (i < 0) return false;
      var cur = d.list[i].sheet[repo];
      if (JSON.stringify(cur === undefined ? null : cur) === JSON.stringify(data == null ? null : data)) return true;
      if (data == null) delete d.list[i].sheet[repo]; else d.list[i].sheet[repo] = data;
      d.list[i] = clean(d.list[i]); return write(d);
    },
    takeInbox: function (id, repo) {
      var d = read(), i = find(d, id); if (i < 0 || !(repo in d.list[i].inbox)) return null;
      var v = d.list[i].inbox[repo]; delete d.list[i].inbox[repo]; write(d); return v;
    },
    mountPicker: mountPicker
  };

  function fire() { var a = API.active(), l = API.all(); subs.forEach(function (fn) { try { fn(a, l); } catch (e) { console.error(e); } }); paint(); }
  window.addEventListener('storage', function (e) { if (e.key === KEY) fire(); });

  // ?char=<id> selects that character on arrival, then drops the parameter from the address
  try {
    var q = new URLSearchParams(location.search), want = q.get('char');
    if (want) {
      var d0 = read(); if (find(d0, want) >= 0 && d0.active !== want) { d0.active = want; localStorage.setItem(KEY, JSON.stringify(d0)); }
      q.delete('char'); var qs = q.toString();
      history.replaceState(null, '', location.pathname + (qs ? '?' + qs : '') + location.hash);
    }
  } catch (e) { /* file:// */ }


  // ---- share links: #dndchar=<base64url JSON> carries the character to another browser ----
  function here() { var m = /^\/([^\/]+)/.exec(location.pathname); return m ? m[1] : 'dnd'; }
  function b64e(s) { return btoa(unescape(encodeURIComponent(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
  function b64d(s) { s = s.replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '='; return decodeURIComponent(escape(atob(s))); }
  function encode(ch) {
    return b64e(JSON.stringify({ v: 1, id: ch.id, n: ch.name, ed: ch.ed, ab: ch.ab,
      c: ch.classes.map(function (x) { return [x.cls, x.lvl, x.sub || '', x.subName || '']; }),
      x: ch.share && Object.keys(ch.share).length ? ch.share : undefined,
      s: ch.sheet && Object.keys(ch.sheet).length ? ch.sheet : undefined }));
  }
  function decode(s) {
    var o = JSON.parse(b64d(s));
    if (!o || o.v !== 1 || !Array.isArray(o.c)) throw new Error('bad share');
    var c = clean({ id: o.id || uid(), name: o.n, ed: o.ed, ab: o.ab,
      classes: o.c.map(function (x) { return Array.isArray(x) ? { cls: x[0], lvl: x[1], sub: x[2] || null, subName: x[3] || null } : null; }),
      inbox: o.x, sheet: o.s });
    if (!c || !c.classes.length) throw new Error('bad share');
    return c;
  }
  function copyShare(ch, repo, btn) {
    var url = API.shareUrl(ch, repo), old = btn && btn.textContent;
    var done = function (msg) { if (!btn) return; btn.textContent = msg; if (window.DndUI) DndUI.pop(btn); setTimeout(function () { btn.textContent = old; }, 2000); };
    if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(url).then(function () { done('Link copied'); }, function () { window.prompt('Copy this link', url); });
    else window.prompt('Copy this link', url);
    return url;
  }
  var incoming = null, incomingBad = false;
  function grab() {
    try {
      var hm = /(^#|&)dndchar=([A-Za-z0-9_-]*)/.exec(location.hash);
      if (!hm) return false;
      try { incoming = decode(hm[2]); incomingBad = false; } catch (e) { incoming = null; incomingBad = true; }
      var rest = location.hash.replace(/(^#|&)dndchar=[A-Za-z0-9_-]*/, '$1').replace(/^#&/, '#').replace(/&$/, '');
      history.replaceState(null, '', location.pathname + location.search + (rest === '#' ? '' : rest));
      return true;
    } catch (e) { return false; /* file:// or old browser */ }
  }
  grab();
  // a share link opened in a tab that already shows this site only changes the #fragment, so there is no reload
  window.addEventListener('hashchange', function (e) { if (grab()) { e.stopImmediatePropagation(); var old = document.querySelector('.char-import'); if (old) old.remove(); toast(); } }, true);
  function same(a, b) { return !Object.keys(b.inbox).length && JSON.stringify([a.name, a.ed, a.ab, a.classes]) === JSON.stringify([b.name, b.ed, b.ab, b.classes]); }
  var TOOL = { 'dnd-magic': 'Spell Planner list', 'dnd-multiclass-planner': 'Multiclass Planner build', 'dnd-druid-wildshapes': 'Wild Shape profile', 'dnd-items': 'Item Finder lists' };
  function extras(c) { var k = Object.keys(c.inbox).map(function (r) { return TOOL[r] || r; }); return k.length ? ' It comes with its ' + k.join(' and ') + '.' : ''; }
  function toast() {
    if (!incoming && !incomingBad) return;
    var inc = incoming; incoming = null; if (!inc && !incomingBad) return;
    var bad = incomingBad; incomingBad = false;
    var esc = function (s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
    var mine = inc && API.get(inc.id);
    if (mine && same(mine, inc)) {   // same character: quietly take any newer sheet summaries it carries (read-only data)
      var sh = {}, k0; for (k0 in mine.sheet) sh[k0] = mine.sheet[k0]; for (k0 in inc.sheet) sh[k0] = inc.sheet[k0];
      if (JSON.stringify(sh) !== JSON.stringify(mine.sheet)) { var d0 = read(), i0 = find(d0, mine.id); if (i0 >= 0) { d0.list[i0].sheet = sh; d0.list[i0] = clean(d0.list[i0]); write(d0); } }
      API.setActive(mine.id); return;
    }
    var box = document.createElement('div');
    box.className = 'char-import'; box.setAttribute('role', 'dialog'); box.setAttribute('aria-labelledby', 'charImpT');
    var desc = inc ? esc(API.summary(inc)) + ', ' + inc.ed + ' rules' : '';
    box.innerHTML = bad
      ? '<p id="charImpT">That character link is damaged or incomplete, so nothing was added.</p><div class="ci-acts"><button type="button" class="ci-no">OK</button></div>'
      : mine
        ? '<p id="charImpT"><b>' + esc(inc.name) + '</b> (' + desc + ') was shared with you.' + extras(inc) + ' You already have this character, and yours is different.</p>' +
          '<div class="ci-acts"><button type="button" class="ci-yes">Use the shared version</button><button type="button" class="ci-no">Keep mine</button></div>'
        : '<p id="charImpT"><b>' + esc(inc.name) + '</b> (' + desc + ') was shared with you.' + extras(inc) + '</p>' +
          '<div class="ci-acts"><button type="button" class="ci-yes">Add to my characters</button><button type="button" class="ci-no">No thanks</button></div>';
    var back = document.activeElement;
    var key = function (e) { if (e.key === 'Escape') close(); };
    var close = function () { box.remove(); document.removeEventListener('keydown', key); if (back && back.focus && back !== document.body) back.focus(); };
    box.addEventListener('click', function (e) {
      if (e.target.closest('.ci-yes')) { var keep = API.get(inc.id), cp = {}; for (var k in inc) if (k !== 'links' && k !== 'share') cp[k] = inc[k];
        if (keep) { var ib = {}; for (var k1 in keep.inbox) ib[k1] = keep.inbox[k1]; for (var k2 in inc.inbox) ib[k2] = inc.inbox[k2]; cp.inbox = ib; }
        var s = API.save(cp, 'share'); API.setActive(s.id); close(); }
      else if (e.target.closest('.ci-no')) close();
    });
    document.addEventListener('keydown', key);
    document.body.appendChild(box);
    if (window.DndUI) DndUI.enter(box);
    box.querySelector('button').focus();
  }

  var pick = null;
  function mountPicker(el) { pick = el; paint(); }
  function paint() {
    if (!pick) return;
    var d = read();
    if (!d.list.length) {
      pick.innerHTML = '<a href="' + BASE + 'dnd/#characters">No character yet</a>';
      return;
    }
    var esc = function (s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
    pick.innerHTML = '<label><span class="char-lbl">Character</span> <select aria-label="Active character">' +
      '<option value="">None</option>' +
      d.list.map(function (c) { return '<option value="' + esc(c.id) + '"' + (c.id === d.active ? ' selected' : '') + '>' + esc(c.name) + (c.classes.length ? ' (' + esc(API.short(c)) + ')' : '') + '</option>'; }).join('') +
      '</select></label>' + (d.active && find(d, d.active) >= 0 ? ' <button type="button" class="char-share" title="Copy a link that adds this character in another browser">Share</button>' : '');
    pick.querySelector('select').addEventListener('change', function (e) { API.setActive(e.target.value || null); });
    var sb = pick.querySelector('.char-share');
    if (sb) sb.addEventListener('click', function () { var a = API.active(); if (a) copyShare(a, here(), sb); });
  }

  window.DndChar = API;
  document.addEventListener('DOMContentLoaded', function () { var el = document.getElementById('charPick'); if (el && !pick) mountPicker(el); toast(); });
  if (document.readyState !== 'loading') { var el0 = document.getElementById('charPick'); if (el0) mountPicker(el0); toast(); }
})();
