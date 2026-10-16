/**
 * Pantry Pal — Google Sheets backend
 *
 * The Sheet is the database. Edit recipes, pantry and the grocery list
 * right in the tabs; the app picks up changes the next time it syncs.
 *
 * - doGet   serves the app (index.html) as an Apps Script web app
 * - doPost  is the JSON API used when the app is hosted elsewhere (GitHub Pages)
 * - api()   is the same API, called directly by the app via google.script.run
 *
 * Every request must carry the app key (menu: Pantry Pal → Show app key).
 */

const APP_NAME = 'Pantry Pal';
const UNITS = ['pcs', 'g', 'kg', 'ml', 'L', 'tsp', 'tbsp', 'cup', 'lb', 'oz', 'clove', 'can', 'bunch', 'pack', 'slice'];
const SECTIONS = ['Produce', 'Meat & fish', 'Dairy & eggs', 'Pantry', 'Spices', 'Frozen', 'Other'];

// [field, header label, type, column width]
const SCHEMA = {
  items: {
    sheet: 'Pantry',
    cols: [
      ['id', 'ID', 'id', 80],
      ['name', 'Item', 'text', 200],
      ['qty', 'Amount', 'num', 80],
      ['unit', 'Unit', 'unit', 80],
      ['category', 'Section', 'section', 120],
      ['staple', 'Staple', 'bool', 70],
      ['inStock', 'In stock', 'bool', 75],
      ['updated', 'Updated', 'date', 110],
      ['example', 'Example', 'bool', 75],
    ],
  },
  recipes: {
    sheet: 'Recipes',
    cols: [
      ['id', 'ID', 'id', 80],
      ['name', 'Recipe', 'text', 200],
      ['servings', 'Serves', 'num', 65],
      ['ingredients', 'Ingredients (one per line)', 'text', 280],
      ['steps', 'Steps (one per line)', 'text', 320],
      ['link', 'Link', 'text', 160],
      ['lastCooked', 'Last cooked', 'date', 110],
      ['updated', 'Updated', 'date', 110],
      ['example', 'Example', 'bool', 75],
      ['draft', 'Draft', 'bool', 65],
      ['icon', 'Icon', 'text', 55], // blank = the app picks one from the recipe name
    ],
  },
  list: {
    sheet: 'Grocery List',
    cols: [
      ['id', 'ID', 'id', 80],
      ['name', 'Item', 'text', 200],
      ['qty', 'Amount', 'num', 80],
      ['unit', 'Unit', 'unit', 80],
      ['for', 'For recipes', 'list', 200],
      ['checked', 'In cart', 'bool', 70],
      ['created', 'Added', 'date', 110],
    ],
  },
  // Products you've scanned: barcode → the pantry item it means to you
  barcodes: {
    sheet: 'Barcodes',
    cols: [
      ['id', 'ID', 'id', 80],
      ['code', 'Barcode', 'code', 130],
      ['name', 'Item', 'text', 200],
      ['qty', 'Amount per package', 'num', 130],
      ['unit', 'Unit', 'unit', 80],
      ['category', 'Section', 'section', 120],
      ['brand', 'Brand', 'text', 140],
      ['updated', 'Updated', 'date', 110],
    ],
  },
};

/* ------------------------------------------------------------------ */
/* Web app entry points                                                */
/* ------------------------------------------------------------------ */

function doGet() {
  return HtmlService.createHtmlOutputFromFile('index')
    .setTitle(APP_NAME)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, viewport-fit=cover');
}

function doPost(e) {
  const res = api(e && e.postData ? e.postData.contents : '{}');
  return ContentService.createTextOutput(JSON.stringify(res)).setMimeType(ContentService.MimeType.JSON);
}

/**
 * Request:  { key, ops: [{op: 'add'|'update'|'del', coll: 'items'|'recipes'|'list', id, data}] }
 * Response: { ok: true, state: {items, recipes, list}, sheetUrl } or { ok: false, error, message }
 * An empty ops list just returns the current state.
 */
