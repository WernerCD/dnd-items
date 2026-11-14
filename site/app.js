/* D&D Item Finder -- vanilla JS, no build step. */
(function () {
  'use strict';

  var store = {
    get: function (k, d) { try { var v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
    set: function (k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* private mode */ } }
  };

  var PAGE = 120;
  /* the main rulebooks: listed first in the Sources picker and selected by default */
  var CORE = ['SRD 5.1', 'SRD 5.2', "Player's Handbook (2014)", "Player's Handbook (2024)", "Dungeon Master's Guide (2014)",
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
  if (!state.srcSel || typeof state.srcSel !== 'object') state.srcSel = coreSel();
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
    if ((v = listParam('books'))) { state.srcSel = {}; state.srcAllPending = v[0] === 'all'; v.forEach(function (k) { state.srcSel[k] = true; }); }
  })();

  var DATA = null, BYID = {}, GROUPS = {}, BYNAME = {}, CUR_CH = null, LISTS = { favs: {}, wish: {}, att: [] };
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
  function coreSel() { var o = {}; CORE.forEach(function (k) { o[k] = true; }); return o; }
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
    return 'Requires attunement ' + a.replace(/^Requires attunement\s*/i, '');
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
  function lists() {
    var ch = activeCh();
    if (!ch) return { favs: state.favs, wish: {}, att: [] };
    var l = ch.links[REPO] || {};
    return { favs: l.favs || {}, wish: l.wish || {}, att: Array.isArray(l.att) ? l.att : [] };
  }
  function setLists(patch) {
    var ch = activeCh();
    if (!ch) { if (patch.favs) { state.favs = patch.favs; save(); } return; }
    var l = lists(); for (var k in patch) l[k] = patch[k];
    DndChar.setLink(ch.id, REPO, l);
  }
  /* attunement slots: 3 in both editions; artificers get 4, 5 and 6 at levels 10, 14 and 18 */
  function attMax(ch) { var a = ch && window.DndChar ? DndChar.levelIn(ch, 'artificer') : 0; return a >= 18 ? 6 : a >= 14 ? 5 : a >= 10 ? 4 : 3; }
  /* classes an item's attunement is limited to: ['cleric','paladin'], ['*caster'], or null for anyone */
  function attClasses(it) {
    if (it._ac === undefined) {
      var a = typeof it.attune === 'string' ? it.attune.toLowerCase() : '';
      var c = CLASSES.filter(function (k) { return new RegExp('\\b' + k + 's?\\b').test(a); });
      it._ac = c.length ? c : /spellcaster/.test(a) ? ['*caster'] : null;
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
    if (r[0] === '*caster') return casts(ch);
    return ch.classes.some(function (c) { return r.indexOf(c.cls) >= 0; });
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
  function inShow(r) {
    if (state.show === 'fav') return isFav(r.id);
    if (state.show === 'wish') return isWish(r.id);
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
    if (state.show) main = main.filter(inShow);
    sortRows(main);
    var nItems = main.reduce(function (n, r) { return n + (r.isGroup ? r.members.length : 1); }, 0);
    $('#count').textContent = nItems.toLocaleString() + ' item' + (nItems === 1 ? '' : 's') + (nItems !== main.length ? ' (' + main.length.toLocaleString() + ' card' + (main.length === 1 ? '' : 's') + ')' : '');
    var list = $('#list');
    list.className = 'list detail-' + state.detail;
    list.innerHTML = main.slice(0, state.limit).map(card).join('');
    $('#moreBtn').hidden = main.length <= state.limit;
    $('#moreBtn').textContent = 'Show more (' + (main.length - state.limit).toLocaleString() + ' left)';
    $('#empty').hidden = main.length > 0;
    var emptyList = state.show === 'fav' ? !Object.keys(LISTS.favs).length : state.show === 'wish' ? !Object.keys(LISTS.wish).length : state.show === 'att' ? !LISTS.att.length : false;
    $('#empty').textContent = emptyList
      ? { fav: 'No favorites yet. Tap the star on any card to add it.', wish: 'Nothing on the wishlist yet. Open an item and choose Add to wishlist.', att: 'Nothing attuned yet. Open an item that needs attunement and choose Attune.' }[state.show]
      : 'No items match. Try clearing a filter, adding books in Sources, or switching the rules edition.' + (state.usable && CUR_CH ? ' (Usable by ' + CUR_CH.name + ' is on.)' : '');
    if (state.merge) $('#othersSec').hidden = true;
    else {
      if (state.show) oth = oth.filter(inShow);
      sortRows(oth);
      $('#othersSec').hidden = !oth.length;
      $('#others').innerHTML = oth.slice(0, state.limitOthers).map(otherRow).join('');
      $('#moreOthersBtn').hidden = oth.length <= state.limitOthers;
      $('#moreOthersBtn').textContent = 'Show more (' + (oth.length - state.limitOthers).toLocaleString() + ' left)';
    }
    renderChips();
    renderSources();
    syncControls();
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
    var books = Object.keys(state.srcSel).sort(), core = CORE.slice().sort();
    var every = allBooks().every(srcOn);
    setP('books', every ? 'all' : books.join('|') !== core.join('|') && books.join('|'));
    if (!$('#detail').open) u.searchParams.delete('item');
    if (u.href !== location.href) history.replaceState(null, '', u);
  }

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
    return (att ? ' <span class="mark att">Attuned</span>' : '') + (isWish(r.id) ? ' <span class="mark wish">Wishlist</span>' : '');
  }
  function card(r) {
    if (r.isGroup) return groupCard(r);
    var h = '<article class="card' + (r.srd ? '' : ' book') + '"' + rarAttr(r.rarity) + ' data-id="' + esc(r.id) + '" tabindex="0" role="button" aria-label="' + esc(r.name) + ' details">' +
      favBtn(r.id, r.name) +
      '<div class="card-top"><div><h3>' + esc(r.name) + '</h3></div></div>' +
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
    var h = '<article class="card group"' + rarAttr(g.rarity) + ' data-group="' + esc(g.id) + '" tabindex="0" role="button" aria-label="' + esc(g.name) + ' details">' +
      favBtn(g.id, g.name) +
      '<div class="card-top"><div><h3>' + esc(g.name) + '</h3><div class="alt">' + g.members.length + ' variants</div></div></div>' +
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
    return '<div class="other"' + rarAttr(o.rarity) + ' data-id="' + esc(o.id) + '" tabindex="0" role="button" aria-label="' + esc(o.name) + ' details">' + favBtn(o.id, o.name) +
      '<b>' + esc(o.name) + '</b><div class="pills">' + rarPill(o.rarity) + marks(o) + '</div>' + metaLine(o) +
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
  function coreIdx(k) { var i = CORE.indexOf(k); return i < 0 ? 99 : i; }
  function srcSort(a, b) { return coreIdx(a) - coreIdx(b) || a.localeCompare(b); }
  function renderSources() {
    var c = sourceCounts(), keys = Object.keys(c).sort(srcSort);
    var on = keys.filter(srcOn).length, q = state.srcQ.trim().toLowerCase();
    var firstOther = keys.filter(function (k) { return coreIdx(k) === 99 && (!q || k.toLowerCase().indexOf(q) >= 0); })[0];
    $('#srcSum').textContent = 'Sources' + (on === keys.length ? '' : ' (' + on + ' of ' + keys.length + ')');
    $('#srcPick').classList.toggle('filtered', on !== keys.length);
    $('#srcList').innerHTML = keys.filter(function (k) { return !q || k.toLowerCase().indexOf(q) >= 0; }).map(function (k) {
      return (k === firstOther ? '<div class="srcsep">Other books</div>' : '') + '<label class="srcrow"' + hueAttr(k) + '><input type="checkbox" data-src="' + esc(k) + '"' + (srcOn(k) ? ' checked' : '') + '> <i class="dot" aria-hidden="true"></i><span>' + esc(k) + '</span><span class="n">' + c[k] + '</span></label>';
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
    $('#srcLinks').innerHTML = Object.keys(per).sort(srcSort).map(function (k) {
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
    return '<dl class="facts-dl">' + rows.filter(function (r) { return r[1]; }).map(function (r) { return '<dt>' + esc(r[0]) + '</dt><dd>' + esc(r[1]) + '</dd>'; }).join('') + '</dl>';
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
        '<div class="itext">' + md(first.desc) + '</div><div class="sb-sec">Variants</div><ul class="variants">' +
        m.map(function (x) { return '<li><button type="button" class="linkish" data-open="' + esc(x.id) + '">' + esc(x.name) + '</button> ' + rarPill(x.rarity) + (x.attune ? ' <span class="small">attunement</span>' : '') + '</li>'; }).join('') + '</ul>';
    } else {
      var alt = otherEd(it);
      h = '<div class="sb-head"><h2 id="dTitle">' + esc(it.name) + '</h2>' +
        '<p class="sb-sub">' + esc(it.type + ', ' + it.rarity.toLowerCase() + (it.attune ? ' (' + attuneText(it.attune).toLowerCase() + ')' : '')) + ' ' + bookLink(it) + alsoLinks(it) + '</p></div>';
      h += '<div class="ed-tabs">' + ['2014', '2024'].map(function (e) {
        var target = e === it.ed ? it : alt && alt.ed === e ? alt : null;
        return target ? '<button type="button" data-open="' + esc(target.id) + '" aria-selected="' + (e === it.ed) + '">' + e + ' rules</button>' : '';
      }).join('') + (it.group ? '<button type="button" data-open="' + esc(it.group) + '">All variants</button>' : '') + '</div>';
      h += '<div class="mn-actions">' + favDlgBtn(id) + wishBtn(id) + attBtn(it) + '</div>';
      h += factsTable(it);
      if (it.summary) h += '<p class="summary">' + esc(it.summary) + '</p>';
      if (it.srd) h += '<div class="itext">' + md(it.desc) + '</div><p class="small">Text from the ' + (it.src === 'SRD 5.1' ? 'System Reference Document 5.1' : 'System Reference Document 5.2') + ', CC-BY-4.0.</p>';
      else h += '<div class="wsnote">This item is not in the free SRD, so its rules text is not reproduced here. Look it up in <b>' + esc(it.src) + '</b>' + (it.page ? ', page ' + esc(it.page) : '') + (bookUrl(it.src) ? ' (<a href="' + bookUrl(it.src) + '" target="_blank" rel="noopener">D&amp;D Beyond</a>)' : '') + '.</div>';
    }
    $('#dBody').innerHTML = h;
    var d = $('#detail');
    if (!d.open) { if (d.showModal) d.showModal(); else d.setAttribute('open', ''); }
    d.querySelector('.dlg').scrollTop = 0;
    var u = new URL(location.href); u.searchParams.set('item', id); history.replaceState(null, '', u);
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
    if (ch) $('#show option[value="att"]').textContent = 'Attuned (' + LISTS.att.length + '/' + attMax(ch) + ')';
  }
  function save() {
    store.set('di.ed', state.ed); store.set('di.sort', state.sort); store.set('di.detail', state.detail);
    store.set('di.merge', state.merge); store.set('di.groupVar', state.groupVar); store.set('di.srcSel', state.srcSel); store.set('di.favs', state.favs); store.set('di.usable', state.usable);
  }
  function update(patch) {
    for (var k in patch) state[k] = patch[k];
    if (!('limit' in patch)) state.limit = PAGE;
    if (!('limitOthers' in patch)) state.limitOthers = PAGE;
    save(); render();
  }
  function toggleIn(arr, v) { var a = arr.slice(), i = a.indexOf(v); if (i >= 0) a.splice(i, 1); else a.push(v); return a; }

  document.addEventListener('click', function (ev) {
    var t = ev.target.closest('button, .card, .other');
    if (!t) return;
    if (t.dataset.ed) return update({ ed: t.dataset.ed, types: [], rars: [] });
    if (t.dataset.kind) return update({ kind: t.dataset.kind });
    if (t.dataset.detail) return update({ detail: t.dataset.detail });
    if (t.id === 'srcAll') return setSources(allBooks(), true);
    if (t.id === 'srcNone') return setSources(allBooks(), false);
    if (t.id === 'srcShown') { var sel = {}; visibleSrcKeys().forEach(function (k) { sel[k] = true; }); return update({ srcSel: sel }); }
    if (t.id === 'srcCore') return update({ srcSel: coreSel() });
    if (t.id === 'resetBtn') { var p = Object.assign({}, DEFAULTS, { srcSel: coreSel(), types: [], rars: [] }); return update(p); }
    if (t.id === 'typeClear') return update({ types: [] });
    if (t.id === 'rarClear') return update({ rars: [] });
    if (t.id === 'attClear') return update({ atts: [] });
    if (t.id === 'moreBtn') return update({ limit: state.limit + PAGE });
    if (t.id === 'moreOthersBtn') return update({ limitOthers: state.limitOthers + PAGE });
    if (t.dataset.fav || t.dataset.wish) {
      ev.stopPropagation();
      var which = t.dataset.fav ? 'favs' : 'wish', k = t.dataset.fav || t.dataset.wish, f = Object.assign({}, lists()[which]), pf = {};
      if (f[k]) delete f[k]; else f[k] = true;
      pf[which] = f; setLists(pf);
      return refresh();
    }
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
  document.addEventListener('keydown', function (ev) {
    var t = ev.target;
    if ((ev.key === 'Enter' || ev.key === ' ') && t.classList && (t.classList.contains('card') || t.classList.contains('other'))) {
      ev.preventDefault(); openDetail(t.dataset.group || t.dataset.id);
    }
  });
  $('#detail').addEventListener('click', function (ev) { if (ev.target === this) this.close(); });
  $('#detail').addEventListener('close', function () {
    var u = new URL(location.href); u.searchParams.delete('item'); history.replaceState(null, '', u);
    /* redraw the list only if a favorite changed while the dialog was open (a full redraw is slow with many cards) */
    if (JSON.stringify(lists()) !== favsAtOpen) render();
    favsAtOpen = null;
  });
  var qTimer = null;
  $('#search').addEventListener('input', function () { var v = this.value; clearTimeout(qTimer); qTimer = setTimeout(function () { update({ q: v }); }, 150); });
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
  function refresh() { if ($('#detail').open) openDetail(dlgId); else render(); }
  /* the header picker or another tab changed the character: follow its edition and redraw */
  var lastChId = activeCh() ? activeCh().id : null;
  if (window.DndChar) DndChar.onChange(function (ch) {
    if (!DATA) return;
    var id = ch ? ch.id : null;
    if (id === lastChId) return refresh();
    lastChId = id;
    var patch = {};
    if (ch && ch.ed !== state.ed) { patch.ed = ch.ed; patch.types = []; patch.rars = []; }
    if (!ch && (state.show === 'wish' || state.show === 'att')) patch.show = '';
    if ($('#detail').open) $('#detail').close();
    update(patch);
  });
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
    var n14 = d.items.filter(function (i) { return i.ed === '2014'; }).length;
    $('#generated').textContent = 'Data built ' + d.generated + ' · ' + d.items.length.toLocaleString() + ' SRD items with full text (2014: ' + n14 + ', 2024: ' + (d.items.length - n14) + '), ' + d.others.length.toLocaleString() + ' more from other books (facts only).';
    if (state.srcAllPending) { state.srcSel = {}; allBooks().forEach(function (k) { state.srcSel[k] = true; }); delete state.srcAllPending; }
    renderSourceLinks();
    render();
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
        if (e.target.id === 'moreBtn') update({ limit: state.limit + PAGE });
        else update({ limitOthers: state.limitOthers + PAGE });
        io.unobserve(e.target); io.observe(e.target); /* re-check: still in view after a short page */
      });
    }, { rootMargin: '600px 0px' });
    io.observe($('#moreBtn')); io.observe($('#moreOthersBtn'));
  }
  syncControls();
})();
