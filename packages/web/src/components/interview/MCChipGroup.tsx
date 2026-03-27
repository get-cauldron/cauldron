'use client';

import * as React from 'react';

export interface MCChipGroupProps {
  options: string[];
  onSelect: (option: string) => void;
  disabled?: boolean;
}

export function MCChipGroup({ options, onSelect, disabled = false }: MCChipGroupProps) {
  const [selected, setSelected] = React.useState(false);
  const [opacity, setOpacity] = React.useState(1);

  // After selection, fade out chips (150ms per animation contract), then render null
  function handleSelect(option: string) {
    if (selected || disabled) return;
    setSelected(true);
    // Trigger fade-out animation: opacity 1 -> 0 over 150ms
    setOpacity(0);
    onSelect(option);
  }

  // Render null after selection animation completes
  if (selected && opacity === 0) return null;

  return (
    <div
      className="flex flex-wrap gap-2"
      style={{
        opacity,
        transition: 'opacity 150ms cubic-bezier(0.25, 0.46, 0.45, 0.94)',
        padding: '4px 0',
      }}
      aria-label="Multiple-choice suggestions"
    >
      {options.map((option) => (
        <button
          key={option}
          onClick={() => handleSelect(option)}
          disabled={disabled || selected}
          className="group"
          style={{
            backgroundColor: '#111820',
            border: '1px solid #1a2330',
            color: '#c8d6e5',
            fontSize: '13px',
            fontWeight: 400,
            borderRadius: '9999px',
            padding: '6px 12px',
            cursor: disabled || selected ? 'not-allowed' : 'pointer',
            transition: 'background-color 150ms, border-color 150ms',
            outline: 'none',
            minHeight: 44,
            lineHeight: 1.4,
          }}
          onMouseEnter={(e) => {
            if (!disabled && !selected) {
              const btn = e.currentTarget;
              btn.style.backgroundColor = '#1a2330';
              btn.style.borderColor = '#00d4aa';
            }
          }}
          onMouseLeave={(e) => {
            const btn = e.currentTarget;
            btn.style.backgroundColor = '#111820';
            btn.style.borderColor = '#1a2330';
          }}
          onFocus={(e) => {
            e.currentTarget.style.boxShadow = '0 0 0 2px #00d4aa';
          }}
          onBlur={(e) => {
            e.currentTarget.style.boxShadow = 'none';
          }}
        >
          {option}
        </button>
      ))}
    </div>
  );
}
