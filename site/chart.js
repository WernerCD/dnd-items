/* dnd-shared chart.js v1.0 (canonical copy: WernerCD/dnd shared/chart.js). Copy unchanged to site/chart.js.
 * Small dependency-free SVG charts in the look of bklit UI (thin lines, soft area fill, crosshair tooltip),
 * themed by the shared tokens, so they follow light/dark/print. No Motion needed (it only animates if present).
 *
 *   DndPlot.line(el, {
 *     labels: [1, 2, ... 20],                 // x values, shown on the axis
 *     series: [{ name: 'Spell slots', values: [...] }, ...],   // up to 3 series, colours in fixed order
 *     xLabel: 'Character level', yLabel: 'Slots',              // axis titles
 *     curve: 'linear' | 'step' | 'smooth',    // 'step' for per-level values (default 'linear')
 *     area: true,                             // soft fill under the first series (default: only when 1 series)
 *     fmt: function (v) { return v; },        // value formatter for ticks, tooltip and table
 *     title: 'Spell slots by level'           // accessible name (also the table caption)
 *   })
 *   DndPlot.bars(el, { labels: [...], values: [...], name: 'Spells', xLabel, yLabel, fmt, title })
 * Both return { update(opts), destroy() }. Each chart has a keyboard-reachable crosshair (arrow keys)
 * and a "Show as table" view. Re-renders on resize.
 */
