"""dnd-shared smoke_test.py v1.0 (canonical copy: WernerCD/dnd shared/smoke_test.py). Copy unchanged to tools/smoke_test.py.

Browser test suite every D&D Toolbox site runs before it deploys (STYLE.md section 7). It serves the
site/ folder at http://127.0.0.1:<port>/<repo>/ (the same path as on GitHub Pages) and checks, in a real
Chromium, at desktop and phone width:
  - every page loads with no JavaScript errors, no console errors and no failed same-site requests
  - the shared header, footer and top-bar tool menu are there and the menu opens
  - the theme button switches light/dark
  - nothing scrolls sideways at 375 px, and the phone "Tools" menu is shown
  - with "reduce motion" on, nothing is left hidden
  - on the main page: the shared character list works (save, reload, picker) and a share link imports
Site-specific tests: tests/smoke.json ({"pages": [...], "ignore_console": [regex...]}) and an optional
tests/site_test.py with  def run(page, base, check): ...  (check(cond, message) records a failure).

Run:  python tools/smoke_test.py            (from the repo root; needs: pip install playwright && python -m playwright install chromium)
Exit code 0 = all passed.
"""
import functools, http.server, json, os, re, shutil, socketserver, sys, tempfile, threading, importlib.util
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
REPO = os.environ.get("SITE_REPO") or ROOT.name
CFG = {}
if (ROOT / "tests" / "smoke.json").exists():
    CFG = json.loads((ROOT / "tests" / "smoke.json").read_text(encoding="utf-8"))
PAGES = CFG.get("pages") or [p for p in ["", "changes.html", "404.html"] if p == "" or (ROOT / "site" / p).exists()]
IGNORE = [re.compile(x) for x in CFG.get("ignore_console", [])] + [re.compile(r"fonts\.(googleapis|gstatic)\.com"), re.compile(r"favicon")]

fails, passes = [], 0
def check(cond, msg):
    global passes
    if cond: passes += 1
    else: fails.append(msg); print("  FAIL " + msg)

def serve():
    tmp = Path(tempfile.mkdtemp(prefix="dndsmoke"))
    shutil.copytree(ROOT / "site", tmp / REPO)
    class Quiet(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *a): pass
    handler = functools.partial(Quiet, directory=str(tmp))
    srv = socketserver.ThreadingTCPServer(("127.0.0.1", 0), handler)
    srv.daemon_threads = True
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv, tmp, f"http://127.0.0.1:{srv.server_address[1]}/{REPO}/"

def watch(page, errors, origin):
    page.on("pageerror", lambda e: errors.append(f"JS error: {e}"))
    def con(m):
        if m.type == "error" and not any(r.search(m.text + " " + (m.location or {}).get("url", "")) for r in IGNORE):
            errors.append(f"console error: {m.text[:200]}")
    page.on("console", con)
    def resp(r):
        if r.url.startswith(origin) and r.status >= 400 and not r.url.endswith("favicon.ico"):
            errors.append(f"HTTP {r.status} for {r.url[len(origin):]}")
    page.on("response", resp)

