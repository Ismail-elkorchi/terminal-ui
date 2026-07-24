import assert from 'node:assert/strict';
import test from 'node:test';

import {
  isProcessStatus,
  isRecordResult,
  isStatusBarStatus,
  isValidationLevel,
  normalizeNotificationTone,
  normalizeProcessStatus,
  normalizeStatusBarStatus,
  optionalRecordResult,
  optionalValidationLevel
} from '../../dist/components/index.js';

void test('process status normalizers keep process semantics distinct from record results', () => {
  assert.equal(isProcessStatus('running'), true);
  assert.equal(isProcessStatus('pending'), false);
  assert.equal(normalizeProcessStatus('success'), 'success');
  assert.equal(normalizeProcessStatus('pending', 'idle'), 'idle');
});

void test('status-bar status accepts informational labels without widening process state', () => {
  assert.equal(isStatusBarStatus('info'), true);
  assert.equal(isProcessStatus('info'), false);
  assert.equal(normalizeStatusBarStatus('pending'), 'pending');
});

void test('record result validation accepts lifecycle outcomes without severity levels', () => {
  assert.equal(isRecordResult('failed'), true);
  assert.equal(isRecordResult('skipped'), true);
  assert.equal(isRecordResult('error'), false);
  assert.equal(optionalRecordResult('cancelled'), 'cancelled');
  assert.equal(optionalRecordResult('warning'), undefined);
});

void test('validation level normalizer keeps validation levels narrow', () => {
  assert.equal(isValidationLevel('warning'), true);
  assert.equal(isValidationLevel('success'), false);
  assert.equal(optionalValidationLevel('error'), 'error');
  assert.equal(optionalValidationLevel('progress'), undefined);
});

void test('notification tones normalize within the notification contract', () => {
  assert.equal(normalizeNotificationTone('progress'), 'progress');
  assert.equal(normalizeNotificationTone('default'), 'info');
});
