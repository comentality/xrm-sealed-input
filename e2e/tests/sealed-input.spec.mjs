import { test, expect } from '@playwright/test';
import { openHarness, harnessValue, shot, dots, collectConsole, setWidth, wrapInFormCell } from './harness.mjs';

// 046454286 is the published Luhn-valid SIN example; 046454287 fails the checksum.
const GOOD_SIN = '046454286';
const BAD_SIN = '046454287';

test.describe('entry', () => {
  test('an empty column shows two fields and nothing else', async ({ page }) => {
    const c = await openHarness(page);
    await expect(c.first).toBeVisible();
    await expect(c.second).toBeVisible();
    await expect(c.hint).toHaveCount(0);
    await expect(c.startOver).toHaveCount(0);
    await expect(c.labels).toHaveText(['SIN', 'Re-enter SIN']);
    await shot(page, 'entry-empty');
  });

  test('the fields carry the column display name and Re-enter it', async ({ page }) => {
    // The harness server names the bound column SIN (see harness-server.mjs).
    const c = await openHarness(page);
    await expect(c.labels).toHaveText(['SIN', 'Re-enter SIN']);
    await expect(c.first).toHaveAttribute('aria-label', 'SIN');
    await expect(c.second).toHaveAttribute('aria-label', 'Re-enter SIN');
  });

  test('earlier characters are masked, the last one stays readable for revealMs', async ({ page }) => {
    const c = await openHarness(page, { revealMs: 60_000 });
    await c.first.click();
    await page.keyboard.type('1234');
    await expect(c.first).toHaveValue(dots(3) + '4');
    await shot(page, 'entry-typing');
  });

  test('the readable character masks after revealMs, on the next key, and on blur', async ({ page }) => {
    const c = await openHarness(page, { revealMs: 300 });
    await c.first.click();
    await page.keyboard.type('12');
    await expect(c.first).toHaveValue(dots(1) + '2');
    await expect(c.first).toHaveValue(dots(2), { timeout: 2000 });

    await page.keyboard.type('3');
    await expect(c.first).toHaveValue(dots(2) + '3');
    await page.keyboard.type('4');
    // The next key masks the previous one at once, whatever the timer says.
    await expect(c.first).toHaveValue(dots(3) + '4');

    await openHarness(page, { revealMs: 60_000 });
    await c.first.click();
    await page.keyboard.type('1234');
    await expect(c.first).toHaveValue(dots(3) + '4');
    await c.first.blur();
    await expect(c.first).toHaveValue(dots(4));
    await shot(page, 'entry-masked');
  });

  test('revealMs of zero masks every character at once', async ({ page }) => {
    const c = await openHarness(page, { revealMs: 0 });
    await c.first.click();
    await page.keyboard.type('98');
    await expect(c.first).toHaveValue(dots(2));
  });

  test('Backspace removes the last character', async ({ page }) => {
    const c = await openHarness(page, { revealMs: 0 });
    await c.first.click();
    await page.keyboard.type('123');
    await page.keyboard.press('Backspace');
    await expect(c.first).toHaveValue(dots(2));
    await page.keyboard.press('Backspace');
    await page.keyboard.press('Backspace');
    await page.keyboard.press('Backspace');
    await expect(c.first).toHaveValue('');
  });

  test('Enter in the first field moves to the second', async ({ page }) => {
    const c = await openHarness(page);
    await c.first.click();
    await page.keyboard.type('12');
    await page.keyboard.press('Enter');
    await expect(c.second).toBeFocused();
  });

  test('digits only by default; any character when configured', async ({ page }) => {
    let c = await openHarness(page, { revealMs: 0 });
    await c.first.click();
    await page.keyboard.type('1a2-3 4');
    await expect(c.first).toHaveValue(dots(4));

    c = await openHarness(page, { revealMs: 0, characters: 'any' });
    await c.first.click();
    await page.keyboard.type('1a2-3 4');
    await expect(c.first).toHaveValue(dots(7));
  });

  test('maxLength caps what can be typed', async ({ page }) => {
    const c = await openHarness(page, { revealMs: 0, maxLength: 4 });
    await c.first.click();
    await page.keyboard.type('123456');
    await expect(c.first).toHaveValue(dots(4));
  });

  test('coming back to a field selects its entry, so typing replaces it and Backspace clears it', async ({ page }) => {
    const c = await openHarness(page, { revealMs: 60_000 });
    await c.first.click();
    await page.keyboard.type('1234');
    await c.second.click();
    await page.keyboard.type('56');
    // Back into the first field by mouse: the entry is selected, not appended to.
    await c.first.click();
    await expect(c.first).toHaveJSProperty('selectionStart', 0);
    await expect(c.first).toHaveJSProperty('selectionEnd', 4);
    await page.keyboard.type('9');
    await expect(c.first).toHaveValue('9');
    // Back into the second field by keyboard, same thing.
    await page.keyboard.press('Enter');
    await expect(c.second).toBeFocused();
    await expect(c.second).toHaveJSProperty('selectionEnd', 2);
    await page.keyboard.press('Backspace');
    await expect(c.second).toHaveValue('');
    await page.keyboard.type('7');
    await expect(c.second).toHaveValue('7');
  });

  test('Start over is a small link under the fields and clears both', async ({ page }) => {
    const c = await openHarness(page, { revealMs: 0 });
    await c.first.click();
    await page.keyboard.type('12');
    await c.second.click();
    await page.keyboard.type('1');
    await c.startOver.click();
    await expect(c.first).toHaveValue('');
    await expect(c.second).toHaveValue('');
    await expect(c.first).toBeFocused();
    await expect(c.startOver).toHaveCount(0);
  });
});

