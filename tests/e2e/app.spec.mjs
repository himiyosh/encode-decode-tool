import { Buffer } from 'node:buffer';

import { expect, openApp, selectFormat, test, useMemoryClipboard } from './fixtures.mjs';

const holdClipboardWrites = page => page.evaluate(() => {
  window.pendingClipboardWrites = [];
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: {
      writeText: text => new Promise((resolve, reject) => {
        window.pendingClipboardWrites.push({ text, resolve, reject });
      }),
    },
  });
});

const settleClipboardWrite = (page, index, outcome) => page.evaluate(async args => {
  const request = window.pendingClipboardWrites[args.index];
  if (args.outcome === 'reject') request.reject(new Error('clipboard denied'));
  else request.resolve();
  await new Promise(resolve => setTimeout(resolve, 0));
}, { index, outcome });

const transformCases = [
  {
    format: 'URL',
    inputLabel: 'URL text',
    outputLabel: 'URL result',
    example: 'https://example.com/a path?x=1',
    encoded: 'https%3A%2F%2Fexample.com%2Fa%20path%3Fx%3D1',
    invalid: '%E0%A4%A',
    error: /not valid percent-encoded content/,
  },
  {
    format: 'Base64',
    inputLabel: 'UTF-8 text or Base64',
    outputLabel: 'Base64 result',
    example: 'Hello 👋 世界',
    encoded: 'SGVsbG8g8J+RiyDkuJbnlYw=',
    invalid: 'abcde',
    error: /not valid Base64/,
  },
  {
    format: 'Unicode',
    inputLabel: 'Text or Unicode code points',
    outputLabel: 'Unicode result',
    example: 'Hello 👋',
    encoded: '72 101 108 108 111 32 128075',
    invalid: '55296',
    error: /decimal Unicode code points/,
  },
];

test('loads the production app at its Pages base with local-only copy visible', async ({
  page,
}) => {
  await openApp(page);

  await expect(page).toHaveTitle('Encode / Decode Tool');
  await expect(
    page.getByText('Every byte stays in this browser.'),
  ).toBeVisible();
  await expect(
    page.getByText('Local-only by design. Nothing is uploaded.'),
  ).toBeVisible();
  await expect(page.getByRole('status')).toContainText(
    'Empty input is valid',
  );

  const assetPaths = await page
    .locator('link[rel="stylesheet"], script[src]')
    .evaluateAll(elements => elements.map(element => element.href || element.src));
  expect(assetPaths.length).toBeGreaterThan(0);
  for (const assetPath of assetPaths) {
    expect(new URL(assetPath).pathname).toMatch(
      /^\/encode-decode-tool\/assets\//,
    );
  }

  const policy = await page
    .locator('meta[http-equiv="Content-Security-Policy"]')
    .getAttribute('content');
  expect(policy).toContain("connect-src 'self'");
  expect(policy).not.toMatch(/unsafe-(?:eval|inline)/);
});

for (const transformCase of transformCases) {
  test(`${transformCase.format} example round-trips and exposes decode errors`, async ({
    page,
  }) => {
    await openApp(page);
    const panel = await selectFormat(page, transformCase.format);
    const input = panel.getByLabel(transformCase.inputLabel);
    const output = panel.getByLabel(transformCase.outputLabel);

    await panel.getByRole('button', { name: 'Try example' }).click();
    await expect(input).toHaveValue(transformCase.example);
    await panel.getByRole('button', { name: 'Encode', exact: true }).click();
    await expect(output).toHaveValue(transformCase.encoded);

    await panel.getByRole('button', { name: 'Use as input' }).click();
    await expect(input).toBeFocused();
    await panel.getByRole('button', { name: 'Decode', exact: true }).click();
    await expect(output).toHaveValue(transformCase.example);

    await input.fill(transformCase.invalid);
    await panel.getByRole('button', { name: 'Decode', exact: true }).click();
    await expect(panel.getByRole('status')).toContainText(transformCase.error);
    await expect(input).toHaveAttribute('aria-invalid', 'true');
    await expect(output).toHaveValue('');
  });
}

