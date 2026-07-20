const utf8Encoder = new TextEncoder();
const utf8Decoder = new TextDecoder('utf-8', { fatal: true });

const isRecord = value =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const assertWellFormedString = value => {
  for (let index = 0; index < value.length; index += 1) {
    const codeUnit = value.charCodeAt(index);
    if (codeUnit >= 0xd800 && codeUnit <= 0xdbff) {
      const nextCodeUnit = value.charCodeAt(index + 1);
      if (
        index + 1 >= value.length ||
        nextCodeUnit < 0xdc00 ||
        nextCodeUnit > 0xdfff
      ) {
        throw new Error('invalid-unicode-text');
      }
      index += 1;
    } else if (codeUnit >= 0xdc00 && codeUnit <= 0xdfff) {
      throw new Error('invalid-unicode-text');
    }
  }
};

const bytesToBinary = bytes => {
  let binary = '';
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return binary;
};

const decodeBase64Bytes = input => {
  const compact = input.replace(/\s/g, '');
  if (!compact || !/^[A-Za-z0-9+/]*={0,2}$/.test(compact)) {
    throw new Error('invalid-base64');
  }

  const unpadded = compact.replace(/=+$/, '');
  const hasPadding = unpadded.length !== compact.length;
  if (
    unpadded.length % 4 === 1 ||
    (hasPadding && compact.length % 4 !== 0)
  ) {
    throw new Error('invalid-base64');
  }

  const padded = unpadded.padEnd(Math.ceil(unpadded.length / 4) * 4, '=');
  let binary;
  try {
    binary = atob(padded);
  } catch {
    throw new Error('invalid-base64');
  }

  if (btoa(binary).replace(/=+$/, '') !== unpadded) {
    throw new Error('invalid-base64');
  }

  return Uint8Array.from(binary, character => character.charCodeAt(0));
};

const encodeUtf8Base64 = value => {
  assertWellFormedString(value);
  return btoa(bytesToBinary(utf8Encoder.encode(value)));
};

const decodeUtf8Base64 = value => {
  try {
    return utf8Decoder.decode(decodeBase64Bytes(value));
  } catch (error) {
    if (error instanceof TypeError) {
      throw new Error('invalid-utf8');
    }
    throw error;
  }
};

const encodeBase64Url = value =>
  encodeUtf8Base64(value)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

const decodeBase64UrlBytes = value => {
  if (!value || !/^[A-Za-z0-9_-]+$/.test(value)) {
    throw new Error('invalid-base64url');
  }
  return decodeBase64Bytes(value.replace(/-/g, '+').replace(/_/g, '/'));
};

const decodeBase64Url = value => {
  try {
    return utf8Decoder.decode(decodeBase64UrlBytes(value));
  } catch (error) {
    if (error instanceof TypeError) {
      throw new Error('invalid-utf8');
    }
    throw error;
  }
};

const parseJwtObject = segment => {
  const parsed = JSON.parse(decodeBase64Url(segment));
  if (!isRecord(parsed)) {
    throw new Error('invalid-jwt-json');
  }
  return parsed;
};

export const encodeValue = (type, input) => {
  switch (type) {
    case 'URL':
      return encodeURIComponent(input);
    case 'Base64':
      return encodeUtf8Base64(input);
    case 'Unicode':
      assertWellFormedString(input);
      return Array.from(input)
        .map(character => character.codePointAt(0))
        .join(' ');
    case 'JWT': {
      const parsed = JSON.parse(input);
      if (
        !isRecord(parsed) ||
        !isRecord(parsed.header) ||
        !isRecord(parsed.payload) ||
        parsed.header.alg !== 'none'
      ) {
        throw new Error('invalid-jwt-json');
      }

      const header = encodeBase64Url(JSON.stringify(parsed.header));
      const payload = encodeBase64Url(JSON.stringify(parsed.payload));
      return `${header}.${payload}.`;
    }
    default:
      throw new Error('unsupported-transform');
  }
};

export const decodeValue = (type, input) => {
  switch (type) {
    case 'URL':
      return decodeURIComponent(input);
    case 'Base64':
      return decodeUtf8Base64(input);
    case 'Unicode': {
      const tokens = input.trim().split(/\s+/);
      const codePoints = tokens.map(token => Number(token));
      const malformed = tokens.some((token, index) => {
        const codePoint = codePoints[index];
        return (
          !/^\d+$/.test(token) ||
          !Number.isSafeInteger(codePoint) ||
          codePoint < 0 ||
          codePoint > 0x10ffff ||
          (codePoint >= 0xd800 && codePoint <= 0xdfff)
        );
      });
      if (malformed) throw new Error('invalid-code-point');
      return codePoints.map(codePoint => String.fromCodePoint(codePoint)).join('');
    }
    case 'JWT': {
      const parts = input.trim().split('.');
      if (
        parts.length !== 3 ||
        !parts[0] ||
        !parts[1]
      ) {
        throw new Error('invalid-jwt');
      }
      if (parts[2]) decodeBase64UrlBytes(parts[2]);

      const header = parseJwtObject(parts[0]);
      const payload = parseJwtObject(parts[1]);
      if (
        typeof header.alg !== 'string' ||
        !header.alg ||
        (header.alg === 'none' && parts[2]) ||
        (header.alg !== 'none' && !parts[2])
      ) {
        throw new Error('invalid-jwt');
      }

      return JSON.stringify(
        { header, payload, signature: parts[2] },
        null,
        2,
      );
    }
    default:
      throw new Error('unsupported-transform');
  }
};
