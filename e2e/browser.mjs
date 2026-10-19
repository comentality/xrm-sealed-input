// Shared: open the persistent profile and expose a same-origin Web API caller
// that runs inside the page (cookies do the auth).
import { chromium } from 'playwright';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

// The environment: ORG_URL when set, otherwise the one the active pac auth
// profile points at (the one `pac pcf push` deploys to).
export const orgUrl = (process.env.ORG_URL || pacOrgUrl()).replace(/\/$/, '');

function pacOrgUrl() {
  let out;
  try {
    out = execSync('pac org who --json', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  } catch {
    throw new Error('No environment: set ORG_URL, or select one with pac auth create / pac auth select');
  }
  const json = out.split(/\r?\n/).find((l) => l.trim().startsWith('{'));
  const url = json && JSON.parse(json).OrgUrl;
  if (!url) throw new Error(`pac org who gave no OrgUrl; set ORG_URL instead. It said: ${out.trim()}`);
  return url;
}

const here = path.dirname(fileURLToPath(import.meta.url));
export const profileDir = path.join(here, '.auth', 'chromium');
export const shotsDir = path.join(here, 'shots');

const SHELL = '[data-id="navbar-container"], #shell-container, [data-id="topBar"], [data-id="mainContent"]';

/**
 * Opens the org in the persistent profile. With waitForLogin, keeps polling
 * (headed) until the user has signed in, up to timeoutMs. Without it, throws
 * when the profile is not signed in.
 */
export async function openOrg({ headless = true, waitForLogin = false, timeoutMs = 15 * 60 * 1000 } = {}) {
  const ctx = await chromium.launchPersistentContext(profileDir, {
    headless: headless && !waitForLogin,
    viewport: { width: 1400, height: 900 },
    args: ['--disable-blink-features=AutomationControlled'],
  });
  const page = ctx.pages()[0] ?? (await ctx.newPage());
  await page.goto(`${orgUrl}/main.aspx`, { waitUntil: 'domcontentloaded' });

  const started = Date.now();
  const limit = waitForLogin ? timeoutMs : 20000;
  if (waitForLogin) console.log(`Sign in in the browser window (up to ${Math.round(timeoutMs / 60000)} min)...`);
  for (;;) {
    const onOrg = page.url().startsWith(orgUrl);
    const shell = onOrg && (await page.locator(SHELL).count()) > 0;
    if (shell) break;
    if (Date.now() - started > limit) {
      await ctx.close();
      throw new Error(`Not signed in (landed on ${page.url()}). Run: node run.mjs`);
    }
    await page.waitForTimeout(2000);
  }
  return { ctx, page };
}

/** Web API call executed in the page. Returns { data, entityId }. Throws on non-2xx. */
export async function webApi(page, method, url, body, extraHeaders = {}) {
  return page.evaluate(
    async ({ method, url, body, extraHeaders }) => {
      const r = await fetch(`/api/data/v9.2/${url}`, {
        method,
        headers: {
          'OData-MaxVersion': '4.0',
          'OData-Version': '4.0',
          Accept: 'application/json',
          'Content-Type': 'application/json; charset=utf-8',
          ...extraHeaders,
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        credentials: 'same-origin',
      });
      const text = await r.text();
      if (!r.ok) throw new Error(`${method} ${url}: ${r.status} ${text}`);
      const id = r.headers.get('OData-EntityId');
      return { data: text ? JSON.parse(text) : null, entityId: id };
    },
    { method, url, body, extraHeaders },
  );
}