test('JWT example assembles, decodes, and clearly reports authenticity and errors', async ({
  page,
}) => {
  await openApp(page);
  const panel = await selectFormat(page, 'JWT');
  const input = panel.getByLabel('JWT JSON or compact token');
  const output = panel.getByLabel('JWT result');

  await panel.getByRole('button', { name: 'Try example' }).click();
  await expect(input).toHaveValue(
    '{"header":{"alg":"none"},"payload":{"sub":"123","name":"Ada"}}',
  );
  await panel.getByRole('button', { name: 'Encode', exact: true }).click();
  await expect(output).toHaveValue(
    'eyJhbGciOiJub25lIn0.eyJzdWIiOiIxMjMiLCJuYW1lIjoiQWRhIn0.',
  );
  await expect(panel.getByRole('status')).toContainText(
    'Unsigned JWT assembled.',
  );

  await panel.getByRole('button', { name: 'Use as input' }).click();
  await panel.getByRole('button', { name: 'Decode', exact: true }).click();
  await expect(panel.getByRole('status')).toContainText(
    'Its signature was not verified.',
  );
  const decoded = JSON.parse(await output.inputValue());
  expect(decoded).toEqual({
    header: { alg: 'none' },
    payload: { sub: '123', name: 'Ada' },
    signature: '',
  });

  await input.fill('not.a.jwt');
  await panel.getByRole('button', { name: 'Decode', exact: true }).click();
  await expect(panel.getByRole('status')).toContainText(
    /malformed|invalid Base64URL/,
  );
  await expect(input).toHaveAttribute('aria-invalid', 'true');
});

test('stale results block one-click actions while current results can be copied', async ({
  page,
}) => {
  await openApp(page);
  const panel = page.locator('#panel-url');
  const input = panel.getByLabel('URL text');
  const output = panel.getByLabel('URL result');
  const copy = panel.getByRole('button', { name: 'Copy', exact: true });

  await input.fill('hello world');
  await panel.getByRole('button', { name: 'Encode', exact: true }).click();
  await expect(output).toHaveValue('hello%20world');
  await expect(copy).toBeEnabled();
  await copy.click();
  await expect(panel.getByRole('status')).toContainText(
    'Output copied to the clipboard.',
  );
  await expect
    .poll(() => page.evaluate(() => navigator.clipboard.readText()))
    .toBe('hello%20world');

  await input.fill('changed');
  const status = panel.getByRole('status');
  const staleMessage = 'Input changed. Transform again to update the output.';
  await expect(status).toContainText(staleMessage);
  await expect(copy).toBeDisabled();
  const useAsInput = panel.getByRole('button', { name: 'Use as input' });
  await expect(useAsInput).toBeDisabled();
  await expect(useAsInput).toHaveJSProperty('disabled', true);
  await expect(output).toHaveAttribute('data-stale', 'true');

  await expect(copy).toBeDisabled();
  await expect(input).toHaveValue('changed');
  await expect(output).toHaveValue('hello%20world');
  await expect(output).toHaveAttribute('data-stale', 'true');
  await expect(status).toContainText(staleMessage);
});

test('format tabs implement Arrow, Home, End, wrap, and focus semantics', async ({
  page,
}) => {
  await openApp(page);
  const url = page.getByRole('tab', { name: 'URL', exact: true });
  const base64 = page.getByRole('tab', { name: 'Base64', exact: true });
  const qr = page.getByRole('tab', { name: 'QR', exact: true });

  await url.focus();
  await page.keyboard.press('ArrowRight');
  await expect(base64).toBeFocused();
  await expect(base64).toHaveAttribute('aria-selected', 'true');

  await page.keyboard.press('End');
  await expect(qr).toBeFocused();
  await expect(qr).toHaveAttribute('aria-selected', 'true');

  await page.keyboard.press('Home');
  await expect(url).toBeFocused();
  await page.keyboard.press('ArrowLeft');
  await expect(qr).toBeFocused();
  await expect(qr).toHaveAttribute('tabindex', '0');
  await expect(url).toHaveAttribute('tabindex', '-1');
});

test('format panels stay mounted and preserve per-tab state', async ({ page }) => {
  await openApp(page);
  const panels = page.getByRole('tabpanel', { includeHidden: true });
  const urlPanel = page.locator('#panel-url');
  const base64Panel = page.locator('#panel-base64');

  await expect(panels).toHaveCount(5);
  await urlPanel.getByLabel('URL text').fill('persistent URL input');
  await selectFormat(page, 'Base64');
  await base64Panel.getByLabel('UTF-8 text or Base64').fill('persistent Base64 input');

  await expect(urlPanel).toHaveAttribute('hidden', '');
  await expect(base64Panel).not.toHaveAttribute('hidden', '');
  await selectFormat(page, 'URL');
  await expect(urlPanel.getByLabel('URL text')).toHaveValue('persistent URL input');
  await selectFormat(page, 'Base64');
  await expect(base64Panel.getByLabel('UTF-8 text or Base64')).toHaveValue(
    'persistent Base64 input',
  );
});

