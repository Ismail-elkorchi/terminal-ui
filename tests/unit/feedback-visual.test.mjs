import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveTerminalCapabilities } from '../../dist/host/index.js';
import { createVisualSnapshot } from '../../dist/testing/index.js';
import { highContrastTheme } from '../../dist/theme/index.js';
import { renderElementFrame } from '../../dist/renderer/index.js';
import {
  activityIndicator,
  helpBar,
  progressBar,
  spinner,
  statusBar
} from '../../dist/components/index.js';
import { stack } from '../../dist/layout/index.js';

test('feedback status widgets preserve state in high contrast and no color output', () => {
  const frame = renderElementFrame(stack([
    statusBar({ id: 'status', text: 'Ready' }),
    helpBar({ id: 'help', bindings: [{ key: 'Enter', label: 'run' }] }),
    activityIndicator({ id: 'activity', label: 'Indexing', status: 'warning' }),
    spinner({ id: 'spinner', label: 'Done', status: 'success' }),
    progressBar({
      id: 'progress',
      label: 'Deploy',
      value: 2,
      max: 4,
      barWidth: 4,
      status: 'error',
      display: 'bar+value+percent'
    })
  ], { gap: 0 }), { columns: 48, rows: 5 }, { theme: highContrastTheme });
  const highContrast = createVisualSnapshot({
    frame,
    ansi: { capabilities: colorCapabilities(), theme: highContrastTheme }
  });
  const noColor = createVisualSnapshot({
    frame,
    ansi: { capabilities: noColorCapabilities(), theme: highContrastTheme }
  });

  assert.equal(highContrast.plainTextFrame, [
    'Ready',
    'Enter run',
    '! Indexing (warning)',
    '+ Done (success)',
    'x Deploy [##--] 2/4 50%'
  ].join('\n'));
  assert.equal(noColor.plainTextFrame, highContrast.plainTextFrame);
  assert.doesNotMatch(noColor.ansiFrame, /\\x1b\[[0-9;]*m/u);
  assert.equal(frame.cells.find((cell) => cell.source?.ownerId === 'activity' && cell.text === '!')?.source?.label, 'status.marker');
  assert.equal(frame.cells.find((cell) => cell.source?.ownerId === 'spinner' && cell.text === '+')?.source?.label, 'status.marker');
  assert.equal(frame.cells.find((cell) => cell.source?.ownerId === 'progress' && cell.text === 'x')?.source?.label, 'status.marker');
});

function colorCapabilities() {
  return resolveTerminalCapabilities({
    host: {
      runtime: 'memory',
      inputIsTty: true,
      outputIsTty: true,
      rawInput: true
    }
  });
}

function noColorCapabilities() {
  return {
    ...colorCapabilities(),
    color: {
      depth: 0,
      hasBasicColors: false,
      has256Colors: false,
      hasTrueColor: false
    }
  };
}
