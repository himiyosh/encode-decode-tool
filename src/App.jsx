import React, { useEffect, useRef, useState } from 'react';
import { Check, ChevronRight, Copy, Download, RefreshCw } from 'lucide-react';
import QRCode from 'qrcode';
import jsQR from 'jsqr';

const tabs = ['URL', 'Base64', 'JWT', 'Unicode', 'QR'];
const MAX_QR_IMAGE_BYTES = 10 * 1024 * 1024;

const formatMeta = {
  URL: {
    inputLabel: 'URL text',
    inputHint: 'Enter plain text to encode or percent-encoded text to decode.',
    placeholder: 'https://example.com/a path?x=1',
    outputLabel: 'URL result',
  },
  Base64: {
    inputLabel: 'UTF-8 text or Base64',
    inputHint: 'Base64 conversion preserves non-ASCII UTF-8 text.',
    placeholder: 'Hello, 世界',
    outputLabel: 'Base64 result',
  },
  JWT: {
    inputLabel: 'JWT JSON or compact token',
    inputHint:
      'Encode {"header": {...}, "payload": {...}} or decode a compact token. Decoding does not verify its signature or authenticity.',
    placeholder: '{"header":{"alg":"none"},"payload":{"sub":"123"}}',
    outputLabel: 'Decoded JWT structure',
  },
  Unicode: {
    inputLabel: 'Text or Unicode code points',
    inputHint: 'Decode space-separated decimal code points, such as 72 101 108 108 111.',
    placeholder: 'Hello 👋',
    outputLabel: 'Unicode result',
  },
};

const App = () => {
  const [activeTab, setActiveTab] = useState('URL');
  const tabRefs = useRef([]);

  const selectTab = (index, moveFocus = false) => {
    setActiveTab(tabs[index]);
    if (moveFocus) {
      tabRefs.current[index]?.focus({ preventScroll: true });
    }
  };

  const handleTabKeyDown = (event, index) => {
    let nextIndex;
    if (event.key === 'ArrowRight') nextIndex = (index + 1) % tabs.length;
    if (event.key === 'ArrowLeft') nextIndex = (index - 1 + tabs.length) % tabs.length;
    if (event.key === 'Home') nextIndex = 0;
    if (event.key === 'End') nextIndex = tabs.length - 1;
    if (nextIndex === undefined) return;

    event.preventDefault();
    selectTab(nextIndex, true);
  };

  return (
    <main className="app-shell">
      <header className="app-header">
        <h1>Encode / Decode Tool</h1>
        <p>Transform text and QR codes locally in your browser.</p>
      </header>

      <section className="workbench" aria-label="Encoding and decoding workbench">
        <div className="tab-list" role="tablist" aria-label="Transformation formats">
          {tabs.map((tab, index) => (
            <button
              key={tab}
              ref={element => {
                tabRefs.current[index] = element;
              }}
              id={`tab-${tab.toLowerCase()}`}
              type="button"
              role="tab"
              aria-selected={activeTab === tab}
              aria-controls={`panel-${tab.toLowerCase()}`}
              tabIndex={activeTab === tab ? 0 : -1}
              className="tab-button"
              onClick={() => selectTab(index)}
              onKeyDown={event => handleTabKeyDown(event, index)}
            >
              {tab}
            </button>
          ))}
        </div>

        {tabs.map(tab =>
          tab === 'QR' ? (
            <QRCodeTab key={tab} hidden={activeTab !== tab} />
          ) : (
            <TabContent key={tab} type={tab} hidden={activeTab !== tab} />
          ),
        )}
      </section>

      <p className="privacy-note">Your text and images never leave this browser.</p>
    </main>
  );
};

