import React from 'react';
import { ArrowLeftRight, ShieldCheck } from 'lucide-react';

import { formatVisualMeta, tabs } from './format-config.jsx';

const AppHeader = ({ activeTab }) => {
  const activeFormat = formatVisualMeta[activeTab];

  return (
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
  );
};

export default AppHeader;