test.describe('clipboard and other injection', () => {
  test('Ctrl+V pastes nothing', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    const c = await openHarness(page, { revealMs: 0 });
    await page.evaluate(() => navigator.clipboard.writeText('4242'));
    await c.first.click();
    await page.keyboard.press('Control+V');
    await page.keyboard.press('Shift+Insert');
    await expect(c.first).toHaveValue('');
    await expect(harnessValue(page)).toHaveValue('');
    // Positive control: the same keystroke does paste into an ordinary input,
    // so the empty field above is the control's doing, not the browser's.
    await harnessValue(page).click();
    await page.keyboard.press('Control+V');
    await expect(harnessValue(page)).toHaveValue('4242');
  });

  test('paste, drop, cut, copy and context menu events are cancelled', async ({ page }) => {
    const c = await openHarness(page, { revealMs: 0 });
    await c.first.click();
    await page.keyboard.type('12');
    const prevented = await c.first.evaluate((el) => {
      const fire = (ev) => !el.dispatchEvent(ev); // false return means defaultPrevented
      const dt = new DataTransfer();
      dt.setData('text/plain', '999');
      return {
        paste: fire(new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: dt })),
        copy: fire(new ClipboardEvent('copy', { bubbles: true, cancelable: true, clipboardData: dt })),
        cut: fire(new ClipboardEvent('cut', { bubbles: true, cancelable: true, clipboardData: dt })),
        drop: fire(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt })),
        dragstart: fire(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer: dt })),
        contextmenu: fire(new MouseEvent('contextmenu', { bubbles: true, cancelable: true })),
        insertFromPaste: fire(new InputEvent('beforeinput', { bubbles: true, cancelable: true, inputType: 'insertFromPaste', data: '999' })),
        insertFromDrop: fire(new InputEvent('beforeinput', { bubbles: true, cancelable: true, inputType: 'insertFromDrop', data: '999' })),
        insertReplacementText: fire(new InputEvent('beforeinput', { bubbles: true, cancelable: true, inputType: 'insertReplacementText', data: '999' })),
      };
    });
    for (const [name, wasPrevented] of Object.entries(prevented)) {
      expect(wasPrevented, `${name} should be cancelled`).toBe(true);
    }
    await expect(c.first).toHaveValue(dots(2));
  });

  test('the fields tell browsers and password managers to stay out', async ({ page }) => {
    const c = await openHarness(page);
    for (const field of [c.first, c.second]) {
      await expect(field).toHaveAttribute('type', 'text');
      await expect(field).toHaveAttribute('autocomplete', 'off');
      await expect(field).toHaveAttribute('data-lpignore', 'true');
      await expect(field).toHaveAttribute('data-1p-ignore', 'true');
      await expect(field).toHaveAttribute('inputmode', 'numeric');
    }
  });
});

