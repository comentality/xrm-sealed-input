import { test, expect } from '@playwright/test';
import { openHarness, harnessValue, shot, dots, collectConsole } from './harness.mjs';

// 046454286 is the published Luhn-valid SIN example; 046454287 fails the checksum.
const GOOD_SIN = '046454286';
const BAD_SIN = '046454287';

test.describe('entry', () => {
  test('an empty column shows two fields and the hint', async ({ page }) => {
    const c = await openHarness(page);
    await expect(c.first).toBeVisible();
    await expect(c.second).toBeVisible();
    await expect(c.entry).toContainText('Type it twice. Pasting is off.');
    await expect(c.startOver).toHaveCount(0);
    await shot(page, 'entry-empty');
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

  test('Start over clears both fields', async ({ page }) => {
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
    await expect(c.saved).toContainText('Entered twice and stored');
    await expect(harnessValue(page)).toHaveValue('00123456789');
    // Fixed-width dots: the stored view leaks neither the value nor its length.
    await expect(c.stored).toContainText(dots(8));
    await expect(c.container).not.toContainText('00123456789');
    await expect(c.container).not.toContainText(dots(11));
    await shot(page, 'stored-saved');
  });

  test('a stored value on load shows dots only', async ({ page }) => {
    const c = await openHarness(page, { value: 'secret123' });
    await expect(c.stored).toContainText(dots(8));
    await expect(c.container).not.toContainText('secret123');
    await expect(c.saved).toHaveCount(0);
    await shot(page, 'stored');
  });

  test('Replace opens entry with Cancel; Cancel returns to the stored view', async ({ page }) => {
    const c = await openHarness(page, { value: 'secret123' });
    await c.replace.click();
    await expect(c.entry).toBeVisible();
    await expect(c.cancel).toBeVisible();
    await shot(page, 'entry-replacing');
    await c.cancel.click();
    await expect(c.stored).toBeVisible();
    await expect(harnessValue(page)).toHaveValue('secret123');
  });

  test('Replace with the same value again closes the entry', async ({ page }) => {
    // The host has nothing new to push when the value is unchanged, so the
    // control must close the entry on its own.
    const c = await openHarness(page, { value: '777', revealMs: 0 });
    await c.replace.click();
    await c.first.click();
    await page.keyboard.type('777');
    await page.keyboard.press('Enter');
    await page.keyboard.type('777');
    await expect(c.stored).toBeVisible();
    await expect(harnessValue(page)).toHaveValue('777');
  });

  test('Cancel forgets what was typed', async ({ page }) => {
    const c = await openHarness(page, { value: 'secret123', revealMs: 0 });
    await c.replace.click();
    await c.first.click();
    await page.keyboard.type('12');
    await c.cancel.click();
    await c.replace.click();
    await expect(c.first).toHaveValue('');
    await expect(c.second).toHaveValue('');
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
    await c.replace.click();
    await c.cancel.click();
    await c.clear.click();
    await expect(c.entry).toBeVisible();
    expect(messages).toEqual([]);
  });

  test('Replace then a matching entry overwrites the value', async ({ page }) => {
    const c = await openHarness(page, { value: 'secret123', revealMs: 0 });
    await c.replace.click();
    await c.first.click();
    await page.keyboard.type('777');
    await page.keyboard.press('Enter');
    await page.keyboard.type('777');
    await expect(c.stored).toBeVisible();
    await expect(harnessValue(page)).toHaveValue('777');
  });

  test('Clear empties the column and reopens entry', async ({ page }) => {
    const c = await openHarness(page, { value: 'secret123' });
    await c.clear.click();
    await expect(harnessValue(page)).toHaveValue('');
    await expect(c.entry).toBeVisible();
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
