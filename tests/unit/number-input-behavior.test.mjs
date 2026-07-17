import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createNumberInputConfiguration,
  createNumberInputState,
  numberInputAnalysis,
  numberInputPresentation,
  numberInputReducer
} from '../../dist/behavior/index.js';
import { numberInput } from '../../dist/components/index.js';
import {
  renderElementFrame,
  renderFramePlain
} from '../../dist/renderer/index.js';
import { renderElementRegions } from '../../dist/testing/index.js';

test('number input analysis preserves empty incomplete invalid valid and range states', () => {
  assert.deepEqual(numberInputAnalysis(''), { validity: 'empty' });
  assert.deepEqual(numberInputAnalysis('-'), { validity: 'incomplete' });
  assert.deepEqual(numberInputAnalysis('.', createNumberInputConfiguration({ grammar: { notation: 'decimal' } })), { validity: 'incomplete' });
  assert.deepEqual(numberInputAnalysis('1e-', createNumberInputConfiguration({ grammar: { notation: 'scientific' } })), { validity: 'incomplete' });
  assert.deepEqual(numberInputAnalysis('1.5'), { validity: 'valid', parsedValue: 1.5 });
  assert.deepEqual(numberInputAnalysis('1,5', createNumberInputConfiguration({ grammar: { decimalSeparator: ',' } })), { validity: 'valid', parsedValue: 1.5 });
  assert.deepEqual(numberInputAnalysis('1.5', createNumberInputConfiguration({ grammar: { notation: 'integer' } })), { validity: 'invalid' });
  assert.deepEqual(numberInputAnalysis('12', createNumberInputConfiguration({ max: 10 })), { validity: 'outOfRange', parsedValue: 12 });
  assert.deepEqual(numberInputAnalysis('abc'), { validity: 'invalid' });
});

test('number input reducer keeps editable invalid text and commits reverts and steps explicitly', () => {
  const initial = createNumberInputState(4);
  const selected = numberInputReducer(initial, { kind: 'edit', operation: { kind: 'selectAll' } });
  const typed = numberInputReducer(selected, { kind: 'edit', operation: { kind: 'insert', text: '-.' } });
  const rejected = numberInputReducer(typed, { kind: 'commit' });
  const reverted = numberInputReducer(rejected, { kind: 'revert' });
  const configured = createNumberInputState(4, { min: 0, max: 10, step: 2 });
  const stepped = numberInputReducer(configured, { kind: 'step', direction: 'increment' });

  assert.equal(typed.input.text, '-.');
  assert.equal(numberInputPresentation(typed).validity, 'incomplete');
  assert.strictEqual(rejected, typed);
  assert.equal(reverted.input.text, '4');
  assert.equal(stepped.input.text, '6');
  assert.equal(stepped.committed, 6);
});

test('number input configuration owns grammar-aware formatting and validation', () => {
  const comma = createNumberInputState(1.5, {
    min: 0,
    max: 3,
    step: 0.25,
    grammar: { notation: 'decimal', decimalSeparator: ',' }
  });
  const stepped = numberInputReducer(comma, { kind: 'step', direction: 'increment' });
  const edited = numberInputReducer(stepped, { kind: 'edit', operation: { kind: 'selectAll' } });
  const exponent = createNumberInputState(1000, { grammar: { notation: 'scientific' } });

  assert.equal(comma.input.text, '1,5');
  assert.equal(stepped.input.text, '1,75');
  assert.equal(numberInputPresentation(edited).validity, 'valid');
  assert.equal(exponent.input.text, '1000');
  assert.throws(() => createNumberInputConfiguration({ step: -1 }), /step must be finite and greater than zero/u);
  assert.throws(
    () => createNumberInputConfiguration({ step: 0.5, grammar: { notation: 'integer' } }),
    /integer number input step must be an integer/u
  );
  assert.throws(
    () => createNumberInputState(-1, { grammar: { allowSign: false } }),
    /cannot be negative/u
  );
});

test('number input commit can clamp out-of-range text only when requested', () => {
  const state = {
    input: { text: '20', cursor: 2 },
    committed: 4,
    configuration: createNumberInputConfiguration({ max: 10 })
  };
  assert.strictEqual(numberInputReducer(state, { kind: 'commit' }), state);
  const clampingState = { ...state, configuration: createNumberInputConfiguration({ max: 10, clampOnCommit: true }) };
  assert.deepEqual(
    numberInputReducer(clampingState, { kind: 'commit' }),
    { input: { text: '10', cursor: 2 }, committed: 10, configuration: clampingState.configuration }
  );
  assert.throws(() => createNumberInputConfiguration({ min: 2, max: 1 }), /min must be less than or equal/u);
});

test('number input renders controlled text validity and pointer step controls', () => {
  const messages = [];
  const element = numberInput({
    id: 'workers',
    presentation: numberInputPresentation({
      input: { text: '-.', cursor: 2 },
      committed: 4,
      configuration: createNumberInputConfiguration()
    }),
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
