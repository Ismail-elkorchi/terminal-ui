import assert from 'node:assert/strict';
import test from 'node:test';

import {
  baseStatusForRecordStatus,
  isProcessStatus,
  isRecordStatus,
  isStatusBarStatus,
  isValidationLevel,
  normalizeNotificationTone,
  normalizeProcessStatus,
  normalizeStatusBarStatus,
  optionalRecordStatus,
  optionalValidationLevel
} from '../../dist/components/index.js';

void test('process status normalizers keep process semantics distinct from record status', () => {
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

void test('record status normalizers accept event states without accepting idle', () => {
  assert.equal(isRecordStatus('failed'), true);
  assert.equal(isRecordStatus('skipped'), true);
  assert.equal(isRecordStatus('idle'), false);
  assert.equal(optionalRecordStatus('cancelled'), 'cancelled');
  assert.equal(optionalRecordStatus('idle'), undefined);
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

void test('record status base mapping preserves shared status styling without flattening public status', () => {
  assert.equal(baseStatusForRecordStatus('failed'), 'error');
  assert.equal(baseStatusForRecordStatus('cancelled'), 'warning');
  assert.equal(baseStatusForRecordStatus('skipped'), 'warning');
  assert.equal(baseStatusForRecordStatus('running'), 'running');
});
