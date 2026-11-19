/* dnd-shared sources.js v1.0 (canonical copy: WernerCD/dnd shared/sources.js). Copy unchanged to site/sources.js.
 * One table of D&D books for every "Sources" picker, so they all sort and default the same way (STYLE.md 6f):
 *   1. Core rules (SRD and the core rulebooks): listed first and ON by default
 *   2. Official supplements, 3. Settings and adventures, 4. Partner and licensed books: listed below, OFF by default
 * Sites may key their data by short code ("XPHB") or by full name ("Player's Handbook (2024)"); both resolve here.
 *
 *   DndSources.info(key)        -> { code, name, group, groupName, core, rank } (unknown books land in group 3)
 *   DndSources.isCore(key)      -> true for the core rules
 *   DndSources.sort(keys)       -> keys in picker order: group, then core rank, then name
 *   DndSources.defaults(keys)   -> the keys that start selected (the core ones; all of them if none is core)
 *   DndSources.groupName(n)     -> heading text for group n (1-4)
 */
(function () {
  var G = { 1: 'Core rules', 2: 'Official supplements', 3: 'Settings and adventures', 4: 'Partner and licensed' };
  // [code, name, group, aliases...]; core books carry their rank in the order they should be listed
  var B = [
    ['SRD51', 'SRD 5.1', 1, 'SRD 5.1 (2014)', 'srd-2014', 'wotc-srd'],
    ['SRD52', 'SRD 5.2', 1, 'SRD 5.2 (2024)', 'SRD 5.2.1', 'srd-2024'],
    ['PHB', "Player's Handbook (2014)", 1, "Player's Handbook"],
    ['XPHB', "Player's Handbook (2024)", 1],
    ['DMG', "Dungeon Master's Guide (2014)", 1, "Dungeon Master's Guide"],
    ['XDMG', "Dungeon Master's Guide (2024)", 1],
    ['MM', 'Monster Manual (2014)', 1, 'Monster Manual'],
    ['XMM', 'Monster Manual (2025)', 1, 'Monster Manual (2024)'],
    ['XGE', "Xanathar's Guide to Everything", 2],
    ['TCE', "Tasha's Cauldron of Everything", 2],
    ['VGM', "Volo's Guide to Monsters", 2],
    ['MTF', "Mordenkainen's Tome of Foes", 2],
    ['MPMM', 'Mordenkainen Presents: Monsters of the Multiverse', 2],
    ['FTD', "Fizban's Treasury of Dragons", 2],
    ['BGG', 'Bigby Presents: Glory of the Giants', 2],
    ['BMT', 'The Book of Many Things', 2],
    ['BAM', "Boo's Astral Menagerie", 2],
    ['SCAG', "Sword Coast Adventurer's Guide", 3],
    ['EGW', "Explorer's Guide to Wildemount", 3],
    ['ERLW', 'Eberron: Rising from the Last War', 3],
    ['EFA', 'Eberron: Forge of the Artificer', 3],
    ['GGR', "Guildmasters' Guide to Ravnica", 3],
    ['MOT', 'Mythic Odysseys of Theros', 3],
    ['VRGR', "Van Richten's Guide to Ravenloft", 3],
    ['RHW', 'Ravenloft: The Horrors Within', 3],
    ['SCC', 'Strixhaven: A Curriculum of Chaos', 3],
    ['AAG', "Astral Adventurer's Guide", 3],
    ['SatO', 'Sigil and the Outlands', 3],
    ['DSotDQ', 'Dragonlance: Shadow of the Dragon Queen', 3],
    ['FRHoF', 'Forgotten Realms: Heroes of Faerûn', 3, 'Forgotten Realms: Heroes of Faerun'],
    ['FRAiF', 'Forgotten Realms: Adventures in Faerûn', 3, 'Forgotten Realms: Adventures in Faerun'],
    ['AI', 'Acquisitions Incorporated', 3],
    ['AU', 'Arcana Unleashed', 4],
    ['AUD', 'Arcana Unleashed: Deadfall', 4],
    ['WoW', 'World of Warcraft', 4],
    ['WoWIC', 'World of Warcraft: Icecrown Citadel', 4],
    ['ST', 'Stranger Things: Welcome to the Hellfire Club', 4]
  ];
  var by = {}, rank = 0;
  function norm(k) { return String(k == null ? '' : k).replace(/\s+p\.?\s*\d+.*$/i, '').replace(/û/g, 'u').trim().toLowerCase(); }
  B.forEach(function (b) {
    var rec = { code: b[0], name: b[1], group: b[2], groupName: G[b[2]], core: b[2] === 1, rank: b[2] === 1 ? rank++ : 99 };
    [b[0], b[1]].concat(b.slice(3)).forEach(function (a) { by[norm(a)] = rec; });
  });
  function info(key) {
    var r = by[norm(key)];
    return r || { code: String(key), name: String(key), group: 3, groupName: G[3], core: false, rank: 99 };
  }
  window.DndSources = {
    info: info,
    isCore: function (k) { return info(k).core; },
    groupName: function (n) { return G[n] || ''; },
    sort: function (keys) {
      return (keys || []).slice().sort(function (a, b) {
        var x = info(a), y = info(b);
        return x.group - y.group || x.rank - y.rank || x.name.localeCompare(y.name);
      });
    },
    defaults: function (keys) {
      var c = (keys || []).filter(function (k) { return info(k).core; });
      return c.length ? c : (keys || []).slice();
    }
  };
})();
