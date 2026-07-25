import React from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Info,
  Loader2,
} from 'lucide-react';

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

export default StatusMessage;
