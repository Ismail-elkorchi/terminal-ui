import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = fileURLToPath(new URL('../..', import.meta.url));
const examples = [
  'examples/prompts/non-tty-input.mjs',
  'examples/shell/cli-core-shell.mjs',
  'examples/tui/render-frame.mjs',
  'examples/tui/forms-settings.mjs',
  'examples/tui/file-browser.mjs',
  'examples/tui/data-table.mjs',
  'examples/tui/log-viewer.mjs',
  'examples/tui/command-palette.mjs',
  'examples/tui/installer-wizard.mjs',
  'examples/tui/text-editor.mjs',
  'examples/tui/game-board.mjs',
  'examples/tui/chat-interface.mjs',
  'examples/tui/monitoring-console.mjs',
  'examples/tui/custom-widget.mjs',
  'examples/testing/visual-snapshots.mjs',
  'examples/testing/harness.mjs'
];

for (const example of examples) {
  test(`example runs: ${example}`, () => {
    const result = spawnSync(process.execPath, [example], {
      cwd: root,
      encoding: 'utf8'
    });

    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.equal(result.stderr, '');
    assert.notEqual(result.stdout.trim(), '');
  });
}
