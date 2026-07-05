import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { exampleScripts } from './example-list.mjs';

const root = fileURLToPath(new URL('../..', import.meta.url));

for (const example of exampleScripts) {
  test(`example runs: ${example}`, () => {
    const result = spawnSync(process.execPath, [example], {
      cwd: root,
      encoding: 'utf8'
    });

    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.equal(result.stderr, '');
    assert.notEqual(result.stdout.trim(), '');
    if (example.endsWith('/ide-editor.mjs')) {
      const summary = JSON.parse(result.stdout);
      assert.equal(summary.status, 'ok');
      assert.equal(summary.rootOpened, true);
      assert.equal(summary.activeFile, 'plan.md');
      assert.equal(summary.savedReadme, true);
      assert.equal(summary.openBuffers, 2);
      assert.equal(summary.dirtyBuffers, 0);
      assert.equal(summary.paletteQuery, 'save');
      assert.equal(summary.notesExpanded, true);
      assert.equal(summary.readmeVisible, true);
      assert.equal(summary.pointerTree, true);
      assert.equal(summary.pointerMenu, true);
      assert.equal(summary.treeTargets > 0, true);
      assert.equal(summary.menuTargets > 0, true);
      assert.equal(summary.visible, true);
      assert.ok(summary.frames >= 8);
    }
    if (example.endsWith('/interactive-workspace.mjs')) {
      const summary = JSON.parse(result.stdout);
      assert.equal(summary.status, 'ok');
      assert.equal(summary.selectedNode, 'queue:review');
      assert.equal(summary.activeTab, 'activity');
      assert.equal(summary.paletteUsed, true);
      assert.equal(summary.pointerTree, true);
      assert.equal(summary.pointerTable, true);
      assert.equal(summary.pointerPalette, true);
      assert.equal(summary.keyboardPaletteQuery, 'resolve');
      assert.equal(summary.commandAfterPaletteAccept, '/issues');
      assert.equal(summary.visible, true);
      assert.equal(summary.tableHitTargets > 0, true);
      assert.ok(summary.frames >= 4);
    }
  });
}
