// Hosts the PCF test harness (pcf-start) without opening a browser.
// Same wiring as pcf-start's bin, with open:false and a fixed port.
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const controlDir = path.resolve(here, '..', 'SealedInput');
const require = createRequire(path.join(controlDir, 'package.json'));
const bs = require('browser-sync').create();
const harnessDir = path.dirname(require.resolve('pcf-start/package.json'));
const port = Number(process.env.HARNESS_PORT ?? 8183);

// The harness names every property "<name>'s Display Name", and the control
// labels its fields after the bound column's display name, so every harness
// screenshot would read "value's Display Name". The harness bundle is served
// with that one template swapped for SIN; nothing else in it changes.
const DISPLAY_NAME = "`${e}'s Display Name`";
const harnessJs = fs.readFileSync(path.join(harnessDir, 'harness.js'), 'utf8');
if (harnessJs.split(DISPLAY_NAME).length !== 2) throw new Error('pcf-start harness.js: display-name template not found once');
const patchedHarnessJs = harnessJs.replace(DISPLAY_NAME, '"SIN"');

bs.init({
  online: false,
  open: false,
  notify: false,
  port,
  server: {
    baseDir: path.join(controlDir, 'out', 'controls', 'SealedInput'),
    routes: { '/': harnessDir },
  },
  middleware: [(req, res, next) => {
    if (req.url.split('?')[0] !== '/harness.js') return next();
    res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
    res.end(patchedHarnessJs);
  }],
  ui: false,
  watch: false,
  logLevel: 'silent',
}, (err) => {
  if (err) { console.error(err); process.exit(1); }
  console.log(`harness at http://localhost:${port}/`);
});