const base64urlEncode = str =>
  btoa(unescape(encodeURIComponent(str)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');

const base64urlDecode = str => {
  str = str.replace(/-/g, '+').replace(/_/g, '/');
  while (str.length % 4) {
    str += '=';
  }
  return decodeURIComponent(escape(atob(str)));
};

const encodeValue = (type, input) => {
  switch (type) {
    case 'URL':
      return encodeURIComponent(input);
    case 'Base64':
      return btoa(unescape(encodeURIComponent(input)));
    case 'Unicode':
      return Array.from(input)
        .map(character => character.codePointAt(0))
        .join(' ');
    case 'JWT': {
      const parsed = JSON.parse(input);
      if (
        !parsed ||
        typeof parsed !== 'object' ||
        !parsed.header ||
        typeof parsed.header !== 'object' ||
        Array.isArray(parsed.header) ||
        !parsed.payload ||
        typeof parsed.payload !== 'object' ||
        Array.isArray(parsed.payload)
      ) {
        throw new Error('invalid-jwt-json');
      }
      const header = base64urlEncode(JSON.stringify(parsed.header));
      const payload = base64urlEncode(JSON.stringify(parsed.payload));
      return `${header}.${payload}.`;
    }
    default:
      return '';
  }
};

const decodeValue = (type, input) => {
  switch (type) {
    case 'URL':
      return decodeURIComponent(input);
    case 'Base64':
      return decodeURIComponent(escape(atob(input)));
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
      if (parts.length !== 3 || !parts[0] || !parts[1]) {
        throw new Error('invalid-jwt');
      }
      const header = JSON.parse(base64urlDecode(parts[0]));
      const payload = JSON.parse(base64urlDecode(parts[1]));
      return JSON.stringify(
        { header, payload, signature: parts[2] || '' },
        null,
        2,
      );
    }
    default:
      return '';
  }
};

const getTransformError = (type, action) => {
  if (type === 'URL') {
    return 'That text is not valid percent-encoded content. Check incomplete % sequences and try again.';
  }
  if (type === 'Base64') {
    return 'That value is not valid UTF-8 Base64. Check its characters and padding, then try again.';
  }
  if (type === 'Unicode') {
    return 'Use decimal Unicode code points from 0 to 1114111, separated by spaces.';
  }
  if (type === 'JWT' && action === 'encode') {
    return 'Use JSON with object-valued "header" and "payload" properties.';
  }
  return 'That compact token could not be decoded. Check its header and payload segments.';
};

const getSuccessMessage = (type, action) => {
  if (type === 'JWT' && action === 'decode') {
    return 'JWT structure decoded. Its signature was not verified.';
  }
  if (type === 'JWT') return 'Unsigned JWT assembled.';
  return `${type} ${action === 'encode' ? 'encoded' : 'decoded'}.`;
};

const TabContent = ({ type, hidden }) => {
  const [input, setInput] = useState('');
  const [output, setOutput] = useState('');
  const [status, setStatus] = useState({
    tone: 'idle',
    source: 'input',
    message: 'Enter text to enable the transformation actions.',
  });
  const [copyState, setCopyState] = useState('idle');
  const copyResetTimer = useRef();
  const meta = formatMeta[type];
  const id = type.toLowerCase();

  useEffect(
    () => () => window.clearTimeout(copyResetTimer.current),
    [],
  );

  const handleInputChange = event => {
    const nextInput = event.target.value;
    setInput(nextInput);
    setCopyState('idle');
    setStatus({
      tone: 'idle',
      source: 'input',
      message: nextInput
        ? output
          ? 'Input changed. Transform again to update the output.'
          : 'Ready to transform.'
        : 'Enter text to enable the transformation actions.',
    });
  };

  const handleTransform = action => {
    try {
      const result =
        action === 'encode' ? encodeValue(type, input) : decodeValue(type, input);
      setOutput(result);
      setStatus({
        tone: 'success',
        source: 'result',
        message: getSuccessMessage(type, action),
      });
    } catch {
      setOutput('');
      setStatus({
        tone: 'error',
        source: 'input',
        message: getTransformError(type, action),
      });
    }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(output);
      setCopyState('copied');
      setStatus({
        tone: 'success',
        source: 'result',
        message: 'Output copied to the clipboard.',
      });
      window.clearTimeout(copyResetTimer.current);
      copyResetTimer.current = window.setTimeout(() => setCopyState('idle'), 2500);
    } catch {
      setCopyState('idle');
      setStatus({
        tone: 'error',
        source: 'action',
        message: 'The browser blocked clipboard access. Select the output and copy it manually.',
      });
    }
  };

  const inputInvalid = status.tone === 'error' && status.source === 'input';

  return (
    <section
      id={`panel-${id}`}
      role="tabpanel"
      aria-labelledby={`tab-${id}`}
      hidden={hidden}
      className="tool-panel"
    >
      <div className="field">
        <label htmlFor={`${id}-input`}>{meta.inputLabel}</label>
        <p id={`${id}-input-help`} className="field-help">
          {meta.inputHint}
        </p>
        <textarea
          id={`${id}-input`}
          name={`${id}-input`}
          value={input}
          onChange={handleInputChange}
          placeholder={meta.placeholder}
          rows={5}
          spellCheck={false}
          autoCapitalize="none"
          aria-invalid={inputInvalid ? 'true' : undefined}
          aria-describedby={`${id}-input-help ${id}-status`}
        />
      </div>

      <div className="action-group">
        <button
          type="button"
          className="action-button action-button--primary"
          onClick={() => handleTransform('encode')}
          disabled={input.length === 0}
        >
          <RefreshCw aria-hidden="true" size={17} />
          <span>Encode</span>
        </button>
        <button
          type="button"
          className="action-button action-button--secondary"
          onClick={() => handleTransform('decode')}
          disabled={input.length === 0}
        >
          <ChevronRight aria-hidden="true" size={17} />
          <span>Decode</span>
        </button>
        <button
          type="button"
          className="action-button action-button--tertiary copy-button"
          onClick={handleCopy}
          disabled={!output}
          data-state={copyState}
        >
          {copyState === 'copied' ? (
            <Check aria-hidden="true" size={17} />
          ) : (
            <Copy aria-hidden="true" size={17} />
          )}
          <span>{copyState === 'copied' ? 'Copied' : 'Copy'}</span>
        </button>
      </div>

      <p
        id={`${id}-status`}
        className="status-message"
        data-tone={status.tone}
        role={status.tone === 'error' ? 'alert' : 'status'}
        aria-atomic="true"
      >
        {status.message}
      </p>

      <div className="field">
        <label htmlFor={`${id}-output`}>{meta.outputLabel}</label>
        <textarea
          id={`${id}-output`}
          name={`${id}-output`}
          value={output}
          readOnly
          rows={5}
          placeholder="Output appears here"
          aria-describedby={`${id}-status`}
        />
      </div>
    </section>
  );
};

