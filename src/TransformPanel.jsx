import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  ChevronRight,
  Copy,
  RefreshCw,
} from 'lucide-react';

import {
  formatMeta,
  getCharacterLabel,
  getSuccessMessage,
} from './format-config.jsx';
import StatusMessage from './StatusMessage.jsx';
import { getTransformErrorMessage } from './transform-errors.mjs';
import { decodeValue, encodeValue } from './transforms.mjs';

const TransformPanel = ({ type, hidden }) => {
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
    () => getCharacterLabel(input),
    [input],
  );
  const outputCharacterLabel = useMemo(
    () => getCharacterLabel(output),
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

export default TransformPanel;
