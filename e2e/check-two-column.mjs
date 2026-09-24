// On the e2e form (already open, record saved), measures the two-column
// section: a Sealed Input cell spanning both columns of a section whose
// labels are on the left should lay its two inputs out like the row of two
// stock cells above it. The first input takes the First Name cell's control
// area, the "Re-enter" label starts where the Last Name cell's label starts,
// the second input takes the Last Name cell's control area; with the cell
// label hidden, the control's own "SIN" label starts where First Name's does.
// Nothing is typed or saved. Failures are collected, not thrown, so the run
// still writes its results file.
import fs from 'node:fs';
import path from 'node:path';
import { openOrg, orgUrl, shotsDir } from './browser.mjs';

const CTRL = (n) => `{5ea1ed00-aaaa-4bbb-8ccc-0000000000${n}}`;
const container = (ctrlId) => `[data-id="${ctrlId}-FieldSectionItemContainer"]`;
// Containers are keyed by control id: the stock cells 51/52 hold controls
// firstname_twocol/lastname_twocol, the spanning cells 53/55 hold 30/32.
const CELLS = {
  firstName: 'firstname_twocol',
  lastName: 'lastname_twocol',
  sin: CTRL(30),
  sinHidden: CTRL(32),
};
const TOLERANCE = 2;

