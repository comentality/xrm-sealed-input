// Label-position mock-ups: where the control's own labels should go once the
// form has drawn the cell label itself.
//
// Static HTML, not the live control: one harness instance cannot render six
// variants at once, and placeholders cannot be injected from outside. The
// inputs are drawn to match the real form shots (Fluent filled-darker, 32px,
// grey fill) and the cell geometry copies the e2e form: a Left-labelled wide
// section (label 184px, cell ~555px, side by side), a Left-labelled narrow
// cell (stacked), a Top-labelled narrow section, and a cell with its label
// hidden. Each mini form has a stock First Name row above the control so a
// vertical misalignment shows.
//
// Output: shots/label-mock.html, shots/label-mock.png (whole page) and one
// crop per context, shots/label-mock-<context>.png.
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const shots = path.join(here, 'shots');
fs.mkdirSync(shots, { recursive: true });

const DOTS = '••••••••';
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');

// One Fluent-looking input. `text` is what it shows; `ph` a placeholder.
const input = ({ text = '', ph = '', focus = false } = {}) =>
  `<div class="in${focus ? ' focus' : ''}">${text ? esc(text) : ph ? `<span class="ph">${esc(ph)}</span>` : ''}</div>`;

/**
 * The control's own rendering for one option.
 *   name: column label the form shows ("SIN"), also the base of "Re-enter SIN"
 *   side: side by side (true) or stacked (false)
 *   stored: stored state (dots in both fields, stored hint) or empty
 *   formLabelShown: whether the form drew the cell label (drives "auto")
 */
const OPTIONS = {
  now: {
    title: 'Now: label above each field',
    render: ({ name, side, stored }) =>
      fields(side, [
        { label: name, input: input({ text: stored ? DOTS : '' }) },
        { label: `Re-enter ${name}`, input: input({ text: stored ? DOTS : '' }) },
      ], stored),
  },
  reenter: {
    title: 'Re-enter only: no first label, "Re-enter" above the second',
    render: ({ name, side, stored }) =>
      fields(side, [
        { label: '', input: input({ text: stored ? DOTS : '' }) },
        { label: `Re-enter ${name}`, input: input({ text: stored ? DOTS : '' }) },
      ], stored),
  },
  inline: {
    title: 'Inline: "Re-enter" beside the second field',
    render: ({ name, side, stored }) =>
      fields(side, [
        { label: '', input: input({ text: stored ? DOTS : '' }) },
        { label: '', inline: 'Re-enter', input: input({ text: stored ? DOTS : '' }) },
      ], stored),
  },
  captions: {
    title: 'Captions below: "Enter" / "Re-enter" under each field',
    render: ({ name, side, stored }) =>
      fields(side, [
        { label: '', caption: 'Enter', input: input({ text: stored ? DOTS : '' }) },
        { label: '', caption: 'Re-enter', input: input({ text: stored ? DOTS : '' }) },
      ], stored),
  },
  placeholders: {
    title: 'Placeholders: "Enter SIN" / "Re-enter SIN", no labels',
    render: ({ name, side, stored }) =>
      fields(side, [
        { label: '', input: input({ text: stored ? DOTS : '', ph: `Enter ${name}` }) },
        { label: '', input: input({ text: stored ? DOTS : '', ph: `Re-enter ${name}` }) },
      ], stored),
  },
};

function fields(side, items, stored) {
  const hasLabels = items.some((i) => i.label);
  const cells = items
    .map((i) => {
      const label = i.label ? `<div class="lbl">${esc(i.label)}</div>` : hasLabels && side ? `<div class="lbl">&nbsp;</div>` : '';
      const inline = i.inline ? `<span class="inl">${esc(i.inline)}</span>` : '';
      const caption = i.caption ? `<div class="cap">${esc(i.caption)}</div>` : '';
      return `<div class="fld">${label}<div class="inrow">${inline}${i.input}</div>${caption}</div>`;
    })
    .join('');
  const hint = stored ? 'Stored. Type to replace, Backspace to clear.' : 'Type it twice. Pasting is off.';
  return `<div class="ctl ${side ? 'side' : 'stack'}">${cells}</div><div class="hint">${hint}</div>`;
}

// A form cell as Unified Interface draws it: label Left, Top, or hidden.
function cell({ label, position, body }) {
  if (position === 'hidden') return `<div class="row nolabel"><div class="val">${body}</div></div>`;
  if (position === 'top') return `<div class="row top"><div class="flabel">${esc(label)}</div><div class="val">${body}</div></div>`;
  return `<div class="row left"><div class="flabel">${esc(label)}</div><div class="val">${body}</div></div>`;
}

const stockRow = (label, value, position) =>
  cell({ label, position, body: input({ text: value }) });

// A mini form: First Name, the SIN cell (empty), the Bank account cell (stored).
function miniForm({ option, position, width, side }) {
  const opt = OPTIONS[option];
  const sin = opt.render({ name: 'SIN', side, stored: false });
  const bank = opt.render({ name: 'Bank account', side, stored: true });
  return `
    <div class="mini" style="width:${width}px">
      <div class="opt">${esc(opt.title)}</div>
      <div class="sec">
        ${stockRow('First Name', 'Jane', position === 'hidden' ? 'left' : position)}
        ${cell({ label: 'SIN', position, body: sin })}
        ${cell({ label: 'Bank account', position, body: bank })}
        ${stockRow('Payee since', '2026-09-01', position === 'hidden' ? 'left' : position)}
      </div>
    </div>`;
}

