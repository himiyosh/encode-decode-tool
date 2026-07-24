const getErrorCode = error => (error instanceof Error ? error.message : '');

export const getTransformErrorMessage = (type, action, error) => {
  const code = getErrorCode(error);
  if (type === 'URL') {
    return action === 'encode' && code === 'invalid-unicode-text'
      ? 'That text contains an unmatched Unicode surrogate. Remove or replace it, then encode again.'
      : 'That text is not valid percent-encoded content. Check incomplete % sequences and try again.';
  }
  if (type === 'Base64') {
    if (action === 'encode' && code === 'invalid-unicode-text') {
      return 'That text contains an unmatched Unicode surrogate. Remove or replace it, then encode again.';
    }
    return code === 'invalid-utf8'
      ? 'That Base64 value decodes to bytes that are not valid UTF-8. Use Base64 containing UTF-8 text.'
      : 'That value is not valid Base64. Check its alphabet, ASCII whitespace, and padding, then try again.';
  }
  if (type === 'Unicode') {
    return action === 'encode'
      ? 'That text contains an unmatched Unicode surrogate. Remove or replace it, then encode again.'
      : 'Use decimal Unicode code points from 0 to 1114111, separated by spaces.';
  }
  if (type === 'JWT' && code === 'invalid-jwt-number') {
    return 'That JWT contains a number that would be rewritten during JSON decoding. Encode the value as a JSON string or use a stable numeric representation.';
  }
  if (type === 'JWT' && code === 'invalid-jwt-unicode') {
    return 'That JWT contains an unmatched Unicode surrogate. Replace it with valid Unicode text.';
  }
  if (type === 'JWT' && action === 'encode') {
    return 'Use valid JSON with object-valued "header" and "payload" properties, and set header.alg to "none". This tool does not sign tokens.';
  }
  if (type === 'JWT' && code === 'invalid-base64url') {
    return 'That compact token contains an invalid Base64URL segment. Use unpadded URL-safe characters in all three segments.';
  }
  if (type === 'JWT' && code === 'invalid-utf8') {
    return 'That compact token has a header or payload that is not valid UTF-8 text.';
  }
  if (type === 'JWT' && code === 'invalid-jwt-json') {
    return 'That compact token must contain JSON objects in both its header and payload segments.';
  }
  return 'That compact token is malformed. Check its algorithm and signature relationship; decoding does not verify authenticity.';
};
