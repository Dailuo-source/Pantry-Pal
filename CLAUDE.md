# Pantry Pal — Brief

> **Claude: read this first.** Open only the files a change touches; use the code map to jump to a function instead of reading whole files.
> At the end of a work session, update **Status** and add one line to **Changelog** (keep about 5).

Groceries + recipes in one. Each recipe shows whether you can make it or what's missing, and missing items go straight to the grocery list. Users: Gary and Cecilia on Samsung Android phones (Chrome PWA). Gary likes cute kawaii visuals (icon: smiling fridge on mint), clear contrast and plain-language replies.

Look (redesign 2026-10-30, mockup: Design canvas "Pantry Pal redesign"): dark only, deep navy + blue-green accent `#5FD4C8`, soft sand for Low and dusty rose for Out, Figtree font, compact rows (48 px), square checkboxes with rounded corners.

## Stack & hosting
| Piece | Location |
|---|---|
| Live app | https://dailuo-source.github.io/Pantry-Pal/ (GitHub Pages from `main`; only `web/` is published, by `.github/workflows/pages.yml` (Settings → Pages → Source: GitHub Actions)) |
| Data | Google Sheet **Pantry Pal**, id `1M16iXq0e-vhhKMZnfMd8rVd-ZvvyMYpD28DEEihUBEw` |
| Backend | Apps Script bound to the sheet; source of truth is `Code.gs` here |
| API link | `API_URL` near the top of the script in `index.html` |
| Auth | Script Property `APP_KEY`; each phone stores it as `pc.key` after opening the link from **Pantry Pal → Show app key and link** |
| Setup guide | `SETUP.md` (first-time setup only) |

**Different from the usual template on purpose:** stays on github.io, site files in `web/`, one `index.html`. Apps Script serves its own copy, `apps-script/index.html` (kept identical to `web/index.html`); don't split either file, op-batched API.

## Sheet schema
Defined in `SCHEMA` at the top of `Code.gs`. Columns matched by header name; rows typed into the sheet get IDs automatically.

