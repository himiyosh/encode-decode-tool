import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeftRight,
  Binary,
  Check,
  CheckCircle2,
  ChevronRight,
  Copy,
  Download,
  Fingerprint,
  Info,
  Languages,
  Loader2,
  QrCode,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react';
import { getQrCanvasSize } from './qr-image.mjs';
import { countCodePoints } from './text-metrics.mjs';
import { decodeValue, encodeValue } from './transforms.mjs';

const tabs = ['URL', 'Base64', 'JWT', 'Unicode', 'QR'];
const formatVisualMeta = {
  URL: { token: '%', icon: ArrowLeftRight },
  Base64: { token: '64', icon: Binary },
  JWT: { token: '{}', icon: Fingerprint },
  Unicode: { token: 'U+', icon: Languages },
  QR: { token: 'QR', icon: QrCode },
};
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

const getCharacterLabel = count => {
  const formattedCount = count.toLocaleString('en-US');
  return `${formattedCount} ${count === 1 ? 'character' : 'characters'}`;
};

const StatusMessage = ({ id, status, celebrationKey = 0, className = '' }) => {
  const Icon =
    status.tone === 'success'
      ? CheckCircle2
      : status.tone === 'error' || status.tone === 'warning'
        ? AlertTriangle
        : status.tone === 'loading'
          ? Loader2
          : Info;

  return (
    <p
      id={id}
      className={`status-message ${className}`.trim()}
      data-tone={status.tone}
      role={status.tone === 'error' ? 'alert' : 'status'}
      aria-atomic="true"
    >
      <Icon
        aria-hidden="true"
        size={17}
        className={status.tone === 'loading' ? 'status-icon is-spinning' : 'status-icon'}
      />
      <span>{status.message}</span>
      {status.tone === 'success' && celebrationKey > 0 && (
        <span
          key={celebrationKey}
          className="success-burst"
          aria-hidden="true"
        />
      )}
    </p>
  );
};