test('QR generation downloads, round-trips locally, and reports deterministic limits', async ({
  page,
}) => {
  await openApp(page);
  const panel = await selectFormat(page, 'QR');
  const text = panel.getByLabel('Text to encode');
  const generatedValue = 'https://example.com/local-only';

  await text.fill(generatedValue);
  await panel.getByRole('button', { name: 'Generate QR' }).click();
  const image = panel.getByRole('img', { name: 'Generated QR code' });
  await expect(image).toBeVisible();
  const download = panel.getByRole('link', { name: 'Download QR' });
  await expect(download).toHaveAttribute('download', 'qr-code.png');
  await expect(download).toHaveAttribute('href', /^data:image\/png;base64,/);

  const dataUrl = await image.getAttribute('src');
  const qrBuffer = Buffer.from(dataUrl.split(',')[1], 'base64');
  await panel.getByLabel('QR image').setInputFiles({
    name: 'generated-qr.png',
    mimeType: 'image/png',
    buffer: qrBuffer,
  });
  await expect(panel.getByRole('status')).toContainText(
    'QR code decoded locally.',
  );
  await expect(panel.getByLabel('Decoded text')).toHaveValue(generatedValue);
  await expect(
    panel.getByRole('link', { name: 'Open decoded URL' }),
  ).toHaveAttribute('rel', 'noopener noreferrer');

  await text.fill(`${generatedValue}/changed`);
  await expect(download).toHaveCount(0);
  await expect(panel.getByText('Out of date')).toBeVisible();

  await text.fill('A'.repeat(5_000));
  await panel.getByRole('button', { name: 'Generate QR' }).click();
  await expect(panel.getByRole('status')).toContainText(
    'too long for one QR code',
  );

  await panel.getByLabel('QR image').setInputFiles({
    name: 'not-an-image.png',
    mimeType: 'image/png',
    buffer: Buffer.from('not an image'),
  });
  await expect(panel.getByRole('status')).toContainText(
    'not a supported PNG, JPEG, GIF, or WebP image',
  );
});

test('320px layout has no horizontal overflow and keeps tap targets usable', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await openApp(page);

  const layout = await page.evaluate(() => {
    const targets = [
      ...document.querySelectorAll(
        'button, input[type="file"], a.action-button',
      ),
    ]
      .filter(element => !element.closest('[hidden]') && element.getClientRects().length)
      .map(element => ({
        label:
          element.getAttribute('aria-label') ||
          element.textContent?.trim() ||
          element.id,
        width: element.getBoundingClientRect().width,
        height: element.getBoundingClientRect().height,
      }));
    return {
      viewportWidth: document.documentElement.clientWidth,
      documentWidth: document.documentElement.scrollWidth,
      bodyWidth: document.body.scrollWidth,
      undersized: targets.filter(
        target => target.width < 44 || target.height < 44,
      ),
    };
  });

  expect(layout.documentWidth).toBeLessThanOrEqual(layout.viewportWidth);
  expect(layout.bodyWidth).toBeLessThanOrEqual(layout.viewportWidth);
  expect(layout.undersized).toEqual([]);
});

test('Base64 preserves leading, repeated, middle and trailing BOM text', async ({ page }) => {
  await openApp(page);
  const panel = await selectFormat(page, 'Base64');
  const input = panel.getByLabel('UTF-8 text or Base64');
  const output = panel.getByLabel('Base64 result');
  for (const value of ['\ufeff', '\ufeffA', '\ufeff\ufeff世界', 'A\ufeffB', 'A\ufeff']) {
    await input.fill(value);
    await panel.getByRole('button', { name: 'Encode', exact: true }).click();
    await panel.getByRole('button', { name: 'Use as input', exact: true }).click();
    await panel.getByRole('button', { name: 'Decode', exact: true }).click();
    await expect(output).toHaveValue(value);
  }
});

test('new transforms clear copied feedback and cancel its old reset timer', async ({ page }) => {
  await openApp(page);
  await useMemoryClipboard(page);
  await page.clock.install({ time: new Date('2026-01-01T00:00:00Z') });
  await page.clock.pauseAt(new Date('2026-01-01T00:00:01Z'));
  const panel = page.locator('#panel-url');
  const input = panel.getByLabel('URL text');
  const output = panel.getByLabel('URL result');
  const copy = panel.locator('.copy-button');
  await input.fill('%2F');
  await panel.getByRole('button', { name: 'Decode', exact: true }).click();
  await copy.click();
  await expect(copy).toHaveAttribute('data-state', 'copied');
  await page.clock.fastForward(2000);
  await panel.getByRole('button', { name: 'Encode', exact: true }).click();
  await expect(output).toHaveValue('%252F');
  await expect(copy).toHaveAttribute('data-state', 'idle');
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe('/');
  await copy.click();
  await expect(copy).toHaveAttribute('data-state', 'copied');
  await page.clock.fastForward(600);
  await expect(copy).toHaveAttribute('data-state', 'copied');
  await page.clock.fastForward(2000);
  await expect(copy).toHaveAttribute('data-state', 'idle');
});

