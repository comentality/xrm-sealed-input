// Opens the e2e form on the test contact, screenshots the form with SIN empty
// and the bank account stored, types a SIN twice, screenshots the stored
// state, saves the record and checks through the Web API that the column
// received exactly what was typed.
import fs from 'node:fs';
import path from 'node:path';
import { openOrg, webApi, orgUrl, shotsDir } from './browser.mjs';

const GOOD_SIN = '046454286';

export async function shootForm(page, setup) {
  fs.mkdirSync(shotsDir, { recursive: true });
  const out = { shots: [] };

  let appId = process.env.APP_ID;
  if (!appId) {
    const apps = await webApi(page, 'GET', `appmodules?$select=appmoduleid,uniquename&$filter=statecode eq 0`);
    const pick =
      apps.data.value.find((a) => /SealedInput/i.test(a.uniquename)) ??
      apps.data.value.find((a) => /EnvironmentSettings/i.test(a.uniquename)) ??
      apps.data.value[0];
    appId = pick.appmoduleid;
    out.app = pick.uniquename;
  }
  const record = `pagetype=entityrecord&etn=contact&id=${setup.contactId}&formid=${setup.formId}`;
  const urls = [`${orgUrl}/main.aspx?appid=${appId}&${record}`, `${orgUrl}/main.aspx?${record}`];
  const first = page.locator('[data-testid="sealed-first"]');
  const stored = page.locator('[data-testid="sealed-entry"][data-state="stored"]');
  const errorDlg = page.locator('[data-id="errorDialog_subtitle"], [data-id="dialogSubtitle"], [data-id="errorDialogTitle"]');
  out.attempts = [];
  let n = 0;
  // The app caches form metadata and control bundles client-side; a form or
  // control changed since the last visit shows up stale (or as "Error loading
  // control") until those caches go.
  const clearCaches = () => page.evaluate(async () => {
    try { localStorage.clear(); sessionStorage.clear(); } catch {}
    try {
      const dbs = await indexedDB.databases();
      await Promise.all(dbs.map((d) => new Promise((r) => { const q = indexedDB.deleteDatabase(d.name); q.onsuccess = q.onerror = q.onblocked = () => r(); })));
    } catch {}
    try { const keys = await caches.keys(); await Promise.all(keys.map((k) => caches.delete(k))); } catch {}
  });
  await clearCaches();
  for (const url of urls) {
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await Promise.race([
      first.first().waitFor({ state: 'visible', timeout: 120000 }),
      errorDlg.first().waitFor({ state: 'visible', timeout: 120000 }),
    ]).catch(() => {});
    await page.waitForTimeout(3000);
    n = await first.count();
    const attempt = { url, entryInstances: n, storedInstances: await stored.count(), finalUrl: page.url() };
    if (await errorDlg.count()) attempt.error = (await errorDlg.first().innerText()).slice(0, 500);
    out.attempts.push(attempt);
    const full = path.join(shotsDir, `form-full-${out.attempts.length}.png`);
    await page.screenshot({ path: full });
    out.shots.push(full);
    if (n > 0) break;
  }
  out.url = out.attempts[out.attempts.length - 1].url;
  if (n === 0) return out;

  const section = page.locator('section').filter({ has: first.first() }).last();
  const fieldContainer = (loc) => loc.locator('xpath=ancestor::*[@data-id][contains(@data-id, "FieldSectionItemContainer")][1]');
  const snap = async (tag) => {
    const r = { sinField: await first.first().inputValue().catch(() => null), storedViews: await stored.count() };
    const target = (await section.count()) ? section : page;
    const f = path.join(shotsDir, `form-${tag}.png`);
    await target.screenshot({ path: f });
    out.shots.push(f);
    const c = fieldContainer(first.first());
    if (await c.count()) {
      const cf = path.join(shotsDir, `form-${tag}-sin.png`);
      await c.screenshot({ path: cf });
      out.shots.push(cf);
    }
    await page.screenshot({ path: path.join(shotsDir, `form-${tag}-page.png`) });
    return r;
  };

  out.display = await snap('display');

  // An entry typed once, then focus leaves: the control flags the empty
  // second field and marks itself invalid on the form, so a save must be
  // refused. The record is made dirty first, with a marker in First Name, so
  // that the save has something to do; the form's own save() must then
  // reject and the marker must not reach the column. Screenshot the cell for
  // the form's error mark on the way. Start over lifts the mark, and the
  // marker goes in with the good SIN at the end.
  const marker = `Jane ${Date.now()}`;
  const firstName = page.locator('[data-id="firstname.fieldControl-text-box-text"]');
  await firstName.fill(marker);
  await first.first().click();
  await page.keyboard.type(GOOD_SIN);
  await first.first().blur();
  await page.locator('.fui-Field__validationMessage').first().waitFor({ timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(500);
  out.incomplete = await snap('incomplete');
  out.incomplete.error = await page.locator('.fui-Field__validationMessage').first().innerText().catch(() => null);
  out.incomplete.save = await page.evaluate(() =>
    Xrm.Page.data.save().then(
      () => 'saved',
      (e) => `refused: ${(e && (e.message ?? JSON.stringify(e))) || String(e)}`.slice(0, 300),
    ),
  );
  await page.waitForTimeout(1500);
  const held = await webApi(page, 'GET', `contacts(${setup.contactId})?$select=firstname,${setup.sin}`);
  out.incomplete.markerSaved = held.data.firstname === marker; // must be false: the save was blocked
  out.incomplete.sinNow = held.data[setup.sin] ?? null;
  await page.locator('[data-testid="sealed-startover"]').first().click();
  await page.waitForTimeout(300);
  out.incomplete.blocked = out.incomplete.save.startsWith('refused') && !out.incomplete.markerSaved;

  // Type the SIN once, screenshot straight away so the last digit is still readable.
  await first.first().click();
  await page.keyboard.type(GOOD_SIN.slice(0, 8));
  out.typing = await snap('typing');
  await page.keyboard.type(GOOD_SIN.slice(8));
  await page.keyboard.press('Enter');
  await page.keyboard.type(GOOD_SIN);
  // Written at once; this cell shows the stored dots once focus leaves it.
  await page.locator('[data-testid="sealed-second"]').first().blur();
  await stored.nth(0).waitFor({ timeout: 10000 });
  await page.waitForTimeout(500);
  out.stored = { storedViews: await stored.count(), pageHasSin: (await page.locator('body').innerText()).includes(GOOD_SIN) };
  const f = path.join(shotsDir, 'form-stored.png');
  await ((await section.count()) ? section : page).screenshot({ path: f });
  out.shots.push(f);
  await page.screenshot({ path: path.join(shotsDir, 'form-stored-page.png') });

  // Save and read back.
  await page.keyboard.press('Control+S');
  await page.waitForTimeout(4000);
  const rec = await webApi(page, 'GET', `contacts(${setup.contactId})?$select=firstname,${setup.sin},${setup.bank}`);
  out.saved = {
    sin: rec.data[setup.sin],
    bank: rec.data[setup.bank],
    sinMatches: rec.data[setup.sin] === GOOD_SIN,
    markerSaved: rec.data.firstname === marker, // the save that was refused above goes through now
  };
  return out;
}

if (process.argv[1] && /shoot-form\.mjs$/.test(process.argv[1])) {
  const setup = JSON.parse(process.argv[2] ?? process.env.SETUP_JSON ?? '{}');
  if (!setup.formId || !setup.contactId) throw new Error('need formId and contactId from setup-form.mjs');
  const { ctx, page } = await openOrg({ headless: true });
  try { console.log(JSON.stringify(await shootForm(page, setup), null, 2)); } finally { await ctx.close(); }
}
