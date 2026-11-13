# D&D Item Finder

A searchable list of D&D 5e items for both the **2014** and **2024** rules: magic items, weapons, armor, adventuring gear, tools, poisons, potions and scrolls.

**Live:** https://wernercd.github.io/dnd-items/ · part of the [D&D Toolbox](https://wernercd.github.io/dnd/) · [Changes](https://wernercd.github.io/dnd-items/changes.html)

## Features
- Pick the rules edition (2014 or 2024) and search names, properties and rules text.
- Filters: magic / mundane, type, rarity, attunement, consumables only, favorites only, and a searchable **Sources** picker (Core books / Select all / Clear all / Only matches). The core rulebooks (SRDs, PHB, DMG, MM, Xanathar's, Tasha's) are listed first and are the only ones selected at first.
- Card detail toggle: **Basic** (name, rarity, type, attunement, source), **Stats** (cost, weight, damage, properties, weapon mastery, AC), or **Full** (the whole SRD text on every card).
- **Group variants**: the SRD lists every +1/+2/+3 weapon, every Holy Avenger blade and so on as its own item; grouped, they show as one card with a list of variants.
- Click any card for the details: a facts table, the full SRD text (tables included), a 2014/2024 switch when the item exists in both, and a link to the source book.
- Every card shows its source, colour-coded by book. **One list (all books)** mixes the other-books index into the main list; turn it off to list those separately.
- An original one-line summary for every SRD item (separate 2014 wording where the rules differ), on Stats/Full cards and in the detail view.
- Favorites are saved in your browser. The link keeps your filters (`?ed=2014&kind=magic&rarity=Legendary&type=Weapon&books=all&view=stats`), and `?item=srd_bag-of-holding` opens one item directly.
- More cards load as you scroll; the Type and Rarity menus have Clear buttons.
- Prints cleanly: tick Favorites only, pick Stats or Full and print for a paper item list.
- Source material links for every book. The change log is its own page (`site/changes.html`). The header, footer and theme follow the shared D&D Toolbox conventions (`WernerCD/dnd`, `STYLE.md`); the theme is stored under `dnd.theme`, shared with the other toolbox sites.

## Data and copyright
The repo and site are public, so only freely licensed text is reproduced.

| Data | Where it comes from | What is shown |
|---|---|---|
| SRD 5.1 items (2014 rules) | [Open5e API v2](https://api.open5e.com/v2/) `items`, `magicitems`, `weapons`, `armor`, `document__key__in=srd-2014` | Full text |
| SRD 5.2 items (2024 rules) | Same endpoints, `srd-2024` | Full text |
| Items from other official books (DMG beyond the SRD, Xanathar's, Tasha's, adventures...) | Compiled from the community [5etools-src](https://github.com/5etools-mirror-3/5etools-src) dataset | **Facts only**: name, type, rarity, attunement, book, page. No rules text |

Nothing is taken from D&D Beyond; the site only links to its book pages. Partnered and third-party products are left out of the index.

## Layout
| Path | What |
|---|---|
| `site/` | The static site (HTML/CSS/JS, no build step) |
| `site/data/items.json` | Generated data, rebuilt by CI on every push |
| `tools/build_data.py` | Builds the data from `source/` and `data-src/` (offline) |
| `tools/check_site.py` | Shared toolbox smoke check, run by CI before deploy |
| `tools/fetch_sources.py` | Refreshes `source/` from Open5e and `data-src/other-items.json` from 5etools (run by hand) |
| `source/` | Raw Open5e exports (SRD 5.1 and 5.2, CC-BY-4.0) |
| `data-src/other-items.json` | Facts-only index of non-SRD items |
| `data-src/summaries.json` | Original one-line summaries, keyed by normalized item name (`2014|name` where the 2014 rules differ) |

## Run locally
```bash
python tools/fetch_sources.py   # only to refresh the inputs
python tools/build_data.py
python -m http.server 8765 --directory site
```
Checks (CI runs the same before every deploy): `python tools/check_site.py`. Every push to `main` deploys to GitHub Pages via `.github/workflows/pages.yml`.

## Credits and license
- Code: MIT, see [LICENSE](LICENSE).
- This work includes material from the System Reference Document 5.1 and System Reference Document 5.2 by Wizards of the Coast LLC, available at https://dnd.wizards.com/resources/systems-reference-document. Both SRDs are licensed under the Creative Commons Attribution 4.0 International License (https://creativecommons.org/licenses/by/4.0/legalcode). The SRD data was retrieved via the [Open5e](https://open5e.com) API.
- The index of items from other books lists facts only (names, types, rarities, attunement, book and page). Those books and their text are © Wizards of the Coast.
- Unofficial fan content. Not affiliated with or endorsed by Wizards of the Coast.
