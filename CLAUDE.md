# Pantry Pal — Brief

> **Claude: read this first.** Open only the files a change touches; use the code map to jump to a function instead of reading whole files.
> At the end of a work session, update **Status** and add one line to **Changelog** (keep about 5).

Groceries + recipes in one. Like a crafting game: each recipe shows whether you can make it or what's missing, and missing items go straight to the grocery list. Users: Gary and Cecilia on Samsung Android phones (Chrome PWA). Gary likes cute kawaii visuals (icon: smiling fridge on mint), clear contrast and plain-language replies.

## Stack & hosting
| Piece | Location |
|---|---|
| Live app | https://dailuo-source.github.io/Pantry-Pal/ (GitHub Pages from `main`; only `web/` is published, by `.github/workflows/pages.yml` (Settings → Pages → Source: GitHub Actions)) |
| Data | Google Sheet **Pantry Pal**, id `1M16iXq0e-vhhKMZnfMd8rVd-ZvvyMYpD28DEEihUBEw` |
| Backend | Apps Script bound to the sheet; source of truth is `Code.gs` here |
| API link | `API_URL` near the top of the script in `index.html` |
| Auth | Script Property `APP_KEY`; each phone stores it as `pc.key` after opening the link from **Pantry Pal → Show app key and link** |
| Setup guide | `SETUP.md` (first-time setup only) |

**Different from the usual template on purpose:** stays on github.io, site files in `web/`, one `index.html`. Apps Script serves its own copy, `apps-script/index.html` (saved from the live project on 2026-10-21, older than `web/index.html`); don't split either file, op-batched API.

## Sheet schema
Defined in `SCHEMA` at the top of `Code.gs`. Columns matched by header name; rows typed into the sheet get IDs automatically.

| Tab (`coll`) | One row is | Columns |
|---|---|---|
| Pantry (`items`) | a pantry item | ID, Item, Amount, Unit, Section, Staple, In stock, Updated, Example |
| Recipes (`recipes`) | a recipe | ID, Recipe, Serves, Ingredients (one per line), Steps (one per line), Link, Last cooked, Updated, Example, Draft, Icon, Meal, Cuisine, Difficulty, Cook time |
| Grocery List (`list`) | a list item | ID, Item, Amount, Unit, For recipes, In cart, Added |
| Barcodes (`barcodes`) | product → pantry item | ID, Barcode, Item, Amount per package, Unit, Section, Brand, Updated |
| Units (`units`) | a unit choice | ID, Unit |

Sections: Produce, Meat & fish, Dairy & eggs, Pantry, Spices, Frozen, Other.

## API
`doPost` → `api()`, `text/plain` POSTs (no CORS preflight).
- Request `{key, ops: [{op: add|update|del, coll, id, data}]}`; empty `ops` just reads.
- Response `{ok: true, state: {items, recipes, list, barcodes, units}, sheetUrl}` or `{ok: false, error, message}` (`bad_request`, `not_setup`, `bad_key`, `busy`, `server`).
- App applies changes on screen first, batches every 350 ms (`enqueue` → `flush`), polls every 60 s.

## Code map
| File | Lines | What's in it |
|---|---|---|
| `Code.gs` | 550 | `SCHEMA`; `doPost`/`api`; read/write (`readAll_`, `applyOp_`, `table_`, `fromCell_`/`toCell_`); menu (`onOpen`, `setup`, `showKey`, `setWebAppUrl`, `resetKey`); tabs (`buildTab_`, `ensureUnits_`, `seedExamples_`) |
| `web/index.html` | ~1120 | CSS (to ~235), markup (to ~260), one `<script>` |
| `web/sw.js` | 33 | offline cache; `CACHE` |
| `web/manifest.webmanifest` | 32 | keep `id: pantry-pal-app` |

