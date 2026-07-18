import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import {
  AlertCircle,
  Check,
  ChevronRight,
  Copy,
  Download,
  ExternalLink,
  RefreshCw,
  Upload,
} from 'lucide-react';
import QRCode from 'qrcode';
import jsQR from 'jsqr';

const tabs = [
  { id: 'url', label: 'URL' },
  { id: 'base64', label: 'Base64' },
  { id: 'jwt', label: 'JWT' },
  { id: 'unicode', label: 'Unicode' },
  { id: 'qr', label: 'QR' },
];

const transformDetails = {
  URL: {
    hint: 'Percent-encode a URL or decode percent escapes.',
    placeholder: 'https://example.com/a path',
  },
  Base64: {
    hint: 'Encode UTF-8 text or decode a Base64 value.',
    placeholder: 'Text or Base64 value',
  },
  JWT: {
    hint: 'Displays JWT contents only. It does not verify the signature or authenticity.',
    placeholder: '{"header": {"alg": "HS256"}, "payload": {"sub": "123"}}',
  },
  Unicode: {
    hint: 'Encode text as decimal code units or decode space-separated values.',
    placeholder: 'Text or decimal values such as 72 101 108 108 111',
  },
};

const base64urlEncode = value =>
  btoa(unescape(encodeURIComponent(value)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');

const base64urlDecode = value => {
  let normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  while (normalized.length % 4) {
    normalized += '=';
  }
  return decodeURIComponent(escape(atob(normalized)));
};

function useCopyFeedback(value) {
  const [copyState, setCopyState] = useState('idle');
  const resetTimer = useRef();

  useEffect(() => {
    setCopyState('idle');
    return () => window.clearTimeout(resetTimer.current);
  }, [value]);

  const copy = async () => {
    if (!value) return false;

    try {
      await navigator.clipboard.writeText(value);
      setCopyState('copied');
      window.clearTimeout(resetTimer.current);
      resetTimer.current = window.setTimeout(() => setCopyState('idle'), 2500);
      return true;
    } catch {
      setCopyState('error');
      return false;
    }
  };

  return { copy, copyState };
}

function App() {
  const [activeTab, setActiveTab] = useState('URL');
  const tabRefs = useRef([]);
  const reduceMotion = useReducedMotion();

  const selectTab = index => {
    setActiveTab(tabs[index].label);
    tabRefs.current[index]?.focus({ preventScroll: true });
  };

  const handleTabKeyDown = (event, index) => {
    let nextIndex;
    switch (event.key) {
      case 'ArrowLeft':
        nextIndex = (index - 1 + tabs.length) % tabs.length;
        break;
      case 'ArrowRight':
        nextIndex = (index + 1) % tabs.length;
        break;
      case 'Home':
        nextIndex = 0;
        break;
      case 'End':
        nextIndex = tabs.length - 1;
        break;
      default:
        return;
    }

    event.preventDefault();
    selectTab(nextIndex);
  };

  const activeId = tabs.find(tab => tab.label === activeTab).id;

  return (
    <main className="app-shell">
      <header className="app-header">
        <h1>Encode / Decode Tool</h1>
        <p>Transform text and QR codes without sending data off-device.</p>
      </header>

      <section className="tool-panel" aria-label="Encoding and decoding workbench">
        <div className="tab-list" role="tablist" aria-label="Choose a format">
          {tabs.map((tab, index) => {
            const selected = activeTab === tab.label;
            return (
              <button
                key={tab.id}
                ref={element => {
                  tabRefs.current[index] = element;
                }}
                id={`tab-${tab.id}`}
                type="button"
                role="tab"
                aria-selected={selected}
                aria-controls={`panel-${tab.id}`}
                tabIndex={selected ? 0 : -1}
                className="tab-button"
                onClick={() => setActiveTab(tab.label)}
                onKeyDown={event => handleTabKeyDown(event, index)}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        <AnimatePresence mode="wait" initial={false}>
          <motion.section
            key={activeTab}
            id={`panel-${activeId}`}
            role="tabpanel"
            aria-labelledby={`tab-${activeId}`}
            initial={reduceMotion ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={reduceMotion ? undefined : { opacity: 0 }}
            transition={{ duration: reduceMotion ? 0 : 0.15 }}
            className="tab-panel"
          >
            {activeTab === 'QR' ? <QRCodeTab /> : <TabContent type={activeTab} />}
          </motion.section>
        </AnimatePresence>
      </section>
    </main>
  );
}

function TabContent({ type }) {
  const [input, setInput] = useState('');
  const [output, setOutput] = useState('');
  const [error, setError] = useState('');
  const [copyError, setCopyError] = useState('');
  const [announcement, setAnnouncement] = useState('');
  const { copy, copyState } = useCopyFeedback(output);
  const id = type.toLowerCase();
  const details = transformDetails[type];

  const fail = message => {
    setOutput('');
    setError(message);
    setCopyError('');
    setAnnouncement(message);
  };

  const succeed = result => {
    setOutput(result);
    setError('');
    setCopyError('');
    setAnnouncement(`${type} output updated.`);
  };

  const handleEncode = () => {
    try {
      switch (type) {
        case 'URL':
          succeed(encodeURIComponent(input));
          break;
        case 'Base64':
          succeed(btoa(unescape(encodeURIComponent(input))));
          break;
        case 'Unicode':
          succeed(input.split('').map(character => character.charCodeAt(0)).join(' '));
          break;
        case 'JWT': {
          const parsed = JSON.parse(input);
          if (
            !parsed ||
            typeof parsed.header !== 'object' ||
            parsed.header === null ||
            typeof parsed.payload !== 'object' ||
            parsed.payload === null
          ) {
            throw new Error('invalid JWT JSON');
          }
          const header = base64urlEncode(JSON.stringify(parsed.header));
          const payload = base64urlEncode(JSON.stringify(parsed.payload));
          succeed(`${header}.${payload}.`);
          break;
        }
        default:
          break;
      }
    } catch {
      if (type === 'JWT') {
        fail('JWT encoding needs JSON with header and payload objects.');
      } else {
        fail(`${type} encoding failed. Check the input and try again.`);
      }
    }
  };

  const handleDecode = () => {
    try {
      switch (type) {
        case 'URL':
          succeed(decodeURIComponent(input));
          break;
        case 'Base64':
          succeed(decodeURIComponent(escape(atob(input))));
          break;
        case 'Unicode': {
          const codes = input.trim().split(/\s+/);
          if (
            codes.some(
              code => !/^\d+$/.test(code) || Number(code) < 0 || Number(code) > 65535,
            )
          ) {
            throw new Error('invalid Unicode values');
          }
          succeed(codes.map(code => String.fromCharCode(Number(code))).join(''));
          break;
        }
        case 'JWT': {
          const parts = input.trim().split('.');
          if (parts.length < 2 || !parts[0] || !parts[1]) {
            throw new Error('invalid JWT');
          }
          const header = JSON.parse(base64urlDecode(parts[0]));
          const payload = JSON.parse(base64urlDecode(parts[1]));
          succeed(
            JSON.stringify(
              { header, payload, signature: parts[2] || '' },
              null,
              2,
            ),
          );
          break;
        }
        default:
          break;
      }
    } catch {
      const message =
        type === 'URL'
          ? 'URL decoding failed. Check percent escapes such as %20 and try again.'
          : type === 'Base64'
            ? 'Base64 decoding failed. Check the alphabet and padding, then try again.'
            : type === 'Unicode'
              ? 'Unicode decoding failed. Use decimal values from 0 to 65535.'
              : 'JWT decoding failed. Provide a token with a valid header and payload.';
      fail(message);
    }
  };

  const handleCopy = async () => {
    const copied = await copy();
    if (copied) {
      setError('');
      setCopyError('');
      setAnnouncement(`${type} output copied to the clipboard.`);
    } else {
      const message = 'Clipboard access failed. Select the output and copy it manually.';
      setCopyError(message);
      setAnnouncement(message);
    }
  };

  const helperId = `${id}-input-help`;
  const errorId = `${id}-input-error`;
  const outputHelpId = `${id}-output-help`;

  return (
    <div className="transform-grid">
      <div className="field-group transform-input">
        <label htmlFor={`${id}-input`}>Input</label>
        <textarea
          id={`${id}-input`}
          name={`${id}-input`}
          value={input}
          onChange={event => {
            setInput(event.target.value);
            if (error) setError('');
            if (copyError) setCopyError('');
          }}
          placeholder={details.placeholder}
          rows={7}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? errorId : helperId}
        />
        {error ? (
          <p id={errorId} className="field-message field-message--error" role="alert">
            <AlertCircle aria-hidden="true" size={16} />
            <span>{error}</span>
          </p>
        ) : (
          <p id={helperId} className="field-message">
            {details.hint}
          </p>
        )}
      </div>

      <div className="action-group transform-actions">
        <div className="action-row">
          <button
            type="button"
            className="button button--action"
            onClick={handleEncode}
            disabled={!input}
            aria-label={`Encode ${type}`}
          >
            <RefreshCw aria-hidden="true" size={16} />
            <span>Encode</span>
          </button>
          <button
            type="button"
            className="button button--action"
            onClick={handleDecode}
            disabled={!input}
            aria-label={`Decode ${type}`}
          >
            <ChevronRight aria-hidden="true" size={16} />
            <span>Decode</span>
          </button>
          <button
            type="button"
            className="button button--quiet"
            onClick={handleCopy}
            disabled={!output}
            data-state={copyState}
          >
            {copyState === 'copied' ? (
              <Check aria-hidden="true" size={16} />
            ) : (
              <Copy aria-hidden="true" size={16} />
            )}
            <span>{copyState === 'copied' ? 'Copied' : 'Copy'}</span>
          </button>
        </div>
        {copyError ? (
          <p className="field-message field-message--error" role="alert">
            <AlertCircle aria-hidden="true" size={16} />
            <span>{copyError}</span>
          </p>
        ) : null}
      </div>

      <div className="field-group transform-output">
        <label htmlFor={`${id}-output`}>Output</label>
        <textarea
          id={`${id}-output`}
          name={`${id}-output`}
          value={output}
          readOnly
          rows={7}
          placeholder="Output appears here"
          aria-describedby={outputHelpId}
        />
        <p id={outputHelpId} className="field-message">
          {output ? 'Ready to copy.' : 'Choose Encode or Decode to create output.'}
        </p>
      </div>

      <p className="sr-only" role="status" aria-live="polite">
        {announcement}
      </p>
    </div>
  );
}

function QRCodeTab() {
  const [text, setText] = useState('');
  const [imgSrc, setImgSrc] = useState('');
  const [decoded, setDecoded] = useState('');
  const [generateError, setGenerateError] = useState('');
  const [decodeError, setDecodeError] = useState('');
  const [announcement, setAnnouncement] = useState('');
  const canvasRef = useRef(null);
  const { copy, copyState } = useCopyFeedback(decoded);

  const generateQR = async () => {
    if (!text) return;

    try {
      const dataUrl = await QRCode.toDataURL(text);
      setImgSrc(dataUrl);
      setGenerateError('');
      setAnnouncement('QR code generated.');
    } catch {
      setImgSrc('');
      setGenerateError('QR generation failed. Shorten the text and try again.');
      setAnnouncement('QR generation failed.');
    }
  };

  const onFileChange = event => {
    const input = event.currentTarget;
    const file = input.files?.[0];
    if (!file) return;

    setDecoded('');
    setDecodeError('');

    if (!file.type.startsWith('image/')) {
      const message = 'That file is not an image. Choose a PNG, JPEG, WebP, or GIF.';
      setDecodeError(message);
      setAnnouncement(message);
      input.value = '';
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      const message = 'That image is larger than 10 MB. Choose a smaller file.';
      setDecodeError(message);
      setAnnouncement(message);
      input.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onerror = () => {
      const message = 'The image could not be read. Choose another file.';
      setDecodeError(message);
      setAnnouncement(message);
      input.value = '';
    };
    reader.onload = () => {
      const image = new Image();
      image.onerror = () => {
        const message = 'The image could not be opened. Choose another file.';
        setDecodeError(message);
        setAnnouncement(message);
        input.value = '';
      };
      image.onload = () => {
        try {
          const canvas = canvasRef.current;
          const context = canvas?.getContext('2d', { willReadFrequently: true });
          if (!canvas || !context) throw new Error('canvas unavailable');

          canvas.width = image.width;
          canvas.height = image.height;
          context.drawImage(image, 0, 0);
          const imageData = context.getImageData(0, 0, image.width, image.height);
          const code = jsQR(imageData.data, imageData.width, imageData.height);

          if (!code) {
            setDecodeError('No QR code was found. Try a sharper, higher-contrast image.');
            setAnnouncement('No QR code was found.');
          } else {
            setDecoded(code.data);
            setDecodeError('');
            setAnnouncement('QR code decoded.');
          }
        } catch {
          setDecodeError('QR decoding failed. Choose another image and try again.');
          setAnnouncement('QR decoding failed.');
        } finally {
          input.value = '';
        }
      };
      image.src = reader.result;
    };
    reader.readAsDataURL(file);
  };

  const handleDecodedCopy = async () => {
    const copied = await copy();
    if (copied) {
      setDecodeError('');
      setAnnouncement('Decoded text copied to the clipboard.');
    } else {
      setDecodeError('Clipboard access failed. Select the decoded text and copy it manually.');
    }
  };

  return (
    <div className="qr-grid">
      <section className="qr-section" aria-labelledby="qr-generate-heading">
        <div className="section-heading">
          <h2 id="qr-generate-heading">Generate</h2>
          <p>Creates the QR code locally in this browser.</p>
        </div>

        <div className="field-group">
          <label htmlFor="qr-text">Text to encode</label>
          <textarea
            id="qr-text"
            name="qr-text"
            rows={4}
            placeholder="Text or URL"
            value={text}
            onChange={event => {
              setText(event.target.value);
              if (generateError) setGenerateError('');
            }}
            aria-invalid={Boolean(generateError)}
            aria-describedby={generateError ? 'qr-generate-error' : 'qr-text-help'}
          />
          {generateError ? (
            <p
              id="qr-generate-error"
              className="field-message field-message--error"
              role="alert"
            >
              <AlertCircle aria-hidden="true" size={16} />
              <span>{generateError}</span>
            </p>
          ) : (
            <p id="qr-text-help" className="field-message">
              Nothing is uploaded or stored.
            </p>
          )}
        </div>

        <button
          type="button"
          className="button button--primary"
          onClick={generateQR}
          disabled={!text}
        >
          <RefreshCw aria-hidden="true" size={16} />
          <span>Generate QR</span>
        </button>

        {imgSrc ? (
          <figure className="qr-result">
            <img src={imgSrc} alt="Generated QR code" width="148" height="148" />
            <a className="button button--quiet" href={imgSrc} download="qr-code.png">
              <Download aria-hidden="true" size={16} />
              <span>Download QR</span>
            </a>
          </figure>
        ) : (
          <div className="empty-state" aria-hidden="true">
            Generated QR code
          </div>
        )}
      </section>

      <section className="qr-section" aria-labelledby="qr-decode-heading">
        <div className="section-heading">
          <h2 id="qr-decode-heading">Decode</h2>
          <p>Reads an image locally. The file never leaves this device.</p>
        </div>

        <input
          id="qr-upload"
          name="qr-upload"
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          onChange={onFileChange}
          className="sr-only file-input"
          aria-invalid={Boolean(decodeError)}
          aria-describedby={decodeError ? 'qr-decode-error' : 'qr-upload-help'}
        />
        <label htmlFor="qr-upload" className="button button--primary file-picker">
          <Upload aria-hidden="true" size={16} />
          <span>Choose QR image</span>
        </label>
        {decodeError ? (
          <p id="qr-decode-error" className="field-message field-message--error" role="alert">
            <AlertCircle aria-hidden="true" size={16} />
            <span>{decodeError}</span>
          </p>
        ) : (
          <p id="qr-upload-help" className="field-message">
            PNG, JPEG, WebP, or GIF up to 10 MB.
          </p>
        )}

        <canvas ref={canvasRef} hidden />

        <div className="field-group">
          <label htmlFor="qr-decoded">Decoded text</label>
          <textarea
            id="qr-decoded"
            name="qr-decoded"
            rows={5}
            readOnly
            placeholder="Decoded text appears here"
            value={decoded}
          />
        </div>

        {decoded ? (
          <div className="decoded-actions">
            <button
              type="button"
              className="button button--quiet"
              onClick={handleDecodedCopy}
              data-state={copyState}
            >
              {copyState === 'copied' ? (
                <Check aria-hidden="true" size={16} />
              ) : (
                <Copy aria-hidden="true" size={16} />
              )}
              <span>{copyState === 'copied' ? 'Copied' : 'Copy text'}</span>
            </button>
            {/^https?:\/\//i.test(decoded) ? (
              <a
                href={decoded}
                target="_blank"
                rel="noopener noreferrer"
                className="text-link"
              >
                <span>Open decoded URL</span>
                <ExternalLink aria-hidden="true" size={16} />
              </a>
            ) : null}
          </div>
        ) : null}
      </section>

      <p className="sr-only" role="status" aria-live="polite">
        {announcement}
      </p>
    </div>
  );
}

export default App;
