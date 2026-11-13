/* dnd-shared theme toggle v1: one key (dnd.theme) shared by every toolbox site.
   OLD_KEY is this site's previous key ('ws.theme', 'di.theme', 'mcp.theme'), migrated once. */
(function () {
  var OLD_KEY = 'di.theme';
  function get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* private mode */ } }
  var t = get('dnd.theme');
  if (!t && OLD_KEY) {
    var old = get(OLD_KEY);
    try { old = JSON.parse(old); } catch (e) { /* stored raw */ }
    if (old === 'dark' || old === 'light') { t = old; set('dnd.theme', old); }
  }
  if (t === 'dark' || t === 'light') document.documentElement.dataset.theme = t;
  var btn = document.getElementById('themeBtn');
  if (btn) btn.addEventListener('click', function () {
    var cur = document.documentElement.dataset.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    var next = cur === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    set('dnd.theme', next);
  });
})();