| Tab (`coll`) | One row is | Columns |
|---|---|---|
| Pantry (`items`) | a pantry item | ID, Item, Amount, Unit, Section, Staple, In stock, Updated, Example, Track, Level, Usual store |
| Recipes (`recipes`) | a recipe | ID, Recipe, Serves, Ingredients (one per line), Steps (one per line), Link, Last cooked, Updated, Example, Draft, Icon, Meal, Cuisine, Difficulty, Cook time, Photo, Up next, Meal prep, Batch makes, Batch of, Keeps, Prep steps (one per line), Reheat |
| Grocery List (`list`) | a list item | ID, Item, Amount, Unit, For recipes, In cart, Added, Store |
| Barcodes (`barcodes`) | product → pantry item | ID, Barcode, Item, Amount per package, Unit, Section, Brand, Updated |
| Units (`units`) | a unit choice | ID, Unit |
| Stores (`stores`) | where you shop | ID, Store (seeded: Costco, Asian market, Farmer's market) |

New columns and tabs are added by `migrate_()` on the first request after `SCHEMA_V` changes (now `2`). Nothing is ever removed.

Sections: Produce, Meat & fish, Dairy & eggs, Pantry, Spices, Frozen, Other.

## API
`doPost` → `api()`, `text/plain` POSTs (no CORS preflight).
- Request `{key, ops: [{op: add|update|del|photo, coll, id, data}]}`; empty `ops` just reads. `photo` sends `data.b64` (JPEG, max 1200 px, shrunk on the phone); `savePhoto_` saves it to Drive **My AI Apps / Pantry Pal photos**, shares it by link, and writes the file id to the recipe's Photo column. The app shows it via `drive.google.com/thumbnail?id=…`.
- Response `{ok: true, state: {items, recipes, list, barcodes, units, stores}, sheetUrl}` or `{ok: false, error, message}` (`bad_request`, `not_setup`, `bad_key`, `busy`, `server`).
- App applies changes on screen first, batches every 350 ms (`enqueue` → `flush`), polls every 60 s.

## Code map
| File | Lines | What's in it |
|---|---|---|
| `Code.gs` | 634 | `SCHEMA`, `SCHEMA_V`; `doPost`/`api`; read/write (`readAll_`, `applyOp_`, `table_`, `fromCell_`/`toCell_`); upgrades + photos (`migrate_`, `photoFolder_`, `savePhoto_`, `authorizePhotos`); menu (`onOpen`, `setup`, `showKey`, `setWebAppUrl`, `resetKey`); tabs (`buildTab_`, `ensureUnits_`, `seedExamples_`) |
| `web/index.html` | ~1500 | CSS (to ~290), markup (to ~320), one `<script>`. `apps-script/index.html` is a copy of it (served inside Apps Script); copy it again after front-end changes |
| `web/sw.js` | 33 | offline cache; `CACHE` |
| `web/manifest.webmanifest` | 32 | keep `id: pantry-pal-app` |

Inside the `index.html` script, search for:
- Units and parsing: `CONV`, `ALIAS`, `fmtNum`, `qtyText`, `normUnit`, `unitList`, `parseLine`, `lineOf`, `norm`, `guessCat`/`CAT_WORDS`
- Sync: `initKey`, `callApi`, `enqueue`, `applyLocal`, `wire`, `flush`, `normItem`, `normalize`, `boot`
- Pantry model: `effQty`, `isCounted`, `levelOf`, `pkgUnits`, `itemAmount`, `storeList`, `setItem`, `newItem`
- Recipe matching: `findItem`, `check`/`checkRaw`, `stats`, `niceAmt`, `photoSrc`
- Screens: `render` (draws each tab's header), `refresh`, `renderRecipes` (Up next, meal chips, shelves, search), `renderPantry`/`itemRow`/`itemEditor`, `renderList`/`listRow`
- Panels: `openSheet(s, push)` / `closeSheet` (stacked, Back pops), `renderSheet`, `sheetRecipe`, `sheetPrep`, `sheetEditRecipe` (works on `sheet.ed`, `edSave`), `sheetCooked`/`cookSave`, `sheetAdd`/`qaGo` (quick add), `sheetIconPick`, `ingRows`, `picBlock`
- Actions: `haveIt`, `addToList`, `addMissing`, `putAway`, `stepItem`, `sparkle`, `shrinkPhoto`/`sendPhoto`
- Icons: `KAWAII` (see token trap), `autoIcon`, `iconKey`/`iconInner`/`smallPic`
- Barcode: `getDetector`, `sheetScan`, `startScan`, `stopScan`, `sheetScanResult`, `submitScan`
- Events: one `click` switch on `data-act`, plus `input`/`change`/`keydown` handlers near the end; Back button = `popstate` handler

## Design rules
- **Pantry never measures.** Each item is either counted in whole packages (Track `count`: Amount + Unit like each, can, bottle, pack) or tracked as Have / Low / Out (Track `status`, Level column). Old rows: staples and weighed items (g, ml…) read as Have/Out; counted units stay counted. Staple / In stock are kept in step for older copies of the app.
- **Recipes keep real units** (cups, tbsp, g). A recipe ingredient is "have" unless the pantry item is Out; only a counted item in the same unit can come up short. Low items show a Low tag.
- Cooking subtracts nothing. "I cooked this" asks Fine / Low / Out (counted: Fine / Low / −1) per ingredient and can add Low/Out to the list.
- Ingredients read "Buttermilk – 2 cups"; each has a square tick-off box (not saved) and "I have it" for things bought but not logged.
- Meal prep: recipes with Meal prep ticked get a ×1–×5 page that scales every amount (6 tsp → 2 tbsp), plus a prep-step checklist (recipe steps + Prep steps).
- Up next: a number in the Up next column; the home card lists them in order.
- Grocery list: amounts are packages; recipe items say "Needed for X" (no recipe amounts). Store per item (defaults to the pantry item's Usual store), grouped and filtered by store or by aisle. Add button floats bottom right and sparkles.
- Photos are optional; the kawaii icon is the default. Tap the picture on a recipe or in Edit to change the icon or add a photo.
- Optional ingredients: `, optional` on a line; never blocks a recipe.
- Units: Canadian cup = 250 ml, tbsp 15 ml, tsp 5 ml.
- **Units** tab is the master unit list (dropdowns, "+ New unit…", every Unit column); created on first request if missing.
- Ingredient names match loosely ("large eggs" finds "Eggs").
- Meal chips: Breakfast / Lunch / Dinner / Dessert first, then others; combine with status filters; remembered as `pc.meal`.
- Barcodes: BarcodeDetector + ponyfill, Open Food Facts lookup, stored as text (leading `'`) to keep zeros.
- Back button: closes a panel, then returns to Recipes, then "Press back again to close".
- No full name in app web addresses.

## Releasing changes
- **App files**: edit, bump `CACHE` in `web/sw.js` (now `pantry-pal-v18`), copy `web/index.html` to `apps-script/index.html`, commit and push to `main`.
- **Code.gs**: paste into Apps Script, save, **Deploy → Manage deployments → pencil → New version → Deploy** (same URL). Via Claude in Chrome: set the Monaco editor value from the raw GitHub file, Ctrl+S, redeploy.
- Photos need Drive access once: in the Apps Script editor run `authorizePhotos` and allow it, then redeploy.
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
- **Token trap:** line 744 of `index.html` is the `KAWAII` icon table, one ~55,000-character line. Never read it or a range including it; trim grep output (e.g. `grep -n … | cut -c1-200`). Touch it only when changing icons.
- Android won't install a second PWA from the same github.io origin; Gary's other apps are on `*.pages.dev`.
- The camera doesn't work inside the Apps Script iframe, only on the GitHub Pages copy.

## Status
- Working (redesign, 2026-10-30): recipes home with Up next + meal shelves + search, recipe page with tick-offs and I have it, meal prep ×1–×5, edit recipe (name-first rows, unit chips, meal prep settings), I cooked this check, pantry (packages or Have/Low/Out, inline editor, usual store), quick add, grocery list by store/aisle with sparkle Add, photos, barcode scanning.
- Deployed 2026-10-30 (Apps Script version 10, same /exec URL) and `authorizePhotos` run. To check on the phone: new columns/Stores tab appear after first sync; a photo saves.

## Changelog (latest first, keep about 5 lines)
- 2026-10-30: Big redesign (navy/teal, Figtree): pantry stops measuring, stores on the list, meal prep, Up next, photos; new columns + Stores tab via migrate_
- 2026-10-21: Moved the site files into `web/`; only that folder is published
- 2026-10-20: color-scheme meta so Chrome keeps its bars dark in dark mode
- 2026-10-19: Dark install colours so Android's bottom bar isn't white
- 2026-10-18: New kawaii app icon (smiling fridge on mint), also the header logo

## Working efficiently
- Find code with search first, then read only the relevant lines. Don't read index.html top to bottom.
- Make small, targeted edits. Never regenerate a whole file.
- Don't open a browser to test unless I ask. I'll test on my phone.
- No subagents unless I ask.
- One task per session. I'll /clear between tasks.