function api(body) {
  let req;
  try {
    req = typeof body === 'string' ? JSON.parse(body || '{}') : body;
  } catch (err) {
    return { ok: false, error: 'bad_request', message: 'The request could not be read.' };
  }
  const props = PropertiesService.getScriptProperties();
  const key = props.getProperty('APP_KEY');
  if (!key) return { ok: false, error: 'not_setup', message: 'Run "Set up / repair sheets" from the Pantry Pal menu first.' };
  if (!req || String(req.key || '').trim() !== key) return { ok: false, error: 'bad_key', message: 'That app key is not right.' };

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) return { ok: false, error: 'busy', message: 'The sheet is busy. Try again in a moment.' };
  try {
    (req.ops || []).forEach(applyOp_);
    SpreadsheetApp.flush();
    return { ok: true, state: readAll_(), sheetUrl: ss_().getUrl() };
  } catch (err) {
    return { ok: false, error: 'server', message: String((err && err.message) || err) };
  } finally {
    lock.releaseLock();
  }
}

/* ------------------------------------------------------------------ */
/* Reading and writing                                                 */
/* ------------------------------------------------------------------ */

function ss_() {
  const id = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
  return id ? SpreadsheetApp.openById(id) : SpreadsheetApp.getActive();
}

function label_(s) {
  return String(s == null ? '' : s).toLowerCase().replace(/\(.*?\)/g, '').trim();
}

/** Map field → 0-based column index, matched by header text so columns can be moved. */
function headerMap_(head, sch) {
  const byLabel = {};
  sch.cols.forEach(function (c) { byLabel[label_(c[1])] = c[0]; });
  const cols = {};
  head.forEach(function (h, i) {
    const k = byLabel[label_(h)];
    if (k && cols[k] == null) cols[k] = i;
  });
  return cols;
}

function table_(sh, sch) {
  const width = Math.max(sh.getLastColumn(), 1);
  const lastRow = sh.getLastRow();
  const cols = headerMap_(sh.getRange(1, 1, 1, width).getValues()[0], sch);
  const rowOf = {};
  let last = 1;
  if (lastRow >= 2) {
    const vals = sh.getRange(2, 1, lastRow - 1, width).getValues();
    vals.forEach(function (r, i) {
      const id = cols.id != null ? String(r[cols.id]).trim() : '';
      const name = cols.name != null ? String(r[cols.name]).trim() : '';
      if (id || name) last = i + 2;
      if (id && !rowOf[id]) rowOf[id] = i + 2;
    });
  }
  return { cols: cols, rowOf: rowOf, lastRow: last, width: width };
}

function fromCell_(v, type) {
  switch (type) {
    case 'num': {
      if (v === '' || v == null) return null;
      const n = Number(v);
      return isNaN(n) ? null : n;
    }
    case 'bool':
      return v === true || /^(true|yes|y|x|1)$/i.test(String(v).trim());
    case 'date':
      if (v instanceof Date) return v.getTime();
      if (v === '' || v == null) return null;
      return new Date(v).getTime() || null;
    case 'list':
      return String(v == null ? '' : v).split(',').map(function (s) { return s.trim(); }).filter(String);
    default:
      return String(v == null ? '' : v).trim();
  }
}

function toCell_(v, type) {
  switch (type) {
    case 'num': return v == null || v === '' ? '' : Number(v);
    case 'bool': return !!v;
    case 'date': return v ? new Date(v) : '';
    case 'list': return Array.isArray(v) ? v.join(', ') : (v || '');
    case 'unit': return v === 'l' ? 'L' : (v || '');
    case 'code': return v ? "'" + String(v) : ''; // keep leading zeros: store as text
    default: return v == null ? '' : String(v);
  }
}

function newId_() {
  return 'r' + Utilities.getUuid().replace(/-/g, '').slice(0, 10);
}

function readAll_() {
  const ss = ss_();
  const out = {};
  Object.keys(SCHEMA).forEach(function (coll) {
    const sch = SCHEMA[coll];
    out[coll] = [];
    const sh = ss.getSheetByName(sch.sheet);
    if (!sh || sh.getLastRow() < 2) return;
    const width = sh.getLastColumn();
    const vals = sh.getRange(1, 1, sh.getLastRow(), width).getValues();
    const cols = headerMap_(vals[0], sch);
    const seen = {};
    const fixes = [];
    for (let r = 1; r < vals.length; r++) {
      const obj = {};
      sch.cols.forEach(function (c) {
        const i = cols[c[0]];
        if (i != null) obj[c[0]] = fromCell_(vals[r][i], c[2]);
      });
      if (!obj.name) continue;
      // Rows typed straight into the sheet (or copied) get their own ID
      if (!obj.id || seen[obj.id]) {
        obj.id = newId_();
        if (cols.id != null) fixes.push([r + 1, cols.id + 1, obj.id]);
      }
      seen[obj.id] = true;
      out[coll].push(obj);
    }
    fixes.forEach(function (f) { sh.getRange(f[0], f[1]).setValue(f[2]); });
  });
  return out;
}

