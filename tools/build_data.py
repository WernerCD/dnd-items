"""Build site/data/items.json from the raw sources.

Inputs (all in the repo, refreshed by tools/fetch_sources.py):
  source/open5e-items.json        SRD 5.1 + 5.2 mundane gear (Open5e v2 API, CC-BY-4.0)
  source/open5e-magicitems.json   SRD 5.1 + 5.2 magic items  (Open5e v2 API, CC-BY-4.0)
  source/open5e-weapons.json      weapon properties (mastery, ranges)
  source/open5e-armor.json        armor table
  data-src/other-items.json       facts-only index of items from other official books
                                  (name, type, rarity, attunement, book, page). No text.
  data-src/summaries.json         original one-line summaries, keyed by item id or normalized name

Run:  python tools/build_data.py
"""
import json
import re
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "source"
DSRC = ROOT / "data-src"
OUT = ROOT / "site" / "data" / "items.json"

DOC = {"srd-2014": ("2014", "SRD 5.1"), "srd-2024": ("2024", "SRD 5.2")}

CAT = {
    "weapon": "Weapon", "armor": "Armor", "shield": "Armor", "wondrous-item": "Wondrous Item",
    "potion": "Potion", "ring": "Ring", "rod": "Rod", "scroll": "Scroll", "staff": "Staff", "wand": "Wand",
    "ammunition": "Ammunition", "adventuring-gear": "Adventuring Gear", "equipment-pack": "Adventuring Gear",
    "tools": "Tool", "trade-good": "Trade Good", "poison": "Poison", "mount": "Mount",
    "land-vehicle": "Vehicle", "waterborne-vehicle": "Vehicle", "spellcasting-focus": "Spellcasting Focus",
}
CONSUMABLE_TYPES = {"Potion", "Scroll", "Poison", "Ammunition", "Food & Drink"}
CONSUMABLE_NAME = re.compile(
    r"^((Oil|Dust|Elixir|Philter|Potion|Spell Scroll|Ammunition|Arrow|Bolt|Bead of Force|Feather Token|"
    r"Keoghtom's Ointment|Nolzur's Marvelous Pigments|Sovereign Glue|Universal Solvent|Necklace of Fireballs)(?![\w-])"
    r"|(Acid|Alchemist's Fire|Antitoxin|Holy Water|Oil|Ball Bearings|Caltrops|Rations|Healer's Kit|Torch)"
    r"( \([^)]*\))?$)", re.I)
NAME_FIX = {"Essense of either": "Essence of ether"}
RARITY_ORDER = ["Mundane", "Common", "Uncommon", "Rare", "Very Rare", "Legendary", "Artifact", "Varies", "Unknown"]


def load(p):
    with open(p, encoding="utf-8") as f:
        return json.load(f)


def norm(s):
    return re.sub(r"[^a-z0-9]+", " ", s.lower().replace("'", "")).strip()


# a parenthesis that only gives a cost, quantity or container, not a different item
QTY_PAREN = re.compile(r"^(\d[\d,]*( gp| feet| sq\. yd\.)?|bag of [\d,]+|\d+ (feet|day|days)|bow|vial|flask|[csegp]p|\d+ gp)$", re.I)


def loose_keys(name, variant_base):
    """Name variants for loose matching. variant_base also tries "X (Variant)" -> "X"."""
    n = name.replace("'", "").replace("’", "")
    out = {n}
    m = re.match(r"^(.*?)\s*\(([^)]*)\)$", n)
    if m and (QTY_PAREN.match(m.group(2).strip()) or variant_base):
        out.add(m.group(1))
    for x in list(out):
        r = re.match(r"^([^,]+),\s*(.+)$", x)
        if r:
            out.add(r.group(2) + " " + r.group(1))
    keys = {norm(x) for x in out}
    return keys | {ALIASES[k] for k in keys if k in ALIASES}


# book name -> SRD name, where the SRD renamed the item
ALIASES = {"carrion crawler mucus": "crawler mucus"}


def base_name(name, typ=""):
    """'Holy Avenger (Longsword)' -> 'Holy Avenger'; 'Battleaxe (+1)' -> '+N Weapon';
    'Wand of the War Mage (+1)' / 'Wand of the War Mage +1' -> 'Wand of the War Mage'."""
    m = re.match(r"^(.*?)\s*\(([^)]*)\)$", name) or re.match(r"^(.*?)\s+(\+\d)$", name)
    if not m:
        return name
    base, inner = m.group(1), m.group(2)
    if re.fullmatch(r"\+\d", inner) and typ == "Weapon" and base not in ("Ammunition", "Weapon"):
        return "+N Weapon"
    return base


def num(x):
    try:
        v = float(x)
    except (TypeError, ValueError):
        return None
    return int(v) if v == int(v) else v