// `setup` is the fixture's ids from setup-form.mjs; the page must already be
// on the form. Kept in the signature so run.mjs can pass what it passes to
// shootForm, though the check locates cells by their fixed control ids.
export async function checkTwoColumn(page, setup) { // eslint-disable-line no-unused-vars
  fs.mkdirSync(shotsDir, { recursive: true });
  const failures = [];
  const shots = [];
  const out = { ok: false, failures, cells: {}, shots };

  const sinContainer = page.locator(container(CELLS.sin));
  await sinContainer.first().waitFor({ state: 'attached', timeout: 30000 }).catch(() => {});
  if ((await sinContainer.count()) === 0) {
    failures.push(`two-column section not on the form: no ${container(CELLS.sin)}`);
    return out;
  }
  // Let the control's own layout measurement settle (it reads the section's
  // stock cells in a layout effect and a ResizeObserver).
  await page.waitForTimeout(1500);

  let measured;
  try {
    measured = await page.evaluate((cells) => {
      const r1 = (v) => Math.round(v * 10) / 10;
      const box = (el) => {
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { left: r1(r.left), top: r1(r.top), width: r1(r.width), height: r1(r.height), right: r1(r.right) };
      };
      const find = (id) => document.querySelector(`[data-id="${id}-FieldSectionItemContainer"]`);
      const stock = (id) => {
        const c = find(id);
        if (!c) return { found: false };
        const label = c.querySelector('label[id$="-field-label"]');
        const area = label?.parentElement?.nextElementSibling ?? null;
        return {
          found: true,
          container: box(c),
          labelText: label?.textContent?.trim() ?? null,
          label: box(label),
          area: box(area),
        };
      };
      const sealed = (id) => {
        const c = find(id);
        if (!c) return { found: false };
        const root = c.querySelector('[data-testid="sealed-entry"]');
        if (!root) return { found: true, rootFound: false, container: box(c) };
        const inputBox = (testid) => {
          const input = root.querySelector(`[data-testid="${testid}"]`);
          // Fluent's Input draws its border on the wrapper span around the
          // native <input>; the wrapper is the visible box to line up.
          return { input: box(input), wrapper: box(input?.parentElement ?? null) };
        };
        const formLabelEl = c.querySelector('label[id$="-field-label"]');
        return {
          found: true,
          rootFound: true,
          container: box(c),
          formLabel: box(formLabelEl),
          formLabelText: formLabelEl?.textContent?.trim() ?? null,
          root: box(root),
          span: root.getAttribute('data-span'),
          layout: root.getAttribute('data-layout'),
          labels: root.getAttribute('data-labels'),
          formLabelState: root.getAttribute('data-form-label'),
          first: inputBox('sealed-first'),
          second: inputBox('sealed-second'),
          ownLabels: Array.from(root.querySelectorAll('.fui-Field label')).map((l) => ({ text: l.textContent.trim(), ...box(l) })),
        };
      };
      return {
        firstName: stock(cells.firstName),
        lastName: stock(cells.lastName),
        sin: sealed(cells.sin),
        sinHidden: sealed(cells.sinHidden),
      };
    }, CELLS);
  } catch (e) {
    failures.push(`measuring the two-column cells threw: ${e?.message ?? e}`);
    return out;
  }
  out.cells = measured;

  const near = (a, b) => typeof a === 'number' && typeof b === 'number' && Math.abs(a - b) <= TOLERANCE;
  const expect = (what, actual, wanted) => {
    if (!near(actual, wanted)) failures.push(`${what}: got ${actual}, wanted ${wanted} (±${TOLERANCE}px)`);
  };
  const { firstName, lastName } = measured;
  for (const [name, stock] of [['First Name', firstName], ['Last Name', lastName]]) {
    if (!stock.found) failures.push(`${name} stock cell container not found`);
    else if (!stock.label || !stock.area) failures.push(`${name} stock cell: label or control area not found`);
  }

  const checkSealed = (key, name, { expectFirstLabelAtStock }) => {
    const s = measured[key];
    if (!s.found) { failures.push(`${name}: container not found`); return; }
    if (!s.rootFound) { failures.push(`${name}: no sealed-entry in the container`); return; }
    if (s.span !== '2') failures.push(`${name}: data-span is ${JSON.stringify(s.span)}, wanted "2"`);
    if (!firstName.area || !lastName.area || !lastName.label) return; // already reported
    expect(`${name}: first input left`, s.first.wrapper?.left, firstName.area.left);
    expect(`${name}: first input width`, s.first.wrapper?.width, firstName.area.width);
    expect(`${name}: second input left`, s.second.wrapper?.left, lastName.area.left);
    expect(`${name}: second input width`, s.second.wrapper?.width, lastName.area.width);
    const reenter = s.ownLabels.find((l) => /^Re-enter/.test(l.text));
    if (!reenter) failures.push(`${name}: no "Re-enter" label inside the control (labels: ${JSON.stringify(s.ownLabels.map((l) => l.text))})`);
    else expect(`${name}: "${reenter.text}" label left`, reenter.left, lastName.label.left);
    if (expectFirstLabelAtStock) {
      const own = s.ownLabels.find((l) => !/^Re-enter/.test(l.text));
      if (!own) failures.push(`${name}: no first label inside the control with the cell label hidden (labels: ${JSON.stringify(s.ownLabels.map((l) => l.text))})`);
      else expect(`${name}: "${own.text}" label left`, own.left, firstName.label?.left);
    }
  };
  checkSealed('sin', 'SIN (cell 53, control 30)', { expectFirstLabelAtStock: false });
  checkSealed('sinHidden', 'SIN label hidden (cell 55, control 32)', { expectFirstLabelAtStock: true });

  // Screenshots: the whole section, then each spanning cell.
  const shoot = async (loc, file) => {
    if (!(await loc.count())) { failures.push(`nothing to screenshot for ${path.basename(file)}`); return; }
    try {
      await loc.screenshot({ path: file });
      shots.push(file);
    } catch (e) {
      failures.push(`screenshot ${path.basename(file)} failed: ${e?.message ?? e}`);
    }
  };
  const section = page.locator('section').filter({ has: sinContainer.first() }).last();
  await shoot(section, path.join(shotsDir, 'form-two-column.png'));
  await shoot(sinContainer.first(), path.join(shotsDir, 'form-two-column-sin.png'));
  await shoot(page.locator(container(CELLS.sinHidden)).first(), path.join(shotsDir, 'form-two-column-hidden.png'));

  out.ok = failures.length === 0;
  return out;
}

if (process.argv[1] && /check-two-column\.mjs$/.test(process.argv[1])) {
  let results = null;
  try { results = JSON.parse(fs.readFileSync(path.join(shotsDir, 'form-results.json'), 'utf8')); } catch {}
  const setup = JSON.parse(process.argv[2] ?? process.env.SETUP_JSON ?? 'null') ?? results?.setup;
  if (!setup?.formId || !setup?.contactId) throw new Error('need formId and contactId: pass setup JSON, or run run.mjs first for shots/form-results.json');
  const url = results?.form?.url ?? `${orgUrl}/main.aspx?pagetype=entityrecord&etn=contact&id=${setup.contactId}&formid=${setup.formId}`;
  const { ctx, page } = await openOrg({ headless: true });
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await page.locator('[data-testid="sealed-entry"]').first().waitFor({ state: 'visible', timeout: 120000 });
    await page.waitForTimeout(2000);
    const r = await checkTwoColumn(page, setup);
    console.log(JSON.stringify(r, null, 2));
    if (!r.ok) process.exitCode = 1;
  } finally {
    await ctx.close();
  }
}
