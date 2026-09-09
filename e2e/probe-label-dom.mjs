// Probe: what can the control see of the form's own cell label from inside
// the DOM? Opens the e2e form on the test contact (fixture ids from
// shots/form-results.json) and, for every Sealed Input instance, records the
// enclosing FieldSectionItemContainer, the label elements in it that are not
// ours, and the bounding boxes of label and control. Writes
// shots/label-dom.json. Read-only; nothing is typed or saved.
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
    const box = (el) => { const r = el.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }; };
    const trim = (html) => html.replace(/\s+/g, ' ').slice(0, 1500);
    return Array.from(document.querySelectorAll('[data-testid="sealed-entry"]')).map((root) => {
      const container = root.closest('[data-id$="FieldSectionItemContainer"], [data-id*="FieldSectionItemContainer"]');
      const labels = container
        ? Array.from(container.querySelectorAll('label, [data-id$="-field-label"], [data-id*="field-label"]')).filter((l) => !root.contains(l))
        : [];
      // Walk up a few levels and note data-id / class of each, for the record.
      const chain = [];
      let el = root.parentElement;
      for (let i = 0; el && i < 8; i++, el = el.parentElement) chain.push({ tag: el.tagName, dataId: el.getAttribute('data-id'), cls: (el.className || '').toString().slice(0, 120), box: box(el) });
      return {
        root: box(root),
        containerDataId: container?.getAttribute('data-id') ?? null,
        containerBox: container ? box(container) : null,
        labels: labels.map((l) => ({ tag: l.tagName, dataId: l.getAttribute('data-id'), text: l.textContent.trim(), box: box(l), hidden: getComputedStyle(l).display === 'none' || getComputedStyle(l).visibility === 'hidden' })),
        chain,
        containerHtml: container ? trim(container.outerHTML.replace(root.outerHTML, '<!-- control -->')) : null,
      };
    });
  });
  const out = path.join(shotsDir, 'label-dom.json');
  fs.writeFileSync(out, JSON.stringify({ url, probe }, null, 2));
  console.log(out);
  for (const p of probe) {
    const rel = p.labels.map((l) => `${JSON.stringify(l.text)} ${l.hidden ? 'hidden' : l.box.x + l.box.w <= p.root.x ? 'left' : l.box.y + l.box.h <= p.root.y ? 'above' : 'overlapping'} (${l.dataId})`);
    console.log(`${p.containerDataId}: root ${JSON.stringify(p.root)}; labels: ${rel.join('; ') || 'none'}`);
  }
} finally {
  await ctx.close();
}