def weapon_info(w, wtable):
    if not w:
        return None
    props, mastery = [], None
    full = wtable.get(w.get("key")) or {}
    for p in w.get("properties") or full.get("properties") or []:
        pr = p.get("property") or {}
        name = pr.get("name", "")
        if pr.get("type") == "Mastery":
            mastery = name
            continue
        props.append(name + (f" ({p['detail']})" if p.get("detail") else ""))
    rng = full.get("range") or w.get("range")
    lr = full.get("long_range") or w.get("long_range")
    return {
        "dmg": w.get("damage_dice") or "",
        "dtype": (w.get("damage_type") or {}).get("name", ""),
        "cat": "Simple" if w.get("is_simple") else "Martial" if w.get("is_martial", True) else "",
        "ranged": bool(rng),
        "range": f"{num(rng)}/{num(lr)} ft" if rng else None,
        "props": props,
        "mastery": mastery,
    }


def armor_info(a):
    if not a:
        return None
    return {
        "ac": a.get("ac_display") or str(a.get("ac_base", "")),
        "cat": (a.get("category") or "").title(),
        "stealth": bool(a.get("grants_stealth_disadvantage")),
        "str": a.get("strength_score_required"),
    }


def attune(r):
    if not r.get("requires_attunement"):
        return None
    d = (r.get("attunement_detail") or "").strip()
    d = re.sub(r"^requires attunement\s*", "", d, flags=re.I).strip()
    return d[0].lower() + d[1:] if d else True


NL, BS = chr(10), chr(92)


def clean_desc(t):
    # some Open5e texts carry literal backslash-n sequences instead of newlines
    t = (t or '').replace(BS + 'r' + BS + 'n', NL).replace(BS + 'n', NL).replace(chr(13), '').replace(BS + '"', '"')
    t = re.sub(NL + '{3,}', NL + NL, t)
    return t.strip().rstrip(BS).strip()


def from_open5e(r, magic, wtable):
    ed, src = DOC[r["document"]["key"]]
    typ = CAT.get(r["category"]["key"], r["category"]["name"])
    rarity = r["rarity"]["name"].title() if magic and r.get("rarity") else "Mundane"
    name = r["name"]
    it = {
        "id": r["key"],
        "name": name,
        "ed": ed,
        "src": src,
        "srd": True,
        "type": typ,
        "rarity": rarity,
        "attune": attune(r) if magic else None,
        "magic": magic,
        "consumable": typ in CONSUMABLE_TYPES or bool(CONSUMABLE_NAME.match(name)),
        "cost": num(r.get("cost")) or None,
        "weight": num(r.get("weight")) or None,
        "desc": clean_desc(r.get("desc")),
    }
    w = weapon_info(r.get("weapon"), wtable)
    a = armor_info(r.get("armor"))
    if typ == "Weapon" and not w and not magic:
        it["type"] = "Adventuring Gear"  # 2024 Open5e files Acid, Oil, Torch, Net... under "weapon" with no weapon stats
    if w:
        it["weapon"] = w
    if a:
        it["armor"] = a
    if r["category"]["key"] == "shield":
        it["armor"] = {"ac": "+2", "cat": "Shield", "stealth": False, "str": None}
    return it


