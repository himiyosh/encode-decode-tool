import React, { useRef, useState } from 'react';
import { ShieldCheck } from 'lucide-react';

import AppHeader from './AppHeader.jsx';
import { tabs } from './format-config.jsx';
import QrCodePanel from './QrCodePanel.jsx';
import TransformPanel from './TransformPanel.jsx';
import TransformTabs from './TransformTabs.jsx';

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
      <AppHeader activeTab={activeTab} />

      <section className="workbench" aria-label="Encoding and decoding workbench">
        <div className="workbench-meta" aria-hidden="true">
          <span className="workbench-meta__dot" />
          <span>Ready locally</span>
          <strong>{activeTab} mode</strong>
        </div>

        <TransformTabs
          activeTab={activeTab}
          tabRefs={tabRefs}
          onSelect={selectTab}
          onKeyDown={handleTabKeyDown}
        />

        {tabs.map(tab =>
          tab === 'QR' ? (
            <QrCodePanel key={tab} hidden={activeTab !== tab} />
          ) : (
            <TransformPanel key={tab} type={tab} hidden={activeTab !== tab} />
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

export default App;
