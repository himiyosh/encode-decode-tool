import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const indexHtml = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const appSource = fs.readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
const uiSource = [
  '../src/App.jsx',
  '../src/AppHeader.jsx',
  '../src/QrCodePanel.jsx',
  '../src/StatusMessage.jsx',
  '../src/TransformPanel.jsx',
  '../src/TransformTabs.jsx',
  '../src/format-config.jsx',
]
  .map(path => fs.readFileSync(new URL(path, import.meta.url), 'utf8'))
  .join('\n');
const transformPanelSource = fs.readFileSync(
  new URL('../src/TransformPanel.jsx', import.meta.url),
  'utf8',
);
const qrCodePanelSource = fs.readFileSync(
  new URL('../src/QrCodePanel.jsx', import.meta.url),
  'utf8',
);
const interfaceCss = fs.readFileSync(
  new URL('../src/index.css', import.meta.url),
  'utf8',
);
const tokenCss = fs.readFileSync(
  new URL('../src/tokens.css', import.meta.url),
  'utf8',
);
const packageJson = JSON.parse(
  fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
);
const postcssConfig = fs.readFileSync(
  new URL('../postcss.config.js', import.meta.url),
  'utf8',
);
const readme = fs.readFileSync(new URL('../README.md', import.meta.url), 'utf8');
const ciWorkflow = fs.readFileSync(
  new URL('../.github/workflows/ci.yml', import.meta.url),
  'utf8',
);
const codeqlWorkflow = fs.readFileSync(
  new URL('../.github/workflows/codeql.yml', import.meta.url),
  'utf8',
);
const dependabotConfig = fs.readFileSync(
  new URL('../.github/dependabot.yml', import.meta.url),
  'utf8',
);
const securityPolicy = fs.readFileSync(
  new URL('../.github/SECURITY.md', import.meta.url),
  'utf8',
);
const viteConfig = fs.readFileSync(
  new URL('../vite.config.js', import.meta.url),
  'utf8',
);
const playwrightConfig = fs.readFileSync(
  new URL('../playwright.config.mjs', import.meta.url),
  'utf8',
);

test('document enforces the local-only browser security contract', () => {
  const contentSecurityPolicy = indexHtml.match(
    /http-equiv="Content-Security-Policy"\s+content="([^"]+)"/,
  )?.[1];

  assert.ok(contentSecurityPolicy, 'Content-Security-Policy meta tag is required');
  for (const directive of [
    "default-src 'self'",
    "base-uri 'none'",
    "connect-src 'self'",
    "font-src 'self'",
    "form-action 'none'",
    "frame-src 'none'",
    "img-src 'self' data: blob:",
    "media-src 'none'",
    "object-src 'none'",
    "script-src 'self'",
    "style-src 'self'",
    "worker-src 'none'",
  ]) {
    assert.ok(
      contentSecurityPolicy.includes(directive),
      `Missing CSP directive: ${directive}`,
    );
  }
  assert.doesNotMatch(contentSecurityPolicy, /\*|'unsafe-(?:eval|inline)'/);
  assert.match(indexHtml, /<meta name="referrer" content="no-referrer"\s*\/>/);
});

