import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const documentModule = new URL('../../../dist/text/document.js', import.meta.url).href;
const projectionModule = new URL('../../../dist/components/text-area/projection.js', import.meta.url).href;

test('latest tab projection shares completed maps without retaining previous revision wrappers', () => {
  const result = spawnSync(process.execPath, ['--expose-gc', '--input-type=module', '--eval', `
    import assert from 'node:assert/strict';
    import { setImmediate } from 'node:timers/promises';
    import { createTextDocument, textDocumentEditExact, textDocumentLineAt, textDocumentLineBoundaries, textDocumentText } from ${JSON.stringify(documentModule)};
    import { createTextAreaProjection } from ${JSON.stringify(projectionModule)};
    const { current, references } = (() => {
      const decorations = Object.freeze([]);
      const profile = Object.freeze({ emoji: 'wide', ambiguous: 'narrow' });
      let document = createTextDocument('header\\n' + 'x'.repeat(1_100_000) + '\\tvalue\\ntail');
      let projection = createTextAreaProjection(document, decorations, profile);
      const references = [];
      references.push(new WeakRef(textDocumentLineBoundaries(document, textDocumentLineAt(document, 1))));
      for (let revision = 0; revision < 12; revision++) {
        references.push(new WeakRef(document), new WeakRef(projection), new WeakRef(projection.document));
        document = textDocumentEditExact(document, 0, 1, String.fromCharCode(65 + revision)).document;
        projection = createTextAreaProjection(document, decorations, profile);
      }
      return { current: projection, references };
    })();
    for (let iteration = 0; iteration < 5; iteration++) { await setImmediate(); global.gc(); }
    assert.ok(references.every(reference => reference.deref() === undefined),
      'retained line maps must not capture an earlier projection, source document, display document or owned boundary wrapper: ' + references.flatMap((reference, index) => reference.deref() === undefined ? [] : [index]).join(','));
    assert.ok(textDocumentText(current.document).startsWith('Leader'));
    assert.equal(current.sourceOffsetAtDisplayOffset(7 + 1_100_000 + 1, 'upstream'), 7 + 1_100_000);
  `], { encoding: 'utf8', timeout: 30_000 });
  assert.equal(result.status, 0, result.stderr || String(result.error));
});
