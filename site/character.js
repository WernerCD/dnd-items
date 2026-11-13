/* dnd-shared character.js v1 (canonical copy: WernerCD/dnd shared/character.js). Copy unchanged to site/character.js.
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
 * }
 * Sites keep their detailed state in their own keys as before; this record is the shared summary they agree on.
 * Subclass ids differ between sites, so match with DndChar.sameSub() (id first, then name).
 *
 * API (window.DndChar):
 *   all() -> [Character]          active() -> Character|null      get(id)
 *   save(ch, repo) -> Character   (creates with an id if missing, merges, stamps updated/by, returns the stored copy)
 *   setLink(id, repo, data)       remove(id)      setActive(id|null)
 *   level(ch), levelIn(ch, cls), classOf(ch, cls) -> {cls,lvl,sub,subName}|null, mod(ch, 'wis'|'str'|...)
 *   summary(ch) -> 'Paladin 6 / Warlock 2'      short(ch) -> 'Pal 6 / Lock 2'
 *   sameSub(a, b) -> bool          url(repo, id) -> link to that tool opened on that character
 *   onChange(fn)                   fn(active, all) after any change, in this tab or another
 *   mountPicker(el)                fills el (the header's <span class="char-pick" id="charPick">) with the switcher
 * Opening any tool with ?char=<id> makes that character active.
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
      classes: cl, ab: ab, updated: c.updated || null, by: c.by || null, links: c.links && typeof c.links === 'object' ? c.links : {} };
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
      d.list.splice(i, 1); if (d.active === id) d.active = d.list.length ? d.list[0].id : null;
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
      '</select></label>';
    pick.querySelector('select').addEventListener('change', function (e) { API.setActive(e.target.value || null); });
  }

  window.DndChar = API;
  document.addEventListener('DOMContentLoaded', function () { var el = document.getElementById('charPick'); if (el && !pick) mountPicker(el); });
  if (document.readyState !== 'loading') { var el0 = document.getElementById('charPick'); if (el0) mountPicker(el0); }
})();
