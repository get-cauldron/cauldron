'use client';

import ReactDiffViewer from 'react-diff-viewer-continued';

// HZD theme colors for diff viewer per D-17
const HZD_DIFF_STYLES = {
  variables: {
    dark: {
      diffViewerBackground: '#0a0f14',
      diffViewerColor: '#c8d6e5',
      addedBackground: 'rgba(0, 212, 170, 0.1)',
      addedColor: '#c8d6e5',
      removedBackground: 'rgba(229, 72, 77, 0.1)',
      removedColor: '#c8d6e5',
      wordAddedBackground: 'rgba(0, 212, 170, 0.2)',
      wordRemovedBackground: 'rgba(229, 72, 77, 0.2)',
      addedGutterBackground: 'rgba(0, 212, 170, 0.08)',
      removedGutterBackground: 'rgba(229, 72, 77, 0.08)',
      gutterBackground: '#111820',
      gutterBackgroundDark: '#0a0f14',
      highlightBackground: '#1a2330',
      highlightGutterBackground: '#1a2330',
      codeFoldBackground: '#111820',
      emptyLineBackground: '#0a0f14',
      gutterColor: '#6b8399',
      addedGutterColor: '#00d4aa',
      removedGutterColor: '#e5484d',
      codeFoldContentColor: '#6b8399',
      diffViewerTitleBackground: '#111820',
      diffViewerTitleColor: '#c8d6e5',
      diffViewerTitleBorderColor: '#1a2330',
    },
  },
};

interface DiffViewerProps {
  oldValue: string;
  newValue: string;
  fileName?: string;
}

export function DiffViewer({ oldValue, newValue, fileName }: DiffViewerProps) {
  return (
    <div
      style={{
        fontFamily: 'var(--font-geist-mono, "JetBrains Mono", monospace)',
        fontSize: 12,
        overflow: 'auto',
      }}
    >
      {fileName && (
        <div
          style={{
            padding: '6px 12px',
            background: '#111820',
            borderBottom: '1px solid #1a2330',
            fontSize: 11,
            color: '#6b8399',
            fontFamily: 'var(--font-geist-mono, monospace)',
          }}
        >
          {fileName}
        </div>
      )}
      <ReactDiffViewer
        oldValue={oldValue}
        newValue={newValue}
        splitView={true}
        useDarkTheme={true}
        styles={HZD_DIFF_STYLES}
        hideLineNumbers={false}
        showDiffOnly={false}
      />
    </div>
  );
}
