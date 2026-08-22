import React, { useRef } from 'react';

/**
 * A real tablist: arrow keys move between tabs, Home/End jump to the ends,
 * and only the active tab is in the Tab order — which is what makes a tab
 * strip faster to get past than a row of six links.
 *
 * Counts are pills rather than parenthesised text so the number reads as a
 * quantity attached to the label instead of part of it.
 */
export default function Tabs({ tabs, activeId, onChange, label }) {
  const refs = useRef({});

  function handleKeyDown(event) {
    const index = tabs.findIndex((tab) => tab.id === activeId);
    let next = null;

    if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
    else if (event.key === 'ArrowLeft') next = (index - 1 + tabs.length) % tabs.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = tabs.length - 1;
    else return;

    event.preventDefault();
    const nextTab = tabs[next];
    onChange(nextTab.id);
    refs.current[nextTab.id]?.focus();
  }

  return (
    <div className="ink-tabs" role="tablist" aria-label={label} onKeyDown={handleKeyDown}>
      {tabs.map((tab) => {
        const active = tab.id === activeId;
        return (
          <button
            key={tab.id}
            id={`tab-${tab.id}`}
            type="button"
            role="tab"
            aria-selected={active}
            aria-controls={`panel-${tab.id}`}
            tabIndex={active ? 0 : -1}
            ref={(node) => { refs.current[tab.id] = node; }}
            className={`ink-tabs__tab${active ? ' is-active' : ''}`}
            onClick={() => onChange(tab.id)}
          >
            <span>{tab.label}</span>
            {tab.count !== undefined && <span className="ink-tabs__count">{tab.count}</span>}
          </button>
        );
      })}
    </div>
  );
}
