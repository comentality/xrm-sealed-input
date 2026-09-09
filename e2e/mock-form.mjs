// A model-driven form mock-up with the real control in it.
//
// The pcf-start harness renders the built control; this script starts that
// harness, then rebuilds the page around the live control so it sits in a
// Contact form laid out like Unified Interface: command bar, record header,
// tab strip, a two-column section. The control is the genuine bundle, driven
// with real keystrokes. Everything around it is static HTML.
//
// Output: shots/form-mock-*.png. Not a screenshot of Dataverse.
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const shots = path.join(here, 'shots');
fs.mkdirSync(shots, { recursive: true });
const port = Number(process.env.HARNESS_PORT ?? 8184);

const server = spawn(process.execPath, ['harness-server.mjs'], { cwd: here, env: { ...process.env, HARNESS_PORT: String(port) }, stdio: 'ignore' });
const portOpen = () => new Promise((r) => { const s = net.connect(port, '127.0.0.1'); s.once('connect', () => { s.end(); r(true); }); s.once('error', () => r(false)); });
for (let i = 0; i < 60 && !(await portOpen()); i++) await new Promise((r) => setTimeout(r, 250));

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1180, height: 720 }, deviceScaleFactor: 2 });
  await page.goto(`http://localhost:${port}/`, { waitUntil: 'load' });
  await page.locator('.control-container [data-testid^="sealed-"]').first().waitFor();

  const row = (name) => page.locator('.property-inputs .io-item').filter({ has: page.locator('.key-value-pair-value span', { hasText: new RegExp(`^${name}$`) }) });
  const set = async (loc, v) => { await loc.fill(String(v)); await loc.dispatchEvent('change'); };
  const select = async (loc, v) => { await loc.selectOption(v); await loc.dispatchEvent('change'); };
  const valueInput = row('value').locator('input[type=text]');

  // Configure as a SIN field, with a long reveal so the typing shot is stable,
  // and as wide as the form cell it is about to sit in.
  await set(page.locator('.io-item, .key-value-pair').filter({ hasText: 'Component Container Width' }).locator('input').first(), 640);
  await select(row('validation').locator('select'), 'sin');
  await set(row('revealMs').locator('input'), 60000);

  // A stored value first, so a static copy of the stored view can stand in
  // for the Bank account cell; then blank it for the live SIN cell.
  await set(valueInput, '0041234567');
  await page.locator('[data-testid="sealed-stored"]').waitFor();

  // Keep a static copy of the stored view, then blank the value while the
  // harness panel is still visible and can be driven.
  await page.evaluate(() => {
    const copy = document.querySelector('.control-container [data-testid="sealed-stored"]').cloneNode(true);
    copy.removeAttribute('data-testid');
    copy.querySelectorAll('[data-testid]').forEach((n) => n.removeAttribute('data-testid'));
    window.__storedCopy = copy;
  });
  await set(valueInput, '');
  await page.locator('[data-testid="sealed-first"]').waitFor();

  await page.evaluate(() => {
    const control = document.querySelector('.control-container');
    const storedCopy = window.__storedCopy;

    const css = `
      #mock, #mock * { box-sizing: border-box; }
      #mock { font-family: "Segoe UI", "Segoe UI Web (West European)", -apple-system, sans-serif; font-size: 14px; color: #242424; background: #f5f5f5; min-height: 720px; }
      .mock-top { height: 48px; background: #0f2a4a; color: #fff; display: flex; align-items: center; padding: 0 16px; gap: 24px; font-size: 15px; }
      .mock-top .app { font-weight: 600; }
      .mock-top .crumb { opacity: .85; }
      .mock-top .right { margin-left: auto; display: flex; gap: 18px; opacity: .9; }
      .mock-cmd { height: 44px; background: #fff; border-bottom: 1px solid #e0e0e0; display: flex; align-items: center; padding: 0 12px; gap: 6px; }
      .mock-cmd span { padding: 6px 10px; border-radius: 4px; color: #242424; }
      .mock-cmd span::before { content: attr(data-icon); font-family: "Segoe UI Symbol", "Segoe UI Emoji"; margin-right: 6px; color: #0f6cbd; }
      .mock-cmd .sep { width: 1px; height: 24px; background: #e0e0e0; padding: 0; margin: 0 6px; }
      .mock-header { background: #fff; padding: 14px 24px 0; }
      .mock-header .title { font-size: 24px; font-weight: 600; line-height: 32px; display: flex; align-items: center; gap: 10px; }
      .mock-header .title .chev { font-size: 13px; color: #616161; }
      .mock-header .sub { color: #616161; font-size: 13px; margin-top: 2px; }
      .mock-header .hdrfields { display: flex; gap: 40px; margin: 10px 0 0; }
      .mock-header .hdrfields div { font-size: 13px; }
      .mock-header .hdrfields b { display: block; font-weight: 600; color: #242424; }
      .mock-header .hdrfields span { color: #616161; }
      .mock-tabs { background: #fff; padding: 8px 24px 0; display: flex; gap: 24px; border-bottom: 1px solid #e0e0e0; }
      .mock-tabs span { padding: 8px 0 10px; color: #616161; }
      .mock-tabs span.on { color: #242424; font-weight: 600; border-bottom: 2px solid #0f6cbd; }
      .mock-body { padding: 16px 24px; }
      .mock-section { background: #fff; border: 1px solid #e0e0e0; border-radius: 4px; padding: 12px 20px 16px; }
      .mock-section h2 { font-size: 16px; font-weight: 600; margin: 0 0 8px; }
      .mock-cols { display: grid; grid-template-columns: 1fr 1fr; column-gap: 40px; }
      .mock-field { display: grid; grid-template-columns: 150px 1fr; align-items: start; min-height: 40px; border-bottom: 1px solid #ededed; padding: 8px 0; }
      .mock-field label { color: #616161; padding-top: 6px; }
      .mock-field label.req::after { content: " *"; color: #a4262c; }
      .mock-field .val { padding: 6px 8px; color: #242424; min-height: 32px; }
      .mock-field .val.lock::before { content: "🔒 "; font-size: 12px; color: #616161; }
      .mock-field .live { padding: 2px 0; }
      .mock-field .live .control-container { width: 100%; border: none !important; padding: 0 !important; margin: 0 !important; box-shadow: none !important; }
      html, body { width: 100%; margin: 0; display: block !important; }
      #mock { width: 100vw; }
      .mock-note { margin-top: 10px; color: #616161; font-size: 12px; }
    `;
    const style = document.createElement('style');
    style.textContent = css;
    document.head.appendChild(style);

    const mock = document.createElement('div');
    mock.id = 'mock';
    mock.innerHTML = `
      <div class="mock-top"><span class="app">Power Apps</span><span class="crumb">Comentality Payees</span><span class="right"><span>🔍</span><span>＋</span><span>⚙</span><span>KK</span></span></div>
      <div class="mock-cmd"><span data-icon="💾">Save</span><span data-icon="💾">Save &amp; Close</span><span data-icon="＋">New</span><span class="sep"></span><span data-icon="⏻">Deactivate</span><span data-icon="👤">Assign</span><span data-icon="🗑">Delete</span><span data-icon="↻">Refresh</span><span data-icon="✓">Check Access</span></div>
      <div class="mock-header">
        <div class="title">Jane Doe <span class="chev">▾</span></div>
        <div class="sub">Contact · Payee</div>
        <div class="hdrfields"><div><b>Kosta Koniev</b><span>Owner</span></div><div><b>Active</b><span>Status</span></div><div><b>Toronto</b><span>City</span></div></div>
      </div>
      <div class="mock-tabs"><span>Summary</span><span>Details</span><span class="on">Payment details</span><span>Related</span></div>
      <div class="mock-body"><div class="mock-section">
        <h2>Payment details</h2>
        <div class="mock-cols">
          <div>
            <div class="mock-field"><label class="req">First Name</label><div class="val">Jane</div></div>
            <div class="mock-field"><label class="req">Last Name</label><div class="val">Doe</div></div>
            <div class="mock-field"><label>Email</label><div class="val">jane.doe@example.com</div></div>
            <div class="mock-field"><label>Payment method</label><div class="val">Direct deposit</div></div>
            <div class="mock-field"><label>Institution</label><div class="val">004</div></div>
            <div class="mock-field"><label>Transit</label><div class="val">12345</div></div>
          </div>
          <div>
            <div class="mock-field"><label class="req">SIN</label><div class="live" id="sin-cell"></div></div>
            <div class="mock-field"><label class="req">Bank account</label><div class="live" id="bank-cell"></div></div>
            <div class="mock-field"><label>Payee since</label><div class="val">2026-09-01</div></div>
            <div class="mock-field"><label>Payments on hold</label><div class="val lock">No</div></div>
          </div>
        </div>
      </div></div>`;

    for (const child of Array.from(document.body.children)) child.style.display = 'none';
    document.body.appendChild(mock);
    document.body.style.margin = '0';
    document.getElementById('sin-cell').appendChild(control);
    document.getElementById('bank-cell').appendChild(storedCopy);
  });

  const first = page.locator('[data-testid="sealed-first"]');
  await first.waitFor();

  const shot = async (name) => {
    await page.waitForTimeout(200);
    await page.screenshot({ path: path.join(shots, `form-mock-${name}.png`) });
    await page.locator('.mock-section').screenshot({ path: path.join(shots, `form-mock-${name}-section.png`) });
    console.log(`shots/form-mock-${name}.png`);
  };

  await shot('empty');
  await first.click();
  await page.keyboard.type('04645428');
  await shot('typing');
  await page.keyboard.type('6');
  await page.keyboard.press('Enter');
  await page.keyboard.type('046454286');
  await page.locator('[data-testid="sealed-stored"]').waitFor();
  await shot('stored');
} finally {
  await browser.close();
  server.kill();
}
