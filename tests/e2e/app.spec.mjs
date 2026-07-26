import { Buffer } from 'node:buffer';

import { expect, openApp, selectFormat, test } from './fixtures.mjs';

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

test.describe('reduced motion', () => {
  test.use({ reducedMotion: 'reduce' });

  test('removes meaningful animation and transition movement', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await openApp(page);

    const motion = await page.evaluate(() => {
      const read = selector => {
        const style = getComputedStyle(document.querySelector(selector));
        return {
          animationDuration: style.animationDuration,
          animationIterationCount: style.animationIterationCount,
          transform: style.transform,
          transitionDuration: style.transitionDuration,
        };
      };
      return {
        preference: matchMedia('(prefers-reduced-motion: reduce)').matches,
        title: read('.title-switch'),
        panel: read('.tool-panel:not([hidden])'),
        action: read('.action-button'),
      };
    });

    expect(motion.preference).toBe(true);
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
  });
});
