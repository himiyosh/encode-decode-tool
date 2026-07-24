import test from 'node:test';
import assert from 'node:assert/strict';

import {
  getQrCanvasSize,
  inspectQrImage,
  isQrCapacityError,
  MAX_QR_IMAGE_BYTES,
  qrImageDimensionsMatch,
} from '../src/qr-image.mjs';
import { getTransformErrorMessage } from '../src/transform-errors.mjs';
import { decodeValue, encodeValue } from '../src/transforms.mjs';

const writeUint16 = (bytes, offset, value, littleEndian = false) => {
  bytes[offset + (littleEndian ? 0 : 1)] = value & 0xff;
  bytes[offset + (littleEndian ? 1 : 0)] = value >>> 8;
};

const writeUint24LittleEndian = (bytes, offset, value) => {
  bytes[offset] = value & 0xff;
  bytes[offset + 1] = (value >>> 8) & 0xff;
  bytes[offset + 2] = (value >>> 16) & 0xff;
};

const writeUint32 = (bytes, offset, value, littleEndian = false) => {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  view.setUint32(offset, value, littleEndian);
};

const makePngHeader = (width, height) => {
  const bytes = new Uint8Array(24);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  writeUint32(bytes, 8, 13);
  bytes.set([0x49, 0x48, 0x44, 0x52], 12);
  writeUint32(bytes, 16, width);
  writeUint32(bytes, 20, height);
  return bytes;
};

const makeGifHeader = (width, height) => {
  const bytes = new Uint8Array(10);
  bytes.set([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]);
  writeUint16(bytes, 6, width, true);
  writeUint16(bytes, 8, height, true);
  return bytes;
};

const makeJpegHeader = (width, height) => {
  const bytes = new Uint8Array(21);
  bytes.set([0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 0x08]);
  writeUint16(bytes, 7, height);
  writeUint16(bytes, 9, width);
  return bytes;
};

const makeWebpHeader = (width, height) => {
  const bytes = new Uint8Array(30);
  bytes.set([0x52, 0x49, 0x46, 0x46]);
  writeUint32(bytes, 4, bytes.length - 8, true);
  bytes.set([0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x58], 8);
  writeUint32(bytes, 16, 10, true);
  writeUint24LittleEndian(bytes, 24, width - 1);
  writeUint24LittleEndian(bytes, 27, height - 1);
  return bytes;
};

const makeJwt = (header, payload, signature = '') =>
  `${Buffer.from(header).toString('base64url')}.${Buffer.from(payload).toString('base64url')}.${signature}`;

test('URL and UTF-8 Base64 round-trip non-ASCII text', () => {
  const value = 'Hello 👋 世界 /?';

  assert.equal(decodeValue('URL', encodeValue('URL', value)), value);
  assert.equal(decodeValue('Base64', encodeValue('Base64', value)), value);
});

test('URL and UTF-8 Base64 reject unmatched surrogates before lossy encoding', () => {
  assert.throws(() => encodeValue('URL', '\ud800'), /invalid-unicode-text/);
  assert.throws(() => encodeValue('Base64', '\udc00'), /invalid-unicode-text/);
});

