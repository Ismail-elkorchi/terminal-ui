import assert from 'node:assert/strict';
import test from 'node:test';
import { createTextDocument, textDocumentEdit, defaultTextWidthProfile } from '../../../dist/text/index.js';
import { layoutTextAreaDocument } from '../../../dist/components/text-area/layout.js';

test('resizing an unchanged document reuses width-independent line measurements', () => {
  const document = createTextDocument(Array.from({ length: 4000 }, (_, i) => `${i} 界 é 👩🏽‍💻`).join('\n'));
  const original = Intl.Segmenter.prototype.segment;
  let calls = 0;
  Intl.Segmenter.prototype.segment = function(text) { calls += 1; return original.call(this, text); };
  try {
    const initial = layoutTextAreaDocument(document, 60, true, defaultTextWidthProfile);
    assert.equal(initial.contentRows, 4000);
    assert.ok(calls > 0);
    const before = calls;
    for (const width of [70, 80, 90, 100, 110, 120, 130, 140, 150]) {
      assert.equal(layoutTextAreaDocument(document, width, true, defaultTextWidthProfile).contentRows, 4000);
    }
    assert.equal(calls, before, 'width changes must not resegment unchanged unwrapped lines');
  } finally { Intl.Segmenter.prototype.segment = original; }
});

test('width reuse keeps wrapping, edits and width profiles exact', () => {
  const source = Array.from({ length: 40 }, (_, i) => `${i} ${'界 é 👩🏽‍💻 '.repeat(12)}`).join('\n');
  const document = createTextDocument(source);
  const profiles = [defaultTextWidthProfile, { emoji: 'codepoint', ambiguous: 'narrow' }];
  for (const profile of profiles) {
    for (const width of [30, 8, 70, 2, 100]) {
      const actual = layoutTextAreaDocument(document, width, true, profile);
      const expected = layoutTextAreaDocument(createTextDocument(source), width, true, profile);
      assert.equal(actual.contentRows, expected.contentRows);
      assert.deepEqual(actual.allRowStartOffsets(), expected.allRowStartOffsets());
      for (const offset of [0, 6, 20, source.length - 1]) assert.deepEqual(actual.cursorAt(offset, 'downstream'), expected.cursorAt(offset, 'downstream'));
    }
  }
  const edited = textDocumentEdit(document, { startOffset: 0, endOffsetExclusive: 1 }, 'changed').document;
  const actual = layoutTextAreaDocument(edited, 30, true, defaultTextWidthProfile);
  const expected = layoutTextAreaDocument(createTextDocument('changed' + source.slice(1)), 30, true, defaultTextWidthProfile);
  assert.deepEqual(actual.allRowStartOffsets(), expected.allRowStartOffsets());
});
