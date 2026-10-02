import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const documentModule = new URL('../../../dist/text/document.js', import.meta.url).href;
const editModule = new URL('../../../dist/text/edit.js', import.meta.url).href;
const sourceModule = new URL('../../../dist/text/source-boundaries.js', import.meta.url).href;

test('tiny cached lines do not retain retired documents or oversized boundary indexes', () => {
  const result = spawnSync(process.execPath, ['--expose-gc', '--input-type=module', '--eval', `
    import assert from 'node:assert/strict';
    import { setImmediate } from 'node:timers/promises';
    import { createTextDocument, textDocumentEditExact, textDocumentLineAt, textDocumentLineBoundaries } from ${JSON.stringify(documentModule)};
    import { editTextBuffer } from ${JSON.stringify(editModule)};
    import { bufferSourceBoundaries } from ${JSON.stringify(sourceModule)};
    const { current, references } = (() => {
      let document = createTextDocument('r'.repeat(1_100_000) + '\\ntiny');
      const references = [];
      for (let revision = 0; revision < 12; revision++) {
        const line = textDocumentLineAt(document, 0);
        const index = textDocumentLineBoundaries(document, line);
        index.at(line.endOffsetExclusive - 1);
        textDocumentLineAt(document, 1);
        references.push(new WeakRef(document), new WeakRef(index));
        document = textDocumentEditExact(document, 0, 1, String.fromCharCode(65 + revision)).document;
      }
      const buffer = editTextBuffer({ text: 'b'.repeat(1_100_000), cursor: 1_100_000 }, { kind: 'moveLeft' });
      references.push(new WeakRef(buffer), new WeakRef(bufferSourceBoundaries(buffer)));
      return { current: document, references };
    })();
    for (let iteration = 0; iteration < 5; iteration++) {
      await setImmediate();
      global.gc();
    }
    assert.ok(references.every(reference => reference.deref() === undefined),
      'a bounded string cache must not strongly own retired source indexes through tiny cached lines');
    assert.equal(textDocumentLineAt(current, 1).text, 'tiny');
  `], { encoding: 'utf8', timeout: 30_000 });
  assert.equal(result.status, 0, result.stderr || String(result.error));
});

test('shared small-line layout cache does not retain document-owned preparation', () => {
  const layoutModule = new URL('../../../dist/components/text-area/layout.js', import.meta.url).href;
  const result = spawnSync(process.execPath, ['--expose-gc', '--input-type=module', '--eval', `
    import assert from 'node:assert/strict';
    import { setImmediate } from 'node:timers/promises';
    import { createTextDocument, textDocumentLineAt, textDocumentLineBoundaries } from ${JSON.stringify(documentModule)};
    import { layoutTextAreaDocument } from ${JSON.stringify(layoutModule)};
    const references = (() => {
      const document = createTextDocument('unique tiny owned line\\n' + 'x'.repeat(1_100_000));
      const first = textDocumentLineBoundaries(document, textDocumentLineAt(document, 0));
      layoutTextAreaDocument(document, 80, false, { emoji: 'wide', ambiguous: 'narrow' });
      return [new WeakRef(document), new WeakRef(first)];
    })();
    for (let iteration = 0; iteration < 5; iteration++) { await setImmediate(); global.gc(); }
    assert.ok(references.every(reference => reference.deref() === undefined),
      'a small shared layout must not retain a document-owned boundary/geometry source');
  `], { encoding: 'utf8', timeout: 30_000 });
  assert.equal(result.status, 0, result.stderr || String(result.error));
});

test('shared native word state across unchanged lines cannot pin retired source wrappers or ropes', () => {
  const wordModule = new URL('../../../dist/text/word-boundaries.js', import.meta.url).href;
  const result = spawnSync(process.execPath, ['--expose-gc', '--input-type=module', '--eval', `
    import assert from 'node:assert/strict';
    import { setImmediate } from 'node:timers/promises';
    import { createTextDocument, textDocumentEdit, textDocumentLineAt, textDocumentLineBoundaries } from ${JSON.stringify(documentModule)};
    import { ownedWordBoundaryIndex } from ${JSON.stringify(wordModule)};
    const { current, references, length } = (() => {
      const lineText = 'word '.repeat(220_000);
      const old = createTextDocument('deleted '.repeat(140_000) + '\\n' + lineText);
      const line = textDocumentLineAt(old, 1);
      const source = textDocumentLineBoundaries(old, line);
      const words = ownedWordBoundaryIndex(source);
      words.next(20); // Leave the native iterator live across the unchanged-line fork.
      const current = textDocumentEdit(old, { startOffset: 0, endOffsetExclusive: line.startOffset - 1 }, 'small').document;
      const retained = textDocumentLineBoundaries(current, textDocumentLineAt(current, 1));
      assert.equal(ownedWordBoundaryIndex(retained).next(20), 24);
      return { current, references: [new WeakRef(old), new WeakRef(source), new WeakRef(words)], length: lineText.length };
    })();
    for (let iteration = 0; iteration < 5; iteration++) { await setImmediate(); global.gc(); }
    assert.ok(references.every(reference => reference.deref() === undefined),
      'the native state must not retain a previous source wrapper or its rope');
    const retained = textDocumentLineBoundaries(current, textDocumentLineAt(current, 1));
    assert.equal(ownedWordBoundaryIndex(retained).next(length - 5), length - 1);
  `], { encoding: 'utf8', timeout: 30_000 });
  assert.equal(result.status, 0, result.stderr || String(result.error));
});