const App = () => {
  const [activeTab, setActiveTab] = useState('URL');
  const tabRefs = useRef([]);
  const activeFormat = formatVisualMeta[activeTab];

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
    <main className="app-shell" data-active-format={activeTab.toLowerCase()}>
      <header className="app-header">
        <div className="app-header__copy">
          <p className="app-kicker">
            <ShieldCheck aria-hidden="true" size={17} />
            <span>Local signal playground</span>
          </p>
          <h1>
            <span>Encode</span>
            <ArrowLeftRight
              className="title-switch"
              aria-hidden="true"
              strokeWidth={2.5}
            />
            <span>Decode</span>
          </h1>
          <p className="app-lede">
            Turn strange strings into useful answers. Every byte stays here.
          </p>
        </div>

        <div
          className="signal-stage"
          data-active={activeTab.toLowerCase()}
          aria-hidden="true"
        >
          <span className="signal-stage__grid" />
          <div className="signal-chips">
            {tabs.map(tab => (
              <span
                key={tab}
                className={`signal-chip signal-chip--${tab.toLowerCase()}`}
              >
                {formatVisualMeta[tab].token}
              </span>
            ))}
          </div>
          <span key={activeTab} className="signal-buddy">
            <span className="signal-buddy__eyes">
              <i />
              <i />
            </span>
            <strong>{activeFormat.token}</strong>
          </span>
        </div>
      </header>

      <section className="workbench" aria-label="Encoding and decoding workbench">
        <div className="workbench-meta" aria-hidden="true">
          <span className="workbench-meta__dot" />
          <span>Ready locally</span>
          <strong>{activeTab} mode</strong>
        </div>

        <div
          className="tab-list"
          role="tablist"
          aria-label="Transformation formats"
          data-active={activeTab.toLowerCase()}
        >
          <span className="tab-indicator" aria-hidden="true" />
          {tabs.map((tab, index) => (
            <TabButton
              key={tab}
              tab={tab}
              index={index}
              active={activeTab === tab}
              tabRefs={tabRefs}
              onSelect={selectTab}
              onKeyDown={handleTabKeyDown}
            />
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

      <p className="privacy-note">
        <ShieldCheck aria-hidden="true" size={18} />
        <span>Local-only by design. Nothing is uploaded.</span>
      </p>
    </main>
  );
};

const TabButton = ({
  tab,
  index,
  active,
  tabRefs,
  onSelect,
  onKeyDown,
}) => {
  const Icon = formatVisualMeta[tab].icon;

  return (
    <button
      ref={element => {
        tabRefs.current[index] = element;
      }}
      id={`tab-${tab.toLowerCase()}`}
      type="button"
      role="tab"
      aria-selected={active}
      aria-controls={`panel-${tab.toLowerCase()}`}
      tabIndex={active ? 0 : -1}
      className="tab-button"
      onClick={() => onSelect(index)}
      onKeyDown={event => onKeyDown(event, index)}
    >
      <Icon className="tab-button__icon" aria-hidden="true" size={16} />
      <span>{tab}</span>
    </button>
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
  const [celebrationKey, setCelebrationKey] = useState(0);
  const copyResetTimer = useRef();
  const inputRef = useRef(null);
  const meta = formatMeta[type];
  const id = type.toLowerCase();
  const inputCharacterLabel = useMemo(
    () => getCharacterLabel(countCodePoints(input)),
    [input],
  );
  const outputCharacterLabel = useMemo(
    () => getCharacterLabel(countCodePoints(output)),
    [output],
  );

  useEffect(
    () => () => window.clearTimeout(copyResetTimer.current),
    [],
  );

  const updateInput = nextInput => {
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

  const handleInputChange = event => {
    updateInput(event.target.value);
  };

  const handleTransform = action => {
    try {
      const result =
        action === 'encode' ? encodeValue(type, input) : decodeValue(type, input);
      setOutput(result);
      setOutputSource(input);
      setCelebrationKey(value => value + 1);
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
  const handleUseOutput = () => {
    setInput(output);
    setOutput('');
    setOutputSource('');
    setCopyState('idle');
    setStatus({
      tone: 'idle',
      source: 'input',
      message: 'Output moved to input. Ready for the next transform.',
    });
    inputRef.current?.focus();
  };

  return (
    <section
      id={`panel-${id}`}
      role="tabpanel"
      aria-labelledby={`tab-${id}`}
      hidden={hidden}
      className="tool-panel"
    >
      <div className="field">
        <div className="field-heading">
          <label htmlFor={`${id}-input`}>{meta.inputLabel}</label>
          <div className="field-heading__meta">
            {input && <span className="field-count">{inputCharacterLabel}</span>}
            <button
              type="button"
              className="utility-button"
              onClick={() => updateInput(meta.example)}
            >
              Try example
            </button>
          </div>
        </div>
        <p id={`${id}-input-help`} className="field-help">
          {meta.inputHint}
        </p>
        <textarea
          ref={inputRef}
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

      <StatusMessage
        id={`${id}-status`}
        status={status}
        celebrationKey={celebrationKey}
      />

      <div className="field">
        <div className="field-heading">
          <label htmlFor={`${id}-output`}>{meta.outputLabel}</label>
          {output && (
            <div className="field-heading__meta">
              <span className="field-count">{outputCharacterLabel}</span>
              <button
                type="button"
                className="utility-button"
                onClick={handleUseOutput}
                disabled={outputIsStale}
                aria-describedby={`${id}-status`}
              >
                Use as input
              </button>
            </div>
          )}
        </div>
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
  const [celebrationKey, setCelebrationKey] = useState(0);
  const canvasRef = useRef(null);
  const copyResetTimer = useRef();
  const decodeRequestId = useRef(0);
  const generateRequestId = useRef(0);
  const textRef = useRef('');
  const qrTextRef = useRef(null);
  const textCharacterLabel = useMemo(
    () => getCharacterLabel(countCodePoints(text)),
    [text],
  );
  const decodedCharacterLabel = useMemo(
    () => getCharacterLabel(countCodePoints(decoded)),
    [decoded],
  );

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
      if (!generatedIsStale) {
        setCelebrationKey(value => value + 1);
      }
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
          setCelebrationKey(value => value + 1);
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

  const updateQrText = nextText => {
    textRef.current = nextText;
    setText(nextText);
    const nextQrIsStale = Boolean(imgSrc && nextText !== generatedText);
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
      <StatusMessage
        id="qr-status"
        status={status}
        celebrationKey={celebrationKey}
        className="qr-status"
      />

      <div className="qr-section">
        <h2>Generate</h2>
        <div className="field">
          <div className="field-heading">
            <label htmlFor="qr-text">Text to encode</label>
            <div className="field-heading__meta">
              {text && <span className="field-count">{textCharacterLabel}</span>}
              <button
                type="button"
                className="utility-button"
                onClick={() => updateQrText('https://example.com/playful')}
              >
                Try example
              </button>
            </div>
          </div>
          <p id="qr-text-help" className="field-help">
            The QR image is generated in this browser and is never uploaded.
          </p>
          <textarea
            ref={qrTextRef}
            id="qr-text"
            name="qr-text"
            rows={3}
            placeholder="Text or URL"
            value={text}
            onChange={event => updateQrText(event.target.value)}
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
          <RefreshCw
            aria-hidden="true"
            size={17}
            className={generating ? 'is-spinning' : undefined}
          />
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
                key={generatedText}
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
          <div className="field-heading">
            <label htmlFor="qr-output">Decoded text</label>
            {decoded && (
              <div className="field-heading__meta">
                <span className="field-count">{decodedCharacterLabel}</span>
                <button
                  type="button"
                  className="utility-button"
                  onClick={() => {
                    updateQrText(decoded);
                    qrTextRef.current?.focus();
                  }}
                  aria-describedby="qr-status"
                >
                  Use to generate
                </button>
              </div>
            )}
          </div>
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