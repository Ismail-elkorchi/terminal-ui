import assert from 'node:assert/strict';
import test from 'node:test';

import { layoutTextAreaDocument } from '../../dist/components/internal/text-area-layout.js';
import {
  createTextDocument,
  defaultTextWidthProfile,
  textDocumentEdit,
  textDocumentText,
} from '../../dist/text/index.js';

test('text-area persistent layout matches a fresh layout across changed line ranges', () => {
  let document = createTextDocument('alpha\nbeta🙂\ngamma\ndelta');
  const mutations = [
    { start: 2, end: 2, text: 'X' },
    { start: 3, end: 3, text: '\nnew' },
    { start: 0, end: 6, text: 'first\nsecond' },
    { start: 12, end: 13, text: '' },
    { start: 0, end: 0, text: 'prefix\n' },
  ];

  for (const wrap of [false, true]) {
    let current = document;
    for (const mutation of mutations) {
      layoutTextAreaDocument(current, 5, wrap, defaultTextWidthProfile);
      const length = textDocumentText(current).length;
      const start = Math.min(length, mutation.start);
      const end = Math.min(length, Math.max(start, mutation.end));
      current = textDocumentEdit(current, {
        startOffset: start,
        endOffsetExclusive: end,
      }, mutation.text).document;
      const incremental = layoutTextAreaDocument(current, 5, wrap, defaultTextWidthProfile);
      const freshDocument = createTextDocument(textDocumentText(current));
      const fresh = layoutTextAreaDocument(freshDocument, 5, wrap, defaultTextWidthProfile);

      assert.deepEqual(layoutEvidence(incremental), layoutEvidence(fresh));
    }
    document = current;
  }
});

function layoutEvidence(layout) {
  return {
    contentRows: layout.contentRows,
    contentColumns: layout.contentColumns,
    intrinsicColumns: layout.intrinsicColumns,
    starts: layout.allRowStartOffsets(),
    lines: Array.from({ length: layout.contentRows }, (_value, row) => {
      const line = layout.lineAtRow(row);
      return line === undefined ? undefined : {
        text: line.text,
        start: line.start,
        rowIndex: line.rowIndex,
        logicalLineIndex: line.logicalLineIndex,
        firstVisualLine: line.firstVisualLine,
        cells: line.index.cells,
      };
    }),
  };
}
