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
      const summary = parseSummary(result.stdout, example);
      assert.equal(summary.status, 'completed');
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
      const summary = parseSummary(result.stdout, example);
      assert.equal(summary.status, 'completed');
      assert.equal(summary.selectedNode, 'queue:review');
      assert.equal(summary.selectedTicket, 'T-103');
      assert.equal(summary.activeTab, 'issues');
      assert.equal(summary.tabSelectedByPointer, true);
      assert.equal(summary.tabSelectedByKeyboard, true);
      assert.equal(summary.pickerInitiallyClosed, true);
      assert.equal(summary.pickerClosedByDismissal, true);
      assert.equal(summary.paletteCommandApplied, true);
      assert.equal(summary.keyboardSearchPickerQuery, 'resolve');
      assert.equal(summary.visible, true);
      assert.equal(summary.tableHitTargets > 0, true);
      assert.equal(summary.focusValidAfterResize, true);
      assert.equal(summary.statusVisible, true);
      assert.ok(summary.frames >= 4);
    }
    if (example.endsWith('/btop-monitor.ts')) {
      const summary = parseSummary(result.stdout, example);
      assert.equal(summary.status, 'completed');
      assert.equal(summary.wheelBatchShared, true);
      assert.equal(summary.offsetAfterWheel > 0, true);
      assert.equal(summary.offsetAfterDrag > summary.offsetAfterWheel, true);
      assert.equal(summary.keyboardSelectionMoved, true);
      assert.equal(summary.metrics.wheelPackets, 3);
    }
    if (example.endsWith('/graphics.ts')) {
      assert.match(result.stdout, /Kitty\/SIXEL raster graphics with terminal fallback/u);
      assert.match(result.stdout, /Gradient preview \(terminal graphics unavailable\)/u);
      assert.doesNotMatch(result.stdout, /Verified/u);
    }
    if (example.endsWith('/testing/harness.mjs')) {
      const summary = parseSummary(result.stdout, example);
      assert.equal(summary.diagnosticCount, 0);
      assert.equal(summary.frameCount, 1);
    }
  });
}

function parseSummary(output, example) {
  const summary = JSON.parse(output);
  assert.equal(
    summary !== null && typeof summary === 'object' && !Array.isArray(summary),
    true,
    `${example} must print one summary object`,
  );
  return summary;
}
