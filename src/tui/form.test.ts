import assert from 'node:assert/strict';
import test from 'node:test';
import { diagnostic } from '../diagnostics.ts';
import { createTuiForm } from './form.ts';
import type { TuiFormMessage } from './form.ts';

interface Values { readonly name: string; }
type Message = TuiFormMessage<Values, string>;
const form = createTuiForm<Values, string, Message>({ id: 'profile',
  validate: (values) => values.name.length === 0 ? { name: 'Required' } : {},
  validateAsync: async () => ({}), submit: async (values) => values.name, toMessage: (message) => message });

void test('forms preserve no-op identity, touched state and reversible dirty decisions', () => {
  const initial = form.init({ name: 'A' });
  assert.equal(form.change(initial, initial.values).state, initial);
  assert.equal(form.dirty(initial), false);
  const touched = form.touch(initial, 'name').state;
  assert.equal(form.touch(touched, 'name').state, touched);
  const changed = form.change(touched, { name: 'B' });
  assert.equal(form.dirty(changed.state), true);
  assert.equal(changed.cancel?.length, 2);
  assert.equal(form.dirty(form.change(changed.state, { name: 'A' }).state), false);
});

void test('validation races reject old values and repeated submission does not duplicate work', () => {
  const pending = form.submit(form.init({ name: 'A' }));
  assert.equal(pending.effects?.length, 1);
  assert.equal(form.submit(pending.state).state, pending.state);
  const changed = form.change(pending.state, { name: 'B' }).state;
  const stale: Message = { kind: 'validation', completion: { kind: 'ready', revision: pending.state.validation.revision, result: {} } };
  assert.equal(form.update(changed, stale).state, changed);
  const current = form.submit(changed).state;
  const submitting = form.update(current, { kind: 'validation', completion: { kind: 'ready', revision: current.validation.revision, result: {} } });
  assert.equal(submitting.effects?.length, 1);
  assert.equal(submitting.state.submission.pending, true);
  assert.equal(form.submit(submitting.state).state, submitting.state);
  const edited = form.change(submitting.state, { name: 'C' }).state;
  assert.equal(form.update(edited, { kind: 'submission', completion: { kind: 'ready', revision: submitting.state.submission.revision, result: 'B' } }).state, edited);
  assert.equal(form.dirty(edited), true);
});

void test('invalid fields never submit and a current successful submission accepts its baseline', () => {
  const invalid = form.submit(form.init({ name: '' }));
  assert.equal(invalid.effects, undefined);
  assert.equal(invalid.state.touched.name, true);
  assert.equal(invalid.state.errors.name, 'Required');
  const pending = form.submit(form.change(invalid.state, { name: 'A' }).state).state;
  const rejected = form.update(pending, { kind: 'validation', completion: { kind: 'ready', revision: pending.validation.revision, result: { name: 'Taken' } } });
  assert.equal(rejected.effects, undefined);
  const again = form.submit(rejected.state).state;
  const accepted = form.update(again, { kind: 'validation', completion: { kind: 'ready', revision: again.validation.revision, result: {} } }).state;
  const done = form.update(accepted, { kind: 'submission', completion: { kind: 'ready', revision: accepted.submission.revision, result: 'A' } }).state;
  assert.equal(form.dirty(done), false);
  assert.equal(done.submission.result, 'A');
});

void test('validation and submission failures remain ordinary query state and can be retried', () => {
  const failure = diagnostic('TUI_EFFECT_FAILED', 'Unavailable');
  const validating = form.submit(form.init({ name: 'A' })).state;
  const failed = form.update(validating, { kind: 'validation', completion: { kind: 'failed', revision: validating.validation.revision, diagnostic: failure } });
  assert.equal(failed.state.validation.error, failure);
  assert.equal(failed.state.submitRequested, false);
  assert.equal(failed.effects, undefined);
  const again = form.submit(failed.state).state;
  const submitting = form.update(again, { kind: 'validation', completion: { kind: 'ready', revision: again.validation.revision, result: {} } }).state;
  const denied = form.update(submitting, { kind: 'submission', completion: { kind: 'failed', revision: submitting.submission.revision, diagnostic: failure } }).state;
  assert.equal(denied.submission.error, failure);
  assert.equal(form.submit(denied).state.validation.pending, true);
});

void test('validate without submit never starts submission and shares normal completion admission', () => {
  const initial = form.init({ name: 'A' });
  const pending = form.validate(initial);
  assert.equal(pending.effects?.length, 1);
  assert.equal(pending.state.submitRequested, false);
  const done = form.update(pending.state, { kind: 'validation', completion: { kind: 'ready', revision: pending.state.validation.revision, result: {} } });
  assert.equal(done.effects, undefined);
  assert.equal(done.state.submission.pending, false);
});

void test('synchronous-only validation directly starts the existing submission effect', () => {
  const direct = createTuiForm<Values, string, Message>({ id: 'direct', validate: () => ({}),
    submit: (values) => Promise.resolve(values.name), toMessage: message => message });
  const result = direct.submit(direct.init({ name: 'A' }));
  assert.equal(result.state.submission.pending, true);
  assert.equal(result.state.validation.pending, false);
  assert.equal(result.effects?.length, 1);
});
