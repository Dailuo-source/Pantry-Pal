# Pantry Pal: handoff notes

Gary's groceries + recipes app. The pantry works like a game crafting system: each recipe shows whether you can make it, or which ingredients are missing, and missing ones go straight to the grocery list. Used by Gary and his partner Cecilia on their Samsung Android phones (Chrome, installed as a PWA).

## Where things live

| Piece | Location |
| --- | --- |
| Live app | https://dailuo-source.github.io/Pantry-Pal/ (GitHub Pages from `main` of `Dailuo-source/Pantry-Pal`) |
| Database | Google Sheet **Pantry Pal**, id `1M16iXq0e-vhhKMZnfMd8rVd-ZvvyMYpD28DEEihUBEw`. Tabs: Pantry, Recipes, Grocery List, Barcodes, Units |
| Backend | Apps Script bound to that sheet. Source of truth is `Code.gs` in this repo (Gary pastes it into Extensions → Apps Script) |
| API link | `API_URL` near the top of the script in `index.html` (the `/exec` web app URL) |
| App key | Script Properties `APP_KEY`; each phone remembers it after opening the link from the sheet menu **Pantry Pal → Show app key and link** |
| Setup guide | `SETUP.md` |

## How it works

- `doPost` / `api()` in Code.gs take `{key, ops:[{op:add|update|del, coll, id, data}]}` and return the whole state. Columns are matched by header name, so Gary can reorder columns or add his own (Meal, Cuisine, Difficulty, Cook time…). Rows typed into the sheet get IDs automatically.
- The app applies changes on screen first, batches them to the sheet every 350 ms, and polls every 60 s while open. POSTs are `text/plain` to avoid CORS preflight.
- Features: recipe filters (All / Ready / 1–2 away / Need more / Drafts), optional ingredients (`, optional`), staples (have/out only), unit conversion (Canadian cup = 250 ml), cook with undo, grocery list with "put away", barcode scanning (BarcodeDetector + ponyfill, Open Food Facts lookup, saved mappings in the Barcodes tab), drafts (Draft column), and kawaii recipe icons (inline SVGs in `index.html`, auto-picked from the recipe name, choice saved in the Icon column).
- Units: the **Units** tab is the master list of units. The app's unit dropdowns follow it (falling back to the built-in list on an older Code.gs), "+ New unit…" in any dropdown adds a row there, and every Unit column in the sheet uses it as its dropdown. Code.gs creates the tab on the first request after deploy, seeded with the standard units plus any already used. Units without a metric conversion (bag, jar…) behave like counts.
- Back button (Android): closes an open panel, then returns to Recipes, then shows "Press back again to close". Uses a spare history entry added on each tap (popstate handler near the end of the script).
- Meals: Code.gs reads the Recipes tab's Meal, Cuisine, Difficulty and Cook time columns. The app shows a meal chip row (Breakfast / Lunch / Dinner / Dessert first, then any other value in the Meal column) that combines with the status filters, shows "Meal · Difficulty · Cook time" on cards, and has a meal picker in the recipe editor. Last meal filter is remembered per phone (`pc.meal`).
- About 80 recipes were imported from Gary's old "Recipes 🍅" sheet.

## Changing things

- **App files** (`index.html`, `sw.js`, icons): edit, bump `CACHE` in `sw.js` (currently `pantry-pal-v13`), commit and push to `main`. GitHub Pages serves it within a few minutes; the service worker fetches with `cache: 'no-cache'` so phones pick it up.
- **Code.gs**: Gary pastes it into Apps Script, saves, then **Deploy → Manage deployments → pencil → Version: New version → Deploy**. The URL stays the same. Claude can also do this in Gary's Chrome with Claude in Chrome: set the Monaco model's value from the raw GitHub file, Ctrl+S, then redeploy.
- Commits use author `Claude <noreply@anthropic.com>`; GitHub rejects Gary's private email.

## Things to know

- Keep the manifest `id` as `pantry-pal-app`. Chrome on Android would not install a second PWA from the same github.io origin, which is why Gary's other apps live on Cloudflare Pages (`*.pages.dev`). Only Pantry Pal stays on github.io.
- Gary doesn't want his full name in app web addresses.
- Gary likes cute kawaii visuals (app icon: a jar character on mint), clear contrast, and plain-language replies.
- The camera doesn't work inside the Apps Script iframe, only on the GitHub Pages copy.

## Open items

- Check that the live Apps Script matches `Code.gs` here (barcode saving and icon choices need the latest version deployed).