const CONTEXTS = [
  {
    id: 'left-wide',
    title: 'Section label position Left, wide cell (side by side). The wide column of the e2e form.',
    note: 'The form label "SIN" sits left of the control. "Now" says SIN twice and drops the inputs a line below First Name.',
    position: 'left', width: 740, side: true,
    options: ['now', 'reenter', 'inline', 'captions', 'placeholders'],
  },
  {
    id: 'left-narrow',
    title: 'Section label position Left, narrow cell (stacked). A three-column section, or a phone.',
    note: 'Same form label, but the two fields stack.',
    position: 'left', width: 440, side: false,
    options: ['now', 'reenter', 'captions', 'placeholders'],
  },
  {
    id: 'top-narrow',
    title: 'Section label position Top, narrow cell (stacked). The narrow column of the e2e form.',
    note: 'The form label is directly above the control, so "Now" reads SIN, SIN, field.',
    position: 'top', width: 365, side: false,
    options: ['now', 'reenter', 'captions', 'placeholders'],
  },
  {
    id: 'hidden',
    title: 'Cell label hidden (showlabel=false), wide cell.',
    note: 'Nothing else names the column, so the control must label its first field. "Now" is right here; the others lose the name.',
    position: 'hidden', width: 560, side: true,
    options: ['now', 'placeholders'],
  },
];

const css = `
  * { box-sizing: border-box; }
  body { margin: 0; padding: 24px; background: #f5f5f5; font-family: "Segoe UI", "Segoe UI Web (West European)", -apple-system, sans-serif; font-size: 14px; color: #242424; }
  h1 { font-size: 18px; margin: 0 0 4px; }
  .lead { color: #616161; margin: 0 0 20px; font-size: 13px; }
  .ctx { background: #fff; border: 1px solid #e0e0e0; border-radius: 6px; padding: 16px 20px; margin-bottom: 24px; }
  .ctx h2 { font-size: 15px; margin: 0 0 2px; }
  .ctx .note { color: #616161; font-size: 13px; margin: 0 0 14px; }
  .grid { display: flex; flex-wrap: wrap; gap: 20px 32px; align-items: flex-start; }
  .mini { }
  .opt { font-size: 12px; font-weight: 600; color: #0f6cbd; margin-bottom: 6px; }
  .sec { border: 1px solid #ededed; border-radius: 4px; padding: 6px 16px 10px; background: #fff; }
  .row { display: grid; align-items: start; padding: 8px 0; }
  .row.left { grid-template-columns: 184px 1fr; }
  .row.top { grid-template-columns: 1fr; row-gap: 6px; }
  .row.nolabel { grid-template-columns: 1fr; }
  .flabel { color: #242424; padding-top: 6px; line-height: 20px; }
  .row.top .flabel { padding-top: 0; }
  .val { min-width: 0; }
  .in { height: 32px; background: #f0f0f0; border-radius: 4px; border-bottom: 1px solid #c7c7c7; padding: 0 10px; line-height: 32px; color: #242424; letter-spacing: .5px; }
  .in.focus { border-bottom: 2px solid #0f6cbd; }
  .in .ph { color: #707070; letter-spacing: 0; }
  .ctl { display: flex; gap: 8px; }
  .ctl.side { flex-direction: row; align-items: flex-start; gap: 12px; }
  .ctl.stack { flex-direction: column; }
  .fld { flex: 1 1 0; min-width: 0; }
  .lbl { line-height: 20px; padding-bottom: 2px; color: #242424; }
  .inrow { display: flex; align-items: center; gap: 8px; }
  .inrow .in { flex: 1 1 0; }
  .inl { color: #424242; white-space: nowrap; }
  .cap { font-size: 12px; color: #616161; line-height: 16px; padding-top: 2px; }
  .hint { font-size: 12px; color: #616161; line-height: 16px; margin-top: 6px; }
`;

const html = `<!doctype html><html><head><meta charset="utf-8"><title>Sealed Input: label position mock-ups</title><style>${css}</style></head><body>
  <h1>Sealed Input: where the control's own labels go</h1>
  <p class="lead">Static mock-up, 2026-09-09. Each mini form is a section with a stock First Name row, the SIN cell empty, the Bank account cell stored, and a stock row after.</p>
  ${CONTEXTS.map((c) => `
    <div class="ctx" id="${c.id}">
      <h2>${esc(c.title)}</h2>
      <p class="note">${esc(c.note)}</p>
      <div class="grid">${c.options.map((o) => miniForm({ option: o, position: c.position, width: c.width, side: c.side })).join('')}</div>
    </div>`).join('')}
</body></html>`;

const htmlPath = path.join(shots, 'label-mock.html');
fs.writeFileSync(htmlPath, html);

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1640, height: 900 }, deviceScaleFactor: 2 });
  await page.goto(`file:///${htmlPath.replace(/\\/g, '/')}`, { waitUntil: 'load' });
  await page.screenshot({ path: path.join(shots, 'label-mock.png'), fullPage: true });
  for (const c of CONTEXTS) {
    await page.locator(`#${c.id}`).screenshot({ path: path.join(shots, `label-mock-${c.id}.png`) });
  }
  // Phone pass: one option per row, page just wider than the widest mini form.
  await page.setViewportSize({ width: 830, height: 900 });
  await page.addStyleTag({ content: '.grid { flex-direction: column; } .ctx { padding: 12px 14px; } body { padding: 12px; }' });
  for (const c of CONTEXTS) {
    await page.locator(`#${c.id}`).screenshot({ path: path.join(shots, `label-mock-${c.id}-phone.png`) });
  }
  console.log(htmlPath);
  console.log(path.join(shots, 'label-mock.png'));
} finally {
  await browser.close();
}
