import assert from 'node:assert/strict';
import test from 'node:test';

import {
  autocomplete,
  confirm,
  input,
  multiselect,
  password,
  runPrompt,
  select
} from '../../dist/prompts/index.js';

test('runPrompt rejects non-TTY choice defaults without explicit provided values', async () => {
  const defaultSelect = await runPrompt(select({
    label: 'Pick',
    choices: [{ label: 'One', value: 1 }],
    defaultValue: 1
  }));
  assert.equal(defaultSelect.status, 'aborted');
  assert.equal(defaultSelect.reason, 'non_tty_denied');

  const defaultMultiselect = await runPrompt(multiselect({
    label: 'Pick many',
    choices: [{ label: 'One', value: 1 }],
    defaultValue: [1]
  }));
  assert.equal(defaultMultiselect.status, 'aborted');
  assert.equal(defaultMultiselect.reason, 'non_tty_denied');

  const defaultAutocomplete = await runPrompt(autocomplete({
    label: 'Find',
    choices: [{ label: 'One', value: 1 }],
    defaultValue: 1
  }));
  assert.equal(defaultAutocomplete.status, 'aborted');
  assert.equal(defaultAutocomplete.reason, 'non_tty_denied');
});

test('runPrompt accepts explicit non-TTY provided values for choice prompts', async () => {
  const providedSelect = await runPrompt(select({
    label: 'Pick',
    choices: [{ label: 'One', value: 1 }],
    nonTty: { mode: 'provided_value', value: 1 }
  }));
  assert.equal(providedSelect.status, 'submitted');
  assert.equal(providedSelect.value, 1);

  const providedMultiselect = await runPrompt(multiselect({
    label: 'Pick many',
    choices: [{ label: 'One', value: 1 }],
    nonTty: { mode: 'provided_value', value: [1] }
  }));
  assert.equal(providedMultiselect.status, 'submitted');
  assert.deepEqual(providedMultiselect.value, [1]);

  const providedAutocomplete = await runPrompt(autocomplete({
    label: 'Find',
    choices: [{ label: 'One', value: 1 }],
    nonTty: { mode: 'provided_value', value: 1 }
  }));
  assert.equal(providedAutocomplete.status, 'submitted');
  assert.equal(providedAutocomplete.value, 1);
});

test('runPrompt explicit non-TTY reject policy overrides prompt defaults', async () => {
  const rejectedInput = await runPrompt(input({
    label: 'Name',
    defaultValue: 'Ada',
    nonTty: { mode: 'reject', diagnosticHint: 'Pass --name.' }
  }));
  assert.equal(rejectedInput.status, 'aborted');
  assert.equal(rejectedInput.reason, 'non_tty_denied');
  assert.equal(rejectedInput.diagnostics[0]?.hint, 'Pass --name.');

  const rejectedConfirm = await runPrompt(confirm({
    label: 'Continue?',
    defaultValue: true,
    nonTty: { mode: 'reject' }
  }));
  assert.equal(rejectedConfirm.status, 'aborted');
  assert.equal(rejectedConfirm.reason, 'non_tty_denied');

  const rejectedPassword = await runPrompt(password({
    label: 'Token',
    defaultValue: 'super-secret',
    nonTty: { mode: 'reject' }
  }));
  assert.equal(rejectedPassword.status, 'aborted');
  assert.equal(rejectedPassword.reason, 'non_tty_denied');
  assert.doesNotMatch(JSON.stringify(rejectedPassword), /super-secret/u);
});
