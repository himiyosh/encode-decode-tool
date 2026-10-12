import { expect, test as base } from '@playwright/test';

import { APP_URL } from '../../playwright.config.mjs';

const APP_ORIGIN = new URL(APP_URL).origin;

const defineMemoryClipboard = () => {
  let clipboardText = '';
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: {
      writeText: async text => { clipboardText = text; },
      readText: async () => clipboardText,
    },
  });
};

export const test = base.extend({
  page: async ({ page }, use) => {
    if (process.env.PLAYWRIGHT_CLIPBOARD_STUB === '1') {
      await page.addInitScript(defineMemoryClipboard);
    }
    const consoleErrors = [];
    const pageErrors = [];
    const crossOriginRequests = [];

    page.on('console', message => {
      if (message.type() === 'error') consoleErrors.push(message.text());
    });
    page.on('pageerror', error => pageErrors.push(error.message));
    page.on('request', request => {
      const url = request.url();
      if (url.startsWith('blob:') || url.startsWith('data:')) return;
      if (new URL(url).origin !== APP_ORIGIN) {
        crossOriginRequests.push(`${request.method()} ${url}`);
      }
    });

    await use(page);

    expect(consoleErrors, 'browser console errors').toEqual([]);
    expect(pageErrors, 'uncaught browser errors').toEqual([]);
    expect(crossOriginRequests, 'cross-origin runtime requests').toEqual([]);
  },
});

export { expect } from '@playwright/test';
export const useMemoryClipboard = page => page.evaluate(defineMemoryClipboard);

export const openApp = async page => {
  await page.goto('./');
  await expect(page).toHaveURL(APP_URL);
  await expect(
    page.getByRole('heading', { level: 1, name: 'Encode and Decode' }),
  ).toBeVisible();
};

export const selectFormat = async (page, format) => {
  const tab = page.getByRole('tab', { name: format, exact: true });
  await tab.click();
  await expect(tab).toHaveAttribute('aria-selected', 'true');
  return page.locator(`#panel-${format.toLowerCase()}`);
};
