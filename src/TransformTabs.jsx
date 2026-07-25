import React from 'react';

import { formatVisualMeta, tabs } from './format-config.jsx';

const TransformTabs = ({
  activeTab,
  tabRefs,
  onSelect,
  onKeyDown,
}) => (
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
        onSelect={onSelect}
        onKeyDown={onKeyDown}
      />
    ))}
  </div>
);

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

export default TransformTabs;
