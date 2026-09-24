// Helpers for driving the pcf-start harness: set the bound value and the
// input properties through its property panel, and crop screenshots to the
// control itself so the panel (which shows the bound value in clear) never
// lands in a picture.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect } from '@playwright/test';

const here = path.dirname(fileURLToPath(import.meta.url));
export const shotsDir = path.join(here, '..', 'shots');
fs.mkdirSync(shotsDir, { recursive: true });

export const MASK = '•';
export const dots = (n) => MASK.repeat(n);

/** The harness row for one property, found by its exact property name. */
function propertyRow(page, name) {
  return page
    .locator('.property-inputs .io-item')
    .filter({ has: page.locator('.key-value-pair-value span', { hasText: new RegExp(`^${name}$`) }) });
}

export function harnessValue(page) {
  return propertyRow(page, 'value').locator('input[type=text]');
}

async function setField(locator, value) {
  await locator.fill(String(value));
  await locator.dispatchEvent('change');
}

async function setSelect(locator, value) {
  await locator.selectOption(String(value));
  await locator.dispatchEvent('change');
}

/**
 * Opens the harness and configures the control. The harness seeds the bound
 * value with "val", so an empty string is applied unless told otherwise.
 */
export async function openHarness(page, { value = '', characters, validation, maxLength, revealMs, layout, width } = {}) {
  if (width !== undefined) await page.setViewportSize({ width: Math.max(700, width + 60), height: 600 });
  await page.goto('/', { waitUntil: 'load' });
  await page.locator('.control-container [data-testid^="sealed-"]').first().waitFor({ timeout: 30_000 });
  if (width !== undefined) await setWidth(page, width);
  if (layout !== undefined) await setSelect(propertyRow(page, 'layout').locator('select'), layout);
  if (characters !== undefined) await setSelect(propertyRow(page, 'characters').locator('select'), characters);
  if (validation !== undefined) await setSelect(propertyRow(page, 'validation').locator('select'), validation);
  if (maxLength !== undefined) await setField(propertyRow(page, 'maxLength').locator('input'), maxLength);
  if (revealMs !== undefined) await setField(propertyRow(page, 'revealMs').locator('input'), revealMs);
  await setField(harnessValue(page), value);
  const c = control(page);
  await expect(c.entry).toHaveAttribute('data-state', value === '' ? 'empty' : 'stored');
  return c;
}

/** The harness's "Component Container Width" box, in CSS pixels. */
export async function setWidth(page, px) {
  const box = page.locator('.io-item, .key-value-pair').filter({ hasText: 'Component Container Width' }).locator('input').first();
  await setField(box, px);
}

export function control(page) {
  const t = (id) => page.locator(`[data-testid="${id}"]`);
  return {
    container: page.locator('.control-container').first(),
    entry: t('sealed-entry'),
    first: t('sealed-first'),
    second: t('sealed-second'),
    startOver: t('sealed-startover'),
    hint: t('sealed-hint'),
    /** The entry root when both fields show the stored dots. */
    stored: page.locator('[data-testid="sealed-entry"][data-state="stored"]'),
    labels: page.locator('.control-container .fui-Field label'),
    /** Fluent Field validation messages, in DOM order. */
    errors: page.locator('.control-container .fui-Field__validationMessage'),
  };
}

/** Screenshot of just the control, for the docs. */
export async function shot(page, name) {
  await page.locator('.control-container').first().screenshot({ path: path.join(shotsDir, `${name}.png`) });
}

/**
 * Collects console errors and warnings from the control, ignoring the
 * harness's own noise (its NaN width style and a 404 for a missing asset).
 */
export function collectConsole(page) {
  const messages = [];
  page.on('console', (m) => {
    if (m.type() !== 'error' && m.type() !== 'warning') return;
    const text = m.text();
    // The panel's number boxes also warn about switching from uncontrolled to controlled when set.
    if (text.includes('`NaN` is an invalid value') || text.includes('Failed to load resource') || text.includes('uncontrolled input of type')) return;
    messages.push(`${m.type()}: ${text}`);
  });
  page.on('pageerror', (e) => messages.push(`pageerror: ${String(e)}`));
  return messages;
}

/**
 * Installs a stand-in for the form's client API before the page loads: a
 * window.Xrm whose Page hands out controls that record setNotification and
 * clearNotification in window.__form (calls in order, and the notification
 * standing now). A keydown listener on window, which runs after the
 * control's own handler on the same event, notes what stood at each Ctrl+S:
 * that is what the form's save would have found. Call before openHarness.
 */
export async function fakeForm(page) {
  await page.addInitScript(() => {
    const form = { calls: [], current: null, atSave: [] };
    window.__form = form;
    const control = (name) => ({
      getName: () => name,
      setNotification: (message, id) => {
        form.calls.push({ op: 'set', name, message, id });
        form.current = { name, message };
        return true;
      },
      clearNotification: (id) => {
        form.calls.push({ op: 'clear', name, id });
        form.current = null;
        return true;
      },
    });
    window.Xrm = { Page: { getControl: (name) => control(name), getAttribute: () => null } };
    window.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') form.atSave.push(form.current);
    });
  });
}