(function () {
  var NS = 'http://www.w3.org/2000/svg';
  var esc = function (s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  var uid = 0;
  function ticks(max, int) {   // about 5 steps of 1, 2, 2.5 or 5 x 10^k (whole numbers when the data is whole)
    var raw = Math.max(max, int ? 1 : 1e-9) / 5, p = Math.pow(10, Math.floor(Math.log10(raw))), n = raw / p;
    var step = (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 && !(int && p < 10) ? 2.5 : n <= 5 ? 5 : 10) * p;
    if (int) step = Math.max(1, Math.round(step));
    var m = Math.max(step, Math.ceil(max / step) * step);
    var out = []; for (var v = 0; v <= m + 1e-9; v += step) out.push(+v.toFixed(6));
    return { max: m, list: out };
  }
  function slopes(p) {   // monotone cubic (Fritsch-Carlson): smooth, but never overshoots the data
    var n = p.length, s = [], m = [];
    for (var i = 0; i < n - 1; i++) s.push((p[i + 1][1] - p[i][1]) / ((p[i + 1][0] - p[i][0]) || 1));
    for (var j = 0; j < n; j++) {
      if (j === 0) m.push(s[0] || 0); else if (j === n - 1) m.push(s[n - 2] || 0);
      else m.push(s[j - 1] * s[j] <= 0 ? 0 : 2 * s[j - 1] * s[j] / (s[j - 1] + s[j]));   // harmonic mean keeps it monotone
    }
    return m;
  }
  function pathFor(pts, curve) {
    if (!pts.length) return '';
    var d = 'M' + pts[0][0] + ',' + pts[0][1], m = curve === 'smooth' ? slopes(pts) : null;
    for (var i = 1; i < pts.length; i++) {
      var a = pts[i - 1], b = pts[i];
      if (curve === 'step') { var mx = (a[0] + b[0]) / 2; d += 'H' + mx + 'V' + b[1] + 'H' + b[0]; }
      else if (curve === 'smooth') { var dx = (b[0] - a[0]) / 3; d += 'C' + (a[0] + dx) + ',' + (a[1] + m[i - 1] * dx) + ' ' + (b[0] - dx) + ',' + (b[1] - m[i] * dx) + ' ' + b[0] + ',' + b[1]; }
      else d += 'L' + b[0] + ',' + b[1];
    }
    return d;
  }
  function el(tag, attrs, parent) {
    var e = document.createElementNS(NS, tag);
    for (var k in attrs) if (attrs[k] != null) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e); return e;
  }

  function make(host, kind, opts) {
    var id = 'dp' + (++uid), o = opts, ro = null, idx = -1, geo = null;
    host.classList.add('plot');
    host.innerHTML = '';
    var fig = document.createElement('figure'); fig.className = 'plot-fig'; host.appendChild(fig);
    var legend = document.createElement('div'); legend.className = 'plot-legend';
    var box = document.createElement('div'); box.className = 'plot-box'; fig.appendChild(box);
    var tip = document.createElement('div'); tip.className = 'plot-tip'; tip.setAttribute('aria-hidden', 'true'); tip.hidden = true; box.appendChild(tip);
    var live = document.createElement('p'); live.className = 'plot-sr'; live.setAttribute('aria-live', 'polite'); fig.appendChild(live);
    var det = document.createElement('details'); det.className = 'plot-table';
    fig.appendChild(det);
    var svg = null, first = true;

    function series() { return kind === 'bars' ? [{ name: o.name || o.yLabel || 'Value', values: o.values }] : (o.series || []).slice(0, 3); }
    function fmt(v) { return v == null ? '-' : (o.fmt ? o.fmt(v) : String(v)); }

    function draw() {
      var S = series(), L = o.labels || [], n = L.length;
      var W = Math.max(260, box.clientWidth || 600), H = Math.round(Math.min(320, Math.max(200, W * 0.45)));
      var padL = 40, padR = (kind === 'line' && S.length > 1) ? 74 : 14, padT = 12, padB = 40;
      if (o.yLabel) padL += 14;
      var iw = W - padL - padR, ih = H - padT - padB;
      var max = 0; S.forEach(function (s) { s.values.forEach(function (v) { if (v > max) max = v; }); });
      var allInt = S.every(function (s) { return s.values.every(function (v) { return v == null || Math.round(v) === v; }); });
      var T = ticks(max, allInt);
      var bw = kind === 'bars' ? iw / Math.max(1, n) : 0;
      var x = function (i) { return kind === 'bars' ? padL + bw * i + bw / 2 : padL + (n <= 1 ? iw / 2 : iw * i / (n - 1)); };
      var y = function (v) { return padT + ih - (v / T.max) * ih; };
      geo = { x: x, y: y, n: n, padL: padL, padT: padT, ih: ih, iw: iw, W: W, H: H, S: S, L: L };

      if (svg) svg.remove();
      svg = el('svg', { viewBox: '0 0 ' + W + ' ' + H, width: W, height: H, role: 'img', tabindex: '0', 'aria-label': (o.title || 'Chart') + '. Use the arrow keys to read values, or open the table below.' });
      box.insertBefore(svg, tip);
      var defs = el('defs', {}, svg), g = el('linearGradient', { id: id + 'g', x1: 0, y1: 0, x2: 0, y2: 1 }, defs);
      el('stop', { offset: '0%', class: 'plot-stop1' }, g); el('stop', { offset: '100%', class: 'plot-stop2' }, g);

      // grid + y ticks
      var grid = el('g', { class: 'plot-grid' }, svg);
      T.list.forEach(function (v) {
        el('line', { x1: padL, x2: padL + iw, y1: y(v), y2: y(v), class: v === 0 ? 'plot-base' : null }, grid);
        var t = el('text', { x: padL - 6, y: y(v) + 4, 'text-anchor': 'end', class: 'plot-tick' }, grid); t.textContent = fmt(v);
      });
      // x ticks: thin out to fit
      var every = Math.max(1, Math.ceil(n / Math.max(2, Math.floor(iw / 34))));
      L.forEach(function (lb, i) {
        if (i !== n - 1 && (i % every || (n - 1 - i) < every * 0.6)) return;
        var t = el('text', { x: x(i), y: padT + ih + 16, 'text-anchor': 'middle', class: 'plot-tick' }, grid); t.textContent = lb;
      });
      if (o.xLabel) { var xl = el('text', { x: padL + iw / 2, y: H - 4, 'text-anchor': 'middle', class: 'plot-axis' }, svg); xl.textContent = o.xLabel; }
      if (o.yLabel) { var yl = el('text', { x: 12, y: padT + ih / 2, 'text-anchor': 'middle', transform: 'rotate(-90 12 ' + (padT + ih / 2) + ')', class: 'plot-axis' }, svg); yl.textContent = o.yLabel; }

      var marks = el('g', { class: 'plot-marks' + (first ? ' plot-new' : '') }, svg);
      if (kind === 'bars') {
        var gap = Math.min(8, bw * 0.25);
        S[0].values.forEach(function (v, i) {
          if (!v) return;
          var h = Math.max(1, y(0) - y(v)), r = Math.min(4, (bw - gap) / 2);
          el('path', { class: 'plot-bar s1', d: 'M' + (x(i) - (bw - gap) / 2) + ',' + y(0) + 'v' + (-(h - r)) + 'q0,' + (-r) + ' ' + r + ',' + (-r) + 'h' + (bw - gap - 2 * r) + 'q' + r + ',0 ' + r + ',' + r + 'v' + (h - r) + 'z' }, marks);
        });
      } else {
        var fill = o.area != null ? o.area : S.length === 1, ends = [];
        S.forEach(function (s, k) {
          var pts = []; s.values.forEach(function (v, i) { if (v != null) pts.push([x(i), y(v)]); });
          var d = pathFor(pts, o.curve);
          if (k === 0 && fill && pts.length) el('path', { class: 'plot-area', d: d + 'L' + pts[pts.length - 1][0] + ',' + y(0) + 'L' + pts[0][0] + ',' + y(0) + 'Z', fill: 'url(#' + id + 'g)' }, marks);
          el('path', { class: 'plot-line s' + (k + 1), d: d }, marks);
          if (S.length > 1 && pts.length) ends.push({ x: pts[pts.length - 1][0] + 6, y: pts[pts.length - 1][1] + 4, name: s.name });
        });
        // direct labels at the line ends, nudged apart so they never overlap
        ends.sort(function (p, q) { return p.y - q.y; });
        for (var e = 1; e < ends.length; e++) if (ends[e].y - ends[e - 1].y < 13) ends[e].y = ends[e - 1].y + 13;
        ends.forEach(function (p) { var lt = el('text', { x: p.x, y: p.y, class: 'plot-dl' }, marks); lt.textContent = p.name; });
      }
      // crosshair layer
      var hov = el('g', { class: 'plot-hover' }, svg);
      geo.cross = el('line', { y1: padT, y2: padT + ih, class: 'plot-cross', visibility: 'hidden' }, hov);
      geo.dots = S.map(function (s, k) { return el('circle', { r: 4.5, class: 'plot-dot s' + (k + 1), visibility: 'hidden' }, hov); });
      el('rect', { x: padL, y: padT, width: iw, height: ih, fill: 'transparent', class: 'plot-hit' }, svg);
      first = false;

      // legend (2+ series) and table
      legend.innerHTML = S.length > 1 ? S.map(function (s, k) { return '<span><i class="sw s' + (k + 1) + '"></i>' + esc(s.name) + '</span>'; }).join('') : '';
      if (S.length > 1 && !legend.parentNode) fig.insertBefore(legend, box);
      det.innerHTML = '<summary>Show as table</summary><div class="plot-tw"><table><caption>' + esc(o.title || '') + '</caption><thead><tr><th scope="col">' + esc(o.xLabel || '') + '</th>' +
        S.map(function (s) { return '<th scope="col">' + esc(s.name) + '</th>'; }).join('') + '</tr></thead><tbody>' +
        L.map(function (lb, i) { return '<tr><th scope="row">' + esc(lb) + '</th>' + S.map(function (s) { return '<td>' + esc(fmt(s.values[i])) + '</td>'; }).join('') + '</tr>'; }).join('') +
        '</tbody></table></div>';
      if (idx >= 0) point(Math.min(idx, n - 1), false);
    }

    function point(i, announce) {
      if (!geo || i < 0) { hide(); return; }
      idx = i;
      var X = geo.x(i);
      geo.cross.setAttribute('x1', X); geo.cross.setAttribute('x2', X); geo.cross.setAttribute('visibility', 'visible');
      geo.S.forEach(function (s, k) {
        var v = s.values[i], d = geo.dots[k];
        if (v == null || kind === 'bars') { d.setAttribute('visibility', 'hidden'); return; }
        d.setAttribute('cx', X); d.setAttribute('cy', geo.y(v)); d.setAttribute('visibility', 'visible');
      });
      tip.innerHTML = '<b>' + esc((o.xLabel ? o.xLabel + ' ' : '') + geo.L[i]) + '</b>' +
        geo.S.map(function (s, k) { return '<span>' + (geo.S.length > 1 ? '<i class="sw s' + (k + 1) + '"></i>' : '') + esc(s.name) + ': <b>' + esc(fmt(s.values[i])) + '</b></span>'; }).join('');
      tip.hidden = false;
      var scale = svg.getBoundingClientRect().width / geo.W || 1, tw = tip.offsetWidth;
      var left = X * scale + 12; if (left + tw > box.clientWidth) left = X * scale - tw - 12;
      tip.style.left = Math.max(0, left) + 'px'; tip.style.top = (geo.padT * scale + 4) + 'px';
      if (announce) live.textContent = (o.xLabel ? o.xLabel + ' ' : '') + geo.L[i] + ': ' + geo.S.map(function (s) { return s.name + ' ' + fmt(s.values[i]); }).join(', ');
    }
    function hide() { idx = -1; tip.hidden = true; if (!geo) return; geo.cross.setAttribute('visibility', 'hidden'); geo.dots.forEach(function (d) { d.setAttribute('visibility', 'hidden'); }); }

    box.addEventListener('pointermove', function (e) {
      if (!geo || !svg) return;
      var r = svg.getBoundingClientRect(), px = (e.clientX - r.left) * geo.W / r.width;
      if (px < geo.padL - 10 || px > geo.padL + geo.iw + 10) { hide(); return; }
      var best = 0, bd = Infinity; for (var i = 0; i < geo.n; i++) { var dd = Math.abs(geo.x(i) - px); if (dd < bd) { bd = dd; best = i; } }
      point(best, false);
    });
    box.addEventListener('pointerleave', hide);
    box.addEventListener('keydown', function (e) {
      if (!geo) return;
      var k = e.key, i = idx < 0 ? 0 : idx;
      if (k === 'ArrowRight' || k === 'ArrowUp') i = Math.min(geo.n - 1, idx < 0 ? 0 : i + 1);
      else if (k === 'ArrowLeft' || k === 'ArrowDown') i = Math.max(0, idx < 0 ? 0 : i - 1);
      else if (k === 'Home') i = 0; else if (k === 'End') i = geo.n - 1;
      else if (k === 'Escape') { hide(); return; } else return;
      e.preventDefault(); point(i, true);
    });
    box.addEventListener('focusout', hide);

    draw();
    if (window.ResizeObserver) { var lastW = box.clientWidth; ro = new ResizeObserver(function () { if (Math.abs(box.clientWidth - lastW) > 4) { lastW = box.clientWidth; draw(); } }); ro.observe(box); }
    return {
      update: function (next) { for (var k in next) o[k] = next[k]; draw(); },
      destroy: function () { if (ro) ro.disconnect(); host.innerHTML = ''; host.classList.remove('plot'); }
    };
  }

  window.DndPlot = {
    line: function (host, opts) { return make(host, 'line', opts || {}); },
    bars: function (host, opts) { return make(host, 'bars', opts || {}); }
  };
})();
