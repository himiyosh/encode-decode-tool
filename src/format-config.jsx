import {
  ArrowLeftRight,
  Binary,
  Fingerprint,
  Languages,
  QrCode,
} from 'lucide-react';

import { countCodePoints } from './text-metrics.mjs';

export const tabs = ['URL', 'Base64', 'JWT', 'Unicode', 'QR'];

export const formatVisualMeta = {
  URL: { token: '%', icon: ArrowLeftRight },
  Base64: { token: '64', icon: Binary },
  JWT: { token: '{}', icon: Fingerprint },
  Unicode: { token: 'U+', icon: Languages },
  QR: { token: 'QR', icon: QrCode },
};

export const formatMeta = {
  URL: {
    inputLabel: 'URL text',
    inputHint: 'Enter plain text to encode or percent-encoded text to decode.',
    placeholder: 'https://example.com/a path?x=1',
    example: 'https://example.com/a path?x=1',
    outputLabel: 'URL result',
  },
  Base64: {
    inputLabel: 'UTF-8 text or Base64',
    inputHint: 'Base64 conversion preserves non-ASCII UTF-8 text.',
    placeholder: 'Hello, 世界',
    example: 'Hello 👋 世界',
    outputLabel: 'Base64 result',
  },
  JWT: {
    inputLabel: 'JWT JSON or compact token',
    inputHint:
      'Assemble an unsecured token with header.alg set to "none", or decode a compact token. Decoding never verifies its signature or authenticity.',
    placeholder: '{"header":{"alg":"none"},"payload":{"sub":"123"}}',
    example: '{"header":{"alg":"none"},"payload":{"sub":"123","name":"Ada"}}',
    outputLabel: 'JWT result',
  },
  Unicode: {
    inputLabel: 'Text or Unicode code points',
    inputHint: 'Decode space-separated decimal code points, such as 72 101 108 108 111.',
    placeholder: 'Hello 👋',
    example: 'Hello 👋',
    outputLabel: 'Unicode result',
  },
};

export const getCharacterLabel = value => {
  const count = countCodePoints(value);
  const formattedCount = count.toLocaleString('en-US');
  return `${formattedCount} ${count === 1 ? 'character' : 'characters'}`;
};

export const getSuccessMessage = (type, action) => {
  if (type === 'JWT' && action === 'decode') {
    return 'JWT structure decoded. Its signature was not verified.';
  }
  if (type === 'JWT') return 'Unsigned JWT assembled.';
  return `${type} ${action === 'encode' ? 'encoded' : 'decoded'}.`;
};
