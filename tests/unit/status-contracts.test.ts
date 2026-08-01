import assert from 'node:assert/strict';
import test from 'node:test';

import {
  isProcessStatus,
  isStatusBarStatus,
  isValidationLevel,
  isNotificationTone
} from '../../dist/components/index.js';

void test('process status validation stays within process lifecycle semantics', () => {
  assert.equal(isProcessStatus('running'), true);
  assert.equal(isProcessStatus('pending'), false);
});

void test('status-bar status accepts informational labels without widening process state', () => {
  assert.equal(isStatusBarStatus('info'), true);
  assert.equal(isProcessStatus('info'), false);
});

void test('validation levels remain narrow', () => {
  assert.equal(isValidationLevel('warning'), true);
  assert.equal(isValidationLevel('success'), false);
});

void test('notification tones remain within the notification contract', () => {
  assert.equal(isNotificationTone('progress'), true);
  assert.equal(isNotificationTone('default'), false);
});
