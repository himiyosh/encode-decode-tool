import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const indexHtml = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const appSource = fs.readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
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
const dependabotConfig = fs.readFileSync(
  new URL('../.github/dependabot.yml', import.meta.url),
  'utf8',
);
const viteConfig = fs.readFileSync(
  new URL('../vite.config.js', import.meta.url),
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

test('CI uses immutable actions with least-privilege permissions', () => {
  const actionReferences = [...ciWorkflow.matchAll(/uses:\s+([^\s#]+)/g)].map(
    match => match[1],
  );

  assert.ok(actionReferences.length > 0, 'CI must use at least one action');
  for (const reference of actionReferences) {
    assert.match(reference, /^[^@\s]+@[a-f0-9]{40}$/);
  }
  assert.match(ciWorkflow, /permissions:\s*\n\s+contents:\s+read/);
});

test('all pull requests run the complete dependency validation gates', () => {
  assert.match(ciWorkflow, /^on:\s*\n\s+pull_request:\s*$/m);
  assert.match(ciWorkflow, /run:\s+npm ci --no-audit --no-fund/);
  assert.match(ciWorkflow, /run:\s+npm run verify/);
  assert.match(ciWorkflow, /run:\s+git diff --exit-code -- docs/);
  assert.match(ciWorkflow, /run:\s+npm audit --audit-level=high/);
  assert.match(packageJson.scripts.verify, /\bnpm test\b/);
  assert.match(packageJson.scripts.verify, /\bnpm run check:lockfile\b/);
  assert.match(packageJson.scripts.verify, /\bnpm run check:customizations\b/);
  assert.match(packageJson.scripts.verify, /\bnpm run build\b/);
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
  assert.match(interfaceCss, /\.success-burst/);
  assert.match(interfaceCss, /\.tab-indicator/);
  assert.match(appSource, /className="signal-stage"/);
  assert.doesNotMatch(interfaceCss, /transition-all|cursor:\s*url|parallax/i);
  assert.doesNotMatch(reducedMotionCss, /animation:[^;]*infinite/i);
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
