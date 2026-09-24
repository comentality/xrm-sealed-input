// End to end against the test env: build the fixture form (when
// setup-form.mjs exists) or take its ids from SETUP_JSON, screenshot it, type
// a SIN twice, save, read back, then measure the two-column section against
// its stock cells (check-two-column.mjs). Uses the signed-in profile in .auth.
// Pass --login to sign in first in a headed window.
// SETUP_JSON='{"formId":"...","contactId":"...","sin":"cmtl_sin","bank":"cmtl_bankaccount"}'
// Writes shots/form-results.json, or shots/form-error.txt on failure; exits
// 1 when the two-column check fails (the results file is still written).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openOrg, shotsDir } from './browser.mjs';
import { shootForm } from './shoot-form.mjs';
import { checkTwoColumn } from './check-two-column.mjs';

fs.mkdirSync(shotsDir, { recursive: true });
const resultFile = path.join(shotsDir, 'form-results.json');
const errorFile = path.join(shotsDir, 'form-error.txt');
for (const f of [resultFile, errorFile]) if (fs.existsSync(f)) fs.unlinkSync(f);

const waitForLogin = process.argv.includes('--login');
let ctx;
const result = {};
try {
  let page;
  ({ ctx, page } = await openOrg({ headless: !waitForLogin, waitForLogin }));
  if (process.env.SETUP_JSON) {
    result.setup = JSON.parse(process.env.SETUP_JSON);
  } else if (fs.existsSync(path.join(path.dirname(fileURLToPath(import.meta.url)), 'setup-form.mjs'))) {
    const { setupForm } = await import('./setup-form.mjs');
    result.setup = await setupForm(page);
  } else {
    throw new Error('No setup-form.mjs and no SETUP_JSON; build the fixture form and pass its ids');
  }
  console.log('setup', JSON.stringify(result.setup));
  result.form = await shootForm(page, result.setup);
  console.log('form', JSON.stringify(result.form, null, 2));
  result.twoColumn = await checkTwoColumn(page, result.setup);
  console.log('twoColumn', JSON.stringify(result.twoColumn, null, 2));
  fs.writeFileSync(resultFile, JSON.stringify(result, null, 2));
  if (!result.twoColumn.ok) process.exitCode = 1;
} catch (e) {
  fs.writeFileSync(errorFile, String(e?.stack ?? e) + '\n' + JSON.stringify(result, null, 2));
  console.error(e);
  process.exitCode = 1;
} finally {
  if (ctx) await ctx.close().catch(() => {});
}
