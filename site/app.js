/* D&D Item Finder -- vanilla JS, no build step. */
(function () {
  'use strict';

  var store = {
    get: function (k, d) { try { var v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
    set: function (k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* private mode */ } }
  };

  var PAGE = 120;
  /* the main rulebooks: listed first in the Sources picker and selected by default */
  /* the default before shared sources.js (kept only to recognise an untouched old default) */
  var OLD_CORE = ['SRD 5.1', 'SRD 5.2', "Player's Handbook (2014)", "Player's Handbook (2024)", "Dungeon Master's Guide (2014)",
    "Dungeon Master's Guide (2024)", 'Monster Manual (2014)', 'Monster Manual (2025)', "Xanathar's Guide to Everything", "Tasha's Cauldron of Everything"];
  var params = new URLSearchParams(location.search);
  var ATT_KINDS = [['none', 'No attunement'], ['req', 'Requires attunement'], ['cls', 'Limited to certain classes'], ['opt', 'Attunement optional']];
  var DEFAULTS = { kind: 'all', types: [], rars: [], atts: [], consumable: '', show: '', q: '' };
  var state = {
    ed: params.get('ed') || store.get('di.ed', '2024'),
    kind: 'all',
    types: [],
    rars: [],
    atts: [],            /* attunement kinds ticked: none / req / cls / opt */
    consumable: '',
    show: '',            /* '' all, 'fav', 'wish', 'att' */
    usable: store.get('di.usable', true),
    q: params.get('q') || '',
    sort: store.get('di.sort', 'name'),
    detail: store.get('di.detail', 'basic'),
    merge: store.get('di.merge', true),
    groupVar: store.get('di.groupVar', true),
    srcSel: store.get('di.srcSel', null), /* books switched on; null = the core books */
    srcQ: '',
    favs: store.get('di.favs', {}),
    limit: PAGE,
    limitOthers: PAGE
  };
  if (!params.get('ed') && activeCh()) state.ed = activeCh().ed;
  if (['2014', '2024'].indexOf(state.ed) < 0) state.ed = '2024';
  if (['basic', 'stats', 'full'].indexOf(state.detail) < 0) state.detail = 'basic';
  if (!state.favs || typeof state.favs !== 'object') state.favs = {};
  /* no saved choice (or the old untouched default): the core books are picked once the data has loaded */
  if (!state.srcSel || typeof state.srcSel !== 'object' || sameKeys(state.srcSel, OLD_CORE)) { state.srcSel = {}; state.srcDefault = true; }
  /* filters carried in the link (?kind=magic&rarity=Rare|Legendary&books=...), so a view can be shared or bookmarked */
  function listParam(n) { var v = params.get(n); return v ? v.split('|').filter(Boolean) : null; }
  (function () {
    var v;
    if ((v = params.get('kind')) && ['all', 'magic', 'mundane'].indexOf(v) >= 0) state.kind = v;
    if ((v = listParam('type'))) state.types = v;
    if ((v = listParam('rarity'))) state.rars = v;
    /* attune=yes|no is the old single-choice form */
    if ((v = params.get('attune'))) state.atts = v === 'yes' ? ['req', 'cls', 'opt'] : v === 'no' ? ['none'] : v.split('|').filter(function (k) { return ATT_KINDS.some(function (x) { return x[0] === k; }); });
    if ((v = params.get('cons')) && ['yes', 'no'].indexOf(v) >= 0) state.consumable = v;
    if ((v = params.get('view')) && ['basic', 'stats', 'full'].indexOf(v) >= 0) state.detail = v;
    if ((v = params.get('sort'))) state.sort = v;
    if ((v = params.get('show')) && ['fav', 'wish', 'att', 'inv'].indexOf(v) >= 0) state.show = v;
    if ((v = params.get('one'))) state.merge = v !== '0';
    if ((v = params.get('group'))) state.groupVar = v !== '0';
    if ((v = params.get('usable'))) state.usable = v !== '0';
    if ((v = listParam('books'))) { state.srcSel = {}; state.srcAllPending = v[0] === 'all'; v.forEach(function (k) { state.srcSel[k] = true; }); }
  })();

  var LISTS_EMPTY = { favs: {}, wish: {}, att: [], inv: {} };
  var DATA = null, BYID = {}, GROUPS = {}, BYNAME = {}, CUR_CH = null, LISTS = LISTS_EMPTY, LAST_MAIN = [], LAST_OTH = [], LINKQ = '';
  var $ = function (s) { return document.querySelector(s); };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var norm = function (s) { return String(s || '').toLowerCase().replace(/'/g, '').replace(/[^a-z0-9]+/g, ' ').trim(); };

  var TYPE_ORDER = ['Weapon', 'Armor', 'Ammunition', 'Wondrous Item', 'Potion', 'Ring', 'Rod', 'Scroll', 'Staff', 'Wand',
    'Adventuring Gear', 'Tool', 'Spellcasting Focus', 'Poison', 'Food & Drink', 'Trade Good', 'Treasure', 'Mount', 'Vehicle', 'Other'];
  var RAR_ORDER = ['Mundane', 'Common', 'Uncommon', 'Rare', 'Very Rare', 'Legendary', 'Artifact', 'Varies', 'Unknown'];
  /* rarity colours [hue, saturation]: grey, silver, green, blue, purple, orange, red */
  var RAR_COL = { Mundane: [30, 0], Common: [210, 12], Uncommon: [130, 55], Rare: [215, 80], 'Very Rare': [275, 60], Legendary: [30, 90], Artifact: [0, 75], Varies: [190, 35], Unknown: [190, 35] };
  function rarVars(r) { var c = RAR_COL[r] || RAR_COL.Unknown; return '--rh:' + c[0] + ';--rs:' + c[1] + '%'; }
  function rarAttr(r) { return ' style="' + rarVars(r) + '" data-rarity="' + esc(r) + '"'; }
  function rarIdx(r) { var i = RAR_ORDER.indexOf(r); return i < 0 ? 0 : i > 6 ? 2.5 : i; }

  /* ---------- sources ---------- */
  function srcOn(k) { return !!state.srcSel[k]; }
  /* an SRD item also printed in a book (PHB armor, DMG +1 weapons) counts for both */
  function itemSrcs(it) { return [it.src].concat((it.also || []).map(function (a) { return a.src; })); }
  function itemSrcOn(it) { return itemSrcs(it).some(srcOn); }
  function alsoTags(it) {
    return (it.also || []).map(function (a) { return ' <span class="srctag also"' + hueAttr(a.src) + ' title="Also in ' + esc(a.src) + '">' + esc(a.src + (a.page ? ' p.' + a.page : '')) + '</span>'; }).join('');
  }
  function alsoLinks(it) {
    return (it.also || []).map(function (a) { return ' ' + bookLink({ src: a.src, page: a.page }); }).join('');
  }
  /* core rules (SRDs, PHB, DMG, MM, both editions) from the shared table (STYLE.md 6f) */
  function coreList() { return DATA && window.DndSources ? DndSources.defaults(allBooks()) : []; }
  function coreSel() { var o = {}; coreList().forEach(function (k) { o[k] = true; }); return o; }
  function sameKeys(sel, list) { var k = Object.keys(sel || {}); return k.length === list.length && list.every(function (x) { return sel[x]; }); }
  var BOOK_HUE = {
    'SRD 5.1': 145, 'SRD 5.2': 165,
    "Player's Handbook (2014)": 0, "Player's Handbook (2024)": 0,
    "Dungeon Master's Guide (2014)": 220, "Dungeon Master's Guide (2024)": 220,
    "Xanathar's Guide to Everything": 284, "Tasha's Cauldron of Everything": 268,
    "Explorer's Guide to Wildemount": 100, 'Eberron: Rising from the Last War': 200,
    'The Book of Many Things': 300, "Guildmasters' Guide to Ravnica": 18,
    "Fizban's Treasury of Dragons": 34, 'Bigby Presents: Glory of the Giants': 48
  };
  var SRD_URL = 'https://dnd.wizards.com/resources/systems-reference-document';
  var DDB = 'https://www.dndbeyond.com/sources/dnd/';
  /* D&D Beyond pages, all checked 2026-11-13; books without a page are left unlinked */
  var BOOK_SLUG = {
    "Player's Handbook (2014)": 'phb-2014', "Player's Handbook (2024)": 'phb-2024',
    "Dungeon Master's Guide (2014)": 'dmg-2014', "Dungeon Master's Guide (2024)": 'dmg-2024',
    'Monster Manual (2014)': 'mm-2014', 'Monster Manual (2025)': 'mm-2024',
    'Acquisitions Incorporated': 'ai', 'Arcana Unleashed': 'au', "Astral Adventurer's Guide": 'sais', "Boo's Astral Menagerie": 'sais',
    'Light of Xaryxis': 'sais', "Baldur's Gate: Descent Into Avernus": 'bgdia', 'Bigby Presents: Glory of the Giants': 'gotg',
    'Candlekeep Mysteries': 'cm', 'Curse of Strahd': 'cos', 'Dragonlance: Shadow of the Dragon Queen': 'sotdq',
    'Eberron: Forge of the Artificer': 'efota', 'Eberron: Rising from the Last War': 'erftlw',
    'Essentials Kit: Divine Contention': 'dc', "Essentials Kit: Sleeping Dragon's Wake": 'sdw',
    "Explorer's Guide to Wildemount": 'egtw', "Fizban's Treasury of Dragons": 'ftod',
    'Forgotten Realms: Adventures in Faerûn': 'fraif', 'Forgotten Realms: Heroes of Faerûn': 'frhof',
    'Ghosts of Saltmarsh': 'gos', "Guildmasters' Guide to Ravnica": 'ggtr', 'Heroes of the Borderlands': 'hotb',
    'Hoard of the Dragon Queen': 'hotdq', 'Icewind Dale: Rime of the Frostmaiden': 'idrotf',
    'Journeys through the Radiant Citadel': 'jttrc', 'Keys from the Golden Vault': 'kftgv', 'Lost Mine of Phandelver': 'lmop',
    "Mordenkainen's Tome of Foes": 'mtof', 'Out of the Abyss': 'oota', 'Phandelver and Below: The Shattered Obelisk': 'pbtso',
    'Princes of the Apocalypse': 'pota', 'Quests from the Infinite Staircase': 'qftis', 'Ravenloft: The Horrors Within': 'rthw',
    'Rise of Tiamat': 'rot', "Storm King's Thunder": 'skt', 'Strixhaven: A Curriculum of Chaos': 'sacoc',
    "Sword Coast Adventurer's Guide": 'scag', "Tasha's Cauldron of Everything": 'tcoe', 'The Book of Many Things': 'tbomt',
    'The Wild Beyond the Witchlight': 'twbtw', 'Tomb of Annihilation': 'toa', "Van Richten's Guide to Ravenloft": 'vrgtr',
    'Vecna: Eve of Ruin': 'veor', "Volo's Guide to Monsters": 'vgtm', 'Waterdeep: Dragon Heist': 'wdh',
    'Waterdeep: Dungeon of the Mad Mage': 'wdotmm', 'World of Warcraft': 'wow', "Xanathar's Guide to Everything": 'xgte'
  };
  function bookUrl(k) { return /^SRD/.test(k) ? SRD_URL : BOOK_SLUG[k] ? DDB + BOOK_SLUG[k] : null; }
  function srcHue(k) {
    if (BOOK_HUE[k] != null) return BOOK_HUE[k];
    var h = 0; for (var i = 0; i < k.length; i++) h = (h * 31 + k.charCodeAt(i)) % 360;
    return h;
  }
  function hueAttr(k) { return ' style="--h:' + srcHue(k) + '"'; }
  function srcLabel(it) { return it.src + (it.page ? ' p.' + it.page : ''); }
  function srcTag(it) { return '<span class="srctag"' + hueAttr(it.src) + '>' + esc(srcLabel(it)) + '</span>'; }
  function bookLink(it) {
    var u = bookUrl(it.src);
    return u ? '<a class="srctag" href="' + u + '" target="_blank" rel="noopener"' + hueAttr(it.src) + '>' + esc(srcLabel(it)) + '</a>' : srcTag(it);
  }
  function rarPill(r, label) { return '<span class="rar"' + rarAttr(r) + '>' + esc(label || r) + '</span>'; }

  /* ---------- formatting ---------- */
  function money(gp) {
    if (gp == null) return '';
    if (gp >= 1) return (Math.round(gp * 100) / 100).toLocaleString() + ' gp';
    if (gp * 10 >= 1 && Math.abs(gp * 10 - Math.round(gp * 10)) < 1e-6) return Math.round(gp * 10) + ' sp';
    return Math.round(gp * 100) + ' cp';
  }
  function attuneText(a) {
    if (!a) return '';
    if (a === true) return 'Requires attunement';
    if (/^optional$/i.test(a)) return 'Attunement optional';
    return 'Requires attunement ' + a.replace(/^Requires attunement\s*/i, '').replace(/\{@\w+ ([^|}]*)[^}]*\}/g, '$1');
  }
  function inline(s) {
    return esc(s).replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>').replace(/(^|[\s(>])_([^_]+)_(?=[\s.,;:)!?<]|$)/g, '$1<i>$2</i>').replace(/(^|[\s(>])\*([^*\s][^*]*)\*(?=[\s.,;:)!?<]|$)/g, '$1<i>$2</i>');
  }
  /* tiny markdown: paragraphs, | tables |, - lists, **bold**, _italic_ */
  function md(text) {
    var lines = String(text || '').split('\n'), out = [], buf = [], mode = null;
    function flush() {
      if (!buf.length) return;
      if (mode === 'table') {
        var rows = buf.filter(function (l) { return !/^\|[\s\-:|]+\|?$/.test(l); }).map(function (l) {
          return l.replace(/^\||\|$/g, '').split('|').map(function (c) { return c.trim(); });
        });
        out.push('<div class="tbl"><table><thead><tr>' + rows[0].map(function (c) { return '<th>' + inline(c) + '</th>'; }).join('') + '</tr></thead><tbody>' +
          rows.slice(1).map(function (r) { return '<tr>' + r.map(function (c) { return '<td>' + inline(c) + '</td>'; }).join('') + '</tr>'; }).join('') + '</tbody></table></div>');
      } else if (mode === 'list') {
        out.push('<ul>' + buf.map(function (l) { return '<li>' + inline(l.replace(/^\s*[-*]\s+/, '')) + '</li>'; }).join('') + '</ul>');
      } else {
        out.push('<p>' + buf.map(inline).join('<br>') + '</p>');
      }
      buf = []; mode = null;
    }
    lines.forEach(function (l) {
      var t = l.trim().replace(/^>\s?/, ''), m =!t ? null : /^\|/.test(t) ? 'table' : /^[-*]\s+/.test(t) && !/^\*\*/.test(t) ? 'list' : 'p';
      if (!m) return flush();
      if (m !== mode) flush();
      mode = m; buf.push(t);
    });
    flush();
    return out.join('');
  }
  function factsLine(it) {
    var bits = [], w = it.weapon, a = it.armor;
    if (w) {
      if (w.dmg) bits.push(w.dmg + ' ' + w.dtype.toLowerCase());
      if (w.range) bits.push('range ' + w.range);
      if (w.props && w.props.length) bits.push(w.props.join(', '));
      if (w.mastery) bits.push('Mastery: ' + w.mastery);
    }
    if (a) {
      bits.push('AC ' + a.ac);
      if (a.str) bits.push('Str ' + a.str);
      if (a.stealth) bits.push('Stealth disadvantage');
    }
    if (it.cost) bits.push(money(it.cost));
    if (it.weight) bits.push(it.weight + ' lb');
    return bits;
  }

  /* ---------- characters (shared D&D Toolbox list, character.js) ---------- */
  var REPO = 'dnd-items';
  var CLASSES = ['artificer', 'barbarian', 'bard', 'cleric', 'druid', 'fighter', 'monk', 'paladin', 'ranger', 'rogue', 'sorcerer', 'warlock', 'wizard'];
  function activeCh() { try { return window.DndChar ? DndChar.active() : null; } catch (e) { return null; } }
  /* this character's lists, or the no-character favorites (di.favs) */
  /* read fresh from storage every time, so two open tabs never write over each other's changes */
  function validId(id) { return !DATA || !!(BYID[id] || GROUPS[id]); }
  function cleanSet(o) {
    var r = {}, drop = false;
    if (o && typeof o === 'object') for (var k in o) { if (validId(k)) r[k] = true; else drop = true; }
    return [r, drop];
  }
  function lists() {
    var ch = activeCh(), l;
    if (ch) l = ch.links[REPO] || {};
    else { var f = store.get('di.favs', {}); state.favs = f && typeof f === 'object' ? f : {}; l = { favs: state.favs }; }
    var fv = cleanSet(l.favs), wv = cleanSet(l.wish), raw = Array.isArray(l.att) ? l.att : [];
    var at = raw.filter(function (id) { return !DATA || !!BYID[id]; });
    var inv = {}, invDrop = false;
    if (l.inv && typeof l.inv === 'object') for (var k in l.inv) { if (validId(k)) inv[k] = Math.max(1, parseInt(l.inv[k], 10) || 1); else invDrop = true; }
    var out = { favs: fv[0], wish: wv[0], att: at, inv: inv };
    /* ids that no longer exist (an item renamed in a data update) are dropped quietly, after this redraw */
    if (DATA && (fv[1] || wv[1] || invDrop || at.length !== raw.length)) setTimeout(function () { setLists(out); }, 0);
    return out;
  }
  function setLists(patch) {
    var ch = activeCh();
    if (!ch) { if (patch.favs) { state.favs = patch.favs; store.set('di.favs', patch.favs); } return; }
    /* keep any other keys another version of this site stored in its link */
    DndChar.setLink(ch.id, REPO, Object.assign({}, ch.links[REPO] || {}, patch));
  }
  /* attunement slots: 3 in both editions; artificers get 4, 5 and 6 at levels 10, 14 and 18 */
  function attMax(ch) { var a = ch && window.DndChar ? DndChar.levelIn(ch, 'artificer') : 0; return a >= 18 ? 6 : a >= 14 ? 5 : a >= 10 ? 4 : 3; }
  /* classes an item's attunement is limited to: ['cleric','paladin'], ['*caster'], or null for anyone */
  /* "by a cleric or paladin" -> both classes; "by a dwarf, fighter, or paladin" -> null, because a dwarf of
     any class qualifies and the character record has no race. Every "or" alternative must name a class. */
  function attClasses(it) {
    if (it._ac === undefined) {
      it._ac = null;
      var a = typeof it.attune === 'string' ? it.attune.toLowerCase() : '';
      var w = a.indexOf('who must be');
      if (w >= 0) a = a.slice(w + 11);
      var alts = a.replace(/^\s*by\s+/, '').split(/,|\bor\b/).map(function (x) { return x.trim(); }).filter(Boolean);
      var all = [], ok = alts.length > 0;
      alts.forEach(function (x) {
        var words = x.split(/[^a-z]+/);
        var hit = CLASSES.filter(function (c) { return words.indexOf(c) >= 0 || words.indexOf(c + 's') >= 0; });
        if (words.indexOf('spellcaster') >= 0 || words.indexOf('spellcasters') >= 0) hit.push('*caster');
        if (!hit.length) ok = false; else all = all.concat(hit);
      });
      if (ok && all.length) it._ac = all;
    }
    return it._ac;
  }
  function casts(ch) {
    return ch.classes.some(function (c) {
      if (['bard', 'cleric', 'druid', 'sorcerer', 'warlock', 'wizard', 'artificer'].indexOf(c.cls) >= 0) return true;
      if (c.cls === 'paladin' || c.cls === 'ranger') return ch.ed === '2024' || c.lvl >= 2;
      return (c.cls === 'fighter' || c.cls === 'rogue') && c.lvl >= 3 && /eldritch knight|arcane trickster/i.test((c.subName || '') + ' ' + String(c.sub || '').replace(/-/g, ' '));
    });
  }
  function attKind(it) {
    if (!it.attune) return 'none';
    if (typeof it.attune === 'string' && /^optional$/i.test(it.attune)) return 'opt';
    return attClasses(it) ? 'cls' : 'req';
  }
  function usableBy(ch, it) {
    var r = attClasses(it);
    if (!r || !ch.classes.length) return true;
    return r.some(function (k) { return k === '*caster' ? casts(ch) : ch.classes.some(function (c) { return c.cls === k; }); });
  }

  /* ---------- filtering ---------- */
  function hay(it) {
    if (!it._hay) {
      var w = it.weapon || {}, a = it.armor || {};
      it._hay = [it.name, it.type, it.rarity, itemSrcs(it).join(' '), it.summary, typeof it.attune === 'string' ? it.attune : '', it.desc,
        w.dtype, (w.props || []).join(' '), w.mastery, a.cat].join(' ').toLowerCase();
    }
    return it._hay;
  }
  /* skip: 'type' or 'rar' leaves that facet out, for the chip counts */
  function pass(it, q, skip) {
    if (it.ed !== state.ed) return false;
    if (state.kind === 'magic' && !it.magic) return false;
    if (state.kind === 'mundane' && it.magic) return false;
    if (skip !== 'type' && state.types.length && state.types.indexOf(it.type) < 0) return false;
    if (skip !== 'rar' && state.rars.length && state.rars.indexOf(it.rarity) < 0) return false;
    if (skip !== 'att' && state.atts.length && state.atts.indexOf(attKind(it)) < 0) return false;
    if (state.consumable === 'yes' && !it.consumable) return false;
    if (state.consumable === 'no' && it.consumable) return false;
    if (!itemSrcOn(it)) return false;
    if (state.usable && CUR_CH && !usableBy(CUR_CH, it)) return false;
    if (q && hay(it).indexOf(q) < 0) return false;
    return true;
  }
  /* turns matching items into rows; SRD variants collapse into one group row */
  function toRows(list) {
    var rows = [], seen = {};
    list.forEach(function (it) {
      if (state.groupVar && it.group) {
        var g = seen[it.group];
        if (!g) { g = seen[it.group] = { isGroup: true, id: it.group, name: groupLabel(it.groupName), members: [], src: it.src, ed: it.ed }; rows.push(g); }
        g.members.push(it);
      } else rows.push(it);
    });
    rows.forEach(function (r) {
      if (!r.isGroup) return;
      if (r.members.length === 1) { rows[rows.indexOf(r)] = r.members[0]; return; }
      var m = r.members, lo = m[0], hi = m[0];
      m.forEach(function (x) { if (rarIdx(x.rarity) < rarIdx(lo.rarity)) lo = x; if (rarIdx(x.rarity) > rarIdx(hi.rarity)) hi = x; });
      r.rarity = hi.rarity; r.rarLo = lo.rarity; r.type = m[0].type; r.attune = m[0].attune; r.magic = m[0].magic;
      r.cost = m[0].cost;
      r.consumable = m.some(function (x) { return x.consumable; });
    });
    return rows;
  }
  function groupLabel(n) { return n === '+N Weapon' ? '+1, +2 and +3 Weapons' : n; }
  function isFav(id) { return !!LISTS.favs[id]; }
  function isWish(id) { return !!LISTS.wish[id]; }
  function isAtt(id) { return LISTS.att.indexOf(id) >= 0; }
  /* in a set by its own id, its variant group's id, or (a group card) any of its variants' ids */
  function inSet(set, r) {
    if (set[r.id] || (r.group && set[r.group])) return true;
    return !!(r.isGroup && r.members.some(function (m) { return set[m.id]; }));
  }
  /* in the list views, a variant group shows only the variants on that list (all of them if the group itself was added) */
  function narrow(rows) {
    var set = state.show === 'fav' ? LISTS.favs : state.show === 'wish' ? LISTS.wish : state.show === 'inv' ? LISTS.inv : null;
    return rows.map(function (r) {
      if (!r.isGroup || (set && set[r.id])) return r;
      var m = r.members.filter(function (x) { return set ? set[x.id] : isAtt(x.id); });
      if (m.length === 1) return m[0];
      if (!m.length || m.length === r.members.length) return r;
      var g = Object.assign({}, r, { members: m });
      g.rarity = m.reduce(function (a, x) { return rarIdx(x.rarity) > rarIdx(a) ? x.rarity : a; }, m[0].rarity);
      g.rarLo = m.reduce(function (a, x) { return rarIdx(x.rarity) < rarIdx(a) ? x.rarity : a; }, m[0].rarity);
      return g;
    });
  }
  function inShow(r) {
    if (state.show === 'fav') return inSet(LISTS.favs, r);
    if (state.show === 'wish') return inSet(LISTS.wish, r);
    if (state.show === 'inv') return inSet(LISTS.inv, r);
    if (state.show === 'att') return r.isGroup ? r.members.some(function (m) { return isAtt(m.id); }) : isAtt(r.id);
    return true;
  }

  function sortRows(rows) {
    var s = state.sort, q = state.q.trim().toLowerCase();
    /* when searching, items whose name matches come before items that only mention it in their text */
    function nameHit(r) { return q && r.name.toLowerCase().indexOf(q) >= 0 ? 0 : 1; }
    rows.sort(function (x, y) {
      var d = nameHit(x) - nameHit(y);
      if (d) return d;
      if (s === 'rar-desc') d = rarIdx(y.rarity) - rarIdx(x.rarity);
      else if (s === 'rar-asc') d = rarIdx(x.rarity) - rarIdx(y.rarity);
      else if (s === 'type') d = TYPE_ORDER.indexOf(x.type) - TYPE_ORDER.indexOf(y.type);
      else if (s === 'cost') d = (y.cost || -1) - (x.cost || -1);
      else if (s === 'src') d = (/^SRD/.test(x.src) ? 0 : 1) - (/^SRD/.test(y.src) ? 0 : 1) || x.src.localeCompare(y.src);
      return d || sortName(x).localeCompare(sortName(y));
    });
    return rows;
  }
  /* "+2 Rod of the Pact Keeper" sorts under R, next to the other variants */
  function sortName(r) {
    if (r._sn == null) r._sn = r.name.replace(/^\+\d,?\s+(\+\d,?\s+)*(and \+\d\s+)?/, '') + ' ' + r.name;
    return r._sn;
  }

  /* ---------- rendering ---------- */
  function render() {
    if (!DATA) return;
    var q = state.q.trim().toLowerCase();
    CUR_CH = activeCh(); LISTS = lists();
    var srd = DATA.items.filter(function (it) { return pass(it, q); });
    var oth = DATA.others.filter(function (it) { return pass(it, q); });
    var main = toRows(state.merge ? srd.concat(oth) : srd);
    if (state.show) main = narrow(main.filter(inShow));
    sortRows(main);
    writeUrl();
    LAST_MAIN = main;
    var nItems = main.reduce(function (n, r) { return n + (r.isGroup ? r.members.length : 1); }, 0);
    var cn = $('#countN');
    if (window.DndUI && DndUI.count && cn.dataset.n && !TYPING) DndUI.count(cn, nItems, function (v) { return Math.round(v).toLocaleString(); });
    else cn.textContent = nItems.toLocaleString();
    cn.dataset.n = nItems;
    $('#countRest').textContent = ' item' + (nItems === 1 ? '' : 's') + (nItems !== main.length ? ' (' + main.length.toLocaleString() + ' card' + (main.length === 1 ? '' : 's') + ')' : '');
    drawChart(main);
    var list = $('#list');
    list.className = 'list detail-' + state.detail;
    list.innerHTML = main.slice(0, state.limit).map(card).join('');
    pager('#moreBtn', main.length, state.limit);
    $('#empty').hidden = main.length > 0;
    var emptyList = state.show === 'fav' ? !Object.keys(LISTS.favs).length : state.show === 'wish' ? !Object.keys(LISTS.wish).length : state.show === 'att' ? !LISTS.att.length : state.show === 'inv' ? !Object.keys(LISTS.inv).length : false;
    $('#empty').textContent = emptyList
      ? { fav: 'No favorites yet. Tap the star on any card to add it.', wish: 'Nothing on the wishlist yet. Open an item and choose Add to wishlist.', att: 'Nothing attuned yet. Open an item that needs attunement and choose Attune.', inv: 'Nothing in the inventory yet. Open an item and choose Add to inventory, or import the character in the D&D Toolbox.' }[state.show]
      : 'No items match. Try clearing a filter, adding books in Sources, or switching the rules edition.' + (state.usable && CUR_CH ? ' (Usable by ' + CUR_CH.name + ' is on.)' : '');
    if (state.merge) $('#othersSec').hidden = true;
    else {
      if (state.show) oth = oth.filter(inShow);
      sortRows(oth);
      LAST_OTH = oth;
      $('#othersSec').hidden = !oth.length;
      $('#others').innerHTML = oth.slice(0, state.limitOthers).map(otherRow).join('');
      pager('#moreOthersBtn', oth.length, state.limitOthers);
    }
    renderChips();
    renderSources();
    syncControls();
    publishSheet();
  }
  /* bar chart of the current results by rarity (items, not cards); drawn only while its panel is open */
  var chart = null, LAST_ROWS = [];
  function drawChart(rows) {
    LAST_ROWS = rows;
    var box = $('#chartBox');
    if (!box.open || !window.DndPlot || !DATA) return;
    var by = {}, seen = {};
    DATA.items.concat(DATA.others).forEach(function (it) { if (it.ed === state.ed) seen[it.rarity] = 1; });
    rows.forEach(function (r) { (r.isGroup ? r.members : [r]).forEach(function (m) { by[m.rarity] = (by[m.rarity] || 0) + 1; }); });
    var labels = RAR_ORDER.filter(function (k) { return seen[k]; });
    var o = { labels: labels, values: labels.map(function (k) { return by[k] || 0; }), name: 'Items', xLabel: 'Rarity', yLabel: 'Items',
      title: 'Items in the current results by rarity (' + state.ed + ' rules)', fmt: function (v) { return Math.round(v).toLocaleString(); } };
    $('#chartHead').textContent = 'Current results by rarity (' + state.ed + ' rules)';
    if (chart) chart.update(o); else chart = DndPlot.bars($('#rarChart'), o);
  }
  /* summary for the hub's Character Sheet and Party pages (STYLE.md 6e): the items on the active
     character's lists. Built in a fixed order, so setSheet sees "no change" and writes nothing. */
  function sheetSummary(ch) {
    var l = lists(), rows = {}, order = [];
    function add(id, tag) {
      var it = BYID[id], g = GROUPS[id], r = rows[id];
      if (!it && !g) return;
      if (!r) {
        var name = it ? it.name : groupLabel(g[0].groupName), rar = it ? it.rarity : g.reduce(function (a, x) { return rarIdx(x.rarity) > rarIdx(a) ? x.rarity : a; }, g[0].rarity);
        r = rows[id] = { n: name, rar: rar, att: false, l: [] };
        var need = it ? it.attune : g[0].attune;
        if (need) r.need = attuneText(need).replace(/^Requires attunement\s*/, '') || 'yes';
        if (it && it.ed) r.ed = it.ed; else if (g) r.ed = g[0].ed;
        order.push(id);
      }
      if (tag === 'att') r.att = true; else if (r.l.indexOf(tag) < 0) r.l.push(tag);
      if (tag === 'inv' && l.inv[id] > 1) r.qty = l.inv[id];
    }
    l.att.forEach(function (id) { add(id, 'att'); });
    Object.keys(l.inv).sort().forEach(function (id) { add(id, 'inv'); });
    Object.keys(l.wish).sort().forEach(function (id) { add(id, 'wish'); });
    Object.keys(l.favs).sort().forEach(function (id) { add(id, 'fav'); });
    var items = order.map(function (id) { return rows[id]; });
    items.sort(function (a, b) { return (b.att - a.att) || a.n.localeCompare(b.n); });
    var out = { v: 1, items: items, attuned: l.att.length, attMax: attMax(ch) };
    /* stay under the 6000-character limit: drop list-only items from the end, keep a count */
    while (JSON.stringify(out).length > 5900 && out.items.length) { out.items.pop(); out.more = (out.more || 0) + 1; }
    return out;
  }
  function publishSheet() {
    var ch = activeCh();
    if (!ch || !DATA || !window.DndChar || !DndChar.setSheet) return;
    DndChar.setSheet(ch.id, REPO, sheetSummary(ch));
  }
  var IMP_SRC = { ddb: 'D&D Beyond', foundry: 'Foundry VTT', fc5: 'Fight Club 5', dicecloud: 'DiceCloud' };
  function impOf(ch) { var i = ch && ch.imp; return i && Array.isArray(i.items) && i.items.length && i.at ? i : null; }
  function impPending(ch) { var i = impOf(ch), l = ch && (ch.links[REPO] || {}); return !!(i && (!l.impAt || String(i.at) > String(l.impAt))); }
  function hideImp() { $('#impNote').hidden = true; $('#impNote').innerHTML = ''; }
  function checkImport() {
    var ch = activeCh(), box = $('#impNote');
    if (!DATA || !impPending(ch)) { if (!box.dataset.result) hideImp(); return; }
    var i = impOf(ch), src = IMP_SRC[i.src] || 'another site';
    delete box.dataset.result;
    box.innerHTML = '<p><b>' + i.items.length + ' item' + (i.items.length === 1 ? '' : 's') + '</b> came with ' + esc(ch.name) + '\'s import from ' + esc(src) + '.</p>' +
      '<div class="imp-btns"><button type="button" class="btn" data-imp-add="1">Add the items imported from ' + esc(src) + ' to ' + esc(ch.name) + '\'s inventory</button>' +
      '<button type="button" class="chip" data-imp-skip="1">Not now</button></div>';
    box.hidden = false;
    if (window.DndUI && DndUI.enter) DndUI.enter(box);
  }
  function markImported() {
    var ch = activeCh(), i = impOf(ch); if (!ch || !i) return;
    setLists({ impAt: i.at });
  }
  /* names to try for an imported item: "Longsword, +1" -> "+1 Longsword" -> "Longsword (+1)"; "Rope, hempen (50 feet)" -> "Hempen Rope" */
  function impKeys(n) {
    var s = String(n || '').replace(/[\u2018\u2019]/g, "'").trim(), out = [];
    function push(x) { var k = norm(x); if (k && out.indexOf(k) < 0) out.push(k); }
    push(s);
    var bare = s.replace(/\s*\([^)]*\)\s*$/, ''); push(bare);
    var m = bare.match(/^([^,]+),\s*(.+)$/); if (m) { push(m[2] + ' ' + m[1]); bare = m[2] + ' ' + m[1]; }
    var p = bare.match(/^\+(\d)\s+(.+)$/); if (p) push(p[2] + ' (+' + p[1] + ')');
    /* the 2024 SRD renamed these: "Belt of Hill Giant Strength" -> "Belt of Giant Strength (Hill)", six potions -> one */
    var gs = bare.match(/^(Belt|Potion) of (\w+) Giant Strength$/i);
    if (gs && /^belt$/i.test(gs[1])) { push('Belt of Giant Strength (' + gs[2] + ')'); if (/^(frost|stone)$/i.test(gs[2])) push('Belt of Giant Strength (Frost or Stone)'); }
    else if (gs) push('Potion of Giant Strength');
    /* "Studded Leather" is "Studded Leather Armor" in the SRD, and the other way round */
    if (/\barmor$/i.test(bare)) push(bare.replace(/\s+armor$/i, '')); else push(bare + ' Armor');
    return out;
  }
  var KEYIDX = null;
  function keyIndex() {
    if (KEYIDX) return KEYIDX;
    KEYIDX = {};
    /* SRD items win over book entries (added last), and an exact name wins over a derived one
       ("Holy Avenger" is the base item, not "Holy Avenger (Whip)" with its parentheses dropped) */
    var all = DATA.others.concat(DATA.items);
    all.forEach(function (it) {
      impKeys(it.name).slice(1).forEach(function (k) { KEYIDX[it.ed + '|' + k] = it.id; });
      if (it.group && it.groupName) KEYIDX[it.ed + '|g|' + norm(it.groupName)] = KEYIDX[it.ed + '|g|' + norm(it.groupName)] || it.group;
    });
    all.forEach(function (it) { KEYIDX[it.ed + '|' + norm(it.name)] = it.id; });
    return KEYIDX;
  }
  function findItem(n, ed) {
    var idx = keyIndex(), eds = ed === '2014' ? ['2014', '2024'] : ['2024', '2014'], ks = impKeys(n);
    /* last resort, own edition only: the part before a comma ("Rope, Hempen (50 feet)" -> "Rope") */
    var head = String(n || '').split(',')[0], hk = head !== String(n || '') ? norm(head) : '';
    for (var e = 0; e < eds.length; e++) {
      for (var j = 0; j < ks.length; j++) if (idx[eds[e] + '|' + ks[j]]) return idx[eds[e] + '|' + ks[j]];
      for (var j2 = 0; j2 < ks.length; j2++) if (idx[eds[e] + '|g|' + ks[j2]]) return idx[eds[e] + '|g|' + ks[j2]];
      if (e === 0 && hk && idx[eds[e] + '|' + hk]) return idx[eds[e] + '|' + hk];
    }
    return null;
  }
  /* adds to the inventory (and attuned list) without removing or changing anything already there */
  function importItems() {
    var ch = activeCh(), i = impOf(ch); if (!ch || !i) return;
    var l = lists(), inv = Object.assign({}, l.inv), att = l.att.slice(), max = attMax(ch), ed = i.ed || ch.ed;
    var added = 0, kept = 0, nAtt = 0, missed = [], full = [];
    i.items.forEach(function (x) {
      var id = findItem(x.n, ed);
      if (!id) { if (missed.indexOf(x.n) < 0) missed.push(x.n); return; }
      if (inv[id]) kept++; else { inv[id] = Math.max(1, parseInt(x.qty, 10) || 1); added++; }
      if (x.att && BYID[id] && BYID[id].attune && att.indexOf(id) < 0) {
        if (att.length < max) { att.push(id); nAtt++; } else full.push(BYID[id].name);
      }
    });
    setLists({ inv: inv, att: att, impAt: i.at });
    var box = $('#impNote');
    box.dataset.result = '1';
    box.innerHTML = '<p>Added <b>' + added + '</b> item' + (added === 1 ? '' : 's') + ' to ' + esc(ch.name) + '\'s inventory' +
      (nAtt ? ' and marked ' + nAtt + ' attuned' : '') + (kept ? '; ' + kept + (kept === 1 ? ' was' : ' were') + ' already there' : '') + '.</p>' +
      (full.length ? '<p class="small">Not attuned (all ' + max + ' slots used): ' + esc(full.join(', ')) + '.</p>' : '') +
      (missed.length ? '<p class="small">Not found on this site (homebrew, renamed, or not in any book here): ' + esc(missed.join(', ')) + '.</p>' : '') +
      '<div class="imp-btns"><button type="button" class="btn" data-imp-show="1">Show the inventory</button><button type="button" class="chip" data-imp-close="1">Close</button></div>';
    box.hidden = false;
    render();
  }
  function pager(sel, total, limit) {
    $(sel).hidden = total <= limit;
    $(sel).textContent = 'Show more (' + Math.max(0, total - limit).toLocaleString() + ' left)';
  }
  /* "Show more" appends the next page instead of redrawing every card */
  function more(which) {
    if (which === 'main') {
      var from = state.limit; state.limit += PAGE;
      $('#list').insertAdjacentHTML('beforeend', LAST_MAIN.slice(from, state.limit).map(card).join(''));
      pager('#moreBtn', LAST_MAIN.length, state.limit);
    } else {
      var f2 = state.limitOthers; state.limitOthers += PAGE;
      $('#others').insertAdjacentHTML('beforeend', LAST_OTH.slice(f2, state.limitOthers).map(otherRow).join(''));
      pager('#moreOthersBtn', LAST_OTH.length, state.limitOthers);
    }
  }
  /* every setting goes in the link, so Copy link reproduces the view exactly */
  function writeUrl() {
    var u = new URL(location.href);
    u.searchParams.set('ed', state.ed);
    if (state.q) u.searchParams.set('q', state.q); else u.searchParams.delete('q');
    function setP(n, v) { if (v) u.searchParams.set(n, v); else u.searchParams.delete(n); }
    setP('kind', state.kind !== 'all' && state.kind);
    setP('type', state.types.join('|'));
    setP('rarity', state.rars.join('|'));
    setP('attune', state.atts.join('|'));
    setP('cons', state.consumable);
    setP('view', state.detail !== 'basic' && state.detail);
    setP('sort', state.sort !== 'name' && state.sort);
    var books = Object.keys(state.srcSel).sort(), core = coreList().sort();
    var every = allBooks().every(srcOn);
    setP('books', every ? 'all' : books.join('|') !== core.join('|') && books.join('|'));
    setP('show', state.show);
    setP('one', !state.merge && '0');
    setP('group', !state.groupVar && '0');
    setP('usable', !state.usable && '0');
    if (!$('#detail').open) u.searchParams.delete('item');
    if (u.href !== location.href) history.replaceState(null, '', u);
    var lq = new URLSearchParams(u.search); lq.delete('item'); lq.delete('char');
    LINKQ = lq.toString();
  }
  function itemHref(id) { return '?' + (LINKQ ? LINKQ + '&' : '') + 'item=' + encodeURIComponent(id); }
  function openLink(id, name) { return '<a class="open" href="' + esc(itemHref(id)) + '" data-open="' + esc(id) + '">' + esc(name) + '</a>'; }

  var STAR = '<svg viewBox="0 0 24 24"><path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/></svg>';
  function favBtn(id, name) {
    var f = isFav(id);
    return '<button type="button" class="fav" data-fav="' + esc(id) + '" aria-pressed="' + f + '" aria-label="Favorite ' + esc(name) + '" title="Favorite">' + STAR + '</button>';
  }
  function metaLine(r) {
    var bits = [r.type];
    if (r.weapon && r.weapon.cat) bits.push(r.weapon.cat + (r.weapon.ranged ? ' ranged' : ' melee'));
    if (r.armor && r.armor.cat && r.armor.cat !== 'Shield') bits.push(r.armor.cat + ' armor');
    if (r.attune) bits.push(attuneText(r.attune));
    if (r.consumable) bits.push('Consumable');
    return '<div class="meta">' + bits.map(esc).join(' &middot; ') + '</div>';
  }
  function marks(r) {
    var att = r.isGroup ? r.members.some(function (m) { return isAtt(m.id); }) : isAtt(r.id);
    var q = !r.isGroup && LISTS.inv[r.id];
    return (att ? ' <span class="mark att">Attuned</span>' : '') + (inSet(LISTS.inv, r) ? ' <span class="mark inv">Owned' + (q > 1 ? ' &times;' + q : '') + '</span>' : '') +
      (inSet(LISTS.wish, r) ? ' <span class="mark wish">Wishlist</span>' : '') +
      (r.isGroup && !isFav(r.id) && inSet(LISTS.favs, r) ? ' <span class="mark fav">&#9733; variant</span>' : '');
  }
  function card(r) {
    if (r.isGroup) return groupCard(r);
    var h = '<article class="card' + (r.srd ? '' : ' book') + '"' + rarAttr(r.rarity) + ' data-id="' + esc(r.id) + '" data-spot>' +
      '<div class="card-top"><div><h3>' + openLink(r.id, r.name) + '</h3></div></div>' + favBtn(r.id, r.name) +
      '<div class="pills">' + rarPill(r.rarity) + marks(r) + '</div>' + metaLine(r) +
      '<div class="src">' + srcTag(r) + alsoTags(r) + (r.srd ? '' : ' <span class="small">facts only</span>') + '</div>';
    if (state.detail !== 'basic') {
      var f = factsLine(r);
      if (f.length) h += '<p class="facts">' + esc(f.join(' · ')) + '</p>';
      if (r.summary) h += '<p class="summary">' + esc(r.summary) + '</p>';
    }
    if (state.detail === 'full') h += r.srd ? '<div class="itext mini">' + md(r.desc) + '</div>' : '<p class="small muted nostats">Rules text is in ' + esc(srcLabel(r)) + '.</p>';
    return h + '</article>';
  }
  function groupCard(g) {
    var names = g.members.map(function (m) { var x = m.name.match(/\(([^)]*)\)$/); return x ? x[1] : m.name; });
    var shown = names.slice(0, 6).join(', ') + (names.length > 6 ? ', and ' + (names.length - 6) + ' more' : '');
    var h = '<article class="card group"' + rarAttr(g.rarity) + ' data-group="' + esc(g.id) + '" data-spot>' +
      '<div class="card-top"><div><h3>' + openLink(g.id, g.name) + '</h3><div class="alt">' + g.members.length + ' variants</div></div></div>' + favBtn(g.id, g.name) +
      '<div class="pills">' + (g.rarLo !== g.rarity ? rarPill(g.rarLo) + '<span class="small">to</span>' + rarPill(g.rarity) : rarPill(g.rarity)) + marks(g) + '</div>' + metaLine(g) +
      '<div class="src">' + srcTag(g) + alsoTags(g.members[0]) + '</div>';
    if (state.detail !== 'basic') {
      h += '<p class="facts">' + esc(shown) + '</p>';
      if (g.members[0].summary) h += '<p class="summary">' + esc(g.members[0].summary) + '</p>';
    }
    if (state.detail === 'full') h += '<div class="itext mini">' + md(g.members[0].desc) + '</div>';
    return h + '</article>';
  }
  function otherRow(o) {
    return '<div class="other"' + rarAttr(o.rarity) + ' data-id="' + esc(o.id) + '">' +
      '<b>' + openLink(o.id, o.name) + '</b>' + favBtn(o.id, o.name) + '<div class="pills">' + rarPill(o.rarity) + marks(o) + '</div>' + metaLine(o) +
      '<div class="src">' + srcTag(o) + '</div></div>';
  }

  /* type and rarity chips, built from the data for this edition */
  function renderChips() {
    /* counts follow every other filter (books, kind, search...), so a chip's number is what you get */
    var types = {}, rars = {}, atts = {}, all = {}, q = state.q.trim().toLowerCase(), pool = state.merge ? DATA.items.concat(DATA.others) : DATA.items;
    pool.forEach(function (it) {
      if (it.ed !== state.ed) return;
      all[it.type] = all[it.rarity] = 1;
      if (pass(it, q, 'type')) types[it.type] = (types[it.type] || 0) + 1;
      if (pass(it, q, 'rar')) rars[it.rarity] = (rars[it.rarity] || 0) + 1;
      if (pass(it, q, 'att')) { var k = attKind(it); atts[k] = (atts[k] || 0) + 1; }
    });
    /* one tick-box row; rows with nothing to show are dimmed unless ticked */
    function row(kind, key, label, n, on, extra) {
      return '<label class="srcrow' + (n || on ? '' : ' zero') + (extra || '') + '"' + (kind === 'rar' ? rarAttr(key) : '') + '><input type="checkbox" data-' + kind + '="' + esc(key) + '"' + (on ? ' checked' : '') + '>' +
        (kind === 'rar' ? '<i class="dot" aria-hidden="true"></i>' : '') + '<span>' + esc(label) + '</span><span class="n">' + (n || 0) + '</span></label>';
    }
    function summary(pick, sum, label, names) {
      $(sum).textContent = names.length ? label + ': ' + (names.length > 2 ? names.length + ' picked' : names.join(' or ')) : label;
      $(pick).classList.toggle('filtered', names.length > 0);
    }
    $('#typeChips').innerHTML = TYPE_ORDER.filter(function (t) { return all[t]; }).map(function (t) { return row('type', t, t, types[t], state.types.indexOf(t) >= 0); }).join('');
    $('#rarChips').innerHTML = RAR_ORDER.filter(function (t) { return all[t]; }).map(function (t) { return row('rar', t, t, rars[t], state.rars.indexOf(t) >= 0, ' rrow'); }).join('');
    $('#attList').innerHTML = ATT_KINDS.map(function (k) { return row('att', k[0], k[1], atts[k[0]], state.atts.indexOf(k[0]) >= 0); }).join('');
    summary('#typePick', '#typeSum', 'Type', TYPE_ORDER.filter(function (t) { return state.types.indexOf(t) >= 0; }));
    summary('#rarPick', '#rarSum', 'Rarity', RAR_ORDER.filter(function (t) { return state.rars.indexOf(t) >= 0; }));
    summary('#attPick', '#attSum', 'Attunement', ATT_KINDS.filter(function (k) { return state.atts.indexOf(k[0]) >= 0; }).map(function (k) { return k[1].replace(/^Attunement optional$/, 'Optional'); }));
  }

  /* source picker: every source in the current edition, with counts */
  function sourceCounts() {
    var c = {};
    DATA.items.concat(DATA.others).forEach(function (it) { if (it.ed === state.ed) itemSrcs(it).forEach(function (k) { c[k] = (c[k] || 0) + 1; }); });
    return c;
  }
  function srcOrder(keys) { return window.DndSources ? DndSources.sort(keys) : keys.slice().sort(); }
  function srcGroup(k) { return window.DndSources ? DndSources.info(k).groupName : ''; }
  function renderSources() {
    var c = sourceCounts(), keys = srcOrder(Object.keys(c));
    var on = keys.filter(srcOn).length, q = state.srcQ.trim().toLowerCase();
    var lastGroup = null;
    $('#srcSum').textContent = 'Sources' + (on === keys.length ? '' : ' (' + on + ' of ' + keys.length + ')');
    $('#srcPick').classList.toggle('filtered', on !== keys.length);
    $('#srcList').innerHTML = keys.filter(function (k) { return !q || k.toLowerCase().indexOf(q) >= 0; }).map(function (k) {
      var g = srcGroup(k), head = g && g !== lastGroup ? '<div class="src-group">' + esc(g) + '</div>' : '';
      lastGroup = g;
      return head + '<label class="srcrow"' + hueAttr(k) + '><input type="checkbox" data-src="' + esc(k) + '"' + (srcOn(k) ? ' checked' : '') + '> <i class="dot" aria-hidden="true"></i><span>' + esc(k) + '</span><span class="n">' + c[k] + '</span></label>';
    }).join('') || '<p class="small muted">No book matches.</p>';
  }
  function allBooks() { var o = {}; DATA.items.concat(DATA.others).forEach(function (it) { itemSrcs(it).forEach(function (k) { o[k] = 1; }); }); return Object.keys(o); }
  function setSources(keys, on) {
    var sel = Object.assign({}, state.srcSel);
    keys.forEach(function (k) { if (on) sel[k] = true; else delete sel[k]; });
    update({ srcSel: sel });
  }
  function visibleSrcKeys() {
    return Array.prototype.map.call(document.querySelectorAll('#srcList [data-src]'), function (i) { return i.dataset.src; });
  }
  function renderSourceLinks() {
    var per = {};
    DATA.items.concat(DATA.others).forEach(function (it) { itemSrcs(it).forEach(function (k) { per[k] = per[k] || { 2014: 0, 2024: 0 }; per[k][it.ed]++; }); });
    $('#srcLinks').innerHTML = srcOrder(Object.keys(per)).map(function (k) {
      var u = bookUrl(k), n = per[k], cnt = [n[2014] ? '2014: ' + n[2014] : '', n[2024] ? '2024: ' + n[2024] : ''].filter(Boolean).join(', ');
      var note = /^SRD/.test(k) ? ' (free, CC-BY-4.0, full text)' : '';
      return '<li><i class="dot"' + hueAttr(k) + '></i><span>' + (u ? '<a href="' + u + '" target="_blank" rel="noopener">' + esc(k) + '</a>' : esc(k)) + esc(note) +
        ' <span class="small">' + esc(cnt) + '</span></span></li>';
    }).join('');
  }

  /* ---------- detail dialog ---------- */
  var dlgId = null;
  function otherEd(it) {
    var o = it.ed === '2014' ? '2024' : '2014';
    var alt = (BYNAME[o + '|' + norm(it.name)] || [])[0] || (it.groupName ? (BYNAME[o + '|' + norm(it.groupName)] || [])[0] : null);
    return alt || null;
  }
  function factsTable(it) {
    var rows = [['Type', it.type + (it.weapon && it.weapon.cat ? ' (' + it.weapon.cat.toLowerCase() + (it.weapon.ranged ? ' ranged' : ' melee') + ' weapon)' : '') + (it.armor && it.armor.cat && it.armor.cat !== 'Shield' ? ' (' + it.armor.cat.toLowerCase() + ' armor)' : '')],
      ['Rarity', it.rarity], ['Attunement', it.attune ? attuneText(it.attune) : (it.magic ? 'No' : '')], ['Consumable', it.consumable ? 'Yes' : '']];
    var w = it.weapon, a = it.armor;
    if (w) {
      rows.push(['Damage', w.dmg ? w.dmg + ' ' + w.dtype.toLowerCase() : '']);
      rows.push(['Range', w.range || '']);
      rows.push(['Properties', (w.props || []).join(', ')]);
      rows.push(['Mastery', w.mastery || '']);
    }
    if (a) { rows.push(['Armor Class', a.ac]); rows.push(['Strength', a.str || '']); rows.push(['Stealth', a.stealth ? 'Disadvantage' : '']); }
    rows.push(['Cost', money(it.cost)]); rows.push(['Weight', it.weight ? it.weight + ' lb' : '']);
    rows.push(['Rules', it.ed + (it.srd ? ' (' + it.src + ')' : '')]);
    return '<dl class="facts-dl">' + rows.filter(function (r) { return r[1]; }).map(function (r) { return '<dt>' + esc(r[0]) + '</dt><dd' + (r[0] === 'Damage' || r[0] === 'Properties' ? ' data-dice data-roll-entry="' + r[0] + '"' : '') + '>' + esc(r[1]) + '</dd>'; }).join('') + '</dl>';
  }
  var favsAtOpen = null;
  function openDetail(id) {
    var it = BYID[id], g = GROUPS[id];
    if (!it && !g) return;
    dlgId = id;
    LISTS = lists();
    if (favsAtOpen == null) favsAtOpen = JSON.stringify(LISTS);
    var h;
    if (g) {
      var m = g.filter(function (x) { return x.ed === g[0].ed; }), first = m[0];
      h = '<div class="sb-head"><h2 id="dTitle">' + esc(groupLabel(first.groupName)) + '</h2>' +
        '<p class="sb-sub">' + esc(first.type + ', ' + m.length + ' variants') + ' ' + bookLink(first) + alsoLinks(first) + '</p></div>' +
        '<div class="mn-actions">' + favDlgBtn(id) + wishBtn(id) + '</div>' +
        '<div class="itext" data-dice data-links>' + md(first.desc) + '</div><div class="sb-sec">Variants</div><ul class="variants">' +
        m.map(function (x) { return '<li><button type="button" class="linkish" data-open="' + esc(x.id) + '">' + esc(x.name) + '</button> ' + rarPill(x.rarity) + (x.attune ? ' <span class="small">attunement</span>' : '') + (isFav(x.id) ? ' <span class="mark fav">&#9733;</span>' : '') + marks(x) + '</li>'; }).join('') + '</ul>';
    } else {
      var alt = otherEd(it);
      h = '<div class="sb-head"><h2 id="dTitle">' + esc(it.name) + '</h2>' +
        '<p class="sb-sub">' + esc(it.type + ', ' + it.rarity.toLowerCase() + (it.attune ? ' (' + attuneText(it.attune).toLowerCase() + ')' : '')) + ' ' + bookLink(it) + alsoLinks(it) + '</p></div>';
      h += '<div class="ed-tabs">' + ['2014', '2024'].map(function (e) {
        var target = e === it.ed ? it : alt && alt.ed === e ? alt : null;
        return target ? '<button type="button" data-open="' + esc(target.id) + '" aria-selected="' + (e === it.ed) + '">' + e + ' rules</button>' : '';
      }).join('') + (it.group ? '<button type="button" data-open="' + esc(it.group) + '">All variants</button>' : '') + '</div>';
      h += '<div class="mn-actions">' + favDlgBtn(id) + invBtn(id) + wishBtn(id) + attBtn(it) + '</div>';
      h += factsTable(it);
      if (it.summary) h += '<p class="summary">' + esc(it.summary) + '</p>';
      if (it.srd) h += '<div class="itext" data-dice data-links>' + md(it.desc) + '</div><p class="small">Text from the ' + (it.src === 'SRD 5.1' ? 'System Reference Document 5.1' : 'System Reference Document 5.2') + ', CC-BY-4.0.</p>';
      else h += '<div class="wsnote">This item is not in the free SRD, so its rules text is not reproduced here. Look it up in <b>' + esc(it.src) + '</b>' + (it.page ? ', page ' + esc(it.page) : '') + (bookUrl(it.src) ? ' (<a href="' + bookUrl(it.src) + '" target="_blank" rel="noopener">D&amp;D Beyond</a>)' : '') + '.</div>';
    }
    $('#dBody').innerHTML = h;
    /* dice.js names rolls after the item (STYLE 6k) */
    $('#dBody').setAttribute('data-roll-ctx', it ? it.name : groupLabel(g[0].groupName));
    $('#dBody').setAttribute('data-ed', (it || g[0]).ed); /* links.js picks 2014 or 2024 links */
    var d = $('#detail');
    if (!d.open) {
      if (d.showModal) d.showModal(); else d.setAttribute('open', '');
      if (window.DndUI && DndUI.enter) DndUI.enter(d.querySelector('.dlg'));
    }
    d.querySelector('.dlg').scrollTop = 0;
    var u = new URL(location.href); u.searchParams.set('item', id); history.replaceState(null, '', u);
  }
  function invBtn(id) {
    if (!activeCh()) return '';
    var n = LISTS.inv[id];
    return '<button type="button" class="btn" data-inv="' + esc(id) + '" aria-pressed="' + !!n + '">' + (n ? '&#10003; In inventory' + (n > 1 ? ' (' + n + ')' : '') : 'Add to inventory') + '</button>';
  }
  function wishBtn(id) {
    if (!activeCh()) return '';
    var w = isWish(id);
    return '<button type="button" class="btn" data-wish="' + esc(id) + '" aria-pressed="' + w + '">' + (w ? '&#10003; On wishlist' : 'Add to wishlist') + '</button>';
  }
  function attBtn(it) {
    var ch = activeCh();
    if (!ch || !it.attune) return '';
    var a = isAtt(it.id), n = LISTS.att.length, max = attMax(ch), full = !a && n >= max;
    var h = '<button type="button" class="btn" data-att="' + esc(it.id) + '" aria-pressed="' + a + '"' +
      (full ? ' disabled title="' + esc(ch.name) + ' is attuned to ' + max + ' items already"' : '') + '>' +
      (a ? '&#10003; Attuned' : full ? 'Attunement full' : 'Attune') + ' (' + n + '/' + max + ')</button>';
    if (!usableBy(ch, it)) h += '<p class="small warn-txt">' + esc(ch.name) + ' doesn\'t meet this attunement requirement.</p>';
    return h;
  }
  function favDlgBtn(id) {
    var f = isFav(id);
    return '<button type="button" class="btn" data-fav="' + esc(id) + '" aria-pressed="' + f + '">' + (f ? '&#9733; Favorite' : '&#9734; Add to favorites') + '</button>';
  }

  /* ---------- controls ---------- */
  function syncControls() {
    document.querySelectorAll('[data-ed]').forEach(function (b) { b.setAttribute('aria-checked', b.dataset.ed === state.ed); });
    document.querySelectorAll('[data-kind]').forEach(function (b) { b.setAttribute('aria-checked', b.dataset.kind === state.kind); });
    document.querySelectorAll('[data-detail]').forEach(function (b) { b.setAttribute('aria-checked', b.dataset.detail === state.detail); });
    $('#consumable').value = state.consumable; $('#show').value = state.show;
    $('#sort').value = state.sort; $('#merge').checked = state.merge; $('#groupVar').checked = state.groupVar;
    if ($('#search').value !== state.q) $('#search').value = state.q;
    var ch = CUR_CH;
    document.querySelectorAll('.ch-only').forEach(function (e) { e.hidden = !ch; if ('disabled' in e) e.disabled = !ch; });
    $('#usable').checked = state.usable;
    $('#usableTxt').textContent = ch ? 'Usable by ' + ch.name : 'Usable by character';
    if (ch) {
      $('#show option[value="att"]').textContent = 'Attuned (' + LISTS.att.length + '/' + attMax(ch) + ')';
      $('#show option[value="inv"]').textContent = 'Inventory (' + Object.keys(LISTS.inv).length + ')';
      $('#attCount').textContent = 'Attuned ' + LISTS.att.length + '/' + attMax(ch);
    }
  }
  function save() {
    store.set('di.ed', state.ed); store.set('di.sort', state.sort); store.set('di.detail', state.detail);
    store.set('di.merge', state.merge); store.set('di.groupVar', state.groupVar); if (DATA) store.set('di.srcSel', sameKeys(state.srcSel, coreList()) ? null : state.srcSel); store.set('di.usable', state.usable);
  }
  function update(patch) {
    for (var k in patch) state[k] = patch[k];
    if (!('limit' in patch)) state.limit = PAGE;
    if (!('limitOthers' in patch)) state.limitOthers = PAGE;
    var ae = document.activeElement, keep = null, scrolls = {};
    if (ae && ae.matches && ae.matches('.srclist input')) { var k = Object.keys(ae.dataset)[0]; keep = { list: ae.closest('.srclist').id, attr: k, val: ae.dataset[k] }; }
    document.querySelectorAll('.srclist').forEach(function (l) { scrolls[l.id] = l.scrollTop; });
    save(); render();
    document.querySelectorAll('.srclist').forEach(function (l) { if (scrolls[l.id]) l.scrollTop = scrolls[l.id]; });
    if (keep) {
      var el = Array.prototype.filter.call(document.querySelectorAll('#' + keep.list + ' input'), function (i) { return i.dataset[keep.attr] === keep.val; })[0];
      if (el) el.focus({ preventScroll: true });
    }
  }
  function copyLink(btn) {
    var url = location.href, done = function () { var t = btn.textContent; btn.textContent = 'Link copied'; if (window.DndUI && DndUI.pop) DndUI.pop(btn); setTimeout(function () { btn.textContent = t; }, 1500); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(done, fallback); else fallback();
    function fallback() {
      var i = document.createElement('input'); i.value = url; document.body.appendChild(i); i.select();
      try { document.execCommand('copy'); done(); } catch (e) { window.prompt('Copy this link:', url); }
      i.remove();
    }
  }
  function toggleIn(arr, v) { var a = arr.slice(), i = a.indexOf(v); if (i >= 0) a.splice(i, 1); else a.push(v); return a; }

  document.addEventListener('click', function (ev) {
    /* a card's title link opens the dialog in place; ctrl/cmd/middle click still opens a new tab */
    var lk = ev.target.closest('a.open');
    if (lk) { if (ev.button === 0 && !ev.ctrlKey && !ev.metaKey && !ev.shiftKey && !ev.altKey) { ev.preventDefault(); openDetail(lk.dataset.open); } return; }
    var t = ev.target.closest('button, .card, .other');
    if (!t) return;
    if (t.dataset.ed) return update({ ed: t.dataset.ed, types: [], rars: [] });
    if (t.dataset.kind) return update({ kind: t.dataset.kind });
    if (t.dataset.detail) return update({ detail: t.dataset.detail });
    if (t.id === 'srcAll') return setSources(allBooks(), true);
    if (t.id === 'srcNone') return setSources(allBooks(), false);
    if (t.id === 'srcShown') { var sel = {}; visibleSrcKeys().forEach(function (k) { sel[k] = true; }); return update({ srcSel: sel }); }
    if (t.id === 'srcCore') return update({ srcSel: coreSel() });
    if (t.id === 'resetBtn') { var p = Object.assign({}, DEFAULTS, { srcSel: coreSel(), types: [], rars: [], atts: [], detail: 'basic', sort: 'name', merge: true, groupVar: true, usable: true }); return update(p); }
    if (t.id === 'typeClear') return update({ types: [] });
    if (t.id === 'rarClear') return update({ rars: [] });
    if (t.id === 'attClear') return update({ atts: [] });
    if (t.id === 'moreBtn') return more('main');
    if (t.id === 'moreOthersBtn') return more('others');
    if (t.id === 'copyLink') return copyLink(t);
    if (t.dataset.fav || t.dataset.wish) {
      ev.stopPropagation();
      var which = t.dataset.fav ? 'favs' : 'wish', k = t.dataset.fav || t.dataset.wish, f = Object.assign({}, lists()[which]), pf = {};
      if (f[k]) delete f[k]; else f[k] = true;
      pf[which] = f; setLists(pf);
      return refresh();
    }
    if (t.dataset.inv) {
      var iv = Object.assign({}, lists().inv);
      if (iv[t.dataset.inv]) delete iv[t.dataset.inv]; else iv[t.dataset.inv] = 1;
      setLists({ inv: iv });
      return refresh();
    }
    if (t.dataset.impAdd) return importItems();
    if (t.dataset.impSkip) { markImported(); return hideImp(); }
    if (t.dataset.impShow) { hideImp(); return update({ show: 'inv' }); }
    if (t.dataset.impClose) return hideImp();
    if (t.dataset.att) {
      var al = lists().att.slice(), i = al.indexOf(t.dataset.att);
      if (i >= 0) al.splice(i, 1); else if (al.length < attMax(activeCh())) al.push(t.dataset.att);
      setLists({ att: al });
      return refresh();
    }
    if (t.dataset.open) return openDetail(t.dataset.open);
    if (t.id === 'closeDlg') return $('#detail').close();
    if (t.dataset.group) return openDetail(t.dataset.group);
    if (t.dataset.id) return openDetail(t.dataset.id);
  });
  /* Escape closes an open filter menu and puts focus back on its button */
  document.addEventListener('keydown', function (ev) {
    if (ev.key !== 'Escape') return;
    var open = document.querySelector('details.srcpick[open]');
    if (open) { ev.preventDefault(); open.open = false; open.querySelector('summary').focus(); }
  });
  $('#detail').addEventListener('click', function (ev) { if (ev.target === this) this.close(); });
  $('#detail').addEventListener('close', function () {
    var u = new URL(location.href); u.searchParams.delete('item'); history.replaceState(null, '', u);
    /* redraw the list only if a favorite changed while the dialog was open (a full redraw is slow with many cards) */
    if (JSON.stringify(lists()) !== favsAtOpen) render();
    favsAtOpen = null;
  });
  var qTimer = null, TYPING = false;
  $('#search').addEventListener('input', function () { var v = this.value; clearTimeout(qTimer); qTimer = setTimeout(function () { TYPING = true; update({ q: v }); TYPING = false; }, 150); });
  $('#chartBox').addEventListener('toggle', function () { store.set('di.chart', this.open); if (this.open) drawChart(LAST_ROWS); });
  if (store.get('di.chart', false)) $('#chartBox').open = true;
  /* tick boxes in the Type, Rarity and Attunement menus */
  ['#typeChips', '#rarChips', '#attList'].forEach(function (s) {
    $(s).addEventListener('change', function (ev) {
      var d = ev.target.dataset;
      if (d.type) update({ types: toggleIn(state.types, d.type) });
      else if (d.rar) update({ rars: toggleIn(state.rars, d.rar) });
      else if (d.att) update({ atts: toggleIn(state.atts, d.att) });
    });
  });
  $('#sort').addEventListener('change', function () { update({ sort: this.value }); });
  $('#consumable').addEventListener('change', function () { update({ consumable: this.value }); });
  $('#show').addEventListener('change', function () { update({ show: this.value }); });
  $('#usable').addEventListener('change', function () { update({ usable: this.checked }); });
  /* after a list change: with the dialog open only the dialog redraws, the list follows on close */
  function refresh() { if ($('#detail').open) { openDetail(dlgId); publishSheet(); } else render(); }
  /* the header picker or another tab changed the character: follow its edition and redraw */
  /* fields this site reads: which character, its edition, its classes (Usable by) and its own link */
  function chSig(ch) { return ch ? [ch.id, ch.ed, JSON.stringify(ch.classes), JSON.stringify(ch.links[REPO] || {}), ch.imp && ch.imp.at || ''].join('|') : ''; }
  var appliedSig = chSig(activeCh()), appliedId = activeCh() ? activeCh().id : '', appliedEd = activeCh() ? activeCh().ed : null;
  if (window.DndChar) DndChar.onChange(function (ch) {
    if (!DATA) return;
    var sig = chSig(ch);
    if (sig === appliedSig) return; /* another site re-saved it: nothing this site uses changed */
    appliedSig = sig;
    setTimeout(checkImport, 0);
    var id = ch ? ch.id : '';
    if (id !== appliedId) {
      appliedId = id; appliedEd = ch ? ch.ed : null;
      var patch = {};
      if (ch && ch.ed !== state.ed) { patch.ed = ch.ed; patch.types = []; patch.rars = []; }
      if (!ch && (state.show === 'wish' || state.show === 'att' || state.show === 'inv')) patch.show = '';
      hideImp();
      if ($('#detail').open) $('#detail').close();
      return update(patch);
    }
    if (ch.ed !== appliedEd) {
      /* follow the character's new edition only if the user hasn't picked another edition here */
      var userPicked = state.ed !== appliedEd;
      appliedEd = ch.ed;
      if (!userPicked && ch.ed !== state.ed) return update({ ed: ch.ed, types: [], rars: [] });
    }
    refresh();
  });
  /* favorites changed in another tab (no character picked) */
  window.addEventListener('storage', function (e) { if (e.key === 'di.favs' && DATA && !activeCh()) refresh(); });
  $('#merge').addEventListener('change', function () { update({ merge: this.checked }); });
  $('#groupVar').addEventListener('change', function () { update({ groupVar: this.checked }); });
  $('#srcQ').addEventListener('input', function () { state.srcQ = this.value; renderSources(); });
  $('#srcList').addEventListener('change', function (ev) { var k = ev.target.dataset.src; if (k) setSources([k], ev.target.checked); });
  document.addEventListener('click', function (ev) {
    if (!ev.target.isConnected) return; /* a chip that was just re-rendered */
    ['#srcPick', '#typePick', '#rarPick', '#attPick'].forEach(function (s) { var p = $(s); if (p.open && !p.contains(ev.target)) p.open = false; });
  });
  /* one filter menu open at a time; each opens under its own button, nudged left to stay 16px inside the screen */
  document.querySelectorAll('details.srcpick').forEach(function (d) {
    d.addEventListener('toggle', function () {
      if (!d.open) return;
      document.querySelectorAll('details.srcpick').forEach(function (o) { if (o !== d) o.open = false; });
      var pop = d.querySelector('.srcpop'); pop.style.left = '0px';
      var r = pop.getBoundingClientRect(), over = r.right - (document.documentElement.clientWidth - 16);
      if (over > 0) pop.style.left = -Math.min(over, r.left - 16) + 'px';
    });
  });


  fetch('data/items.json?v=dev').then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); }).then(function (d) {
    DATA = d;
    DATA.items.concat(DATA.others).forEach(function (it) {
      BYID[it.id] = it;
      var k = it.ed + '|' + norm(it.groupName || it.name);
      (BYNAME[k] = BYNAME[k] || []).push(it);
      if (it.groupName) { var k2 = it.ed + '|' + norm(it.name); (BYNAME[k2] = BYNAME[k2] || []).push(it); }
      if (it.group) (GROUPS[it.group] = GROUPS[it.group] || []).push(it);
    });
    /* variants share one copy of their rules text and summary in the data file */
    DATA.items.forEach(function (it) {
      if (it.descRef && BYID[it.descRef]) it.desc = BYID[it.descRef].desc;
      if (it.summaryRef && BYID[it.summaryRef]) it.summary = BYID[it.summaryRef].summary;
    });
    var n14 = d.items.filter(function (i) { return i.ed === '2014'; }).length;
    $('#generated').textContent = 'Data built ' + d.generated + ' · ' + d.items.length.toLocaleString() + ' SRD items with full text (2014: ' + n14 + ', 2024: ' + (d.items.length - n14) + '), ' + d.others.length.toLocaleString() + ' more from other books (facts only).';
    if (state.srcAllPending) { state.srcSel = {}; allBooks().forEach(function (k) { state.srcSel[k] = true; }); delete state.srcAllPending; }
    else if (state.srcDefault) state.srcSel = coreSel();
    delete state.srcDefault;
    renderSourceLinks();
    render();
    checkImport();
    var open = params.get('item');
    if (open && (BYID[open] || GROUPS[open])) openDetail(open);
  }).catch(function (err) {
    $('#list').innerHTML = '<p class="empty">Could not load the item data (' + esc(err.message) + ').</p>';
  });
  /* load the next page of cards when the Show more button scrolls into view */
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting || e.target.hidden || !DATA) return;
        more(e.target.id === 'moreBtn' ? 'main' : 'others');
        io.unobserve(e.target); io.observe(e.target); /* re-check: still in view after a short page */
      });
    }, { rootMargin: '600px 0px' });
    io.observe($('#moreBtn')); io.observe($('#moreOthersBtn'));
  }
  syncControls();
})();
