import assert from 'node:assert/strict';
import test from 'node:test';
import { countWrappedTextRows } from '../../../dist/text/wrap.js';
import { wrapTextCells } from '../../../dist/text/index.js';


test('geometry-only wrapping agrees with materialized Unicode, tabs, controls and empty lines', () => {
  for (const text of ['', 'abcdef\n\nlast', '界界é🙂 x', '\u0301界\u200b', 'a\tb\r\nc', '\u001b[31mabc\u001b[0m']) {
    for (const width of [0.5, 1, 2, 3, 40]) {
      assert.equal(countWrappedTextRows(text, width, {}), wrapTextCells(text, width).length, JSON.stringify({ text, width }));
    }
  }
});