def main():
    from playwright.sync_api import sync_playwright
    srv, tmp, base = serve()
    origin = base.split(f"/{REPO}/")[0]
    print(f"Smoke test for {REPO} at {base}")
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch()
            for label, vp in (("desktop", {"width": 1280, "height": 900}), ("phone", {"width": 375, "height": 812})):
                ctx = browser.new_context(viewport=vp, reduced_motion="no-preference")
                for pg in PAGES:
                    name = f"[{label}] /{pg or ''}"
                    print(name)
                    page = ctx.new_page(); errors = []
                    watch(page, errors, origin)
                    r = page.goto(base + pg, wait_until="load")
                    page.wait_for_timeout(700)
                    check(r is not None and r.status == 200, f"{name}: loads (HTTP {r and r.status})")
                    check(page.locator(".hub-bar").count() == 1, f"{name}: shared header (.hub-bar)")
                    check(page.locator(".site-footer").count() == 1, f"{name}: shared footer")
                    check(page.locator(".tool-menu .tm-btn").count() == 4, f"{name}: top-bar tool menu with 4 groups (nav.js)")
                    overflow = page.evaluate("document.documentElement.scrollWidth - document.documentElement.clientWidth")
                    check(overflow <= 1, f"{name}: no sideways scroll (overflow {overflow}px)")
                    if label == "desktop":
                        page.locator(".tm-btn").first.click()
                        check(page.locator(".tm-list").first.is_visible(), f"{name}: tool menu opens on click")
                        page.keyboard.press("Escape")
                    else:
                        check(page.locator(".tm-all").is_visible(), f"{name}: phone Tools menu button")
                        page.locator(".tm-all").click()
                        check(page.locator(".tm-groups").is_visible(), f"{name}: phone Tools menu opens")
                        page.keyboard.press("Escape")
                    if page.locator("#themeBtn").count():
                        before = page.evaluate("document.documentElement.dataset.theme || ''")
                        page.locator("#themeBtn").click()
                        after = page.evaluate("document.documentElement.dataset.theme || ''")
                        check(after != before, f"{name}: theme button switches theme")
                        page.locator("#themeBtn").click()
                    for e in errors: check(False, f"{name}: {e}")
                    page.close()
                ctx.close()

            # reduced motion: nothing hidden
            ctx = browser.new_context(viewport={"width": 1280, "height": 900}, reduced_motion="reduce")
            page = ctx.new_page(); page.goto(base, wait_until="load"); page.wait_for_timeout(500)
            hidden = page.evaluate("[...document.querySelectorAll('[data-reveal] > *')].filter(e => getComputedStyle(e).opacity < 0.99).length")
            check(hidden == 0, f"[reduced motion] {hidden} element(s) left hidden")
            ctx.close()

            # shared characters on the main page
            ctx = browser.new_context(viewport={"width": 1280, "height": 900})
            page = ctx.new_page(); errors = []; watch(page, errors, origin)
            page.goto(base, wait_until="load"); page.wait_for_timeout(500)
            if page.evaluate("!!window.DndChar"):
                cid = page.evaluate("DndChar.save({name: 'Smoke Test', ed: '2024', classes: [{cls: 'druid', lvl: 5}]}, 'smoke').id")
                page.evaluate(f"DndChar.setActive('{cid}')")
                page.reload(wait_until="load"); page.wait_for_timeout(500)
                if page.locator("#charPick select").count():
                    check(page.locator(f"#charPick select option[value='{cid}']").count() == 1, "[characters] saved character shows in the header picker after reload")
                link = page.evaluate(f"DndChar.shareUrl(DndChar.get('{cid}'))")
                frag = link.split("#", 1)[1]
                page.evaluate("localStorage.removeItem('dnd.characters')")
                page.goto(base + "?fresh=1#" + frag, wait_until="load"); page.wait_for_timeout(700)
                check(page.locator(".char-import").count() == 1, "[characters] a share link shows the import prompt")
                if page.locator(".char-import .ci-yes").count():
                    page.locator(".char-import .ci-yes").click()
                    check(page.evaluate(f"!!DndChar.get('{cid}')"), "[characters] accepting the share link adds the character")
            else:
                check(False, "[characters] character.js not loaded on the main page")
            for e in errors: check(False, f"[characters] {e}")
            ctx.close()

            # site-specific tests
            st = ROOT / "tests" / "site_test.py"
            if st.exists():
                print("[site tests]")
                spec = importlib.util.spec_from_file_location("site_test", st); mod = importlib.util.module_from_spec(spec); spec.loader.exec_module(mod)
                ctx = browser.new_context(viewport={"width": 1280, "height": 900})
                page = ctx.new_page(); errors = []; watch(page, errors, origin)
                mod.run(page, base, check)
                for e in errors: check(False, f"[site tests] {e}")
                ctx.close()
            browser.close()
    finally:
        srv.shutdown(); shutil.rmtree(tmp, ignore_errors=True)
    print(f"\n{passes} passed, {len(fails)} failed")
    sys.exit(1 if fails else 0)

if __name__ == "__main__":
    main()
