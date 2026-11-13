"""dnd-shared site smoke check v1.3 -- copy unchanged to tools/check_site.py in every toolbox repo.

CI runs it before every deploy (after any data build), so a broken page or data file never goes live:
    python tools/check_site.py
Checks, for site/index.html, site/changes.html and site/404.html:
  - the page exists and has <html lang>, one <h1>, a <title>, a description, og:title, theme-color
  - the shared header (hub-bar), footer, theme script and update notice are present
  - every local src/href it references exists in site/
  - every JSON file under site/ parses
Exit code 1 on any failure.
"""
import json, re, sys
from pathlib import Path

SITE = Path(__file__).resolve().parents[1] / "site"
errors = []

def check_page(name, need_meta=True):
    f = SITE / name
    if not f.exists():
        errors.append(f"{name}: missing"); return
    html = f.read_text(encoding="utf-8")
    must = {
        "lang": r'<html lang="[a-z]', "title": r"<title>[^<]+</title>", "hub-bar": r'class="wrap hub-bar"',
        "footer": r'class="site-footer"', "theme": r"getItem\('dnd\.theme'\)",
    }
    if need_meta:
        must.update({"description": r'<meta name="description"', "og:title": r'property="og:title"',
                     "theme-color": r'name="theme-color"', "version.js": r'src="(?:/[^"]*/)?version\.js\?v='})
    for k, rx in must.items():
        if not re.search(rx, html): errors.append(f"{name}: no {k}")
    if len(re.findall(r"<h1[ >]", html)) != 1: errors.append(f"{name}: needs exactly one <h1>")
    for ref in re.findall(r'(?:src|href)="([^"#:?]+)(?:\?[^"]*)?"', html):
        if ref.startswith("//") or ref in ("./", "/"): continue
        rel = re.sub(r"^/[^/]+/", "", ref) if ref.startswith("/") else ref
        if rel.endswith("/") or not rel: continue
        if not (SITE / rel).exists(): errors.append(f"{name}: links missing file {ref}")

check_page("index.html")
check_page("changes.html")
check_page("404.html", need_meta=False)
for j in SITE.rglob("*.json"):
    try: json.loads(j.read_text(encoding="utf-8"))
    except Exception as e: errors.append(f"{j.relative_to(SITE)}: bad JSON ({e})")

if errors:
    print("check_site FAILED:\n  " + "\n  ".join(errors)); sys.exit(1)
print("check_site OK")
