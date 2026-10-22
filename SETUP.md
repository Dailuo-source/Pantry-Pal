# Pantry Pal — setup

Your Google Sheet is the database. You can edit recipes, pantry items and the grocery list in the app or directly in the sheet. The app picks up sheet edits when you open it, when you tap the sync status, or about once a minute while it's open.

## Part 1: Sheet + Apps Script (about 10 minutes)

1. **Create a blank Google Sheet** and name it `Pantry Pal`.
2. In the sheet, open **Extensions → Apps Script**.
3. Replace everything in `Code.gs` with the contents of **Code.gs** from this folder.
4. Click **+** next to Files → **HTML**, name it `apps-script/index` (Apps Script adds `.html`), and paste in **apps-script/index.html**. (`clasp push` does this for you.)
5. Save. In the function dropdown pick **setup**, click **Run**, and approve the permissions.
   - This builds the **Pantry**, **Recipes** and **Grocery List** tabs with dropdowns and checkboxes, adds example rows, and creates your **app key** (shown in the execution log).
6. **Deploy → New deployment → Select type: Web app**
   - Execute as: **Me**
   - Who has access: **Anyone**
   - Click Deploy and copy the **Web app URL** (ends in `/exec`).
7. Reload the sheet. A **Pantry Pal** menu appears. Choose **Set web app link…** and paste the `/exec` URL from step 6 (you only do this once). It then shows your full phone link. Later, **Show app key and link** brings it back up.
8. On your phone, open that link once (it includes `?key=...`). The app remembers the key. Add it to your home screen from Chrome's menu if you like.

**Sharing with someone in your household:** send them the same link. Anyone without the key can open the page but can't see or change any data. To revoke access, use **Pantry Pal → Make a new app key**.

**After you edit Code.gs or index.html:** Deploy → Manage deployments → pencil icon → Version: **New version** → Deploy. This keeps the same URL.

## Editing in the sheet

| Tab | Notes |
| --- | --- |
| **Recipes** | Put ingredients in one cell, one per line: `2 cups flour`, `3 eggs`, `salt`. Add `, optional` to extras (`pickles, optional`) so they don't block a recipe. Steps work the same way. Extra columns such as Meal or Cuisine are fine; the app ignores them. |
| **Pantry** | Amount + Unit for things you measure. Tick **Staple** for things you only track as have/out (salt, oil, spices) and use **In stock**. Out-of-stock items turn red. |
| **Grocery List** | **In cart** ticks match the app's checkboxes. |

- Leave the hidden **ID** column alone. New rows you type get an ID automatically.
- You can reorder columns; the app matches them by header name.
- Units: pcs, g, kg, ml, L, tsp, tbsp, cup, lb, oz, clove, can, bunch, pack, slice. Weights convert with weights and volumes with volumes (cup = 250 ml). A recipe that asks for `1 cup flour` won't compare against pantry flour stored in kg; use the same kind of unit for best results.
- Ingredient names match loosely: plural/singular and extra leading words are fine ("large eggs" finds "Eggs").

## Part 2 (later): install it as an app with GitHub Pages

1. Create a GitHub repository (it needs to be public for free GitHub Pages; no data or key lives in these files).
2. Put the site files in `web/`: `index.html`, `manifest.webmanifest`, `sw.js`, `icon-192.png`, `icon-512.png`, `icon-maskable-512.png`. Only `web/` is published (`.github/workflows/pages.yml`; Settings → Pages → Source: GitHub Actions).
3. In `web/index.html`, set `const API_URL = "...";` near the top of the script to your web app URL (`/exec`).
4. Repository **Settings → Pages** → Deploy from branch → `main` / root.
5. On your phone, open `https://<your-username>.github.io/<repo>/?key=YOUR_KEY` in Chrome, then **⋮ → Add to home screen → Install**.

The same `index.html` works in both places: inside Apps Script it talks to the sheet directly, and on GitHub Pages it uses `API_URL`. When you update the GitHub files, bump `CACHE` in `sw.js` (e.g. `pantry-pal-v3`) so phones pick up the change.