for (const outcome of ['resolve', 'reject']) {
  test(`old clipboard ${outcome} cannot overwrite a new result`, async ({ page }) => {
    await openApp(page);
    await holdClipboardWrites(page);
    const panel = page.locator('#panel-url');
    const input = panel.getByLabel('URL text');
    const copy = panel.locator('.copy-button');
    await input.fill('original value');
    await panel.getByRole('button', { name: 'Encode', exact: true }).click();
    await copy.click();
    await input.fill('new value');
    await panel.getByRole('button', { name: 'Encode', exact: true }).click();
    const currentStatus = await panel.getByRole('status').innerText();
    await settleClipboardWrite(page, 0, outcome);
    await expect(panel.getByLabel('URL result')).toHaveValue('new%20value');
    await expect(copy).toHaveAttribute('data-state', 'idle');
    await expect(panel.getByRole('status')).toHaveText(currentStatus);

    await copy.click();
    await settleClipboardWrite(page, 1, outcome);
    if (outcome === 'resolve') {
      await expect(copy).toHaveAttribute('data-state', 'copied');
      await expect(panel.getByRole('status')).toContainText('Output copied');
    } else {
      await expect(panel.getByRole('status')).toContainText('browser blocked clipboard access');
      await expect(copy).toHaveAttribute('data-state', 'idle');
    }
  });
}

test('input restored to its original value still invalidates an old copy', async ({ page }) => {
  await openApp(page);
  await holdClipboardWrites(page);
  const panel = page.locator('#panel-url');
  const input = panel.getByLabel('URL text');
  const copy = panel.locator('.copy-button');
  await input.fill('original');
  await panel.getByRole('button', { name: 'Encode', exact: true }).click();
  await copy.click();
  await input.fill('changed');
  await input.fill('original');
  await panel.getByRole('button', { name: 'Encode', exact: true }).click();
  const status = await panel.getByRole('status').innerText();
  await settleClipboardWrite(page, 0, 'resolve');
  await expect(copy).toHaveAttribute('data-state', 'idle');
  await expect(panel.getByRole('status')).toHaveText(status);
});

test('earlier copies cannot overwrite the latest copy failure', async ({ page }) => {
  await openApp(page);
  await holdClipboardWrites(page);
  const panel = page.locator('#panel-url');
  await panel.getByLabel('URL text').fill('value');
  await panel.getByRole('button', { name: 'Encode', exact: true }).click();
  await panel.locator('.copy-button').click();
  await panel.locator('.copy-button').click();
  await settleClipboardWrite(page, 1, 'reject');
  await expect(panel.getByRole('status')).toContainText('browser blocked clipboard access');
  const status = await panel.getByRole('status').innerText();
  await settleClipboardWrite(page, 0, 'resolve');
  await expect(panel.locator('.copy-button')).toHaveAttribute('data-state', 'idle');
  await expect(panel.getByRole('status')).toHaveText(status);
});

test('old QR capacity errors do not invalidate edited text and generation recovers', async ({ page }) => {
  await openApp(page);
  let releaseImport;
  let holdObserved;
  const held = new Promise(resolve => { holdObserved = resolve; });
  const released = new Promise(resolve => { releaseImport = resolve; });
  await page.route('**/assets/browser-*.js', async route => {
    holdObserved();
    await released;
    await route.continue();
  });
  const panel = await selectFormat(page, 'QR');
  const input = panel.getByLabel('Text to encode');
  const generate = panel.getByRole('button', { name: 'Generate QR', exact: true });
  await input.fill('a'.repeat(4000));
  await generate.click();
  await held;
  await input.fill('valid');
  releaseImport();
  await expect(generate).toBeEnabled();
  await expect(input).not.toHaveAttribute('aria-invalid', 'true');
  await expect(panel.getByRole('status')).toContainText('Ready to generate.');
  await generate.click();
  await expect(panel.getByRole('img', { name: 'Generated QR code', exact: true })).toBeVisible();
  await expect(panel.getByRole('status')).toContainText('QR code generated');
  await input.fill('a'.repeat(4000));
  await generate.click();
  await expect(panel.getByRole('status')).toContainText('too long for one QR code');
  await expect(input).toHaveAttribute('aria-invalid', 'true');
});

