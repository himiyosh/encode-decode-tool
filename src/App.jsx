import React, { useEffect, useRef, useState } from 'react';
import { Check, ChevronRight, Copy, Download, RefreshCw } from 'lucide-react';
import { getQrCanvasSize } from './qr-image.mjs';
import { decodeValue, encodeValue } from './transforms.mjs';

const tabs = ['URL', 'Base64', 'JWT', 'Unicode', 'QR'];
const MAX_QR_IMAGE_BYTES = 10 * 1024 * 1024;
const SUPPORTED_QR_IMAGE_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
]);

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
      'Assemble an unsecured token with header.alg set to "none", or decode a compact token. Decoding never verifies its signature or authenticity.',
    placeholder: '{"header":{"alg":"none"},"payload":{"sub":"123"}}',
    outputLabel: 'JWT result',
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

const getTransformError = (type, action) => {
  if (type === 'URL') {
    return 'That text is not valid percent-encoded content. Check incomplete % sequences and try again.';
  }
  if (type === 'Base64') {
    return 'That value is not valid UTF-8 Base64. Check its characters and padding, then try again.';
  }
  if (type === 'Unicode') {
    return action === 'encode'
      ? 'That text contains an unmatched Unicode surrogate and cannot be encoded without changing it.'
      : 'Use decimal Unicode code points from 0 to 1114111, separated by spaces.';
  }
  if (type === 'JWT' && action === 'encode') {
    return 'Use JSON with object-valued "header" and "payload" properties, and set header.alg to "none". This tool does not sign tokens.';
  }
  return 'That compact token is malformed. Check its object-valued header and payload, algorithm, and Base64URL signature segment.';
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
  const [outputSource, setOutputSource] = useState('');
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
    const nextOutputIsStale = Boolean(output && nextInput !== outputSource);
    setStatus({
      tone: nextOutputIsStale ? 'warning' : output ? 'success' : 'idle',
      source: nextOutputIsStale || !output ? 'input' : 'result',
      message: nextInput
        ? nextOutputIsStale
          ? 'Input changed. Transform again to update the output.'
          : output
            ? 'Output matches the current input and is ready to copy.'
            : 'Ready to transform.'
        : 'Enter text to enable the transformation actions.',
    });
  };

  const handleTransform = action => {
    try {
      const result =
        action === 'encode' ? encodeValue(type, input) : decodeValue(type, input);
      setOutput(result);
      setOutputSource(input);
      setStatus({
        tone: 'success',
        source: 'result',
        message: getSuccessMessage(type, action),
      });
    } catch {
      setOutput('');
      setOutputSource('');
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

  const outputIsStale = Boolean(output && input !== outputSource);
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
          disabled={!output || outputIsStale}
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
          data-stale={outputIsStale ? 'true' : undefined}
        />
      </div>
    </section>
  );
};

export default App;

