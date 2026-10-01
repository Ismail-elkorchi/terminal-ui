import assert from 'node:assert/strict';
import test from 'node:test';

import { ignoreMessage } from '../../../dist/component/index.js';
import { button, toggleButton } from '../../../dist/components/index.js';
import { renderElementFrame, renderFramePlain } from '../../../dist/renderer/index.js';
import { renderElementInternal } from '../../../dist/renderer/internal/render-element.js';
import { defaultTheme } from '../../../dist/theme/index.js';

const size = { columns: 16, rows: 1 };
const frameStyle = { fg: { kind: 'ansi', value: 2 }, bold: true };
const markerStyle = { fg: { kind: 'ansi', value: 5 }, bold: false, underline: true };

function assertMarker(frame, glyph, style, state) {
  const marker = frame.cells.find((cell) => cell.row === 1 && cell.column === 1);
  assert.equal(marker?.text, glyph);
  assert.equal(marker?.style?.fg?.kind, style.fg.kind);
  assert.equal(marker?.style?.fg?.value, style.fg.value);
  assert.equal(marker?.style?.bold, style.bold);
  assert.equal(marker?.style?.underline, style.underline);
  assert.equal(marker?.source?.partType, 'marker');
  assert.equal(marker?.source?.partName, 'marker');
  assert.equal(marker?.source?.description, 'marker');
  assert.equal(marker?.source?.cellRole, 'decoration');
  assert.equal(marker?.source?.interactionState, state);
}

function assertFramePadding(frame) {
  const padding = frame.cells.find((cell) => cell.row === 1 && cell.column === 2);
  assert.equal(padding?.text, ' ');
  assert.equal(padding?.source?.partType, 'frame');
  assert.equal(padding?.source?.partName, 'padding.leading');
  assert.deepEqual(padding?.style?.fg, frameStyle.fg);
  assert.equal(padding?.style?.underline, undefined);
  const trailing = frame.cells.find((cell) => cell.source?.partName === 'padding.trailing');
  assert.equal(trailing?.source?.partType, 'frame');
}

test('busy button marker uses its own state-part override while padding stays frame styled', () => {
  const frame = renderElementFrame(button({
    id: 'busy-marker',
    label: 'Sync',
    busy: true,
    onPress: () => ignoreMessage(),
    styles: {
      parts: { frame: frameStyle, marker: { underline: false } },
      states: { busy: { parts: { marker: markerStyle, frame: frameStyle } } },
    },
  }), size, { focusPath: ['none'] });

  assertMarker(frame, defaultTheme.tokens.symbols.statusInfo, markerStyle, 'busy');
  assertFramePadding(frame);
  assert.equal(renderFramePlain(frame).trimEnd(), 'i Sync');
});

test('pointer-pressed button marker uses the pressed anatomy override', () => {
  const element = button({
    id: 'pressed-marker',
    label: 'Press',
    onPress: () => ignoreMessage(),
    styles: {
      parts: { frame: frameStyle },
      states: { pressed: { parts: { marker: markerStyle, frame: frameStyle } } },
    },
  });
  const initial = renderElementInternal(element, size, { focusPath: ['none'] });
  const target = initial.regions.flatMap((region) => region.hitTargets)
    .find((entry) => entry.id === 'pressed-marker:control');
  assert.ok(target);
  const { frame } = renderElementInternal(element, size, {
    focusPath: ['none'],
    pointerVisuals: { pressed: { ownerIdentity: target.ownerIdentity, targetId: target.id } },
  });

  assertMarker(frame, defaultTheme.tokens.symbols.selected, markerStyle, 'pressed');
  assertFramePadding(frame);
});

for (const density of ['regular', 'compact']) {
  test(`pressed toggle marker is separately styled at ${density} density`, () => {
    const frame = renderElementFrame(toggleButton({
      id: `toggle-marker-${density}`,
      label: 'Enabled',
      pressed: true,
      density,
      onTransition: () => ignoreMessage(),
      meta: { focus: { disabled: true } },
      styles: { parts: { frame: frameStyle, marker: markerStyle } },
    }), size, { focusPath: ['none'] });

    assertMarker(frame, defaultTheme.tokens.symbols.selected, markerStyle, undefined);
    if (density === 'regular') {
      assertFramePadding(frame);
    } else {
      const label = frame.cells.find((cell) => cell.row === 1 && cell.column === 2);
      assert.equal(label?.text, 'E');
      assert.equal(label?.source?.partType, 'label');
      assert.equal(frame.cells.some((cell) => cell.source?.partName === 'padding.leading'), false);
    }
    const trailing = frame.cells.find((cell) => cell.source?.partName === 'padding.trailing');
    assert.deepEqual(trailing?.style?.fg, frameStyle.fg);
    assert.equal(trailing?.style?.underline, undefined);
    assert.equal(frame.accessibility.root.pressed, true);
  });
}
