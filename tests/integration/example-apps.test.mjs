import assert from 'node:assert/strict';
import test from 'node:test';

import { createMemoryTerminalHost } from '../../dist/host/index.js';
import { renderFramePlain } from '../../dist/renderer/index.js';
import { highContrastTheme, noColorTheme } from '../../dist/theme/index.js';
import { createTuiRuntime } from '../../dist/tui/index.js';
import { btopMonitorApp } from '../../examples/tui/btop-monitor.mjs';
import { ideEditorApp } from '../../examples/tui/ide-editor.mjs';
import { interactiveWorkspaceApp } from '../../examples/tui/interactive-workspace.mjs';

const examples = [
  { name: 'interactive workspace', app: interactiveWorkspaceApp, anchor: 'T-101' },
  { name: 'IDE editor', app: ideEditorApp, anchor: 'Open a folder or file' },
  { name: 'btop monitor', app: btopMonitorApp, anchor: 'CPU' }
];

for (const example of examples) {
  test(`${example.name} preserves structural output across themes and resize`, async () => {
    const highContrast = await renderExample(example.app, highContrastTheme);
    const noColor = await renderExample(example.app, noColorTheme);

    assert.equal(highContrast.wide.includes(example.anchor), true);
    assert.equal(highContrast.narrow.trim().length > 0, true);
    assert.equal(highContrast.wide, noColor.wide);
    assert.equal(highContrast.narrow, noColor.narrow);
    assert.equal(highContrast.wideRows, 42);
    assert.equal(highContrast.narrowRows, 28);
  });
}

async function renderExample(app, theme) {
  const host = createMemoryTerminalHost({ viewport: { columns: 160, rows: 42 } });
  const runtime = createTuiRuntime({ app, host, theme });
  try {
    const wide = await runtime.start();
    const narrow = await runtime.resize({ columns: 88, rows: 28 });
    return {
      wide: renderFramePlain(wide),
      narrow: renderFramePlain(narrow),
      wideRows: wide.height,
      narrowRows: narrow.height
    };
  } finally {
    await runtime.dispose();
  }
}
