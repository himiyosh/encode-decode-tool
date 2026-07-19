import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const indexHtml = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const ciWorkflow = fs.readFileSync(
  new URL('../.github/workflows/ci.yml', import.meta.url),
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
