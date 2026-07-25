import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  Copy,
  Download,
  RefreshCw,
} from 'lucide-react';

import { getCharacterLabel } from './format-config.jsx';
import {
  getQrCanvasSize,
  inspectQrImage,
  isQrCapacityError,
  MAX_QR_IMAGE_BYTES,
  qrImageDimensionsMatch,
} from './qr-image.mjs';
import StatusMessage from './StatusMessage.jsx';

const QrCodePanel = ({ hidden }) => {
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
    () => getCharacterLabel(text),
    [text],
  );
  const decodedCharacterLabel = useMemo(
    () => getCharacterLabel(decoded),
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
          disabled={!text || generating}
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
};

export default QrCodePanel;
