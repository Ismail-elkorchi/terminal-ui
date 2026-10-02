import assert from 'node:assert/strict';
import test from 'node:test';
import { createTuiControls } from './controls.ts';
import type { TuiControlMessage } from './controls.ts';

interface State { readonly count: number; readonly step: number; readonly optional?: string; }
const controls = createTuiControls<State>()({
  count: (count, transition: 'increment' | 'unchanged', parent) => transition === 'increment' ? count + parent.step : count,
  optional: (value, transition: { readonly text: string }) => value === undefined ? value : transition.text,
});

void test('controls route typed serializable transitions against current parent state', () => {
  const first: State = { count: 0, step: 1 };
  const bound = controls.bind('count', first);
  assert.equal(bound.state, 0);
  const message: TuiControlMessage<typeof controls> = bound.onTransition('increment');
  assert.deepEqual(JSON.parse(JSON.stringify(message)), { kind: 'control', control: 'count', transition: 'increment' });
  const current = { ...first, count: 2, step: 10 };
  const next = controls.update(current, message).state;
  assert.deepEqual(next, { count: 12, step: 10 });
  assert.equal(controls.update(next, message).state.count, 22);
  assert.equal(first.count, 0);
});

void test('controls preserve no-op identity and do not create an absent optional child', () => {
  const state: State = { count: 5, step: 1 };
  assert.equal(controls.update(state, controls.onTransition('count')('unchanged')).state, state);
  assert.equal(controls.update(state, controls.onTransition('optional')({ text: 'late' })).state, state);
  const mounted = { ...state, optional: 'old' };
  assert.deepEqual(controls.update(mounted, controls.onTransition('optional')({ text: 'new' })).state, { ...mounted, optional: 'new' });
});

void test('control definitions snapshot caller-owned reducer maps', () => {
  const reducers = { count: (count: number, delta: number) => count + delta };
  const owned = createTuiControls<State>()(reducers);
  reducers.count = () => -1;
  assert.equal(owned.update({ count: 2, step: 1 }, owned.onTransition('count')(3)).state.count, 5);
});

void test('controlled bindings reuse callbacks without capturing a parent snapshot', () => {
  const first = { count: 1, step: 2 };
  const later = { count: 3, step: 10 };
  assert.equal(controls.bind('count', first).onTransition, controls.bind('count', later).onTransition);
  assert.equal(controls.onTransition('count'), controls.onTransition('count'));
  assert.equal(controls.update(later, controls.bind('count', first).onTransition('increment')).state.count, 13);
});
