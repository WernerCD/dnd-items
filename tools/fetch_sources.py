"""Refresh the raw inputs in source/ and data-src/other-items.json.

Run by hand (not in CI):  python tools/fetch_sources.py

1. Open5e v2 API -> source/open5e-<endpoint>.json
   SRD 5.1 (srd-2014) and SRD 5.2 (srd-2024) only. CC-BY-4.0 text.
2. 5etools-src (fan dataset on GitHub) -> data-src/other-items.json
   FACTS ONLY for items outside the SRD: name, type, rarity, attunement,
   source book, page, edition. No description text is kept, ever.
"""
import json
import re
import time
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
UA = {"User-Agent": "dnd-items-site-build/1.0 (+https://github.com/WernerCD/dnd-items)"}
DOCS = "srd-2014,srd-2024"
ENDPOINTS = ["items", "magicitems", "weapons", "armor"]
FIVE = "https://raw.githubusercontent.com/5etools-mirror-3/5etools-src/main/data/"


def get(url):
    for attempt in range(4):
        try:
            req = urllib.request.Request(url, headers=UA)
            with urllib.request.urlopen(req, timeout=60) as r:
                return json.loads(r.read().decode("utf-8"))
        except Exception as e:  # noqa: BLE001
            if attempt == 3:
                raise
            print("  retry", url, e)
            time.sleep(3)


def fetch_open5e():
    for ep in ENDPOINTS:
        url = f"https://api.open5e.com/v2/{ep}/?document__key__in={DOCS}&limit=200"
        rows = []
        while url:
            print("GET", url)
            d = get(url)
            rows.extend(d["results"])
            url = d.get("next")
        rows.sort(key=lambda r: r["key"])
        out = ROOT / "source" / f"open5e-{ep}.json"
        out.write_text(json.dumps(rows, indent=1, ensure_ascii=False), encoding="utf-8")
        print(f"  {ep}: {len(rows)} rows -> {out.name}")


# 5etools type codes -> our type names
TYPE5 = {
    "A": "Ammunition", "AF": "Ammunition", "AT": "Tool", "EM": "Adventuring Gear", "FD": "Food & Drink",
    "G": "Adventuring Gear", "GS": "Tool", "HA": "Armor", "INS": "Tool", "LA": "Armor", "MA": "Armor",
    "M": "Weapon", "R": "Weapon", "MNT": "Mount", "TAH": "Adventuring Gear", "OTH": "Other", "P": "Potion",
    "RD": "Rod", "RG": "Ring", "S": "Armor", "SC": "Scroll", "SCF": "Spellcasting Focus", "T": "Tool",
    "TG": "Trade Good", "VEH": "Vehicle", "SHP": "Vehicle", "AIR": "Vehicle", "SPC": "Vehicle",
    "WD": "Wand", "ST": "Staff", "$": "Treasure", "$A": "Treasure", "$C": "Treasure", "$G": "Treasure",
    "IDG": "Other", "GV": "Other",
}
SRD_SOURCES = set()  # filled from items whose 'srd' / 'srd52' flag is set


def type5(it):
    t = (it.get("type") or "").split("|")[0]
    if it.get("wondrous"):
        return "Wondrous Item"
    if it.get("poison"):
        return "Poison"
    if it.get("staff"):
        return "Staff"
    if it.get("weapon") or it.get("weaponCategory"):
        return "Weapon"
    if it.get("armor"):
        return "Armor"
    return TYPE5.get(t, "Other")


def rarity5(it):
    r = it.get("rarity") or "none"
    if r in ("none", "unknown", "unknown (magic)"):
        return "Mundane" if r == "none" else "Unknown"
    return r.title()


def attune5(it):
    a = it.get("reqAttune")
    if not a:
        return None
    return True if a is True else str(a)[:80]


def fetch_5etools():
    books = {b["id"]: b for b in get(FIVE + "books.json")["book"]}
    advs = {b["id"]: b for b in get(FIVE + "adventures.json")["adventure"]}
    names = {}
    for k, b in list(books.items()) + list(advs.items()):
        # "-alt" groups are partnered / third-party products, not official WotC books
        if str(b.get("group", "")).endswith("-alt"):
            continue
        names[k] = {"name": b["name"], "published": b.get("published", "")}
    rows = []
    for fn, key in (("items.json", "item"), ("items-base.json", "baseitem")):
        d = get(FIVE + fn)
        for it in d.get(key, []):
            if it.get("srd") or it.get("srd52") or it.get("basicRules") or it.get("basicRules2024"):
                srd = True
            else:
                srd = False
            src = it.get("source", "")
            info = names.get(src)
            if not info:
                continue  # homebrew/partner/unknown products are skipped
            # books from the 2024 Player's Handbook (2024-09-17) on use the 2024 rules
            ed = "2024" if (it.get("edition") == "one" or info["published"] >= "2024-09-17") else "2014"
            rows.append({
                "name": it["name"],
                "source": src,
                "sourceName": info["name"],
                "page": it.get("page"),
                "edition": ed,
                "type": type5(it),
                "rarity": rarity5(it),
                "attune": attune5(it),
                "magic": rarity5(it) not in ("Mundane",),
                "consumable": type5(it) in ("Potion", "Scroll", "Ammunition", "Poison", "Food & Drink")
                or bool(it.get("charges") and it.get("type", "").startswith("SC")),
                "inSrd": srd,
            })
    # generic magic variants ("+1 Armor", "Mariner's Armor", "Armor of Gleaming"...): facts from "inherits"
    for v in get(FIVE + "magicvariants.json").get("magicvariant", []):
        inh = v.get("inherits") or {}
        src = inh.get("source", "")
        info = names.get(src)
        if not info:
            continue
        req = " ".join(str(r.get("type", "")) + " " + " ".join(k for k in r if k != "type") for r in v.get("requires", []))
        if v.get("ammo") or re.search(r"\bAF?\b", req):
            typ = "Ammunition"
        elif re.search(r"\b(LA|MA|HA|S)\b|armor", req):
            typ = "Armor"
        elif re.search(r"\b(M|R)\b|weapon|sword|axe|bow", req, re.I):
            typ = "Weapon"
        else:
            typ = "Other"
        ed = "2024" if (v.get("edition") == "one" or info["published"] >= "2024-09-17") else "2014"
        rar = rarity5(inh)
        rows.append({
            "name": re.sub(r"\s*\(\*\)$", "", v["name"]),
            "source": src,
            "sourceName": info["name"],
            "page": inh.get("page"),
            "edition": ed,
            "type": typ,
            "rarity": rar,
            "attune": attune5(inh),
            "magic": rar != "Mundane",
            "consumable": typ == "Ammunition",
            "inSrd": bool(inh.get("srd") or inh.get("srd52")),
        })
    rows.sort(key=lambda r: (r["sourceName"], r["name"]))
    out = ROOT / "data-src" / "other-items.json"
    out.write_text(json.dumps(rows, indent=1, ensure_ascii=False), encoding="utf-8")
    print(f"  5etools facts: {len(rows)} rows -> {out.name}")


if __name__ == "__main__":
    fetch_open5e()
    fetch_5etools()