function QRCodeTab({ hidden }) {
  const [text, setText] = useState('');
  const [imgSrc, setImgSrc] = useState('');
  const [generatedText, setGeneratedText] = useState('');
  const [decoded, setDecoded] = useState('');
  const [status, setStatus] = useState({
    tone: 'idle',
    message: 'Generate a QR code or choose an image to decode locally.',
  });
  const [generating, setGenerating] = useState(false);
  const [copyState, setCopyState] = useState('idle');
  const canvasRef = useRef(null);
  const copyResetTimer = useRef();
  const decodeRequestId = useRef(0);
  const generateRequestId = useRef(0);
  const textRef = useRef('');

  useEffect(
    () => () => {
      window.clearTimeout(copyResetTimer.current);
      decodeRequestId.current += 1;
      generateRequestId.current += 1;
    },
    [],
  );

  const generateQR = async () => {
    const sourceText = text;
    const requestId = ++generateRequestId.current;
    setGenerating(true);
    setStatus({ tone: 'loading', message: 'Generating QR code…' });
    try {
      const { default: QRCode } = await import('qrcode');
      const url = await QRCode.toDataURL(sourceText, { width: 240, margin: 2 });
      if (requestId !== generateRequestId.current) return;
      setImgSrc(url);
      setGeneratedText(sourceText);
      const generatedIsStale = sourceText !== textRef.current;
      setStatus({
        tone: generatedIsStale ? 'warning' : 'success',
        message: generatedIsStale
          ? 'Text changed while the QR code was generated. Generate again before downloading.'
          : 'QR code generated and ready to download.',
      });
    } catch {
      if (requestId !== generateRequestId.current) return;
      setImgSrc('');
      setGeneratedText('');
      setStatus({
        tone: 'error',
        message: 'The QR code could not be generated. Check the text and try again.',
      });
    } finally {
      if (requestId === generateRequestId.current) {
        setGenerating(false);
      }
    }
  };

  const onFileChange = e => {
    const input = e.currentTarget;
    const file = input.files?.[0];
    if (!file) return;
    const requestId = ++decodeRequestId.current;
    setDecoded('');
    setCopyState('idle');

    if (!SUPPORTED_QR_IMAGE_TYPES.has(file.type)) {
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

    setStatus({ tone: 'loading', message: 'Reading the QR image locally…' });
    const reader = new FileReader();
    reader.onload = () => {
      if (requestId !== decodeRequestId.current) return;
      const img = new Image();
      img.onload = async () => {
        if (requestId !== decodeRequestId.current) return;
        try {
          const canvas = canvasRef.current;
          const context = canvas?.getContext('2d', { willReadFrequently: true });
          if (!canvas || !context) throw new Error('canvas-unavailable');
          const canvasSize = getQrCanvasSize(img.naturalWidth, img.naturalHeight);
          canvas.width = canvasSize.width;
          canvas.height = canvasSize.height;
          context.drawImage(img, 0, 0, canvasSize.width, canvasSize.height);
          const imageData = context.getImageData(
            0,
            0,
            canvasSize.width,
            canvasSize.height,
          );
          const { default: jsQR } = await import('jsqr');
          if (requestId !== decodeRequestId.current) return;
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
        } catch (error) {
          if (requestId !== decodeRequestId.current) return;
          setDecoded('');
          setStatus({
            tone: 'error',
            message:
              error instanceof Error &&
              error.message === 'image-dimensions-too-large'
                ? 'That image has too many pixels to process safely. Choose an image under 24 megapixels.'
                : 'The image could not be read. Try another image file.',
          });
        }
      };
      img.onerror = () => {
        if (requestId !== decodeRequestId.current) return;
        setStatus({
          tone: 'error',
          message: 'The image could not be opened. Try another image file.',
        });
      };
      img.src = reader.result;
    };
    reader.onerror = () => {
      if (requestId !== decodeRequestId.current) return;
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

  const qrIsStale = Boolean(imgSrc && text !== generatedText);

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
              const nextText = event.target.value;
              textRef.current = nextText;
              setText(nextText);
              const nextQrIsStale = Boolean(
                imgSrc && nextText !== generatedText,
              );
              setStatus({
                tone: nextQrIsStale
                  ? 'warning'
                  : imgSrc && nextText === generatedText
                    ? 'success'
                    : 'idle',
                message: nextText
                  ? imgSrc
                    ? nextQrIsStale
                      ? 'Text changed. Generate again before downloading this QR code.'
                      : 'This QR code matches the current text and is ready to download.'
                    : 'Ready to generate.'
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

        <div
          className="qr-preview"
          aria-live="polite"
          data-stale={qrIsStale ? 'true' : undefined}
        >
          {imgSrc ? (
            <>
              <img
                src={imgSrc}
                alt={
                  qrIsStale
                    ? 'Generated QR code, out of date with the current text'
                    : 'Generated QR code'
                }
                width="240"
                height="240"
              />
              {qrIsStale && <span className="stale-badge">Out of date</span>}
            </>
          ) : (
            <p>Generated QR appears here.</p>
          )}
        </div>

        {imgSrc && !qrIsStale && (
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