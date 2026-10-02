import assert from 'node:assert/strict';
import test from 'node:test';
import { liftTuiResult } from './result.ts';
import { createTuiCommands } from './commands.ts';
import { defineTui, tuiBindingHelp } from './definition.ts';
import { text } from '../components/index.ts';

void test('lifting preserves no-op parent identity and every work contribution', () => {
  const child = { value: 1 };
  const parent = { child, other: 'keep' };
  const local = { state: child, effects: ['effect'], cancel: ['cancel'], focus: { id: 'focus' }, outputs: ['output'] };
  const lifted = liftTuiResult(parent, 'child', local);
  assert.equal(lifted.state, parent);
  assert.equal(lifted.effects, local.effects);
  assert.equal(lifted.cancel, local.cancel);
  assert.equal(lifted.focus, local.focus);
  assert.equal(lifted.outputs, local.outputs);
  assert.deepEqual(liftTuiResult(parent, 'child', { state: { value: 2 } }).state, { child: { value: 2 }, other: 'keep' });
});

void test('commands derive projections and recheck current state after display', () => {
  const commands = createTuiCommands<{ allowed: boolean }, 'save', { id: string }>([
    { id: 'save', label: 'Save', message: 'save', enabled: state => state.allowed, shortcuts: [{ kind: 'key', key: 's', modifiers: { ctrl: true } }] },
  ], id => ({ id }));
  assert.equal(commands.menuItems({ allowed: true })[0]?.disabled, false);
  assert.equal(commands.pickerEntries({ allowed: false })[0]?.disabled, true);
  assert.equal(commands.resolve({ allowed: false }, 'save'), undefined);
  assert.equal(commands.resolve({ allowed: true }, 'save'), 'save');
  assert.equal(commands.resolve({ allowed: true }, 'missing'), undefined);
  const app = defineTui({ init: () => ({ state: { allowed: true } }), update: state => ({ state }), view: () => text({ content: '' }), inputBindings: commands.inputBindings });
  assert.equal(tuiBindingHelp(app)[0]?.label, 'Save');
  assert.throws(() => createTuiCommands([{ id: 'x', label: 'X', message: 1 }, { id: 'x', label: 'Again', message: 2 }], id => id), /unique/u);
});
