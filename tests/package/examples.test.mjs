import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { exampleScripts } from './example-list.mjs';

const root = fileURLToPath(new URL('../..', import.meta.url));

const productExampleAssertions = [
  {
    script: 'examples/products/file-manager.mjs',
    text: [/Harbor Files/u, /File manager/u, /dispatch\/shift-report\.md/u],
    summary: {
      workflow: 'file-manager',
      action: 'select dispatch report',
      selectedAfter: 'dispatch/shift-report.md',
      previewVisible: true
    }
  },
  {
    script: 'examples/products/system-monitor.mjs',
    text: [/Pulse Monitor/u, /System monitor/u, /queue drain/u],
    summary: {
      workflow: 'system-monitor',
      action: 'drain queue shard',
      queueAfter: 54,
      actionSucceeded: true
    }
  },
  {
    script: 'examples/products/notes-workspace.mjs',
    text: [/Notes Desk/u, /Note editor/u, /Harbor review - published/u],
    summary: {
      workflow: 'note-editor-workspace',
      action: 'publish edited note',
      titleAfter: 'Harbor review - published',
      published: true
    }
  },
  {
    script: 'examples/products/data-dashboard.mjs',
    text: [/Port Ledger/u, /Arrival board/u, /Cobalt/u],
    summary: {
      workflow: 'data-table-dashboard',
      action: 'select high-risk row',
      selectedAfter: 2,
      selectedVessel: 'Cobalt'
    }
  },
  {
    script: 'examples/products/form-wizard.mjs',
    text: [/Launch Planner/u, /Wizard form/u, /Review/u],
    summary: {
      workflow: 'form-wizard',
      action: 'advance review step',
      stepAfter: 2,
      ready: true
    }
  },
  {
    script: 'examples/products/chart-explorer.mjs',
    text: [/Signal Lab/u, /Signal explorer/u, /Wind sample 4/u],
    summary: {
      workflow: 'chart-explorer',
      action: 'select chart point',
      selectedValue: 48
    }
  }
];

for (const example of exampleScripts) {
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

test('showcase app renders a polished fullscreen preview in non-TTY mode', () => {
  const result = spawnSync(process.execPath, ['examples/showcase/app.mjs'], {
    cwd: root,
    encoding: 'utf8'
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /Northstar Control/u);
  assert.match(result.stdout, /Live harbor surface/u);
  assert.match(result.stdout, /Inspector/u);
  assert.match(result.stdout, /Overview/u);
  assert.match(result.stdout, /Atlas service/u);
  assert.doesNotMatch(result.stdout, /Render pipeline|Accessible snapshot|widget tree/u);
});

test('showcase scripted tour drives runtime frames diffs hit targets and route changes', () => {
  const result = spawnSync(process.execPath, ['examples/showcase/scripted.mjs'], {
    cwd: root,
    encoding: 'utf8'
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /Northstar Control scripted tour/u);
  assert.match(result.stdout, /frames: \d+/u);
  assert.match(result.stdout, /host frames: \d+/u);
  assert.match(result.stdout, /host diffs: \d+/u);
  assert.match(result.stdout, /input command: \/dispatch/u);
  assert.match(result.stdout, /hit targets: \d+/u);
  assert.match(result.stdout, /final route: activity/u);
  assert.match(result.stdout, /final inspector: event/u);
  assert.doesNotMatch(result.stdout, /Render pipeline|Accessible snapshot|widget tree/u);
});

test('showcase visual preview exposes snapshot frame diff hit focus and accessibility evidence', () => {
  const result = spawnSync(process.execPath, ['examples/showcase/preview.mjs'], {
    cwd: root,
    encoding: 'utf8'
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /Northstar Control visual preview/u);
  assert.match(result.stdout, /schema: terminal-ui\.visual-snapshots\.v1/u);
  assert.match(result.stdout, /frame: 160x42/u);
  assert.match(result.stdout, /diff operations: \d+ fullRewrite=false/u);
  assert.match(result.stdout, /hit targets: \d+/u);
  assert.match(result.stdout, /accessibility root: application/u);
  assert.match(result.stdout, /Route map/u);
  assert.doesNotMatch(result.stdout, /Render pipeline|Accessible snapshot|widget tree/u);
});

for (const productExample of productExampleAssertions) {
  test(`product example demonstrates workflow: ${productExample.script}`, () => {
    const result = spawnSync(process.execPath, [productExample.script], {
      cwd: root,
      encoding: 'utf8'
    });

    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.equal(result.stderr, '');
    for (const pattern of productExample.text) {
      assert.match(result.stdout, pattern);
    }
    assert.deepEqual(
      pickProperties(parseLastJsonLine(result.stdout), Object.keys(productExample.summary)),
      productExample.summary
    );
  });
}

function parseLastJsonLine(output) {
  const jsonLine = output.trim().split('\n').at(-1);
  assert.ok(jsonLine !== undefined);
  return JSON.parse(jsonLine);
}

function pickProperties(value, keys) {
  return Object.fromEntries(keys.map((key) => [key, value[key]]));
}