function applyOp_(op) {
  const sch = SCHEMA[op.coll];
  if (!sch) throw new Error('Unknown list "' + op.coll + '".');
  const ss = ss_();
  // A tab added in a later version (like Barcodes) is created the first time it's used
  const sh = ss.getSheetByName(sch.sheet) || buildTab_(ss, sch);
  const t = table_(sh, sch);
  let row = op.id ? t.rowOf[op.id] : null;

  if (op.op === 'del') {
    if (row) sh.deleteRow(row);
    return;
  }

  const data = Object.assign({}, op.data || {});
  if (t.cols.updated != null) data.updated = Date.now();

  if (op.op === 'add' && !row) {
    data.id = op.id || newId_();
    const vals = [];
    for (let i = 0; i < t.width; i++) vals.push('');
    sch.cols.forEach(function (c) {
      const i = t.cols[c[0]];
      if (i != null && c[0] in data) vals[i] = toCell_(data[c[0]], c[2]);
    });
    sh.getRange(t.lastRow + 1, 1, 1, t.width).setValues([vals]);
    return;
  }

  if (!row) return; // the row was removed in the sheet; nothing to update
  sch.cols.forEach(function (c) {
    if (c[0] === 'id' || !(c[0] in data)) return;
    const i = t.cols[c[0]];
    if (i != null) sh.getRange(row, i + 1).setValue(toCell_(data[c[0]], c[2]));
  });
}

/* ------------------------------------------------------------------ */
/* Setup, menu and key                                                 */
/* ------------------------------------------------------------------ */

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu(APP_NAME)
    .addItem('Show app key and link', 'showKey')
    .addItem('Set web app link…', 'setWebAppUrl')
    .addItem('Set up / repair sheets', 'setup')
    .addSeparator()
    .addItem('Make a new app key', 'resetKey')
    .addToUi();
}