test.describe('confirmation and storing', () => {
  test('a mismatch shows an error and stores nothing', async ({ page }) => {
    const c = await openHarness(page, { revealMs: 0 });
    await c.first.click();
    await page.keyboard.type('1234');
    await page.keyboard.press('Enter');
    await page.keyboard.type('123');
    await expect(c.errors).toHaveCount(0); // quiet while the second entry is still shorter
    await page.keyboard.type('9');
    await expect(c.errors).toHaveText(['Does not match the first entry.']);
    await expect(harnessValue(page)).toHaveValue('');
    await expect(c.entry).toBeVisible();
    await shot(page, 'entry-mismatch');

    // Fixing the second entry clears the error and stores.
    await page.keyboard.press('Backspace');
    await page.keyboard.type('4');
    await expect(c.stored).toBeVisible();
    await expect(harnessValue(page)).toHaveValue('1234');
  });

  test('a match stores the value and collapses to hidden dots', async ({ page }) => {
    const c = await openHarness(page, { revealMs: 0 });
    await c.first.click();
    await page.keyboard.type('00123456789');
    await page.keyboard.press('Enter');
    await page.keyboard.type('00123456789');
    await expect(c.stored).toBeVisible();
    await expect(c.hint).toHaveCount(0);
    await expect(harnessValue(page)).toHaveValue('00123456789');
    // Fixed-width dots in both fields: neither the value nor its length shows.
    await expect(c.first).toHaveValue(dots(8));
    await expect(c.second).toHaveValue(dots(8));
    await expect(c.container).not.toContainText('00123456789');
    await expect(c.startOver).toHaveCount(0);
    await shot(page, 'stored-saved');
  });

  test('a stored value on load shows dots in both fields', async ({ page }) => {
    const c = await openHarness(page, { value: 'secret123' });
    await expect(c.first).toHaveValue(dots(8));
    await expect(c.second).toHaveValue(dots(8));
    await expect(c.container).not.toContainText('secret123');
    await expect(c.hint).toHaveCount(0);
    await shot(page, 'stored');
  });

  test('typing over the stored dots starts a fresh entry', async ({ page }) => {
    const c = await openHarness(page, { value: 'secret123', revealMs: 0 });
    await c.first.click();
    await page.keyboard.type('7');
    await expect(c.entry).toHaveAttribute('data-state', 'entering');
    await expect(c.first).toHaveValue(dots(1));
    await expect(c.second).toHaveValue('');
    await expect(harnessValue(page)).toHaveValue('secret123'); // untouched until the entry completes
    await shot(page, 'entry-replacing');
  });

  test('typing in the second field over the stored dots also starts fresh, there', async ({ page }) => {
    const c = await openHarness(page, { value: 'secret123', revealMs: 0 });
    await c.second.click();
    await page.keyboard.type('7');
    await expect(c.first).toHaveValue('');
    await expect(c.second).toHaveValue(dots(1));
  });

  test('Start over during a replacement returns to the stored dots', async ({ page }) => {
    const c = await openHarness(page, { value: 'secret123', revealMs: 0 });
    await c.first.click();
    await page.keyboard.type('12');
    await c.startOver.click();
    await expect(c.entry).toHaveAttribute('data-state', 'stored');
    await expect(c.first).toHaveValue(dots(8));
    await expect(c.second).toHaveValue(dots(8));
    await expect(harnessValue(page)).toHaveValue('secret123');
  });

  test('re-entering the same value again returns to the stored dots', async ({ page }) => {
    // The host has nothing new to push when the value is unchanged, so the
    // control must close the entry on its own.
    const c = await openHarness(page, { value: '777', revealMs: 0 });
    await c.first.click();
    await page.keyboard.type('777');
    await page.keyboard.press('Enter');
    await page.keyboard.type('777');
    await expect(c.entry).toHaveAttribute('data-state', 'stored');
    await expect(harnessValue(page)).toHaveValue('777');
  });

  test('the whole flow raises no console errors', async ({ page }) => {
    const messages = collectConsole(page);
    const c = await openHarness(page, { revealMs: 200 });
    await c.first.click();
    await page.keyboard.type('4321');
    await page.keyboard.press('Backspace');
    await page.keyboard.type('1');
    await page.keyboard.press('Enter');
    await page.keyboard.type('4321');
    await expect(c.stored).toBeVisible();
    await c.first.click();
    await page.keyboard.type('9');
    await c.startOver.click();
    await c.first.click();
    await page.keyboard.press('Backspace');
    await expect(c.entry).toHaveAttribute('data-state', 'empty');
    expect(messages).toEqual([]);
  });

  test('a new matching entry overwrites the stored value', async ({ page }) => {
    const c = await openHarness(page, { value: 'secret123', revealMs: 0 });
    await c.first.click();
    await page.keyboard.type('777');
    await page.keyboard.press('Enter');
    await page.keyboard.type('777');
    await expect(c.stored).toBeVisible();
    await expect(harnessValue(page)).toHaveValue('777');
  });

  test('Backspace over the stored dots clears the column', async ({ page }) => {
    const c = await openHarness(page, { value: 'secret123' });
    await c.first.click();
    await page.keyboard.press('Backspace');
    await expect(harnessValue(page)).toHaveValue('');
    await expect(c.entry).toHaveAttribute('data-state', 'empty');
    await expect(c.first).toHaveValue('');
    await expect(c.second).toHaveValue('');
  });
});

