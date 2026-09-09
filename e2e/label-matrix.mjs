// Every label combination, rendered by the real control in the harness
// inside a copy of a Unified Interface form cell, and composed into one
// sheet: shots/label-matrix.png (plus one png per cell).
//
// Auto rows: the cell label on the left, on top, or hidden, each in a wide
// cell (fields side by side) and a narrow one (stacked). Forced rows: the
// four Labels x Label position settings, wide and narrow.
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openHarness, wrapInFormCell } from './tests/harness.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const shots = path.join(here, 'shots');
fs.mkdirSync(shots, { recursive: true });
const port = Number(process.env.HARNESS_PORT ?? 8186);

const server = spawn(process.execPath, ['harness-server.mjs'], { cwd: here, env: { ...process.env, HARNESS_PORT: String(port) }, stdio: 'ignore' });
const portOpen = () => new Promise((r) => { const s = net.connect(port, '127.0.0.1'); s.once('connect', () => { s.end(); r(true); }); s.once('error', () => r(false)); });
for (let i = 0; i < 60 && !(await portOpen()); i++) await new Promise((r) => setTimeout(r, 250));

const WIDE = 720; // form cell width in px; minus the fake 120px label column the control still clears the 480 side-by-side line
const NARROW = 380;

const CELLS = [
  // Auto: what the form shows decides.
  { group: 'Auto, cell label on the left (section labels Left)', title: 'wide cell', width: WIDE, form: { label: 'left' } },
  { group: 'Auto, cell label on the left (section labels Left)', title: 'narrow cell', width: NARROW, form: { label: 'left' } },
  { group: 'Auto, cell label on top (section labels Top)', title: 'wide cell', width: WIDE, form: { label: 'top' } },
  { group: 'Auto, cell label on top (section labels Top)', title: 'narrow cell', width: NARROW, form: { label: 'top' } },
  { group: 'Auto, cell label hidden, neighbours labelled on the left', title: 'wide cell', width: WIDE, form: { label: 'hidden', sibling: 'left' } },
  { group: 'Auto, cell label hidden, neighbours labelled on the left', title: 'narrow cell', width: NARROW, form: { label: 'hidden', sibling: 'left' } },
  { group: 'Auto, cell label hidden, neighbours labelled on top', title: 'wide cell', width: WIDE, form: { label: 'hidden', sibling: 'top' } },
  { group: 'Auto, cell label hidden, neighbours labelled on top', title: 'narrow cell', width: NARROW, form: { label: 'hidden', sibling: 'top' } },
  // Forced: the two properties set by hand, shown in a cell whose label is on the left.
  { group: 'Forced: Labels = Both fields, Label position = Above', title: 'wide cell', width: WIDE, form: { label: 'left' }, props: { labels: 'both', labelPosition: 'above' } },
  { group: 'Forced: Labels = Both fields, Label position = Above', title: 'narrow cell', width: NARROW, form: { label: 'left' }, props: { labels: 'both', labelPosition: 'above' } },
  { group: 'Forced: Labels = Both fields, Label position = Beside', title: 'wide cell', width: WIDE, form: { label: 'left' }, props: { labels: 'both', labelPosition: 'inline' } },
  { group: 'Forced: Labels = Both fields, Label position = Beside', title: 'narrow cell', width: NARROW, form: { label: 'left' }, props: { labels: 'both', labelPosition: 'inline' } },
  { group: 'Forced: Labels = Re-enter only, Label position = Above', title: 'wide cell', width: WIDE, form: { label: 'left' }, props: { labels: 'reenterOnly', labelPosition: 'above' } },
  { group: 'Forced: Labels = Re-enter only, Label position = Above', title: 'narrow cell', width: NARROW, form: { label: 'left' }, props: { labels: 'reenterOnly', labelPosition: 'above' } },
  { group: 'Forced: Labels = Re-enter only, Label position = Beside', title: 'wide cell', width: WIDE, form: { label: 'left' }, props: { labels: 'reenterOnly', labelPosition: 'inline' } },
  { group: 'Forced: Labels = Re-enter only, Label position = Beside', title: 'narrow cell', width: NARROW, form: { label: 'left' }, props: { labels: 'reenterOnly', labelPosition: 'inline' } },
];

