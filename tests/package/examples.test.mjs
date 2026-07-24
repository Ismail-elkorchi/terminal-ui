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
    if (example.endsWith('/ide-editor.ts')) {
      const summary = JSON.parse(result.stdout);
      assert.equal(summary.status, 'ok');
      assert.equal(summary.rootOpened, true);
      assert.equal(summary.activeFile, 'README.md');
      assert.equal(summary.savedPlan, true);
      assert.equal(summary.chooserVisible, true);
      assert.equal(summary.openBuffers, 2);
      assert.equal(summary.dirtyBuffers, 0);
      assert.equal(summary.treeTargets > 0, true);
      assert.equal(summary.visible, true);
      assert.ok(summary.frames >= 6);
    }
    if (example.endsWith('/interactive-workspace.ts')) {
      const summary = JSON.parse(result.stdout);
      assert.equal(summary.status, 'ok');
      assert.equal(summary.selectedNode, 'queue:review');
      assert.equal(summary.activeTab, 'issues');
      assert.equal(summary.tabSelectedByPointer, true);
      assert.equal(summary.tabSelectedByKeyboard, true);
      assert.equal(summary.searchPickerUsed, true);
      assert.equal(summary.pointerTree, true);
      assert.equal(summary.pointerTable, true);
      assert.equal(summary.keyboardSearchPickerQuery, 'resolve');
      assert.equal(summary.visible, true);
      assert.equal(summary.tableHitTargets > 0, true);
      assert.equal(summary.focusValidAfterResize, true);
      assert.equal(summary.statusVisible, true);
      assert.ok(summary.frames >= 4);
    }
    if (example.endsWith('/btop-monitor.ts')) {
      const summary = JSON.parse(result.stdout);
      assert.equal(summary.status, 'ok');
      assert.equal(summary.wheelBatchShared, true);
      assert.equal(summary.offsetAfterWheel > 0, true);
      assert.equal(summary.offsetAfterDrag > summary.offsetAfterWheel, true);
      assert.equal(summary.keyboardSelectionMoved, true);
      assert.equal(summary.metrics.wheelPackets, 3);
    }
  });
}