function setup() {
  const ss = SpreadsheetApp.getActive();
  const props = PropertiesService.getScriptProperties();
  props.setProperty('SHEET_ID', ss.getId());

  Object.keys(SCHEMA).forEach(function (coll) { buildTab_(ss, SCHEMA[coll]); });

  ['Sheet1', 'Sheet 1'].forEach(function (n) {
    const blank = ss.getSheetByName(n);
    if (blank && blank.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(blank);
  });

  seedExamples_(ss);

  let key = props.getProperty('APP_KEY');
  if (!key) {
    key = newKey_();
    props.setProperty('APP_KEY', key);
  }
  ss.setActiveSheet(ss.getSheetByName(SCHEMA.recipes.sheet));

  const msg = APP_NAME + ' is set up.\n\nYour app key: ' + key +
    '\n\nNext: Deploy → New deployment → Web app (Execute as: Me, Who has access: Anyone).';
  console.log(msg);
  try { SpreadsheetApp.getUi().alert(msg); } catch (e) { /* run from the editor: see the log */ }
}

/**
 * Apps Script can't reliably report its own deployment URL (getUrl() often
 * returns the editor-only /dev link), so the /exec URL is pasted in once and saved.
 */
function showKey() {
  const props = PropertiesService.getScriptProperties();
  const key = props.getProperty('APP_KEY');
  const ui = SpreadsheetApp.getUi();
  if (!key) { ui.alert('Run "Set up / repair sheets" first.'); return; }
  const url = props.getProperty('WEB_APP_URL');
  if (!url) {
    ui.alert(APP_NAME,
      'App key: ' + key +
      '\n\nYour web app link isn\'t saved yet. Choose Pantry Pal → Set web app link… and paste the ' +
      'Web app URL from Deploy → Manage deployments (it ends in /exec).',
      ui.ButtonSet.OK);
    return;
  }
  const html = HtmlService.createHtmlOutput(
    '<div style="font:14px/1.5 Arial,sans-serif">' +
    '<p style="margin:0 0 6px"><b>App key:</b> <code>' + key + '</code></p>' +
    '<p style="margin:12px 0 6px">Open this on your phone once. It remembers the key after that.</p>' +
    '<input id="u" readonly style="width:100%;padding:6px;font:13px monospace" value="' + url + '?key=' + key + '" onclick="this.select()">' +
    '<p style="margin:12px 0"><a href="' + url + '?key=' + key + '" target="_blank">Open the app ↗</a></p>' +
    '</div>').setWidth(460).setHeight(210);
  ui.showModalDialog(html, APP_NAME);
}

function setWebAppUrl() {
  const ui = SpreadsheetApp.getUi();
  const props = PropertiesService.getScriptProperties();
  const r = ui.prompt('Set web app link',
    'In Apps Script open Deploy → Manage deployments, copy the Web app URL (ends in /exec) and paste it here.',
    ui.ButtonSet.OK_CANCEL);
  if (r.getSelectedButton() !== ui.Button.OK) return;
  let url = String(r.getResponseText() || '').trim().split(/[?#]/)[0];
  if (/\/dev$/.test(url)) {
    ui.alert('That is the test link (ends in /dev), which only works for you while signed in to the editor. ' +
      'Use the Web app URL from Deploy → Manage deployments instead (ends in /exec).');
    return;
  }
  if (!/^https:\/\/script\.google\.com\/(a\/macros\/[^/]+|macros)\/s\/[\w-]+\/exec$/.test(url)) {
    ui.alert('That doesn\'t look like a web app link. It should look like:\nhttps://script.google.com/macros/s/AKfy…/exec');
    return;
  }
  props.setProperty('WEB_APP_URL', url);
  showKey();
}

function resetKey() {
  const ui = SpreadsheetApp.getUi();
  const r = ui.alert('Make a new app key?', 'Phones using the old key will ask for the new one.', ui.ButtonSet.YES_NO);
  if (r !== ui.Button.YES) return;
  PropertiesService.getScriptProperties().setProperty('APP_KEY', newKey_());
  showKey();
}

function newKey_() {
  return Utilities.getUuid().replace(/-/g, '').slice(0, 16);
}

function colLetter_(n) {
  let s = '';
  while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); }
  return s;
}

function buildTab_(ss, sch) {
  const sh = ss.getSheetByName(sch.sheet) || ss.insertSheet(sch.sheet);
  const existing = sh.getLastColumn() > 0 ? headerMap_(sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0], sch) : {};
  if (Object.keys(existing).length === 0) {
    sh.getRange(1, 1, 1, sch.cols.length).setValues([sch.cols.map(function (c) { return c[1]; })]);
  } else {
    sch.cols.forEach(function (c) {
      if (existing[c[0]] == null) sh.getRange(1, sh.getLastColumn() + 1).setValue(c[1]);
    });
  }
  if (sh.getMaxRows() < 500) sh.insertRowsAfter(sh.getMaxRows(), 500 - sh.getMaxRows());

  const width = sh.getLastColumn();
  const cols = headerMap_(sh.getRange(1, 1, 1, width).getValues()[0], sch);
  const body = sh.getMaxRows() - 1;

  sh.setFrozenRows(1);
  sh.getRange(1, 1, 1, width).setFontWeight('bold').setBackground('#E6EAE4').setFontColor('#1B2120');
  sh.getRange(2, 1, body, width).setVerticalAlignment('top');

  sch.cols.forEach(function (c) {
    const field = c[0], type = c[2], w = c[3];
    const col = cols[field] + 1;
    const rng = sh.getRange(2, col, body, 1);
    if (type === 'bool') rng.setDataValidation(SpreadsheetApp.newDataValidation().requireCheckbox().build());
    if (type === 'unit') rng.setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(UNITS, true).setAllowInvalid(true).build());
    if (type === 'section') rng.setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(SECTIONS, true).setAllowInvalid(true).build());
    if (type === 'date') rng.setNumberFormat('mmm d, yyyy');
    if (type === 'code') rng.setNumberFormat('@');
    if (field === 'ingredients' || field === 'steps') rng.setWrap(true);
    if (w) sh.setColumnWidth(col, w);
    if (field === 'id') sh.hideColumns(col);
  });

  // Highlight state so the sheet reads like the app
  const L = function (f) { return colLetter_(cols[f] + 1); };
  const rules = [];
  if (sch.sheet === SCHEMA.items.sheet) {
    rules.push(SpreadsheetApp.newConditionalFormatRule()
      .whenFormulaSatisfied('=AND($' + L('name') + '2<>"",IF($' + L('staple') + '2,NOT($' + L('inStock') + '2),N($' + L('qty') + '2)<=0))')
      .setFontColor('#B03A31')
      .setRanges([sh.getRange(2, cols.name + 1, body, 1)])
      .build());
  }
  if (sch.sheet === SCHEMA.list.sheet) {
    rules.push(SpreadsheetApp.newConditionalFormatRule()
      .whenFormulaSatisfied('=$' + L('checked') + '2=TRUE')
      .setFontColor('#8A948F').setStrikethrough(true)
      .setRanges([sh.getRange(2, 1, body, width)])
      .build());
  }
  sh.setConditionalFormatRules(rules);
  return sh;
}

