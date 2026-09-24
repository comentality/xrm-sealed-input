// Copies the screenshots the manual embeds from shots/ into docs/img/.
// Run after `npx playwright test`, `node mock-form.mjs` and, when available, `node run.mjs`.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const from = path.join(here, 'shots');
const to = path.join(here, '..', 'docs', 'img');
fs.mkdirSync(to, { recursive: true });
const keep = ['entry-empty', 'entry-typing', 'entry-masked', 'entry-mismatch', 'entry-incomplete', 'entry-sin-invalid', 'entry-replacing', 'stored', 'stored-saved',
  'form-mock-typing', 'form-mock-empty-section', 'form-mock-typing-section', 'form-mock-stored-section',
  'layout-narrow', 'layout-wide', 'layout-wide-mismatch',
  // Label-position mock-ups from mock-labels.mjs.
  'label-mock-left-wide', 'label-mock-left-narrow', 'label-mock-top-narrow', 'label-mock-hidden',
  'label-mock-left-wide-phone', 'label-mock-left-narrow-phone', 'label-mock-top-narrow-phone', 'label-mock-hidden-phone',
  // Harness shots of the control inside a copy of a form cell (labels tests).
  'labels-form-left', 'labels-form-top', 'labels-form-top-wide', 'labels-form-hidden', 'labels-form-hidden-narrow',
  'labels-form-two-columns', 'labels-form-two-columns-hidden'];
// Real-form shots from run.mjs, renamed for the manual.
const renamed = { 'form-full-1': 'form-real-empty', 'form-typing-page': 'form-real-typing', 'form-stored-page': 'form-real-stored', 'form-two-column': 'form-real-two-columns' };
for (const name of keep) {
  fs.copyFileSync(path.join(from, `${name}.png`), path.join(to, `${name}.png`));
  console.log(`docs/img/${name}.png`);
}
for (const [src, dst] of Object.entries(renamed)) {
  const f = path.join(from, `${src}.png`);
  if (!fs.existsSync(f)) continue;
  fs.copyFileSync(f, path.join(to, `${dst}.png`));
  console.log(`docs/img/${dst}.png`);
}
