export const MAX_QR_IMAGE_PIXELS = 24_000_000;
export const MAX_QR_CANVAS_EDGE = 2048;

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