function seedExamples_(ss) {
  const items = ss.getSheetByName(SCHEMA.items.sheet);
  const recipes = ss.getSheetByName(SCHEMA.recipes.sheet);
  if (items.getLastRow() >= 2 || recipes.getLastRow() >= 2) return; // never seed over real data

  const pantry = [
    ['Eggs', 6, 'pcs', 'Dairy & eggs'],
    ['Milk', 1, 'L', 'Dairy & eggs'],
    ['Butter', 200, 'g', 'Dairy & eggs'],
    ['All-purpose flour', 1, 'kg', 'Pantry'],
    ['Rice', 2, 'kg', 'Pantry'],
    ['Spaghetti', 500, 'g', 'Pantry'],
    ['Chicken thighs', 500, 'g', 'Meat & fish'],
    ['Onions', 3, 'pcs', 'Produce'],
    ['Garlic', 8, 'clove', 'Produce'],
    ['Green onions', 1, 'bunch', 'Produce'],
    ['Tomatoes', 0, 'pcs', 'Produce'],
  ];
  const staples = [
    ['Soy sauce', true, 'Pantry'],
    ['Olive oil', true, 'Pantry'],
    ['Vegetable oil', true, 'Pantry'],
    ['Sugar', true, 'Pantry'],
    ['Salt', true, 'Spices'],
    ['Baking powder', false, 'Pantry'],
  ];
  pantry.forEach(function (p) {
    applyOp_({ op: 'add', coll: 'items', id: newId_(), data: { name: p[0], qty: p[1], unit: p[2], category: p[3], staple: false, inStock: true, example: true } });
  });
  staples.forEach(function (s) {
    applyOp_({ op: 'add', coll: 'items', id: newId_(), data: { name: s[0], qty: '', unit: '', category: s[2], staple: true, inStock: s[1], example: true } });
  });

  const recs = [
    ['Egg fried rice', 2,
      '300 g rice, cooked and cooled\n3 eggs\n1 bunch green onions\n2 tbsp soy sauce\n2 cloves garlic, minced\n1 tbsp vegetable oil',
      'Heat the oil in a wok over high heat.\nScramble the eggs and set aside.\nFry the garlic and the white parts of the green onions for 30 seconds.\nAdd the rice and stir-fry until hot.\nAdd the soy sauce, eggs and green onion tops. Toss and serve.'],
    ['Garlic butter chicken', 3,
      '600 g chicken thighs\n30 g butter\n4 cloves garlic\nsalt',
      'Season the chicken with salt.\nSear skin side down until golden, about 7 minutes, then flip.\nAdd the butter and garlic and baste until cooked through.'],
    ['Spaghetti pomodoro', 4,
      '400 g spaghetti\n4 tomatoes, diced\n3 cloves garlic\n2 tbsp olive oil\n50 g parmesan\n1 bunch basil\nsalt',
      'Boil the spaghetti in salted water.\nCook the garlic in olive oil, add the tomatoes and simmer 10 minutes.\nToss with the pasta, basil and parmesan.'],
    ['Pancakes', 4,
      '190 g all-purpose flour\n300 ml milk\n2 eggs\n2 tbsp sugar\n30 g butter, melted\n2 tsp baking powder',
      'Whisk the dry ingredients.\nWhisk in the milk, eggs and melted butter.\nCook on a buttered pan over medium heat until bubbles form, then flip.'],
  ];
  recs.forEach(function (r) {
    applyOp_({ op: 'add', coll: 'recipes', id: newId_(), data: { name: r[0], servings: r[1], ingredients: r[2], steps: r[3], example: true } });
  });
}
