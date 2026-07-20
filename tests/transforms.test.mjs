import test from 'node:test';
import assert from 'node:assert/strict';

import { getQrCanvasSize } from '../src/qr-image.mjs';
import { decodeValue, encodeValue } from '../src/transforms.mjs';

test('URL and UTF-8 Base64 round-trip non-ASCII text', () => {
  const value = 'Hello 👋 世界 /?';

  assert.equal(decodeValue('URL', encodeValue('URL', value)), value);
  assert.equal(decodeValue('Base64', encodeValue('Base64', value)), value);
});

test('Base64 accepts unpadded and wrapped input', () => {
  assert.equal(decodeValue('Base64', 'SGVsbG8g8J+Riw'), 'Hello 👋');
  assert.equal(decodeValue('Base64', 'SGVs\nbG8='), 'Hello');
});

test('Base64 handles long input without argument or stack limits', () => {
  const value = 'Hello 👋 世界 '.repeat(10_000);
  assert.equal(decodeValue('Base64', encodeValue('Base64', value)), value);
});

test('Base64 rejects malformed, non-canonical, and invalid UTF-8 input', () => {
  assert.throws(() => decodeValue('Base64', 'abcde'), /invalid-base64/);
  assert.throws(() => decodeValue('Base64', 'Zg='), /invalid-base64/);
  assert.throws(() => decodeValue('Base64', 'Zh=='), /invalid-base64/);
  assert.throws(() => decodeValue('Base64', '/w=='), /invalid-utf8/);
});

test('Unicode conversion preserves scalar values and rejects surrogates', () => {
  const encoded = encodeValue('Unicode', 'A👋');

  assert.equal(encoded, '65 128075');
  assert.equal(decodeValue('Unicode', encoded), 'A👋');
  assert.throws(() => encodeValue('Unicode', '\ud800'), /invalid-unicode-text/);
  assert.throws(() => decodeValue('Unicode', '55296'), /invalid-code-point/);
});

test('JWT encoding only assembles explicitly unsecured tokens', () => {
  const input = JSON.stringify({
    header: { alg: 'none', typ: 'JWT' },
    payload: { sub: '123', name: '世界' },
  });
  const token = encodeValue('JWT', input);
  const decoded = JSON.parse(decodeValue('JWT', token));

  assert.deepEqual(decoded.header, { alg: 'none', typ: 'JWT' });
  assert.deepEqual(decoded.payload, { sub: '123', name: '世界' });
  assert.equal(decoded.signature, '');
  assert.throws(
    () =>
      encodeValue(
        'JWT',
        JSON.stringify({ header: { alg: 'HS256' }, payload: {} }),
      ),
    /invalid-jwt-json/,
  );
});

test('JWT decoding validates segment JSON, algorithms, and signatures', () => {
  const signed = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjMifQ.c2ln';
  assert.equal(JSON.parse(decodeValue('JWT', signed)).signature, 'c2ln');

  assert.throws(
    () => decodeValue('JWT', 'eyJhbGciOiJub25lIn0.e30.c2ln'),
    /invalid-jwt/,
  );
  assert.throws(
    () => decodeValue('JWT', 'eyJhbGciOiJIUzI1NiJ9.e30.'),
    /invalid-jwt/,
  );
  assert.throws(
    () => decodeValue('JWT', 'eyJhbGciOiJIUzI1NiJ9.e30.a'),
    /invalid-base64/,
  );
  assert.throws(
    () => decodeValue('JWT', 'eyJhbGciOiJub25lIn0.W10.'),
    /invalid-jwt-json/,
  );
});

test('QR canvas sizing bounds decoded pixel memory', () => {
  assert.deepEqual(getQrCanvasSize(800, 600), { width: 800, height: 600 });
  assert.deepEqual(getQrCanvasSize(8000, 3000), {
    width: 2048,
    height: 768,
  });
  assert.throws(
    () => getQrCanvasSize(8000, 4000),
    /image-dimensions-too-large/,
  );
});