export default App;

function QRCodeTab({ hidden }) {
  const [text, setText] = useState('');
  const [imgSrc, setImgSrc] = useState('');
  const [decoded, setDecoded] = useState('');
  const [status, setStatus] = useState({
    tone: 'idle',
    message: 'Generate a QR code or choose an image to decode locally.',
  });
  const [generating, setGenerating] = useState(false);
  const [copyState, setCopyState] = useState('idle');
  const canvasRef = useRef(null);
  const copyResetTimer = useRef();

  useEffect(
    () => () => window.clearTimeout(copyResetTimer.current),
    [],
  );

  const generateQR = async () => {
    setGenerating(true);
    setStatus({ tone: 'loading', message: 'Generating QR code…' });
    try {
      const url = await QRCode.toDataURL(text, { width: 240, margin: 2 });
      setImgSrc(url);
      setStatus({ tone: 'success', message: 'QR code generated and ready to download.' });
    } catch {
      setImgSrc('');
      setStatus({
        tone: 'error',
        message: 'The QR code could not be generated. Check the text and try again.',
      });
    } finally {
      setGenerating(false);
    }
  };

  const onFileChange = e => {
    const input = e.currentTarget;
    const file = input.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setStatus({
        tone: 'error',
        message: 'That file is not an image. Choose a PNG, JPEG, GIF, or WebP image.',
      });
      input.value = '';
      return;
    }
    if (file.size > MAX_QR_IMAGE_BYTES) {
      setStatus({
        tone: 'error',
        message: 'That image is larger than 10 MB. Choose a smaller image.',
      });
      input.value = '';
      return;
    }

    setDecoded('');
    setCopyState('idle');
    setStatus({ tone: 'loading', message: 'Reading the QR image locally…' });
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        try {
          const canvas = canvasRef.current;
          const context = canvas?.getContext('2d', { willReadFrequently: true });
          if (!canvas || !context) throw new Error('canvas-unavailable');
          canvas.width = img.width;
          canvas.height = img.height;
          context.drawImage(img, 0, 0);
          const imageData = context.getImageData(0, 0, img.width, img.height);
          const code = jsQR(imageData.data, imageData.width, imageData.height);
          if (!code?.data) {
            setStatus({
              tone: 'error',
              message: 'No QR code was found in that image. Try a sharper, uncropped image.',
            });
            return;
          }
          setDecoded(code.data);
          setStatus({ tone: 'success', message: 'QR code decoded locally.' });
        } catch {
          setDecoded('');
          setStatus({
            tone: 'error',
            message: 'The image could not be read. Try another image file.',
          });
        }
      };
      img.onerror = () => {
        setStatus({
          tone: 'error',
          message: 'The image could not be opened. Try another image file.',
        });
      };
      img.src = reader.result;
    };
    reader.onerror = () => {
      setStatus({
        tone: 'error',
        message: 'The browser could not read that file. Choose it again or try another image.',
      });
    };
    reader.readAsDataURL(file);
    input.value = '';
  };

  const copyDecoded = async () => {
    try {
      await navigator.clipboard.writeText(decoded);
      setCopyState('copied');
      setStatus({ tone: 'success', message: 'Decoded text copied to the clipboard.' });
      window.clearTimeout(copyResetTimer.current);
      copyResetTimer.current = window.setTimeout(() => setCopyState('idle'), 2500);
    } catch {
      setCopyState('idle');
      setStatus({
        tone: 'error',
        message: 'The browser blocked clipboard access. Select the decoded text and copy it manually.',
      });
    }
  };

  return (
    <section
      id="panel-qr"
      role="tabpanel"
      aria-labelledby="tab-qr"
      hidden={hidden}
      className="tool-panel qr-panel"
    >
      <p
        id="qr-status"
        className="status-message qr-status"
        data-tone={status.tone}
        role={status.tone === 'error' ? 'alert' : 'status'}
        aria-atomic="true"
      >
        {status.message}
      </p>

      <div className="qr-section">
        <h2>Generate</h2>
        <div className="field">
          <label htmlFor="qr-text">Text to encode</label>
          <p id="qr-text-help" className="field-help">
            The QR image is generated in this browser and is never uploaded.
          </p>
          <textarea
            id="qr-text"
            name="qr-text"
            rows={3}
            placeholder="Text or URL"
            value={text}
            onChange={event => {
              setText(event.target.value);
              setStatus({
                tone: 'idle',
                message: event.target.value
                  ? 'Ready to generate.'
                  : 'Enter text to enable QR generation.',
              });
            }}
            aria-describedby="qr-text-help qr-status"
          />
        </div>

        <button
          type="button"
          onClick={generateQR}
          className="action-button action-button--primary"
          disabled={!text || generating}
          aria-busy={generating}
        >
          <RefreshCw aria-hidden="true" size={17} />
          <span>{generating ? 'Generating…' : 'Generate QR'}</span>
        </button>

        <div className="qr-preview" aria-live="polite">
          {imgSrc ? (
            <img
              src={imgSrc}
              alt="Generated QR code"
              width="240"
              height="240"
            />
          ) : (
            <p>Generated QR appears here.</p>
          )}
        </div>

        {imgSrc && (
          <a
            href={imgSrc}
            download="qr-code.png"
            className="action-button action-button--secondary download-link"
          >
            <Download aria-hidden="true" size={17} />
            <span>Download QR</span>
          </a>
        )}
      </div>

      <div className="qr-section">
        <h2>Decode</h2>
        <div className="field">
          <label htmlFor="qr-upload">QR image</label>
          <p id="qr-upload-help" className="field-help">
            Choose an image from this device. It is processed locally.
          </p>
          <input
            id="qr-upload"
            name="qr-upload"
            type="file"
            accept="image/png,image/jpeg,image/gif,image/webp"
            onChange={onFileChange}
            aria-describedby="qr-upload-help qr-status"
            className="file-input"
          />
        </div>

        <canvas ref={canvasRef} hidden aria-hidden="true" />

        <div className="field">
          <label htmlFor="qr-output">Decoded text</label>
          <textarea
            id="qr-output"
            name="qr-output"
            rows={3}
            readOnly
            placeholder="Decoded text appears here"
            value={decoded}
            aria-describedby="qr-status"
          />
        </div>

        <button
          type="button"
          className="action-button action-button--tertiary copy-button"
          onClick={copyDecoded}
          disabled={!decoded}
          data-state={copyState}
        >
          {copyState === 'copied' ? (
            <Check aria-hidden="true" size={17} />
          ) : (
            <Copy aria-hidden="true" size={17} />
          )}
          <span>{copyState === 'copied' ? 'Copied' : 'Copy decoded text'}</span>
        </button>

        {/^https?:\/\//i.test(decoded) && (
          <a
            href={decoded}
            target="_blank"
            rel="noopener noreferrer"
            className="decoded-link"
          >
            Open decoded URL
          </a>
        )}
      </div>

    </section>
  );
}