for (const outcome of ['resolve', 'reject']) {
  test(`old QR clipboard ${outcome} cannot overwrite a new file error`, async ({ page }) => {
    await openApp(page);
    await holdClipboardWrites(page);
    const panel = await selectFormat(page, 'QR');
    await panel.getByLabel('Text to encode').fill('local decoded text');
    await panel.getByRole('button', { name: 'Generate QR', exact: true }).click();
    const image = panel.getByRole('img', { name: 'Generated QR code', exact: true });
    await expect(image).toBeVisible();
    const dataUrl = await image.getAttribute('src');
    await panel.getByLabel('QR image').setInputFiles({
      name: 'valid.png', mimeType: 'image/png',
      buffer: Buffer.from(dataUrl.split(',')[1], 'base64'),
    });
    await expect(panel.getByLabel('Decoded text')).toHaveValue('local decoded text');
    await panel.getByRole('button', { name: 'Copy decoded text', exact: true }).click();
    await panel.getByLabel('QR image').setInputFiles({
      name: 'invalid.png', mimeType: 'image/png', buffer: Buffer.from('not an image'),
    });
    await expect(panel.getByRole('status')).toContainText('not a supported PNG');
    const status = await panel.getByRole('status').innerText();
    await settleClipboardWrite(page, 0, outcome);
    await expect(panel.getByLabel('Decoded text')).toHaveValue('');
    await expect(panel.getByRole('status')).toHaveText(status);
    await expect(panel.getByRole('button', { name: 'Copy decoded text', exact: true })).toBeDisabled();
  });
}

test.describe('reduced motion', () => {
  test.use({ reducedMotion: 'reduce' });

  for (const width of [320, 375, 414, 768, 1280]) {
    test(`removes meaningful motion at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await openApp(page);

      const motion = await page.evaluate(() => {
        const read = selector => {
          const style = getComputedStyle(document.querySelector(selector));
          return {
            animationName: style.animationName,
            animationDuration: style.animationDuration,
            animationIterationCount: style.animationIterationCount,
            opacity: style.opacity,
            transform: style.transform,
            transitionDuration: style.transitionDuration,
          };
        };
        return {
          preference: matchMedia('(prefers-reduced-motion: reduce)').matches,
          title: read('.title-switch'),
          stage: read('.signal-stage'),
          buddy: read('.signal-buddy'),
          panel: read('.tool-panel:not([hidden])'),
          action: read('.action-button'),
        };
      });

      expect(motion.preference).toBe(true);
      for (const element of [motion.title, motion.stage, motion.buddy, motion.panel]) {
        expect(element.animationName).toBe('none');
        expect(element.opacity).toBe('1');
      }
      expect(motion.title.animationIterationCount).toBe('1');
      expect(['none', 'matrix(1, 0, 0, 1, 0, 0)']).toContain(
        motion.title.transform,
      );
      expect(['none', 'matrix(1, 0, 0, 1, 0, 0)']).toContain(
        motion.panel.transform,
      );
      expect(Number.parseFloat(motion.action.transitionDuration)).toBeLessThanOrEqual(
        0.001,
      );

      const stage = page.locator('.signal-stage');
      if (await stage.isVisible()) {
        const alignment = await page.locator('.signal-buddy').evaluate(element => {
          const buddy = element.getBoundingClientRect();
          const container = element.parentElement.getBoundingClientRect();
          return {
            x: buddy.x + buddy.width / 2 - (container.x + container.width / 2),
            y: buddy.y + buddy.height / 2 - (container.y + container.height / 2),
          };
        });
        expect(Math.abs(alignment.x)).toBeLessThanOrEqual(1);
        expect(Math.abs(alignment.y)).toBeLessThanOrEqual(1);
      }

      const panel = await selectFormat(page, 'QR');
      await panel.getByRole('button', { name: 'Try example', exact: true }).click();
      await panel.getByRole('button', { name: 'Generate QR', exact: true }).click();
      const qr = panel.locator('.qr-preview img');
      await expect(qr).toBeVisible();
      const qrMotion = await qr.evaluate(element => {
        const style = getComputedStyle(element);
        return { animationName: style.animationName, opacity: style.opacity };
      });
      expect(qrMotion).toEqual({ animationName: 'none', opacity: '1' });

      const layout = await page.evaluate(() => ({
        documentWidth: document.documentElement.scrollWidth,
        bodyWidth: document.body.scrollWidth,
        viewportWidth: innerWidth,
      }));
      expect(layout.documentWidth).toBeLessThanOrEqual(layout.viewportWidth);
      expect(layout.bodyWidth).toBeLessThanOrEqual(layout.viewportWidth);
    });
  }
});