test('workflows use immutable actions with least-privilege permissions', () => {
  const workflowDirectory = new URL('../.github/workflows/', import.meta.url);
  const workflows = fs
    .readdirSync(workflowDirectory)
    .filter(name => /\.ya?ml$/.test(name))
    .map(name => ({
      name,
      source: fs.readFileSync(new URL(name, workflowDirectory), 'utf8'),
    }));

  for (const { name, source: workflow } of workflows) {
    const actionReferences = [...workflow.matchAll(/uses:\s+([^\s#]+)/g)].map(
      match => match[1],
    );

    assert.ok(actionReferences.length > 0, `${name} must use an action`);
    for (const reference of actionReferences) {
      assert.match(reference, /^[^@\s]+@[a-f0-9]{40}$/);
    }
    assert.doesNotMatch(workflow, /\b(?:write-all|contents:\s+write)\b/);
  }

  assert.match(ciWorkflow, /permissions:\s*\n\s+contents:\s+read/);
  assert.match(
    codeqlWorkflow,
    /permissions:\s*\n\s+contents:\s+read\s*\n\s+security-events:\s+write/,
  );
});

test('CodeQL scans JavaScript and TypeScript without duplicating the CI build', () => {
  assert.match(codeqlWorkflow, /^on:\s*\n\s+push:\s*\n\s+branches:\s*\n\s+- main/m);
  assert.match(
    codeqlWorkflow,
    /\s+pull_request:\s*\n\s+branches:\s*\n\s+- main/,
  );
  assert.match(codeqlWorkflow, /\s+schedule:\s*\n\s+- cron: '[^']+'/);
  assert.match(codeqlWorkflow, /\s+workflow_dispatch:\s*$/m);
  assert.match(codeqlWorkflow, /timeout-minutes:\s+10/);
  assert.match(codeqlWorkflow, /languages:\s+javascript-typescript/);
  assert.match(codeqlWorkflow, /build-mode:\s+none/);
  assert.match(codeqlWorkflow, /github\/codeql-action\/init@[a-f0-9]{40}/);
  assert.match(codeqlWorkflow, /github\/codeql-action\/analyze@[a-f0-9]{40}/);
  assert.doesNotMatch(codeqlWorkflow, /\b(?:autobuild|npm|npx|pnpm|yarn)\b/);
});

test('security policy requires private, privacy-conscious disclosure', () => {
  assert.match(readme, /\.github\/SECURITY\.md/);
  assert.match(securityPolicy, /current version on the `main` branch/i);
  assert.match(securityPolicy, /security\/advisories\/new/);
  assert.match(securityPolicy, /Do not disclose[^.]+public issues/i);
  assert.match(securityPolicy, /reproducible steps/i);
  assert.match(securityPolicy, /security and privacy impact/i);
  assert.match(securityPolicy, /Remove real secrets, personal data/i);
  assert.match(securityPolicy, /locally in the browser/i);
  assert.match(securityPolicy, /unexpected network transmission/i);
});

test('all pull requests run the complete dependency validation gates', () => {
  assert.match(ciWorkflow, /^on:\s*\n\s+pull_request:\s*$/m);
  assert.match(ciWorkflow, /run:\s+npm ci --no-audit --no-fund/);
  assert.match(ciWorkflow, /run:\s+npm run verify/);
  assert.match(
    ciWorkflow,
    /run:\s+npx playwright install --with-deps chromium/,
  );
  assert.match(ciWorkflow, /run:\s+npm run test:e2e/);
  assert.match(ciWorkflow, /run:\s+git diff --exit-code -- docs/);
  assert.match(ciWorkflow, /run:\s+npm audit --audit-level=high/);
  assert.match(packageJson.scripts.verify, /\bnpm test\b/);
  assert.match(packageJson.scripts.verify, /\bnpm run check:lockfile\b/);
  assert.match(packageJson.scripts.verify, /\bnpm run check:customizations\b/);
  assert.match(packageJson.scripts.verify, /\bnpm run build\b/);
  assert.equal(packageJson.scripts['test:e2e'], 'playwright test');
  assert.match(packageJson.devDependencies['@playwright/test'], /^\^1\./);
  assert.match(playwrightConfig, /baseURL:\s*APP_URL/);
  assert.match(playwrightConfig, /\/encode-decode-tool\//);
  assert.match(playwrightConfig, /npm run build && npm run preview/);
  assert.match(playwrightConfig, /browserName:\s*['"]chromium['"]/);
  assert.equal(
    ciWorkflow.indexOf('npm run verify') <
      ciWorkflow.indexOf('npm run test:e2e'),
    true,
    'CI must build and verify before running the browser suite',
  );
  assert.match(viteConfig, /outDir:\s*['"]docs['"]/);
});

test('Dependabot groups compatible updates without grouping major migrations', () => {
  assert.match(
    dependabotConfig,
    /react-ecosystem:\s*\n\s+dependency-type:\s+production/,
  );
  for (const dependency of ['react', 'react-dom', 'lucide-react']) {
    assert.match(dependabotConfig, new RegExp(`^\\s+- ${dependency}$`, 'm'));
  }
  assert.match(
    dependabotConfig,
    /react-ecosystem:[\s\S]*?update-types:\s*\n\s+- minor\s*\n\s+- patch/,
  );
  assert.match(
    dependabotConfig,
    /development-tooling:\s*\n\s+dependency-type:\s+development[\s\S]*?update-types:\s*\n\s+- minor\s*\n\s+- patch/,
  );
  assert.doesNotMatch(dependabotConfig, /^\s+- major\s*$/m);
});

test('playful motion stays local, bounded, and reduced-motion safe', () => {
  const reducedMotionCss = interfaceCss.slice(
    interfaceCss.indexOf('@media (prefers-reduced-motion: reduce)'),
  );

  assert.doesNotMatch(`${indexHtml}\n${interfaceCss}\n${tokenCss}`, /https?:\/\//);
  assert.match(interfaceCss, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(interfaceCss, /\.tab-indicator/);
  assert.match(uiSource, /className="signal-stage"/);
  assert.doesNotMatch(interfaceCss, /transition-all|cursor:\s*url|parallax/i);
  assert.doesNotMatch(reducedMotionCss, /animation:[^;]*infinite/i);
});

test('workbench accessibility and responsive contracts stay explicit', () => {
  assert.match(uiSource, /role="tab"/);
  assert.match(uiSource, /aria-orientation="horizontal"/);
  assert.match(appSource, /focus\(\{ preventScroll: true \}\)/);
  assert.match(uiSource, /role="status"/);
  assert.match(uiSource, /aria-live="polite"/);
  assert.match(uiSource, /aria-errormessage=/);
  assert.doesNotMatch(uiSource, /role=\{[^}]*alert/);
  assert.doesNotMatch(`${uiSource}\n${interfaceCss}`, /success-burst|celebrationKey/);

  assert.match(interfaceCss, /html,\s*\nbody\s*\{[\s\S]*?overflow-x:\s*clip/);
  assert.doesNotMatch(
    interfaceCss,
    /\.app-shell\s*\{[^}]*overflow:\s*hidden/s,
  );
  assert.match(interfaceCss, /\.signal-stage\s*\{[\s\S]*?display:\s*none/);
  assert.match(
    interfaceCss,
    /@media \(min-width: 36rem\)[\s\S]*?\.signal-stage\s*\{\s*display:\s*block/,
  );
  assert.match(interfaceCss, /white-space:\s*nowrap/);
  assert.match(interfaceCss, /@media \(forced-colors: active\)/);
  assert.match(interfaceCss, /@media \(prefers-contrast: more\)/);
  assert.doesNotMatch(interfaceCss, /oklch\(/);
});

test('App stays the mounted-panel composition and keyboard ownership root', () => {
  assert.match(appSource, /const \[activeTab, setActiveTab\] = useState\('URL'\)/);
  assert.match(appSource, /focus\(\{ preventScroll: true \}\)/);
  assert.match(appSource, /\{tabs\.map\(tab =>/);
  assert.match(appSource, /<QrCodePanel key=\{tab\} hidden=\{activeTab !== tab\} \/>/);
  assert.match(
    appSource,
    /<TransformPanel key=\{tab\} type=\{tab\} hidden=\{activeTab !== tab\} \/>/,
  );
  assert.doesNotMatch(
    appSource,
    /encodeValue|decodeValue|getTransformErrorMessage|navigator\.clipboard/,
  );
  assert.doesNotMatch(
    appSource,
    /decodeRequestId|generateRequestId|pendingImageRef|inspectQrImage|import\(['"](?:qrcode|jsqr)['"]\)/,
  );
});

test('transform and QR implementations stay in their cohesive panel owners', () => {
  assert.match(transformPanelSource, /encodeValue\(type, input\)/);
  assert.match(transformPanelSource, /decodeValue\(type, input\)/);
  assert.match(transformPanelSource, /getTransformErrorMessage\(type, action, error\)/);
  assert.match(transformPanelSource, /navigator\.clipboard\.writeText\(output\)/);

  for (const marker of [
    'decodeRequestId',
    'generateRequestId',
    'pendingImageRef',
    'pendingImageUrlRef',
    'inspectQrImage',
    'qrImageDimensionsMatch',
    'getQrCanvasSize',
    "import('qrcode')",
    "import('jsqr')",
    'URL.revokeObjectURL',
    'navigator.clipboard.writeText(decoded)',
    'rel="noopener noreferrer"',
  ]) {
    assert.ok(qrCodePanelSource.includes(marker), `QR panel must own ${marker}`);
  }
});

test('Tailwind uses the v4 PostCSS integration and CSS entry point', () => {
  assert.match(packageJson.devDependencies.tailwindcss, /^\^4\./);
  assert.match(packageJson.devDependencies['@tailwindcss/postcss'], /^\^4\./);
  assert.equal(packageJson.devDependencies.autoprefixer, undefined);
  assert.match(postcssConfig, /['"]@tailwindcss\/postcss['"]\s*:/);
  assert.doesNotMatch(postcssConfig, /\b(?:tailwindcss|autoprefixer)\s*:/);
  assert.match(interfaceCss, /^@import "tailwindcss" source\(none\);/);
  assert.match(interfaceCss, /@source "\.\.\/index\.html";/);
  assert.match(interfaceCss, /@source "\.\/";/);
  assert.doesNotMatch(interfaceCss, /@tailwind\s+(?:base|components|utilities)/);
  assert.equal(
    fs.existsSync(new URL('../tailwind.config.js', import.meta.url)),
    false,
  );
});

test('README exposes both repository agents', () => {
  assert.match(readme, /\.github\/agents\/EncodeDecodeAgent\.agent\.md/);
  assert.match(readme, /\.github\/agents\/PlayfulWorkbenchAgent\.agent\.md/);
});