def main():
    wtable = {w["key"]: w for w in load(SRC / "open5e-weapons.json")}
    items, seen = [], set()
    for r in load(SRC / "open5e-magicitems.json"):
        it = from_open5e(r, True, wtable)
        items.append(it)
        seen.add((it["ed"], norm(it["name"])))
    for r in load(SRC / "open5e-items.json"):
        it = from_open5e(r, False, wtable)
        if (it["ed"], norm(it["name"])) in seen:
            continue  # the magic-item record already covers it
        items.append(it)
        seen.add((it["ed"], norm(it["name"])))

    # variant groups: several SRD items sharing a base name in one edition
    groups = {}
    for it in items:
        groups.setdefault((it["ed"], base_name(it["name"], it["type"])), []).append(it)
    for (ed, base), members in groups.items():
        if len(members) > 1:
            gid = f"g-{ed}-{norm(base).replace(' ', '-')}"
            for it in members:
                it["group"] = gid
                it["groupName"] = base

    summaries = {}
    sp = DSRC / "summaries.json"
    if sp.exists():
        summaries = load(sp)
    for it in items:
        # keyed by item id, or by the normalized item / variant-group name (one line covers all variants)
        gname = it.get("groupName")
        gkey = norm("+1, +2 and +3 Weapons" if gname == "+N Weapon" else gname) if gname else None
        # "2014|name" overrides the shared line where the 2014 rules differ
        sm = None
        for k in [it["id"]] + [p + n for n in (norm(it["name"]), gkey) if n for p in (it["ed"] + "|", "")]:
            if k in summaries:
                sm = summaries[k]
                break
        if sm:
            it["summary"] = sm

    # SRD items by name and by variant-group name, so a book entry for the same item
    # (PHB "Chain Mail", DMG "+1 Weapon") becomes an "also in" note on the SRD item
    # tidy SRD 5.1 poison names, which Open5e has in lower case (and one typo)
    small = {"of", "the", "and", "a"}
    for it in items:
        if it["type"] == "Poison" and it["ed"] == "2014":
            n = NAME_FIX.get(it["name"], it["name"])
            it["name"] = " ".join(w if (i and w in small) or w[:1].isupper() else w[:1].upper() + w[1:]
                                  for i, w in enumerate(n.split(" ")))
    by_name, by_group, by_loose = {}, {}, {}
    for it in items:
        for k in loose_keys(it["name"], False):
            by_loose.setdefault((it["ed"], k), []).append(it)
    for it in items:
        by_name.setdefault((it["ed"], norm(it["name"])), []).append(it)
        if it.get("groupName"):
            by_group.setdefault((it["ed"], norm(it["groupName"])), []).append(it)
    others, merged = [], 0
    for o in load(DSRC / "other-items.json"):
        ed, name = o["edition"], o["name"]
        keys = [norm(name),
                norm(re.sub(r"^\+\d\s+", "+N ", name)),  # "+1 Weapon" -> SRD group "+N Weapon"
                norm(re.sub(r"^\+\d\s+", "", name))]     # "+1 Rod of the Pact Keeper" -> "Rod of the Pact Keeper (+1)" group
        # an exact name wins over a variant group: PHB "Breastplate" is not the +1/+2/+3 Breastplates
        gm = re.match(r"^\+(\d) (Armor|Shield|Weapon|Ammunition)$", name)
        hit = None
        if gm:  # DMG "+1 Armor" covers every SRD "<armor> (+1)"
            typ = "Armor" if gm.group(2) in ("Armor", "Shield") else gm.group(2)
            hit = [it for it in items if it["ed"] == ed
                   and (it["type"] == typ or (typ == "Ammunition" and it["name"].startswith("Ammunition")))
                   and re.search(r"\(\+" + gm.group(1) + r"\)$|\+" + gm.group(1) + "$", it["name"])
                   and (gm.group(2) != "Shield" or it["name"].startswith("Shield"))
                   and (gm.group(2) != "Armor" or not it["name"].startswith("Shield"))] or None
        if not hit:
            ks = keys[:1] if gm else keys  # a generic "+2 Shield" must not land on the mundane Shield
            hit = next((idx[(ed, k)] for idx in (by_name, by_group) for k in ks if (ed, k) in idx), None)
        if not hit and not gm:
            # same item, worded differently: "Hooded Lantern" = "Lantern, Hooded",
            # "Silk Rope (50 feet)" = "Rope, silk (50 feet)", "Alchemist's Supplies" = "... (50 GP)"
            hit = next((by_loose[(ed, k)] for k in loose_keys(name, True) if (ed, k) in by_loose), None)
        if hit:
            merged += 1
            for it in hit:
                also = it.setdefault("also", [])
                if o["sourceName"] not in [a["src"] for a in also]:
                    also.append({"src": o["sourceName"], "page": o.get("page")})
            continue
        others.append({
            "id": "x-" + o["edition"] + "-" + o["source"].lower() + "-" + norm(o["name"]).replace(" ", "-"),
            "name": o["name"],
            "ed": o["edition"],
            "src": o["sourceName"],
            "page": o.get("page"),
            "srd": False,
            "type": o["type"],
            "rarity": "Unknown" if o["rarity"] == "Mundane" and o.get("attune") else o["rarity"],
            "attune": o.get("attune"),
            "magic": o["rarity"] != "Mundane" or bool(o.get("attune")),  # attunement means magic
            "consumable": o["type"] in CONSUMABLE_TYPES or bool(CONSUMABLE_NAME.match(o["name"])),
        })
    # one row per id (5etools can list an item twice, e.g. reprints within a book)
    uniq = {}
    for o in others:
        uniq.setdefault(o["id"], o)
    others = list(uniq.values())

    items.sort(key=lambda x: (x["ed"], x["name"]))
    others.sort(key=lambda x: (x["ed"], x["name"]))
    counts = {}
    for x in items + others:
        for src in [x["src"]] + [a["src"] for a in x.get("also", [])]:
            k = f'{x["ed"]} | {src}'
            counts[k] = counts.get(k, 0) + 1
    data = {
        "generated": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
        "rarities": RARITY_ORDER,
        "items": items,
        "others": others,
        "counts": dict(sorted(counts.items())),
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    n14 = sum(1 for i in items if i["ed"] == "2014")
    print(f"SRD items: {len(items)} (2014: {n14}, 2024: {len(items) - n14}); "
          f"index of other books: {len(others)} ({merged} book entries matched to SRD items as also-in)")
    print(f"wrote {OUT.relative_to(ROOT)} ({OUT.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    main()