/** What the stand-in form has recorded so far. */
export const formState = (page) => page.evaluate(() => window.__form);

/**
 * Puts the control inside a copy of the DOM a Unified Interface form cell
 * has: a container whose data-id ends in FieldSectionItemContainer holding a
 * <label id="...-field-label"> and the control area. `label` is where the
 * form puts the cell label: 'left', 'top', or 'hidden' (rendered display:none,
 * with a sibling cell in the same section whose label is at `sibling`). The
 * control re-reads the DOM when its size changes, so the width is nudged.
 * `labelWidth` is the fake label column, 120px unless said otherwise.
 * With `width`, the control area is sized to that many pixels (the harness
 * pane would otherwise clamp it) and the viewport widened to make room.
 * With `columns: 2`, the section has two columns: a row of two stock cells
 * (First Name, Last Name; data-ids sibling- and sibling2-) above the
 * control's cell, which spans both columns, and `width` is the whole row.
 */
export async function wrapInFormCell(page, { label = 'left', sibling = 'left', text = 'SIN', width, labelWidth = 120, columns = 1 } = {}) {
  await page.evaluate(({ label, sibling, text, labelWidth, columns }) => {
    const control = document.querySelector('.control-container');
    const parent = control.parentElement;
    const cell = (id, where, labelText, area) => {
      const c = document.createElement('div');
      c.setAttribute('data-id', `${id}-FieldSectionItemContainer`);
      c.style.display = 'flex';
      c.style.flexDirection = where === 'top' ? 'column' : 'row';
      c.style.alignItems = 'flex-start';
      c.style.gap = '8px';
      const wrap = document.createElement('div');
      const l = document.createElement('label');
      l.id = `${id}-field-label`;
      l.textContent = labelText;
      l.style.display = where === 'hidden' ? 'none' : 'block';
      l.style.width = where === 'top' ? 'auto' : `${labelWidth}px`;
      // A hidden cell label takes its wrapper with it, so the control area
      // starts at the cell's edge, as on the real form.
      if (where === 'hidden') wrap.style.display = 'none';
      wrap.appendChild(l);
      c.appendChild(wrap);
      const a = document.createElement('div');
      a.style.flex = '1 1 0';
      a.style.minWidth = '0';
      a.appendChild(area);
      c.appendChild(a);
      return c;
    };
    const section = document.createElement('section');
    section.setAttribute('data-testid', 'fake-section');
    const stockInput = () => {
      const stock = document.createElement('div');
      stock.style.height = '32px';
      stock.style.background = '#eee';
      return stock;
    };
    if (columns === 2) {
      // Two cells on one row, each half the width, like a two-column
      // section; the cells are separated by the same gap the form uses
      // between its columns (16px).
      const row = document.createElement('div');
      row.style.display = 'flex';
      row.style.columnGap = '16px';
      row.style.marginBottom = '8px';
      for (const [id, name] of [['sibling', 'First Name'], ['sibling2', 'Last Name']]) {
        const c = cell(id, sibling, name, stockInput());
        c.style.flex = '1 1 0';
        c.style.minWidth = '0';
        row.appendChild(c);
      }
      section.appendChild(row);
    } else {
      section.appendChild(cell('sibling', sibling, 'First Name', stockInput()));
    }
    section.appendChild(cell('sealed', label, text, control));
    parent.appendChild(section);
    window.__fakeSection = section;
  }, { label, sibling, text, labelWidth, columns });
  if (width !== undefined) {
    await page.setViewportSize({ width: Math.max(1400, width + 400), height: 800 });
    // The fake cell adds its label column and an 8px gap on the left; with
    // two columns, `width` is the row and the control gets the rest of it.
    const sectionWidth = columns === 2 ? width : label === 'top' ? width : width + labelWidth + 8;
    const controlWidth = columns === 2 ? (label === 'left' ? width - labelWidth - 8 : width) : width;
    await page.evaluate(({ w, cw }) => {
      document.querySelector('[data-testid="fake-section"]').style.width = `${w}px`;
      document.querySelector('.control-container').style.width = `${cw}px`;
    }, { w: sectionWidth, cw: controlWidth });
  }
  // Nudge the size so the ResizeObserver fires and the control re-reads the DOM.
  await page.evaluate(() => { document.querySelector('.control-container').style.paddingRight = '1px'; });
}

/** Label and control-area boxes of a fake stock cell put there by wrapInFormCell. */
export async function fakeCellBoxes(page, id = 'sibling') {
  const c = page.locator(`[data-id="${id}-FieldSectionItemContainer"]`);
  return { label: await c.locator('label').boundingBox(), area: await c.locator('> div:nth-child(2)').boundingBox() };
}
