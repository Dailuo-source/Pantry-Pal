# Pantry Pal — Brief

> Claude: read this first and open only the files a change touches. In the long files, jump to code by searching for a function name (see the code map) instead of reading the whole file.
> At the end of a work session, update **Status** and add one line to **Changelog**.

## What it does
- Groceries + recipes in one. The pantry works like a game crafting system: each recipe shows whether you can make it or which ingredients are missing, and missing ones go straight to the grocery list.
- Users: Gary and his partner Cecilia, on Samsung Android phones (Chrome, installed as a PWA).
- Gary likes cute kawaii visuals (app icon: a smiling little fridge on mint), clear contrast, and plain-language replies.

## Stack & hosting
| Piece | Location |
|---|---|
| Live app | https://dailuo-source.github.io/Pantry-Pal/ (GitHub Pages from `main`) |
| Data | Google Sheet **Pantry Pal**, id `1M16iXq0e-vhhKMZnfMd8rVd-ZvvyMYpD28DEEihUBEw` |
| Backend | Apps Script bound to that sheet. Source of truth is `Code.gs` here; Gary pastes it into Extensions → Apps Script |
| API link | `API_URL` near the top of the script in `index.html` (the `/exec` URL) |
| Auth | Script Properties `APP_KEY`. Each phone remembers it (`pc.key` in localStorage) after opening the link from the sheet menu **Pantry Pal → Show app key and link** |
| Setup guide | `SETUP.md` (first-time setup only; no need to read it for changes) |

