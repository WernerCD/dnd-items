"""Item Finder checks, run by tools/smoke_test.py (STYLE.md 7) after the shared browser tests.

run(page, base, check): page is a fresh Playwright page, base the site URL (http://127.0.0.1:<port>/dnd-items/),
check(cond, message) records a pass or a failure.
"""

def wait_ready(page):
    page.wait_for_function("() => /\\d/.test(document.querySelector('#countN') ? document.querySelector('#countN').textContent : '')", timeout=15000)
    page.wait_for_timeout(300)


def count(page):
    return page.evaluate("() => parseInt(document.querySelector('#countN').textContent.replace(/,/g, ''), 10)")


def search(page, q):
    page.fill("#search", q)
    page.wait_for_timeout(450)


def run(page, base, check):
    # --- loads the data ---
    page.goto(base + "?ed=2024", wait_until="load")
    wait_ready(page)
    n = count(page)
    check(n > 1000, f"[items] 2024 list loads with over 1000 items (got {n})")

    # --- Sources picker: core books first and ticked, the rest listed but off (STYLE.md 6f) ---
    src = page.evaluate("""() => {
        const rows = [...document.querySelectorAll('#srcList > *')];
        return { groups: rows.filter(r => r.classList.contains('src-group')).map(r => r.textContent),
                 on: [...document.querySelectorAll('#srcList input:checked')].map(i => i.dataset.src),
                 all: [...document.querySelectorAll('#srcList input')].map(i => i.dataset.src) };
    }""")
    check(src["groups"][:1] == ["Core rules"], f"[sources] 'Core rules' is the first group (got {src['groups']})")
    check(sorted(src["on"]) == sorted(["SRD 5.2", "Player's Handbook (2024)", "Dungeon Master's Guide (2024)", "Monster Manual (2025)"]),
          f"[sources] only the 2024 core books start ticked (got {src['on']})")
    check("World of Warcraft" in src["all"] and "World of Warcraft" not in src["on"],
          "[sources] World of Warcraft is listed but not ticked")
    check("books=" not in page.url, "[sources] the default selection stays out of the link")

    # --- search finds an SRD item and its dialog shows the SRD text ---
    search(page, "bag of holding")
    first = page.evaluate("() => (document.querySelector('#list .card h3') || {}).textContent")
    check(first == "Bag of Holding", f"[search] 'bag of holding' puts Bag of Holding first (got {first!r})")
    page.click("#list .card a.open")
    page.wait_for_timeout(300)
    dlg = page.evaluate("() => ({ open: document.querySelector('#detail').open, text: document.querySelector('#dBody').textContent })")
    check(dlg["open"] and "CC-BY-4.0" in dlg["text"] and len(dlg["text"]) > 300,
          "[dialog] the SRD item opens with its rules text and the CC-BY credit")
    check("item=" in page.url, "[dialog] the open item is in the link")
    page.keyboard.press("Escape")
    page.wait_for_timeout(200)

    # --- a non-SRD item is facts only: no rules text (copyright rule) ---
    page.goto(base + "?ed=2014&books=all&q=orcsplitter", wait_until="load")
    wait_ready(page)
    page.click("#list .card a.open")
    page.wait_for_timeout(300)
    txt = page.evaluate("() => document.querySelector('#dBody').textContent")
    check("not in the free SRD" in txt and "CC-BY" not in txt, "[copyright] a book item shows facts only, no rules text")
    page.keyboard.press("Escape")

    # --- filters survive in the link ---
    page.goto(base + "?ed=2024", wait_until="load")
    wait_ready(page)
    page.click("[data-kind='magic']")
    page.click("#rarPick summary")
    page.check("#rarChips input[data-rar='Legendary']")
    page.wait_for_timeout(700)
    n1, url = count(page), page.url
    check("kind=magic" in url and "rarity=Legendary" in url, f"[link] kind and rarity are written to the link ({url})")
    page.goto(url, wait_until="load")
    wait_ready(page)
    st = page.evaluate("() => ({ leg: document.querySelector('#rarChips input[data-rar=\"Legendary\"]').checked, kind: document.querySelector('[data-kind=\"magic\"]').getAttribute('aria-checked') })")
    check(st["leg"] and st["kind"] == "true" and count(page) == n1, "[link] reopening the link restores the same filters and count")

    # --- rarity chart renders and follows the filters ---
    page.evaluate("() => { const b = document.querySelector('#chartBox'); b.open = true; b.dispatchEvent(new Event('toggle')); }")
    page.wait_for_timeout(600)
    rows = page.evaluate("() => [...document.querySelectorAll('#rarChart .plot-table tbody tr')].map(tr => [tr.cells[0].textContent, tr.cells[1].textContent])")
    has_svg = page.evaluate("() => !!document.querySelector('#rarChart svg')")
    leg = dict(rows).get("Legendary", "")
    check(has_svg and leg.replace(",", "") == str(n1), f"[chart] the rarity chart draws and its Legendary bar matches the results ({leg} vs {n1})")

    # --- Reset all clears everything but the edition ---
    page.click("#resetBtn")
    page.wait_for_timeout(500)
    check("kind=" not in page.url and "rarity=" not in page.url, "[reset] Reset all clears the filters from the link")

    # --- a character: Usable by hides class-limited items, attunement is capped ---
    page.evaluate("""() => {
        const ch = DndChar.save({ name: 'Smoke Cleric', ed: '2024', classes: [{ cls: 'cleric', lvl: 5 }], ab: [10, 10, 14, 10, 16, 12] }, 'smoke');
        DndChar.setActive(ch.id);
    }""")
    page.wait_for_timeout(500)
    search(page, "holy avenger")
    check(count(page) == 0, "[character] Usable by hides the paladin-only Holy Avenger from a cleric")
    page.uncheck("#usable")
    page.wait_for_timeout(400)
    check(count(page) > 0, "[character] unticking Usable by shows it again")
    page.check("#usable")
    search(page, "")

    # --- import offer: the hub importer's anonymised Brin sample (STYLE.md 6g) ---
    brin = {"v": 1, "src": "ddb", "at": "2026-11-19T06:09:16.081Z", "ed": "2024", "name": "Brin Ashvale",
            "items": [{"n": "Chain Mail", "qty": 1, "eq": True, "att": False}, {"n": "Shield", "qty": 1, "eq": True, "att": False},
                      {"n": "Longsword", "qty": 1, "eq": True, "att": False}, {"n": "Potion of Healing", "qty": 2, "eq": False, "att": False},
                      {"n": "Cloak of Protection", "qty": 1, "eq": True, "att": True},
                      {"n": "Belt of Hill Giant Strength", "qty": 1, "eq": False, "att": False},
                      {"n": "Rations", "qty": 10, "eq": False, "att": False}]}
    page.evaluate("""(imp) => {
        const ch = DndChar.save({ name: 'Brin Ashvale', ed: '2024', classes: [{ cls: 'paladin', lvl: 5 }, { cls: 'warlock', lvl: 2 }], ab: [18, 10, 15, 8, 10, 16] }, 'smoke');
        const d = JSON.parse(localStorage.getItem('dnd.characters')); const c = d.list.find(x => x.id === ch.id);
        c.imp = imp; d.active = ch.id; localStorage.setItem('dnd.characters', JSON.stringify(d));
        window.dispatchEvent(new StorageEvent('storage', { key: 'dnd.characters' }));
    }""", brin)
    page.wait_for_timeout(600)
    check(page.is_visible("#impNote [data-imp-add]"), "[import] an imported character's items are offered")
    page.click("#impNote [data-imp-add]")
    page.wait_for_timeout(400)
    got = page.evaluate("() => DndChar.active().links['dnd-items']")
    inv = got.get("inv", {})
    check(len(inv) == 7, f"[import] all 7 of Brin's items match (got {len(inv)})")
    check(inv.get("srd-2024_belt-of-giant-strength-hill") == 1, "[import] 'Belt of Hill Giant Strength' matches the 2024 SRD belt")
    check(inv.get("srd-2024_potion-of-healing") == 2 and inv.get("srd-2024_rations") == 10, "[import] quantities are kept")
    check(got.get("att") == ["srd-2024_cloak-of-protection"] and got.get("impAt") == brin["at"],
          "[import] the attuned cloak takes a slot and impAt is saved")
    page.reload(wait_until="load")
    wait_ready(page)
    check(not page.is_visible("#impNote"), "[import] the same import is not offered again")
    sheet = page.evaluate("() => (DndChar.active().sheet || {})['dnd-items']")
    check(bool(sheet) and sheet.get("v") == 1 and sheet.get("attuned") == 1 and len(sheet.get("items", [])) == 7,
          "[sheet] the character sheet summary is published (STYLE.md 6e)")

    # --- hub search list: its links open the right entry (STYLE.md 6j) ---
    import json, pathlib
    sj = json.loads((pathlib.Path(__file__).resolve().parents[1] / "site" / "search.json").read_text(encoding="utf-8"))
    by = {x["n"]: x for x in sj["items"]}
    check(len(by) == len(sj["items"]), "[search.json] one entry per name")
    for name, title in (("Bag of Holding", "Bag of Holding"), ("Orcsplitter", "Orcsplitter"), ("+1, +2 and +3 Weapons", "+1, +2 and +3 Weapons")):
        e = by.get(name)
        check(e is not None, f"[search.json] lists {name}")
        if not e:
            continue
        page.goto(base + e["u"], wait_until="load")
        wait_ready(page)
        page.wait_for_timeout(300)
        got = page.evaluate("() => document.querySelector('#detail').open ? document.querySelector('#dTitle').textContent : null")
        check(got == title, f"[search.json] the {name} link opens its entry (got {got!r})")
    check(all("desc" not in x and len(x.get("t", "")) < 90 for x in sj["items"]), "[search.json] names and short facts only")

    # --- dice and links between tools (STYLE.md 6k) ---
    page.goto(base + "?ed=2024&item=srd-2024_longsword", wait_until="load")
    wait_ready(page)
    page.wait_for_timeout(500)
    dmg = page.locator("#dBody dd[data-roll-entry='Damage'] .dd-roll")
    check(dmg.count() == 1 and "1d8" in dmg.first.text_content(), "[dice] the Longsword's damage 1d8 is a roll")
    if dmg.count():
        before = page.evaluate("() => JSON.parse(localStorage.getItem('dnd.rolls') || '[]').length")
        dmg.first.click()
        page.wait_for_timeout(400)
        log = page.evaluate("() => JSON.parse(localStorage.getItem('dnd.rolls') || '[]')")
        check(len(log) == before + 1 and "Longsword" in json.dumps(log[0]), f"[dice] clicking it rolls and logs it under the item's name ({log[:1]})")
        page.keyboard.press("Escape")
    page.goto(base + "?ed=2014&item=srd_wand-of-magic-missiles", wait_until="load")
    wait_ready(page)
    page.wait_for_timeout(500)
    rolls = page.locator("#dBody .itext .dd-roll").count()
    check(rolls > 0, f"[dice] dice in the item text become rolls ({rolls})")
    try:
        page.wait_for_selector("#dBody .itext a.dlx[href*='dnd-magic']", timeout=8000)
        ok = True
    except Exception:
        ok = False
    check(ok, "[links] the spell name in the Wand of Magic Missiles links to the Spell Planner")

    # --- u14: the 2014 link of a name that is in both editions opens the 2014 entry ---
    e = by.get("Bag of Holding", {})
    check("u14" in e, "[search.json] Bag of Holding has a u14 link for 2014 text")
    if e.get("u14"):
        page.goto(base + e["u14"], wait_until="load")
        wait_ready(page)
        page.wait_for_timeout(300)
        st = page.evaluate("() => ({ open: document.querySelector('#detail').open, ed: document.querySelector('#dBody').dataset.ed, t: (document.querySelector('#dTitle') || {}).textContent })")
        check(st["open"] and st["ed"] == "2014" and st["t"] == "Bag of Holding", f"[search.json] the u14 link opens the 2014 Bag of Holding ({st})")
