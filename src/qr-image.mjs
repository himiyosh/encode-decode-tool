export const MAX_QR_IMAGE_BYTES = 10 * 1024 * 1024;
export const MAX_QR_IMAGE_PIXELS = 24_000_000;
export const MAX_QR_CANVAS_EDGE = 2048;

const matches = (bytes, offset, expected) =>
  expected.every((value, index) => bytes[offset + index] === value);

const readUint16BigEndian = (bytes, offset) =>
  bytes[offset] * 0x100 + bytes[offset + 1];

const readUint16LittleEndian = (bytes, offset) =>
  bytes[offset] + bytes[offset + 1] * 0x100;

const readUint24LittleEndian = (bytes, offset) =>
  bytes[offset] + bytes[offset + 1] * 0x100 + bytes[offset + 2] * 0x10000;

const readUint32BigEndian = (bytes, offset) =>
  bytes[offset] * 0x1000000 +
  bytes[offset + 1] * 0x10000 +
  bytes[offset + 2] * 0x100 +
  bytes[offset + 3];

const readUint32LittleEndian = (bytes, offset) =>
  bytes[offset] +
  bytes[offset + 1] * 0x100 +
  bytes[offset + 2] * 0x10000 +
  bytes[offset + 3] * 0x1000000;

const parseJpegDimensions = bytes => {
  let offset = 2;
  while (offset < bytes.length) {
    if (bytes[offset] !== 0xff) throw new Error('invalid-image-file');
    while (bytes[offset] === 0xff) offset += 1;
    const marker = bytes[offset];
    offset += 1;

    if (marker === 0xd9 || marker === 0xda) break;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) continue;
    if (offset + 2 > bytes.length) throw new Error('invalid-image-file');

    const segmentLength = readUint16BigEndian(bytes, offset);
    if (segmentLength < 2 || offset + segmentLength > bytes.length) {
      throw new Error('invalid-image-file');
    }
    const isStartOfFrame =
      marker >= 0xc0 &&
      marker <= 0xcf &&
      ![0xc4, 0xc8, 0xcc].includes(marker);
    if (isStartOfFrame) {
      if (segmentLength < 7) throw new Error('invalid-image-file');
      return {
        width: readUint16BigEndian(bytes, offset + 5),
        height: readUint16BigEndian(bytes, offset + 3),
      };
    }
    offset += segmentLength;
  }
  throw new Error('invalid-image-file');
};

const parseWebpDimensions = bytes => {
  if (bytes.length < 30) throw new Error('invalid-image-file');
  if (readUint32LittleEndian(bytes, 4) + 8 > bytes.length) {
    throw new Error('invalid-image-file');
  }
  const chunkType = String.fromCharCode(...bytes.subarray(12, 16));
  const chunkLength = readUint32LittleEndian(bytes, 16);
  if (chunkType === 'VP8X' && chunkLength >= 10) {
    return {
      width: readUint24LittleEndian(bytes, 24) + 1,
      height: readUint24LittleEndian(bytes, 27) + 1,
    };
  }
  if (chunkType === 'VP8L' && bytes[20] === 0x2f) {
    return {
      width: 1 + bytes[21] + ((bytes[22] & 0x3f) << 8),
      height:
        1 +
        ((bytes[22] & 0xc0) >> 6) +
        (bytes[23] << 2) +
        ((bytes[24] & 0x0f) << 10),
    };
  }
  if (chunkType === 'VP8 ' && matches(bytes, 23, [0x9d, 0x01, 0x2a])) {
    return {
      width: readUint16LittleEndian(bytes, 26) & 0x3fff,
      height: readUint16LittleEndian(bytes, 28) & 0x3fff,
    };
  }
  throw new Error('invalid-image-file');
};

export const getQrCanvasSize = (width, height) => {
  if (
    !Number.isSafeInteger(width) ||
    !Number.isSafeInteger(height) ||
    width <= 0 ||
    height <= 0
  ) {
    throw new Error('invalid-image-dimensions');
  }
  if (width * height > MAX_QR_IMAGE_PIXELS) {
    throw new Error('image-dimensions-too-large');
  }

  const scale = Math.min(1, MAX_QR_CANVAS_EDGE / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
};

export const qrImageDimensionsMatch = (
  encodedWidth,
  encodedHeight,
  naturalWidth,
  naturalHeight,
) =>
  (encodedWidth === naturalWidth && encodedHeight === naturalHeight) ||
  (encodedWidth === naturalHeight && encodedHeight === naturalWidth);

export const inspectQrImage = bytes => {
  if (!(bytes instanceof Uint8Array)) throw new Error('invalid-image-file');

  let type;
  let dimensions;
  if (
    bytes.length >= 24 &&
    matches(bytes, 0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) &&
    readUint32BigEndian(bytes, 8) === 13 &&
    matches(bytes, 12, [0x49, 0x48, 0x44, 0x52])
  ) {
    type = 'image/png';
    dimensions = {
      width: readUint32BigEndian(bytes, 16),
      height: readUint32BigEndian(bytes, 20),
    };
  } else if (
    bytes.length >= 10 &&
    (matches(bytes, 0, [0x47, 0x49, 0x46, 0x38, 0x37, 0x61]) ||
      matches(bytes, 0, [0x47, 0x49, 0x46, 0x38, 0x39, 0x61]))
  ) {
    type = 'image/gif';
    dimensions = {
      width: readUint16LittleEndian(bytes, 6),
      height: readUint16LittleEndian(bytes, 8),
    };
  } else if (bytes.length >= 4 && matches(bytes, 0, [0xff, 0xd8, 0xff])) {
    type = 'image/jpeg';
    dimensions = parseJpegDimensions(bytes);
  } else if (
    bytes.length >= 16 &&
    matches(bytes, 0, [0x52, 0x49, 0x46, 0x46]) &&
    matches(bytes, 8, [0x57, 0x45, 0x42, 0x50])
  ) {
    type = 'image/webp';
    dimensions = parseWebpDimensions(bytes);
  } else {
    throw new Error('invalid-image-file');
  }

  return {
    type,
    ...dimensions,
    canvasSize: getQrCanvasSize(dimensions.width, dimensions.height),
  };
};

export const isQrCapacityError = error =>
  error instanceof Error &&
  /amount of data is too big|code length overflow/i.test(error.message);