const browser = await chromium.launch();
try {
  const ctx = await browser.newContext({ baseURL: `http://localhost:${port}`, viewport: { width: 1000, height: 700 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  const files = [];
  for (const [i, cell] of CELLS.entries()) {
    // The fake cell adds a 120px label column on the left; the control gets `width` minus that.
    const controlWidth = cell.form.label === 'top' ? cell.width : cell.width - 128;
    const c = await openHarness(page, { width: controlWidth, ...(cell.props ?? {}) });
    // openHarness sizes the viewport to the control; the fake cell needs room beside the property pane.
    await page.setViewportSize({ width: 1400, height: 800 });
    await wrapInFormCell(page, cell.form);
    // The harness clamps the container to the pane it had at the time; size the cell and the container by hand.
    await page.evaluate(({ w, cw }) => {
      document.querySelector('[data-testid="fake-section"]').style.width = `${w}px`;
      document.querySelector('.control-container').style.width = `${cw}px`;
    }, { w: cell.width, cw: controlWidth });
    await page.waitForTimeout(300);
    const f = path.join(shots, `label-matrix-${String(i + 1).padStart(2, '0')}.png`);
    await page.locator('[data-testid="fake-section"]').screenshot({ path: f });
    files.push({ ...cell, file: f, attrs: await c.entry.evaluate((el) => ({ labels: el.dataset.labels, pos: el.dataset.labelPosition, form: el.dataset.formLabel, layout: el.dataset.layout })) });
    console.log(`${cell.group} / ${cell.title}: ${JSON.stringify(files[files.length - 1].attrs)}`);
  }

  // Compose the sheet.
  const groups = [...new Set(files.map((f) => f.group))];
  const html = `<!doctype html><meta charset="utf-8"><style>
    body { margin: 0; padding: 20px; background: #f5f5f5; font-family: "Segoe UI", sans-serif; color: #242424; width: 1560px; box-sizing: border-box; }
    h1 { font-size: 18px; margin: 0 0 12px; }
    .g { background: #fff; border: 1px solid #e0e0e0; border-radius: 6px; padding: 12px 16px; margin-bottom: 16px; }
    .g h2 { font-size: 14px; margin: 0 0 8px; }
    .row { display: flex; gap: 24px; align-items: flex-start; }
    figure { margin: 0; }
    figcaption { font-size: 12px; color: #616161; margin-bottom: 4px; }
    img { display: block; border: 1px solid #ededed; }
  </style>
  <h1>Sealed Input: every label combination (real control, harness, inside a copy of a form cell)</h1>
  ${groups.map((g) => `<div class="g"><h2>${g}</h2><div class="row">${files.filter((f) => f.group === g).map((f) => {
    const b64 = fs.readFileSync(f.file).toString('base64');
    return `<figure><figcaption>${f.title}, ${f.width}px: labels ${f.attrs.labels}, ${f.attrs.pos}, form label ${f.attrs.form}, ${f.attrs.layout}</figcaption><img src="data:image/png;base64,${b64}" style="width:${f.width}px"></figure>`;
  }).join('')}</div></div>`).join('')}`;
  const sheet = path.join(shots, 'label-matrix.html');
  fs.writeFileSync(sheet, html);
  const p2 = await ctx.newPage();
  await p2.setViewportSize({ width: 1560, height: 900 });
  await p2.goto(`file:///${sheet.replace(/\\/g, '/')}`, { waitUntil: 'load' });
  await p2.screenshot({ path: path.join(shots, 'label-matrix.png'), fullPage: true });
  console.log(path.join(shots, 'label-matrix.png'));
} finally {
  await browser.close();
  server.kill();
}
