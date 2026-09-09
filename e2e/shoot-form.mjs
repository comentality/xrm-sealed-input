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
  const stored = page.locator('[data-testid="sealed-stored"]');
  const errorDlg = page.locator('[data-id="errorDialog_subtitle"], [data-id="dialogSubtitle"], [data-id="errorDialogTitle"]');
  out.attempts = [];
  let n = 0;
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

  // Type the SIN once, screenshot straight away so the last digit is still readable.
  await first.first().click();
  await page.keyboard.type(GOOD_SIN.slice(0, 8));
  out.typing = await snap('typing');
  await page.keyboard.type(GOOD_SIN.slice(8));
  await page.keyboard.press('Enter');
  await page.keyboard.type(GOOD_SIN);
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
  const rec = await webApi(page, 'GET', `contacts(${setup.contactId})?$select=${setup.sin},${setup.bank}`);
  out.saved = { sin: rec.data[setup.sin], bank: rec.data[setup.bank], sinMatches: rec.data[setup.sin] === GOOD_SIN };
  return out;
}

if (process.argv[1] && /shoot-form\.mjs$/.test(process.argv[1])) {
  const setup = JSON.parse(process.argv[2] ?? process.env.SETUP_JSON ?? '{}');
  if (!setup.formId || !setup.contactId) throw new Error('need formId and contactId from setup-form.mjs');
  const { ctx, page } = await openOrg({ headless: true });
  try { console.log(JSON.stringify(await shootForm(page, setup), null, 2)); } finally { await ctx.close(); }
}