test.describe('SIN validation', () => {
  test('a bad checksum is flagged on the first field and never stored', async ({ page }) => {
    const c = await openHarness(page, { validation: 'sin', revealMs: 0 });
    await c.first.click();
    await page.keyboard.type(BAD_SIN.slice(0, 8));
    await expect(c.errors).toHaveCount(0); // quiet until nine digits are in
    await page.keyboard.type(BAD_SIN.slice(8));
    await expect(c.errors).toHaveText(['Not a valid SIN. Check the nine digits.']);
    await shot(page, 'entry-sin-invalid');
    await page.keyboard.press('Enter');
    await page.keyboard.type(BAD_SIN);
    await expect(harnessValue(page)).toHaveValue('');
    await expect(c.entry).toBeVisible();
  });

  test('SIN caps typing at nine digits', async ({ page }) => {
    const c = await openHarness(page, { validation: 'sin', revealMs: 0, maxLength: 20 });
    await c.first.click();
    await page.keyboard.type(GOOD_SIN + '123');
    await expect(c.first).toHaveValue(dots(9));
  });

  test('a valid SIN entered twice is stored', async ({ page }) => {
    const c = await openHarness(page, { validation: 'sin', revealMs: 0 });
    await c.first.click();
    await page.keyboard.type(GOOD_SIN);
    await expect(c.errors).toHaveCount(0);
    await page.keyboard.press('Enter');
    await page.keyboard.type(GOOD_SIN);
    await expect(c.stored).toBeVisible();
    await expect(harnessValue(page)).toHaveValue(GOOD_SIN);
  });
});

test.describe('layout', () => {
  const rowOf = async (loc) => (await loc.boundingBox()).y;

  test('a narrow cell stacks the fields', async ({ page }) => {
    const c = await openHarness(page, { width: 360, revealMs: 60_000 });
    await expect(c.entry).toHaveAttribute('data-layout', 'stacked');
    expect(await rowOf(c.second)).toBeGreaterThan(await rowOf(c.first));
    await c.first.click();
    await page.keyboard.type('1234');
    await shot(page, 'layout-narrow');
  });

  test('a wide cell puts Enter and Enter again side by side', async ({ page }) => {
    const c = await openHarness(page, { width: 900, revealMs: 60_000 });
    await expect(c.entry).toHaveAttribute('data-layout', 'side-by-side');
    expect(Math.abs((await rowOf(c.second)) - (await rowOf(c.first)))).toBeLessThan(2);
    expect((await c.second.boundingBox()).x).toBeGreaterThan((await c.first.boundingBox()).x + 300);
    await c.first.click();
    await page.keyboard.type('1234');
    await shot(page, 'layout-wide');
    // The mismatch message sits under the right-hand field.
    await page.keyboard.press('Enter');
    await page.keyboard.type('1239');
    await expect(c.errors).toHaveText(['Does not match the first entry.']);
    expect((await c.errors.first().boundingBox()).x).toBeGreaterThan((await c.first.boundingBox()).x + 300);
    await shot(page, 'layout-wide-mismatch');
  });

  test('the layout follows a resize', async ({ page }) => {
    const c = await openHarness(page, { width: 900 });
    await expect(c.entry).toHaveAttribute('data-layout', 'side-by-side');
    await setWidth(page, 360);
    await expect(c.entry).toHaveAttribute('data-layout', 'stacked');
    await setWidth(page, 700);
    await expect(c.entry).toHaveAttribute('data-layout', 'side-by-side');
  });

  test('layout can be forced either way', async ({ page }) => {
    let c = await openHarness(page, { width: 900, layout: 'stacked' });
    await expect(c.entry).toHaveAttribute('data-layout', 'stacked');
    c = await openHarness(page, { width: 360, layout: 'sideBySide' });
    await expect(c.entry).toHaveAttribute('data-layout', 'side-by-side');
  });
});

