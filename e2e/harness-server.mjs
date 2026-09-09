// Hosts the PCF test harness (pcf-start) without opening a browser.
// Same wiring as pcf-start's bin, with open:false and a fixed port.
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const controlDir = path.resolve(here, '..', 'SealedInput');
const require = createRequire(path.join(controlDir, 'package.json'));
const bs = require('browser-sync').create();
const harnessDir = path.dirname(require.resolve('pcf-start/package.json'));
const port = Number(process.env.HARNESS_PORT ?? 8183);

bs.init({
  online: false,
  open: false,
  notify: false,
  port,
  server: {
    baseDir: path.join(controlDir, 'out', 'controls', 'SealedInput'),
    routes: { '/': harnessDir },
  },
  ui: false,
  watch: false,
  logLevel: 'silent',
}, (err) => {
  if (err) { console.error(err); process.exit(1); }
  console.log(`harness at http://localhost:${port}/`);
});
