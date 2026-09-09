// Probe: computed layout of the control's Fluent Fields on the real form, per
// instance. Read-only. Writes shots/field-styles.json and prints a summary.
import fs from 'node:fs';
import path from 'node:path';
import { openOrg, orgUrl, shotsDir } from './browser.mjs';

const results = JSON.parse(fs.readFileSync(path.join(shotsDir, 'form-results.json'), 'utf8'));
const { formId, contactId } = results.setup;
const url = results.form?.url ?? `${orgUrl}/main.aspx?pagetype=entityrecord&etn=contact&id=${contactId}&formid=${formId}`;

const { ctx, page } = await openOrg({ headless: true });
try {
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.locator('[data-testid="sealed-entry"]').first().waitFor({ state: 'visible', timeout: 120000 });
  await page.waitForTimeout(2000);
  const probe = await page.evaluate(() => {
    const geo = (el) => { const r = el.getBoundingClientRect(); return `${Math.round(r.x)},${Math.round(r.y)} ${Math.round(r.width)}x${Math.round(r.height)}`; };
    return Array.from(document.querySelectorAll('[data-testid="sealed-entry"]')).map((root) => {
      const fieldsWrap = root.firstElementChild;
      const cs = getComputedStyle(fieldsWrap);
      return {
        attrs: { labels: root.dataset.labels, pos: root.dataset.labelPosition, form: root.dataset.formLabel, layout: root.dataset.layout },
        root: geo(root),
        fieldsWrap: { geo: geo(fieldsWrap), display: cs.display, flexDirection: cs.flexDirection, className: fieldsWrap.className },
        fields: Array.from(root.querySelectorAll('.fui-Field')).map((f) => {
          const s = getComputedStyle(f);
          const input = f.querySelector('input');
          const label = f.querySelector('label');
          return {
            geo: geo(f), display: s.display, gridTemplateColumns: s.gridTemplateColumns, paddingLeft: s.paddingLeft, flex: s.flex, inlineStyle: f.getAttribute('style'),
            className: f.className,
            label: label ? { geo: geo(label), text: label.textContent, gridRow: getComputedStyle(label).gridRow, marginRight: getComputedStyle(label).marginRight } : null,
            inputWrap: input ? { geo: geo(input.parentElement), className: input.parentElement.className, gridColumn: getComputedStyle(input.parentElement).gridColumn, minWidth: getComputedStyle(input.parentElement).minWidth } : null,
            input: input ? geo(input) : null,
          };
        }),
      };
    });
  });
  const out = path.join(shotsDir, 'field-styles.json');
  fs.writeFileSync(out, JSON.stringify(probe, null, 2));
  console.log(JSON.stringify(probe, null, 1));
} finally {
  await ctx.close();
}
