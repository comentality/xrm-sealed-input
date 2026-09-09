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
export async function openHarness(page, { value = '', characters, validation, maxLength, revealMs, layout, width, label } = {}) {
  if (width !== undefined) await page.setViewportSize({ width: Math.max(700, width + 60), height: 600 });
  await page.goto('/', { waitUntil: 'load' });
  await page.locator('.control-container [data-testid^="sealed-"]').first().waitFor({ timeout: 30_000 });
  if (width !== undefined) await setWidth(page, width);
  if (layout !== undefined) await setSelect(propertyRow(page, 'layout').locator('select'), layout);
  // The harness seeds text inputs with "val"; label the fields SIN unless told otherwise.
  await setField(propertyRow(page, 'label').locator('input[type=text]'), label ?? 'SIN');
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
    if (text.includes('`NaN` is an invalid value') || text.includes('Failed to load resource')) return;
    messages.push(`${m.type()}: ${text}`);
  });
  page.on('pageerror', (e) => messages.push(`pageerror: ${String(e)}`));
  return messages;
}