test('Base64 and Unicode round-trip empty input', () => {
  assert.equal(encodeValue('Base64', ''), '');
  assert.equal(decodeValue('Base64', ''), '');
  assert.equal(decodeValue('Base64', ' \r\n\t'), '');
  assert.equal(encodeValue('Unicode', ''), '');
  assert.equal(decodeValue('Unicode', ''), '');
  assert.equal(decodeValue('Unicode', ' \r\n\t'), '');
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
  assert.throws(() => decodeValue('Base64', 'SGVs\u00a0bG8='), /invalid-base64/);
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

test('JWT rejects JSON values that would be silently changed', () => {
  for (const value of [
    '9007199254740993',
    '0.1234567890123456789',
    '1e400',
    '1e-400',
    '-0',
  ]) {
    const input = `{"header":{"alg":"none"},"payload":{"value":${value}}}`;
    assert.throws(() => encodeValue('JWT', input), /invalid-jwt-number/);
  }

  const token = makeJwt(
    '{"alg":"none"}',
    '{"value":9007199254740993}',
  );
  assert.throws(() => decodeValue('JWT', token), /invalid-jwt-number/);
});

test('JWT preserves precisely representable JSON numbers', () => {
  const input =
    '{"header":{"alg":"none"},"payload":{"integer":9007199254740992,"decimal":0.125,"exponent":1e3}}';
  const decoded = JSON.parse(decodeValue('JWT', encodeValue('JWT', input)));

  assert.deepEqual(decoded.payload, {
    integer: 9007199254740992,
    decimal: 0.125,
    exponent: 1000,
  });
});

test('JWT preserves canonical large numbers without rewriting their text', () => {
  const input =
    '{"header":{"alg":"none"},"payload":{"value":1000000000000000100}}';
  const decoded = decodeValue('JWT', encodeValue('JWT', input));

  assert.match(decoded, /"value": 1000000000000000100/);
  assert.throws(
    () =>
      encodeValue(
        'JWT',
        '{"header":{"alg":"none"},"payload":{"value":1000000000000000128}}',
      ),
    /invalid-jwt-number/,
  );
});

test('JWT rejects unmatched surrogates in values and property names', () => {
  for (const input of [
    '{"header":{"alg":"none"},"payload":{"value":"\\ud800"}}',
    '{"header":{"alg":"none"},"payload":{"\\udc00":"value"}}',
  ]) {
    assert.throws(() => encodeValue('JWT', input), /invalid-jwt-unicode/);
  }

  const token = makeJwt('{"alg":"none"}', '{"value":"\\ud800"}');
  assert.throws(() => decodeValue('JWT', token), /invalid-jwt-unicode/);
});

test('JWT handles wide payload arrays without argument limits', () => {
  const input = JSON.stringify({
    header: { alg: 'none' },
    payload: { values: Array(150_000).fill(true) },
  });
  const decoded = JSON.parse(decodeValue('JWT', encodeValue('JWT', input)));

  assert.equal(decoded.payload.values.length, 150_000);
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

test('QR image inspection recognizes supported signatures without MIME metadata', () => {
  for (const [bytes, expected] of [
    [makePngHeader(800, 600), { type: 'image/png', width: 800, height: 600 }],
    [makeGifHeader(320, 240), { type: 'image/gif', width: 320, height: 240 }],
    [makeJpegHeader(640, 480), { type: 'image/jpeg', width: 640, height: 480 }],
    [makeWebpHeader(1024, 512), { type: 'image/webp', width: 1024, height: 512 }],
  ]) {
    const { type, width, height } = inspectQrImage(bytes);
    assert.deepEqual({ type, width, height }, expected);
  }
});

test('QR image inspection rejects malformed headers and unsafe dimensions early', () => {
  assert.throws(
    () => inspectQrImage(new Uint8Array([0x89, 0x50, 0x4e, 0x47])),
    /invalid-image-file/,
  );
  assert.throws(
    () => inspectQrImage(makePngHeader(6000, 5000)),
    /image-dimensions-too-large/,
  );
  assert.throws(
    () => inspectQrImage(makeGifHeader(0, 100)),
    /invalid-image-dimensions/,
  );
  assert.equal(MAX_QR_IMAGE_BYTES, 10 * 1024 * 1024);
});

test('QR image dimensions allow browser EXIF orientation correction', () => {
  assert.equal(qrImageDimensionsMatch(4000, 3000, 4000, 3000), true);
  assert.equal(qrImageDimensionsMatch(4000, 3000, 3000, 4000), true);
  assert.equal(qrImageDimensionsMatch(4000, 3000, 3999, 3000), false);
});

test('QR capacity errors are distinguished from unrelated generation failures', () => {
  assert.equal(
    isQrCapacityError(
      new Error('The amount of data is too big to be stored in a QR Code'),
    ),
    true,
  );
  assert.equal(isQrCapacityError(new Error('canvas unavailable')), false);
});

test('transform errors explain the failing boundary and corrective action', () => {
  assert.match(
    getTransformErrorMessage(
      'URL',
      'encode',
      new Error('invalid-unicode-text'),
    ),
    /unmatched Unicode surrogate.*Remove or replace/,
  );
  assert.match(
    getTransformErrorMessage('Base64', 'decode', new Error('invalid-utf8')),
    /not valid UTF-8/,
  );
  assert.match(
    getTransformErrorMessage('JWT', 'decode', new Error('invalid-jwt-number')),
    /rewritten during JSON decoding.*JSON string/,
  );
  assert.match(
    getTransformErrorMessage('JWT', 'decode', new Error('invalid-base64url')),
    /invalid Base64URL.*unpadded URL-safe/,
  );
});
