import assert from 'node:assert/strict';
import test from 'node:test';

import {
  textAreaPresentation,
  textAreaReducer,
  textInputPresentation,
  textInputReducer
} from '../../dist/behavior/index.js';
import { createScrollState } from '../../dist/behavior/index.js';
import { routedPointerEvent } from '../helpers/pointer.ts';

void test('textInputReducer applies edits and grapheme-aware pointer selections', () => {
  const initial = { text: 'a🙂bc', cursor: 0 };
  const placed = textInputReducer(initial, {
    kind: 'pointer',
    action: { kind: 'placeCaret', offset: 2 }
  });
  const selected = textInputReducer(placed, {
    kind: 'pointer',
    action: { kind: 'extendSelection', anchor: 1, offset: 4 }
  });
  const replaced = textInputReducer(selected, {
    kind: 'edit',
    operation: { kind: 'insert', text: 'X' }
  });

  assert.deepEqual(placed, { text: 'a🙂bc', cursor: 1 });
  assert.deepEqual(textInputPresentation(selected), {
    value: 'a🙂bc',
    cursor: 4,
    selection: { start: 1, end: 4 }
  });
  assert.deepEqual(replaced, { text: 'aXc', cursor: 2 });
});

void test('textAreaReducer owns editing selection and normalized scroll in one action channel', () => {
  const initial = {
    input: { text: 'alpha\nbeta', cursor: 0 },
    scroll: createScrollState({ contentRows: 20, viewportRows: 4 })
  };
  const selected = textAreaReducer(initial, {
    kind: 'pointer',
    action: { kind: 'endSelection', anchor: 6, offset: 10 }
  });
  const scrolled = textAreaReducer(selected, {
    kind: 'scroll',
    event: {
      action: { kind: 'scrollLines', rows: 3 },
      scroll: initial.scroll,
      source: 'wheel',
      target: 'content',
      pointer: routedPointerEvent({ kind: 'scroll', button: 'wheelDown', clickCount: 0 })
    }
  });

  assert.deepEqual(selected.input, {
    text: 'alpha\nbeta',
    cursor: 10,
    selection: { start: 6, end: 10 }
  });
  assert.equal(scrolled.scroll.offsetRow, 3);
  assert.deepEqual(textAreaPresentation(scrolled), {
    value: 'alpha\nbeta',
    cursor: 10,
    selection: { start: 6, end: 10 },
    scroll: scrolled.scroll
  });
});
