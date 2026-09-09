// Copies the screenshots the manual embeds from shots/ into docs/img/.
// Run after `npx playwright test`.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const from = path.join(here, 'shots');
const to = path.join(here, '..', 'docs', 'img');
fs.mkdirSync(to, { recursive: true });
const keep = ['entry-empty', 'entry-typing', 'entry-masked', 'entry-mismatch', 'entry-sin-invalid', 'entry-replacing', 'stored', 'stored-saved'];
for (const name of keep) {
  fs.copyFileSync(path.join(from, `${name}.png`), path.join(to, `${name}.png`));
  console.log(`docs/img/${name}.png`);
}