Inside the `index.html` script, search for:
- Units and parsing: `CONV`, `ALIAS`, `convert`, `fmtNum`, `normUnit`, `unitList`, `unitOptions`, `parseLine`, `norm`, `guessCat`/`CAT_WORDS`
- Sync: `initKey`, `callApi`, `enqueue`, `flush`, `normalize`, `boot`
- Recipe matching: `findItem`, `check`/`checkRaw`, `stats`
- Screens: `render`, `refresh`, `renderRecipes`, `renderPantry`, `renderList`, `mealList`
- Panels: `openSheet`, `renderSheet`, `sheetRecipe`, `sheetEditRecipe`, `sheetEditItem`, `sheetEditList`, `bind*Form`
- Actions: `addToPantry`, `addToList`, `addMissing`, `cook`, `putAway`
- Icons: `KAWAII` (see token trap), `autoIcon`, `iconHTML`, `sheetIconPick`
- Barcode: `getDetector`, `sheetScan`, `startScan`, `stopScan`
- Events: the `document.addEventListener` block near the end; Back button = `popstate` handler

## Design rules
- Optional ingredients: `, optional` on a line; never blocks a recipe.
- Staples are have/out only (In stock), not amounts.
- Units: Canadian cup = 250 ml, tbsp 15 ml, tsp 5 ml. Weights with weights, volumes with volumes; bag, jar… behave like counts.
- **Units** tab is the master unit list (dropdowns, "+ New unit…", every Unit column); created on first request if missing.
- Ingredient names match loosely ("large eggs" finds "Eggs").
- Meal chips: Breakfast / Lunch / Dinner / Dessert first, then others; combine with status filters; remembered as `pc.meal`.
- Barcodes: BarcodeDetector + ponyfill, Open Food Facts lookup, stored as text (leading `'`) to keep zeros.
- Back button: closes a panel, then returns to Recipes, then "Press back again to close".
- No full name in app web addresses.

## Releasing changes
- **App files**: edit, bump `CACHE` in `web/sw.js` (now `pantry-pal-v17`), commit and push to `main`.
- **Code.gs**: paste into Apps Script, save, **Deploy → Manage deployments → pencil → New version → Deploy** (same URL). Via Claude in Chrome: set the Monaco editor value from the raw GitHub file, Ctrl+S, redeploy.
- Commits use author `Claude <noreply@anthropic.com>`.

## Deploying Code.gs

- Web app deployment ID: `AKfycbwSpWrbiB1ak7Sj3dDuZNlAcvEueD1DKPu_KC8E-JcW-EPetTz104e2ZroLZBapTO5p`. Always update this deployment so the /exec URL never changes.
- From this folder, `.clasp.json` points clasp at the script project (rootDir is the repo root, where `Code.gs` is):
  ```
  clasp push
  clasp deploy -i AKfycbwSpWrbiB1ak7Sj3dDuZNlAcvEueD1DKPu_KC8E-JcW-EPetTz104e2ZroLZBapTO5p -d "what changed"
  ```
- Never run `clasp deploy` without `-i`: that creates a new deployment with a new /exec URL. `clasp deployments` lists them.
- Ignore the older deployment `AKfycbxn3OarQ25MbA2YPpXQaJAewHVsrmdhIR7wOpX_Ps74F1X_2FHBCV5edkyKg3prfJyJjA` (version 1). index.html calls the one above.

## Known gotchas
- **Token trap:** line 485 of `index.html` is the `KAWAII` icon table, one ~55,000-character line. Never read it or a range including it; trim grep output (e.g. `grep -n … | cut -c1-200`). Touch it only when changing icons.
- Android won't install a second PWA from the same github.io origin; Gary's other apps are on `*.pages.dev`.
- The camera doesn't work inside the Apps Script iframe, only on the GitHub Pages copy.

## Status
- Working: pantry, recipes with can-make filters, grocery list, cook with undo, units tab, barcode scanning, drafts, kawaii icons, meal filters.
- To check: the live Apps Script matches `Code.gs` (barcode saving and icon choices need the latest deployed).

## Changelog (latest first, keep about 5 lines)
- 2026-10-21: Moved the site files into `web/`; only that folder is published
- 2026-10-22: Trimmed this brief
- 2026-10-20: color-scheme meta so Chrome keeps its bars dark in dark mode
- 2026-10-19: Dark install colours so Android's bottom bar isn't white
- 2026-10-18: New kawaii app icon (smiling fridge on mint), also the header logo

## Working efficiently
- Find code with search first, then read only the relevant lines. Don't read index.html top to bottom.
- Make small, targeted edits. Never regenerate a whole file.
- Don't open a browser to test unless I ask. I'll test on my phone.
- No subagents unless I ask.
- One task per session. I'll /clear between tasks.
