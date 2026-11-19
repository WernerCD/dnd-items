/* dnd-shared nav.js v1.0 (canonical copy: WernerCD/dnd shared/nav.js). Copy unchanged to site/nav.js.
 * Centred drop-down menus of every D&D Toolbox page in the top bar (STYLE.md 3). It inserts itself into
 * .hub-bar after the "D&D Toolbox" link, so pages need no markup, only <script src="nav.js?v=dev"></script>.
 * Adding a site or page = one line in MENU below, then re-copy this file to every site.
 */
(function () {
  var B = 'https://wernercd.github.io/';
  var MENU = [
    ['Characters', [['Characters', 'dnd/characters.html'], ['Character Sheet', 'dnd/sheet.html'], ['Party', 'dnd/party.html']]],
    ['Build', [['Multiclass Planner', 'dnd-multiclass-planner/'], ['Spell Planner', 'dnd-magic/'], ['Feats & Origins', 'dnd-feats/']]],
    ['Play', [['Wild Shape', 'dnd-druid-wildshapes/'], ['Item Finder', 'dnd-items/'], ['Rules Reference', 'dnd-rules/']]],
    ['Run', [['Monster Lookup', 'dnd-monsters/'], ['Party', 'dnd/party.html']]]
  ];
  var esc = function (s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  function here(path) {   // is this menu entry the page we're on?
    var p = location.pathname.replace(/index\.html$/, ''), t = '/' + path;
    return /\/$/.test(t) ? p.indexOf(t) === 0 : p === t;   // a tool site counts on any of its pages; hub pages match exactly
  }
  function build(bar) {
    if (!bar || bar.querySelector('.tool-menu')) return;
    var nav = document.createElement('nav');
    nav.className = 'tool-menu'; nav.setAttribute('aria-label', 'D&D Toolbox pages');
    var n = 0, html = '<button type="button" class="tm-all" aria-expanded="false" aria-controls="tmGroups">Tools <span aria-hidden="true">&#9662;</span></button><ul class="tm-groups" id="tmGroups">';
    MENU.forEach(function (g) {
      var cur = g[1].some(function (it) { return here(it[1]); }), id = 'tmG' + (n++);
      html += '<li class="tm-g' + (cur ? ' tm-cur' : '') + '"><button type="button" class="tm-btn" aria-expanded="false" aria-controls="' + id + '">' + esc(g[0]) + ' <span aria-hidden="true">&#9662;</span></button><ul class="tm-list" id="' + id + '">' +
        g[1].map(function (it) { var on = here(it[1]); return '<li><a href="' + B + it[1] + '"' + (on ? ' aria-current="page"' : '') + '>' + esc(it[0]) + '</a></li>'; }).join('') + '</ul></li>';
    });
    nav.innerHTML = html + '</ul>';
    var first = bar.firstElementChild;
    if (first && first.nextSibling) bar.insertBefore(nav, first.nextSibling); else bar.appendChild(nav);
    bar.classList.add('has-menu');

    function closeAll(except) {
      Array.prototype.forEach.call(nav.querySelectorAll('.tm-btn[aria-expanded="true"]'), function (b) { if (b !== except) b.setAttribute('aria-expanded', 'false'); });
    }
    function closeEverything() { closeAll(); nav.querySelector('.tm-all').setAttribute('aria-expanded', 'false'); nav.classList.remove('open'); }
    nav.addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b) return;
      if (b.classList.contains('tm-all')) { var o = b.getAttribute('aria-expanded') !== 'true'; b.setAttribute('aria-expanded', String(o)); nav.classList.toggle('open', o); return; }
      var open = b.getAttribute('aria-expanded') !== 'true'; closeAll(b); b.setAttribute('aria-expanded', String(open));
      if (open && e.detail === 0) { var a = b.nextElementSibling.querySelector('a'); if (a) a.focus(); }   // keyboard: into the menu
    });
    // pointer hover opens a group on devices that can hover (desktop)
    var canHover = window.matchMedia && window.matchMedia('(hover: hover) and (min-width: 721px)').matches;
    if (canHover) Array.prototype.forEach.call(nav.querySelectorAll('.tm-g'), function (li) {
      var b = li.querySelector('.tm-btn'), t;
      li.addEventListener('mouseenter', function () { clearTimeout(t); closeAll(b); b.setAttribute('aria-expanded', 'true'); });
      li.addEventListener('mouseleave', function () { t = setTimeout(function () { b.setAttribute('aria-expanded', 'false'); }, 180); });
    });
    nav.addEventListener('keydown', function (e) {
      var links, i;
      if (e.key === 'Escape') { var openB = nav.querySelector('.tm-btn[aria-expanded="true"]'); closeEverything(); if (openB) openB.focus(); return; }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        var g = e.target.closest('.tm-g'); if (!g) return;
        var btn = g.querySelector('.tm-btn'); links = Array.prototype.slice.call(g.querySelectorAll('a'));
        if (btn.getAttribute('aria-expanded') !== 'true') btn.setAttribute('aria-expanded', 'true');
        i = links.indexOf(document.activeElement);
        i = e.key === 'ArrowDown' ? Math.min(links.length - 1, i + 1) : Math.max(0, i - 1);
        e.preventDefault(); links[i].focus();
      }
    });
    document.addEventListener('click', function (e) { if (!nav.contains(e.target)) closeEverything(); });
    nav.addEventListener('focusout', function () { setTimeout(function () { if (!nav.contains(document.activeElement)) closeEverything(); }, 0); });
  }
  function start() { build(document.querySelector('.hub-bar')); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
  window.DndNav = { menu: MENU };
})();
