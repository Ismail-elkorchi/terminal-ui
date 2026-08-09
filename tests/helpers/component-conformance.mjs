import assert from 'node:assert/strict';
import test from 'node:test';

import { renderElementSnapshot } from '../../dist/testing/index.js';

export function runButtonConformance(name, createButton) {
  test(`${name}: exact decoding, sanitization, Unicode, styles, source, focus, and determinism`, () => {
    const element = createButton({
      id: `${name}-button`,
      label: `Go\u001b[31m界`,
      onAction: () => ({ kind: 'activate' }),
      meta: { styles: { parts: { label: { underline: true } } } }
    });
    const input = {
      element,
      terminalSize: { columns: 12, rows: 2 },
      focusPath: [`${name}-button`]
    };
    const first = renderElementSnapshot(input);
    const second = renderElementSnapshot(input);

    assert.equal(first.plainTextFrame.includes(String.fromCharCode(27)), false);
    assert.match(first.plainTextFrame, /Go界/u);
    assert.equal(first.frameJson, second.frameJson);
    assert.deepEqual(first.frame.focusPath, [`${name}-button`]);
    assert.equal(first.frame.accessibility.focusPath.includes(`${name}-button`), true);
    assert.equal((first.frame.hitTargets?.length ?? 0) > 0, true);
    assert.equal(first.frame.cells.some((cell) => cell.style?.underline === true), true);
    assert.equal(first.frame.cells.some((cell) => cell.source?.rendererFamily === 'component'), true);

    const tiny = renderElementSnapshot({ element, terminalSize: { columns: 1, rows: 1 } });
    assert.equal(tiny.frame.width, 1);
    assert.equal(tiny.frame.height, 1);
  });

  test(`${name}: disabled state suppresses interaction and remains accessible`, () => {
    const snapshot = renderElementSnapshot({
      element: createButton({ id: `${name}-disabled`, label: 'Disabled', disabled: true }),
      terminalSize: { columns: 12, rows: 1 }
    });

    assert.equal(snapshot.frame.hitTargets?.length ?? 0, 0);
    assert.equal(snapshot.frame.focusPath, undefined);
    assert.equal(snapshot.frame.accessibility.root.disabled, true);
  });

  test(`${name}: unknown instance fields fail at the component boundary`, () => {
    assert.throws(() => createButton({
      id: `${name}-invalid`,
      label: 'Invalid',
      onAction: () => ({ kind: 'activate' }),
      misspelled: true
    }), /unknown field/u);
  });
}