**Differs from the usual app template on purpose:** stays on github.io, files sit at the repo root, the front end is one `index.html` (Apps Script also serves this same file, so don't split it), and the API is op-batched rather than one action per call.

## Sheet schema
Defined in `SCHEMA` at the top of `Code.gs`. Columns are matched by header name, so Gary can reorder them or add his own. Rows typed into the sheet get IDs automatically.

| Tab (`coll`) | One row is | Columns |
|---|---|---|
| Pantry (`items`) | a pantry item | ID, Item, Amount, Unit, Section, Staple, In stock, Updated, Example |
| Recipes (`recipes`) | a recipe | ID, Recipe, Serves, Ingredients (one per line), Steps (one per line), Link, Last cooked, Updated, Example, Draft, Icon, Meal, Cuisine, Difficulty, Cook time |
| Grocery List (`list`) | a list item | ID, Item, Amount, Unit, For recipes, In cart, Added |
| Barcodes (`barcodes`) | a scanned product → pantry item | ID, Barcode, Item, Amount per package, Unit, Section, Brand, Updated |
| Units (`units`) | a unit choice | ID, Unit |

Sections: Produce, Meat & fish, Dairy & eggs, Pantry, Spices, Frozen, Other.

## API
One endpoint, `doPost` → `api()` in Code.gs. POSTs are `text/plain` to avoid CORS preflight.
- Request: `{key, ops: [{op: add|update|del, coll, id, data}]}`. An empty `ops` list just reads.
- Response: `{ok: true, state: {items, recipes, list, barcodes, units}, sheetUrl}` or `{ok: false, error, message}`. Errors: `bad_request`, `not_setup`, `bad_key`, `busy`, `server`.
- The app applies changes on screen first, batches them every 350 ms (`enqueue` → `flush`), and polls every 60 s while open.

## Code map
| File | Lines | What's in it |
|---|---|---|
| `Code.gs` | 550 | `SCHEMA`; `doPost`/`api`; read/write (`readAll_`, `applyOp_`, `table_`, `fromCell_`/`toCell_`); sheet menu (`onOpen`, `setup`, `showKey`, `setWebAppUrl`, `resetKey`); tab building (`buildTab_`, `ensureUnits_`, `seedExamples_`) |
| `index.html` | ~1120 | CSS (top to about line 235), markup (`<body>` to about line 260), then one `<script>` |
| `sw.js` | 33 | Offline cache; `CACHE` version string |
| `manifest.webmanifest` | 32 | PWA manifest; keep `id: pantry-pal-app` |

Inside the `index.html` script, search for these names:
- Units and parsing: `CONV`, `ALIAS`, `convert`, `fmtNum`, `normUnit`, `unitList`, `unitOptions`, `parseLine`, `norm`, `guessCat`/`CAT_WORDS`
- Sync: `initKey`, `callApi`, `enqueue`, `flush`, `normalize`, `boot`
- Recipe matching: `findItem`, `check`/`checkRaw` (optional ingredients), `stats`
- Screens: `render`, `refresh`, `renderRecipes`, `renderPantry`, `renderList`, meal chips `mealList`
- Panels: `openSheet`, `renderSheet`, `sheetRecipe`, `sheetEditRecipe`, `sheetEditItem`, `sheetEditList`, `bind*Form`
- Actions: `addToPantry`, `addToList`, `addMissing`, `cook` (with undo), `putAway`
- Icons: `KAWAII` (the SVG table; see the token trap below), `autoIcon`, `iconHTML`, `sheetIconPick`
- Barcode: `getDetector`, `sheetScan`, `startScan`, `stopScan`, package-size parsing below it
- Event handlers: the `document.addEventListener` block near the end; Android back button is the `popstate` handler

## Decisions & conventions
- Optional ingredients: add `, optional` to a line; they never block a recipe.
- Staples are tracked as have/out only (In stock), not by amount.
- Unit conversion: Canadian cup = 250 ml, tbsp 15 ml, tsp 5 ml. Weights convert with weights, volumes with volumes. Units with no conversion (bag, jar…) behave like counts.
- The **Units** tab is the master unit list: app dropdowns follow it (falling back to the built-in list on an older Code.gs), "+ New unit…" adds a row there, and every Unit column in the sheet uses it. Code.gs creates the tab on the first request if missing.
- Ingredient names match loosely (plural/singular, extra leading words: "large eggs" finds "Eggs").
- Meals: chip row shows Breakfast / Lunch / Dinner / Dessert first, then any other Meal value; combines with the status filters (All / Ready / 1–2 away / Need more / Drafts). Last meal filter is remembered per phone (`pc.meal`).
- Barcode scanning: BarcodeDetector + ponyfill, Open Food Facts lookup, mappings saved in Barcodes.
- Android back button: closes an open panel, then returns to Recipes, then shows "Press back again to close".
- Gary doesn't want his full name in app web addresses.

## Releasing changes
- **App files** (`index.html`, `sw.js`, icons): edit, bump `CACHE` in `sw.js` (now `pantry-pal-v14`), commit and push to `main`. Pages serves it within a few minutes; phones pick it up because the service worker fetches with `cache: 'no-cache'`.
- **Code.gs**: Gary pastes it into Apps Script, saves, then **Deploy → Manage deployments → pencil → Version: New version → Deploy** (same URL). Claude can also do this in Gary's Chrome with Claude in Chrome: set the Monaco editor's value from the raw GitHub file, Ctrl+S, then redeploy.
- Commits use author `Claude <noreply@anthropic.com>`; GitHub rejects Gary's private email.

## Known gotchas
- **Token trap:** line 485 of `index.html` is the `KAWAII` icon table, one line of about 55,000 characters. Don't read that line or a range that includes it, and search `index.html` with output trimmed (e.g. `grep -n … | cut -c1-200`). Only touch it when changing icons.
- Chrome on Android won't install a second PWA from the same github.io origin, which is why Gary's other apps live on Cloudflare Pages (`*.pages.dev`). Only Pantry Pal stays on github.io.
- The camera doesn't work inside the Apps Script iframe, only on the GitHub Pages copy.
- Barcodes are stored as text (a leading `'`) to keep leading zeros.

## Status
- Working: pantry, recipes with can-make filters, grocery list with "put away", cook with undo, units tab, barcode scanning, drafts, kawaii icons, meal filters. About 80 recipes imported from Gary's old "Recipes 🍅" sheet.
- To check: that the live Apps Script matches `Code.gs` here (barcode saving and icon choices need the latest version deployed).
- Next up: (none recorded)

## Changelog (latest first, keep about 10 lines)
- 2026-10-18: New thick-line kawaii app icon (smiling fridge on mint)
- 2026-10-18: Turned these notes into a one-page brief (schema, API, code map, status)
- 2026-10-17: Recipes filter by meal; cards show meal, difficulty and cook time; meal picker in the editor
