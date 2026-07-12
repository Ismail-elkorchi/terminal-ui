import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createNumberInputState,
  numberInputAnalysis,
  numberInputPresentation,
  numberInputReducer
} from '../../dist/behavior/index.js';
import { numberInput } from '../../dist/components/index.js';
import {
  renderElementFrame,
  renderElementRegions,
  renderFramePlain
} from '../../dist/renderer/index.js';

test('number input analysis preserves empty incomplete invalid valid and range states', () => {
  assert.deepEqual(numberInputAnalysis(''), { validity: 'empty' });
  assert.deepEqual(numberInputAnalysis('-'), { validity: 'incomplete' });
  assert.deepEqual(numberInputAnalysis('.', { grammar: { notation: 'decimal' } }), { validity: 'incomplete' });
  assert.deepEqual(numberInputAnalysis('1e-', { grammar: { notation: 'scientific' } }), { validity: 'incomplete' });
  assert.deepEqual(numberInputAnalysis('1.5'), { validity: 'valid', value: 1.5 });
  assert.deepEqual(numberInputAnalysis('1,5', { grammar: { decimalSeparator: ',' } }), { validity: 'valid', value: 1.5 });
  assert.deepEqual(numberInputAnalysis('1.5', { grammar: { notation: 'integer' } }), { validity: 'invalid' });
  assert.deepEqual(numberInputAnalysis('12', { max: 10 }), { validity: 'outOfRange', value: 12 });
  assert.deepEqual(numberInputAnalysis('abc'), { validity: 'invalid' });
});

test('number input reducer keeps editable invalid text and commits reverts and steps explicitly', () => {
  const initial = createNumberInputState(4);
  const selected = numberInputReducer(initial, { kind: 'edit', operation: { kind: 'selectAll' } });
  const typed = numberInputReducer(selected, { kind: 'edit', operation: { kind: 'insert', text: '-.' } });
  const rejected = numberInputReducer(typed, { kind: 'commit' });
  const reverted = numberInputReducer(rejected, { kind: 'revert' });
  const stepped = numberInputReducer(reverted, { kind: 'step', direction: 'increment' }, { min: 0, max: 10, step: 2 });

  assert.equal(typed.input.text, '-.');
  assert.equal(numberInputPresentation(typed).validity, 'incomplete');
  assert.strictEqual(rejected, typed);
  assert.equal(reverted.input.text, '4');
  assert.equal(stepped.input.text, '6');
  assert.equal(stepped.committed, 6);
});

test('number input commit can clamp out-of-range text only when requested', () => {
  const state = {
    input: { text: '20', cursor: 2 },
    committed: 4
  };
  assert.strictEqual(numberInputReducer(state, { kind: 'commit' }, { max: 10 }), state);
  assert.deepEqual(
    numberInputReducer(state, { kind: 'commit' }, { max: 10, clampOnCommit: true }),
    { input: { text: '10', cursor: 2 }, committed: 10 }
  );
  assert.throws(() => numberInputAnalysis('1', { min: 2, max: 1 }), /min must be less than or equal/u);
});

test('number input renders controlled text validity and pointer step controls', () => {
  const messages = [];
  const element = numberInput({
    id: 'workers',
    presentation: numberInputPresentation({ input: { text: '-.', cursor: 2 }, committed: 4 }),
    onAction: (action) => {
      messages.push(action);
      return action;
    }
  });
  const frame = renderElementFrame(element, { columns: 18, rows: 1 });
  const regions = renderElementRegions(element, { columns: 18, rows: 1 });

  assert.match(renderFramePlain(frame), /-\./u);
  assert.match(renderFramePlain(frame), /\[-\].*\[\+\]/u);
  assert.match(frame.accessibility.root.description, /incomplete/u);
  const increment = regions.flatMap((region) => region.hitTargets)
    .find((target) => target.id === 'workers:step:increment');
  assert.ok(increment);
  assert.deepEqual(increment.message({ kind: 'click' }), { kind: 'step', direction: 'increment' });
  assert.deepEqual(messages, [{ kind: 'step', direction: 'increment' }]);
});