test.describe('labels', () => {
  // Outside a form cell (the harness) nothing names the column, so both
  // fields are labelled, above. Inside a Unified Interface cell the form draws
  // the column label itself: then only the second field gets a label, placed
  // as the section places labels.
  test('outside a form cell both fields are labelled, above', async ({ page }) => {
    const c = await openHarness(page);
    await expect(c.entry).toHaveAttribute('data-form-label', 'none');
    await expect(c.entry).toHaveAttribute('data-labels', 'both');
    await expect(c.entry).toHaveAttribute('data-label-position', 'above');
    await expect(c.labels).toHaveText(['SIN', 'Re-enter SIN']);
  });

  test('a form label on the left leaves only Re-enter, beside the second field', async ({ page }) => {
    const c = await openHarness(page, { width: 560 });
    await wrapInFormCell(page, { label: 'left', width: 560 });
    await expect(c.entry).toHaveAttribute('data-form-label', 'shown');
    await expect(c.entry).toHaveAttribute('data-labels', 'reenter-only');
    await expect(c.entry).toHaveAttribute('data-label-position', 'inline');
    await expect(c.labels).toHaveText(['Re-enter']);
    await expect(c.first).toHaveAttribute('aria-label', 'SIN');
    await expect(c.second).toHaveAttribute('aria-label', 'Re-enter SIN');
    // The label sits beside the field, on the same line.
    const label = await c.labels.first().boundingBox();
    const input = await c.second.boundingBox();
    expect(label.x + label.width).toBeLessThanOrEqual(input.x + 1);
    await page.locator('[data-testid="fake-section"]').screenshot({ path: `shots/labels-form-left.png` });
  });

  test('a form label on top leaves only Re-enter SIN, above the second field when stacked', async ({ page }) => {
    const c = await openHarness(page, { width: 360 });
    await wrapInFormCell(page, { label: 'top', width: 360 });
    await expect(c.entry).toHaveAttribute('data-form-label', 'shown');
    await expect(c.entry).toHaveAttribute('data-labels', 'reenter-only');
    await expect(c.entry).toHaveAttribute('data-label-position', 'above');
    await expect(c.labels).toHaveText(['Re-enter SIN']);
    await page.locator('[data-testid="fake-section"]').screenshot({ path: `shots/labels-form-top.png` });
  });

  test('a form label on top with the fields side by side puts Re-enter beside the second input, on the same line', async ({ page }) => {
    const c = await openHarness(page, { width: 560 });
    await wrapInFormCell(page, { label: 'top', width: 560 });
    await expect(c.entry).toHaveAttribute('data-form-label', 'shown');
    await expect(c.entry).toHaveAttribute('data-layout', 'side-by-side');
    await expect(c.entry).toHaveAttribute('data-label-position', 'inline');
    await expect(c.labels).toHaveText(['Re-enter']);
    const first = await c.first.boundingBox();
    const second = await c.second.boundingBox();
    expect(Math.abs(first.y - second.y)).toBeLessThanOrEqual(1);
    expect(Math.abs(first.width - second.width)).toBeLessThanOrEqual(2);
    await page.locator('[data-testid="fake-section"]').screenshot({ path: `shots/labels-form-top-wide.png` });
  });

  test('a hidden form label brings both labels back, the first in the form\'s own label column', async ({ page }) => {
    const c = await openHarness(page, { width: 560 });
    await wrapInFormCell(page, { label: 'hidden', sibling: 'left', width: 560 });
    await expect(c.entry).toHaveAttribute('data-form-label', 'hidden');
    await expect(c.entry).toHaveAttribute('data-labels', 'both');
    await expect(c.entry).toHaveAttribute('data-label-position', 'inline');
    await expect(c.labels).toHaveText(['SIN', 'Re-enter']);
    // The first input starts where the neighbouring cell's input does.
    const neighbour = await page.locator('[data-id="sibling-FieldSectionItemContainer"] > div:nth-child(2)').boundingBox();
    const first = await c.first.boundingBox();
    const second = await c.second.boundingBox();
    expect(Math.abs(first.x - neighbour.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(first.y - second.y)).toBeLessThanOrEqual(1);
    expect(Math.abs(first.width - second.width)).toBeLessThanOrEqual(2);
    // The second label keeps its distance from the first input.
    const reenter = await c.labels.nth(1).boundingBox();
    expect(reenter.x - (first.x + first.width)).toBeGreaterThanOrEqual(10);
    await page.locator('[data-testid="fake-section"]').screenshot({ path: `shots/labels-form-hidden.png` });

    // A wide label column in a narrow cell: the inputs shrink rather than
    // overflow into the second label (a real form gave a narrow column a
    // 248px label column at 542px).
    await openHarness(page, { width: 540 });
    await wrapInFormCell(page, { label: 'hidden', sibling: 'left', width: 540, labelWidth: 250 });
    await expect(c.entry).toHaveAttribute('data-layout', 'side-by-side');
    const n3 = await page.locator('[data-id="sibling-FieldSectionItemContainer"] > div:nth-child(2)').boundingBox();
    const f3 = await c.first.boundingBox();
    const s3 = await c.second.boundingBox();
    const r3 = await c.labels.nth(1).boundingBox();
    expect(Math.abs(f3.x - n3.x)).toBeLessThanOrEqual(1);
    expect(r3.x - (f3.x + f3.width)).toBeGreaterThanOrEqual(10);
    expect(s3.x).toBeGreaterThanOrEqual(r3.x + r3.width);
    expect(Math.abs(f3.width - s3.width)).toBeLessThanOrEqual(2);
    expect(f3.width).toBeGreaterThanOrEqual(60);
    await page.locator('[data-testid="fake-section"]').screenshot({ path: `shots/labels-form-hidden-narrow.png` });

    // Stacked, both labels beside, in that same column.
    await openHarness(page, { width: 360 });
    await wrapInFormCell(page, { label: 'hidden', sibling: 'left', width: 360 });
    await expect(c.labels).toHaveText(['SIN', 'Re-enter']);
    const n2 = await page.locator('[data-id="sibling-FieldSectionItemContainer"] > div:nth-child(2)').boundingBox();
    const f2 = await c.first.boundingBox();
    const s2 = await c.second.boundingBox();
    expect(Math.abs(f2.x - n2.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(f2.x - s2.x)).toBeLessThanOrEqual(1);

    await openHarness(page, { width: 360 });
    await wrapInFormCell(page, { label: 'hidden', sibling: 'top', width: 360 });
    await expect(c.entry).toHaveAttribute('data-labels', 'both');
    await expect(c.entry).toHaveAttribute('data-label-position', 'above');
  });

  test('typing inside a form cell stores the value, without console errors', async ({ page }) => {
    // A regression test: the first version re-rendered without end once a
    // form label was found, and the page hung on the first Enter.
    const messages = collectConsole(page);
    for (const [label, width] of [['left', 560], ['top', 360]]) {
      const c = await openHarness(page, { width, validation: 'sin', revealMs: 60_000 });
      await wrapInFormCell(page, { label });
      await expect(c.entry).toHaveAttribute('data-form-label', 'shown');
      await c.first.click();
      await page.keyboard.type(GOOD_SIN);
      await page.keyboard.press('Enter');
      await page.keyboard.type(GOOD_SIN);
      await expect(c.entry).toHaveAttribute('data-state', 'stored');
      expect(messages).toEqual([]);
    }
  });
});
