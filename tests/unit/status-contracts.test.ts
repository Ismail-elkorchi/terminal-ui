import assert from 'node:assert/strict';
import test from 'node:test';

import {
  baseStatusForRecordStatus,
  isProcessStatus,
  isRecordStatus,
  isValidationTone,
  normalizeNotificationTone,
  normalizeProcessStatus,
  optionalRecordStatus,
  optionalValidationTone,
  recordStatusFromTone,
  statusFromTone
} from '../../dist/components/index.js';

void test('process status normalizers keep process semantics distinct from record status', () => {
  assert.equal(isProcessStatus('running'), true);
  assert.equal(isProcessStatus('pending'), false);
  assert.equal(normalizeProcessStatus('success'), 'success');
  assert.equal(normalizeProcessStatus('pending', 'idle'), 'idle');
});

void test('record status normalizers accept event states without accepting idle', () => {
  assert.equal(isRecordStatus('failed'), true);
  assert.equal(isRecordStatus('skipped'), true);
  assert.equal(isRecordStatus('idle'), false);
  assert.equal(optionalRecordStatus('cancelled'), 'cancelled');
  assert.equal(optionalRecordStatus('idle'), undefined);
});

void test('validation tone normalizer keeps validation tones narrow', () => {
  assert.equal(isValidationTone('warning'), true);
  assert.equal(isValidationTone('success'), false);
  assert.equal(optionalValidationTone('error'), 'error');
  assert.equal(optionalValidationTone('progress'), undefined);
});

void test('notification tones normalize before mapping to status', () => {
  assert.equal(normalizeNotificationTone('progress'), 'progress');
  assert.equal(normalizeNotificationTone('default'), 'info');
  assert.equal(statusFromTone('progress'), 'running');
  assert.equal(recordStatusFromTone('progress'), 'running');
  assert.equal(recordStatusFromTone('destructive'), 'error');
});

void test('record status base mapping preserves shared status styling without flattening public status', () => {
  assert.equal(baseStatusForRecordStatus('failed'), 'error');
  assert.equal(baseStatusForRecordStatus('cancelled'), 'warning');
  assert.equal(baseStatusForRecordStatus('skipped'), 'warning');
  assert.equal(baseStatusForRecordStatus('running'), 'running');
});
