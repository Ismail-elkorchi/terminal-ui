import assert from 'node:assert/strict';
import test from 'node:test';

import { createScrollState } from '../../../behavior/scroll.ts';
import { defaultTextWidthProfile, prepareTextDocument } from '../../../text/index.ts';
import {
  projectTextAreaDocument,
  textAreaOffsetInProjection,
  textAreaVisibleText
} from './projection.ts';

void test('text-area projections are reused for stable prepared documents', () => {
  const document = prepareTextDocument('alpha\nbravo\ncharlie');
  const first = projectTextAreaDocument(document, 12, false, defaultTextWidthProfile);
  const second = projectTextAreaDocument(document, 12, false, defaultTextWidthProfile);

  assert.equal(second, first);
  assert.equal(textAreaOffsetInProjection(first, 1, 3), 'alpha\n'.length + 3);
});

void test('wrapped text-area projections preserve intrinsic width independently from constrained rows', () => {
  const document = prepareTextDocument('x');
  const projection = projectTextAreaDocument(document, 40, true, defaultTextWidthProfile);

  assert.equal(projection.intrinsicColumns, 1);
  assert.equal(projection.contentColumns, 1);
  assert.equal(projection.contentRows, 1);
});

void test('text-area accessibility text is bounded to the visible viewport', () => {
  const document = prepareTextDocument('alpha\nbravo\ncharlie');
  const projection = projectTextAreaDocument(document, 12, false, defaultTextWidthProfile);
  const scroll = createScrollState({
    offsetRow: 1,
    offsetColumn: 1,
    contentRows: 3,
    contentColumns: 7,
    viewportRows: 1,
    viewportColumns: 3
  });

  assert.equal(textAreaVisibleText(projection, scroll), 'rav');
});
