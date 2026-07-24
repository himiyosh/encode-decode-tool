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
import {
  getQrCanvasSize,
  inspectQrImage,
  isQrCapacityError,
  MAX_QR_IMAGE_BYTES,
  qrImageDimensionsMatch,
} from './qr-image.mjs';
import { countCodePoints } from './text-metrics.mjs';
import { getTransformErrorMessage } from './transform-errors.mjs';
import { decodeValue, encodeValue } from './transforms.mjs';

const tabs = ['URL', 'Base64', 'JWT', 'Unicode', 'QR'];
const formatVisualMeta = {
  URL: { token: '%', icon: ArrowLeftRight },
  Base64: { token: '64', icon: Binary },
  JWT: { token: '{}', icon: Fingerprint },
  Unicode: { token: 'U+', icon: Languages },
  QR: { token: 'QR', icon: QrCode },
};
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

const StatusMessage = ({ id, status, className = '' }) => {
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
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      <Icon
        aria-hidden="true"
        size={17}
        className={status.tone === 'loading' ? 'status-icon is-spinning' : 'status-icon'}
      />
      <span>{status.message}</span>
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
            <span>Local encode/decode workbench</span>
          </p>
          <h1>
            <span>Encode</span>
            <span className="sr-only"> and </span>
            <ArrowLeftRight
              className="title-switch"
              aria-hidden="true"
              strokeWidth={2.5}
            />
            <span>Decode</span>
          </h1>
          <p className="app-lede">
            Inspect encoded text and QR data. Every byte stays in this browser.
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
          aria-orientation="horizontal"
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

const getSuccessMessage = (type, action) => {
  if (type === 'JWT' && action === 'decode') {
    return 'JWT structure decoded. Its signature was not verified.';
  }
  if (type === 'JWT') return 'Unsigned JWT assembled.';
  return `${type} ${action === 'encode' ? 'encoded' : 'decoded'}.`;
};

const TabContent = ({ type, hidden }) => {
  const emptyInputAllowed = type !== 'JWT';
  const [input, setInput] = useState('');
  const [output, setOutput] = useState('');
  const [hasOutput, setHasOutput] = useState(false);
  const [status, setStatus] = useState({
    tone: 'idle',
    source: 'input',
    message: emptyInputAllowed
      ? 'Empty input is valid, or enter text to transform.'
      : 'Enter text to enable the transformation actions.',
  });
  const [copyState, setCopyState] = useState('idle');
  const [outputSource, setOutputSource] = useState('');
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
    const nextOutputIsStale = hasOutput && nextInput !== outputSource;
    setStatus({
      tone: nextOutputIsStale ? 'warning' : hasOutput ? 'success' : 'idle',
      source: nextOutputIsStale || !hasOutput ? 'input' : 'result',
      message: nextInput
        ? nextOutputIsStale
          ? 'Input changed. Transform again to update the output.'
          : hasOutput
            ? 'Output matches the current input and is ready to copy.'
            : 'Ready to transform.'
        : nextOutputIsStale
          ? 'Input changed. Transform again to update the output.'
          : hasOutput
            ? 'The empty result matches the current input and is ready to copy.'
            : emptyInputAllowed
              ? 'Empty input is valid, or enter text to transform.'
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
      setHasOutput(true);
      setOutputSource(input);
      setStatus({
        tone: 'success',
        source: 'result',
        message: getSuccessMessage(type, action),
      });
    } catch (error) {
      setOutput('');
      setHasOutput(false);
      setOutputSource('');
      setStatus({
        tone: 'error',
        source: 'input',
        message: getTransformErrorMessage(type, action, error),
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

  const outputIsStale = hasOutput && input !== outputSource;
  const inputInvalid = status.tone === 'error' && status.source === 'input';
  const handleUseOutput = () => {
    setInput(output);
    setOutput('');
    setHasOutput(false);
    setOutputSource('');
    setCopyState('idle');
    setStatus({
      tone: 'idle',
      source: 'input',
      message: 'Output moved to input. Ready for the next transform.',
    });
    inputRef.current?.focus();
  };
  const handleUseOutputClick = () => {
    if (!outputIsStale) handleUseOutput();
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
          aria-describedby={`${id}-input-help`}
          aria-errormessage={inputInvalid ? `${id}-status` : undefined}
        />
      </div>

      <div className="action-group">
        <button
          type="button"
          className="action-button action-button--primary"
          onClick={() => handleTransform('encode')}
          disabled={!emptyInputAllowed && input.length === 0}
        >
          <RefreshCw aria-hidden="true" size={17} />
          <span>Encode</span>
        </button>
        <button
          type="button"
          className="action-button action-button--secondary"
          onClick={() => handleTransform('decode')}
          disabled={!emptyInputAllowed && input.length === 0}
        >
          <ChevronRight aria-hidden="true" size={17} />
          <span>Decode</span>
        </button>
        <button
          type="button"
          className="action-button action-button--tertiary copy-button"
          onClick={handleCopy}
          disabled={!hasOutput || outputIsStale}
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
      />

      <div className="field">
        <div className="field-heading">
          <label htmlFor={`${id}-output`}>{meta.outputLabel}</label>
          {hasOutput && (
            <div className="field-heading__meta">
              <span className="field-count">{outputCharacterLabel}</span>
              <button
                type="button"
                className="utility-button"
                onClick={handleUseOutputClick}
                aria-disabled={outputIsStale ? 'true' : undefined}
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
          placeholder={hasOutput ? 'The result is empty' : 'Output appears here'}
          aria-describedby={outputIsStale ? `${id}-status` : undefined}
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
  const [hasDecoded, setHasDecoded] = useState(false);
  const [status, setStatus] = useState({
    tone: 'idle',
    source: 'general',
    message: 'Generate a QR code or choose an image to decode locally.',
  });
  const [generating, setGenerating] = useState(false);
  const [copyState, setCopyState] = useState('idle');
  const canvasRef = useRef(null);
  const copyResetTimer = useRef();
  const decodeRequestId = useRef(0);
  const generateRequestId = useRef(0);
  const textRef = useRef('');
  const qrTextRef = useRef(null);
  const pendingImageRef = useRef(null);
  const pendingImageUrlRef = useRef('');
  const textCharacterLabel = useMemo(
    () => getCharacterLabel(countCodePoints(text)),
    [text],
  );
  const decodedCharacterLabel = useMemo(
    () => getCharacterLabel(countCodePoints(decoded)),
    [decoded],
  );

  const cancelPendingImage = () => {
    if (pendingImageRef.current) {
      pendingImageRef.current.onload = null;
      pendingImageRef.current.onerror = null;
      pendingImageRef.current.src = '';
      pendingImageRef.current = null;
    }
    if (pendingImageUrlRef.current) {
      URL.revokeObjectURL(pendingImageUrlRef.current);
      pendingImageUrlRef.current = '';
    }
  };

  useEffect(
    () => () => {
      window.clearTimeout(copyResetTimer.current);
      decodeRequestId.current += 1;
      generateRequestId.current += 1;
      cancelPendingImage();
    },
    [],
  );

  const generateQR = async () => {
    if (!text || generating) return;
    const sourceText = text;
    const requestId = ++generateRequestId.current;
    setGenerating(true);
    setStatus({ tone: 'loading', source: 'text', message: 'Generating QR code…' });
    try {
      const { default: QRCode } = await import('qrcode');
      const url = await QRCode.toDataURL(sourceText, { width: 240, margin: 2 });
      if (requestId !== generateRequestId.current) return;
      setImgSrc(url);
      setGeneratedText(sourceText);
      const generatedIsStale = sourceText !== textRef.current;
      setStatus({
        tone: generatedIsStale ? 'warning' : 'success',
        source: generatedIsStale ? 'text' : 'result',
        message: generatedIsStale
          ? 'Text changed while the QR code was generated. Generate again before downloading.'
          : 'QR code generated and ready to download.',
      });
    } catch (error) {
      if (requestId !== generateRequestId.current) return;
      setImgSrc('');
      setGeneratedText('');
      setStatus({
        tone: 'error',
        source: 'text',
        message: isQrCapacityError(error)
          ? 'That text is too long for one QR code. Shorten it and generate again.'
          : 'The QR code could not be generated. Check the text and try again.',
      });
    } finally {
      if (requestId === generateRequestId.current) {
        setGenerating(false);
      }
    }
  };

  const onFileChange = async e => {
    const input = e.currentTarget;
    const file = input.files?.[0];
    if (!file) return;
    input.value = '';
    const requestId = ++decodeRequestId.current;
    cancelPendingImage();
    setDecoded('');
    setHasDecoded(false);
    setCopyState('idle');

    if (file.size > MAX_QR_IMAGE_BYTES) {
      setStatus({
        tone: 'error',
        source: 'file',
        message: 'That image is larger than 10 MB. Choose a smaller image.',
      });
      return;
    }

    setStatus({
      tone: 'loading',
      source: 'file',
      message: 'Checking the QR image locally…',
    });
    let bytes;
    try {
      bytes = new Uint8Array(await file.arrayBuffer());
    } catch {
      if (requestId !== decodeRequestId.current) return;
      setStatus({
        tone: 'error',
        source: 'file',
        message: 'The browser could not read that file. Choose it again or try another image.',
      });
      return;
    }
    if (requestId !== decodeRequestId.current) return;

    let inspection;
    try {
      inspection = inspectQrImage(bytes);
    } catch (error) {
      if (requestId !== decodeRequestId.current) return;
      const code = error instanceof Error ? error.message : '';
      setStatus({
        tone: 'error',
        source: 'file',
        message:
          code === 'image-dimensions-too-large'
            ? 'That image has too many pixels to process safely. Choose an image under 24 megapixels.'
            : code === 'invalid-image-dimensions'
              ? 'That image reports invalid dimensions. Choose another image file.'
              : 'That file is not a supported PNG, JPEG, GIF, or WebP image.',
      });
      return;
    }
    if (requestId !== decodeRequestId.current) return;

    setStatus({
      tone: 'loading',
      source: 'file',
      message: 'Decoding the QR image locally…',
    });
    const imageUrl = URL.createObjectURL(file);
    const img = new Image();
    pendingImageRef.current = img;
    pendingImageUrlRef.current = imageUrl;
    let imageReleased = false;
    const releaseImage = () => {
      if (imageReleased) return;
      imageReleased = true;
      if (pendingImageRef.current === img) pendingImageRef.current = null;
      if (pendingImageUrlRef.current === imageUrl) {
        pendingImageUrlRef.current = '';
      }
      URL.revokeObjectURL(imageUrl);
    };

    img.onload = async () => {
      if (requestId !== decodeRequestId.current) return;
      try {
        if (
          !qrImageDimensionsMatch(
            inspection.width,
            inspection.height,
            img.naturalWidth,
            img.naturalHeight,
          )
        ) {
          throw new Error('image-dimensions-mismatch');
        }
        const canvas = canvasRef.current;
        const context = canvas?.getContext('2d', { willReadFrequently: true });
        if (!canvas || !context) throw new Error('canvas-unavailable');
        const canvasSize = getQrCanvasSize(
          img.naturalWidth,
          img.naturalHeight,
        );
        canvas.width = canvasSize.width;
        canvas.height = canvasSize.height;
        context.drawImage(img, 0, 0, canvasSize.width, canvasSize.height);
        const imageData = context.getImageData(
          0,
          0,
          canvasSize.width,
          canvasSize.height,
        );
        releaseImage();
        const { default: jsQR } = await import('jsqr');
        if (requestId !== decodeRequestId.current) return;
        const code = jsQR(imageData.data, imageData.width, imageData.height);
        if (!code) {
          setHasDecoded(false);
          setStatus({
            tone: 'error',
            source: 'file',
            message: 'No QR code was found in that image. Try a sharper, uncropped image.',
          });
          return;
        }
        setDecoded(code.data);
        setHasDecoded(true);
        setStatus({
          tone: 'success',
          source: 'decoded',
          message: 'QR code decoded locally.',
        });
      } catch {
        if (requestId !== decodeRequestId.current) return;
        setDecoded('');
        setHasDecoded(false);
        setStatus({
          tone: 'error',
          source: 'file',
          message: 'The image could not be read. Try another image file.',
        });
      } finally {
        releaseImage();
      }
    };
    img.onerror = () => {
      if (requestId !== decodeRequestId.current) return;
      releaseImage();
      setStatus({
        tone: 'error',
        source: 'file',
        message: 'The image could not be opened. Try another image file.',
      });
    };
    img.src = imageUrl;
  };

  const copyDecoded = async () => {
    try {
      await navigator.clipboard.writeText(decoded);
      setCopyState('copied');
      setStatus({
        tone: 'success',
        source: 'decoded',
        message: 'Decoded text copied to the clipboard.',
      });
      window.clearTimeout(copyResetTimer.current);
      copyResetTimer.current = window.setTimeout(() => setCopyState('idle'), 2500);
    } catch {
      setCopyState('idle');
      setStatus({
        tone: 'error',
        source: 'action',
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
      source: nextQrIsStale ? 'text' : imgSrc ? 'result' : 'text',
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
  const qrTextInvalid = status.tone === 'error' && status.source === 'text';
  const qrFileInvalid = status.tone === 'error' && status.source === 'file';

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
        className="qr-status"
      />

      <section className="qr-section" aria-labelledby="qr-generate-heading">
        <h2 id="qr-generate-heading">Generate</h2>
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
            aria-describedby="qr-text-help"
            aria-invalid={qrTextInvalid ? 'true' : undefined}
            aria-errormessage={qrTextInvalid ? 'qr-status' : undefined}
          />
        </div>

        <button
          type="button"
          onClick={generateQR}
          className="action-button action-button--primary"
          disabled={!text}
          aria-disabled={generating ? 'true' : undefined}
          aria-busy={generating}
          aria-describedby="qr-status"
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
      </section>

      <section className="qr-section" aria-labelledby="qr-decode-heading">
        <h2 id="qr-decode-heading">Decode</h2>
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
            aria-describedby="qr-upload-help"
            aria-invalid={qrFileInvalid ? 'true' : undefined}
            aria-errormessage={qrFileInvalid ? 'qr-status' : undefined}
            className="file-input"
          />
        </div>

        <canvas ref={canvasRef} hidden aria-hidden="true" />

        <div className="field">
          <div className="field-heading">
            <label htmlFor="qr-output">Decoded text</label>
            {hasDecoded && (
              <div className="field-heading__meta">
                <span className="field-count">{decodedCharacterLabel}</span>
                {decoded && (
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
                )}
              </div>
            )}
          </div>
          <textarea
            id="qr-output"
            name="qr-output"
            rows={3}
            readOnly
            placeholder={hasDecoded ? 'The decoded text is empty' : 'Decoded text appears here'}
            value={decoded}
          />
        </div>

        <button
          type="button"
          className="action-button action-button--tertiary copy-button"
          onClick={copyDecoded}
          disabled={!hasDecoded}
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
      </section>

    </section>
  );
}