import assert from 'node:assert/strict';
import test from 'node:test';

import {
  baseStatusForRecordStatus,
  isWidgetProcessStatus,
  isWidgetRecordStatus,
  isWidgetValidationTone,
  normalizeNotificationTone,
  normalizeWidgetProcessStatus,
  optionalWidgetRecordStatus,
  optionalWidgetValidationTone,
  recordStatusFromTone,
  statusFromTone
} from '../../dist/widgets/index.js';

test('process status normalizers keep process semantics distinct from record status', () => {
  assert.equal(isWidgetProcessStatus('running'), true);
  assert.equal(isWidgetProcessStatus('pending'), false);
  assert.equal(normalizeWidgetProcessStatus('success'), 'success');
  assert.equal(normalizeWidgetProcessStatus('pending', 'idle'), 'idle');
});

test('record status normalizers accept event states without accepting idle', () => {
  assert.equal(isWidgetRecordStatus('failed'), true);
  assert.equal(isWidgetRecordStatus('skipped'), true);
  assert.equal(isWidgetRecordStatus('idle'), false);
  assert.equal(optionalWidgetRecordStatus('cancelled'), 'cancelled');
  assert.equal(optionalWidgetRecordStatus('idle'), undefined);
});

test('validation tone normalizer keeps validation tones narrow', () => {
  assert.equal(isWidgetValidationTone('warning'), true);
  assert.equal(isWidgetValidationTone('success'), false);
  assert.equal(optionalWidgetValidationTone('error'), 'error');
  assert.equal(optionalWidgetValidationTone('progress'), undefined);
});

test('notification tones normalize before mapping to status', () => {
  assert.equal(normalizeNotificationTone('progress'), 'progress');
  assert.equal(normalizeNotificationTone('default'), 'info');
  assert.equal(statusFromTone('progress'), 'running');
  assert.equal(recordStatusFromTone('progress'), 'running');
  assert.equal(recordStatusFromTone('destructive'), 'error');
});

test('record status base mapping preserves shared status styling without flattening public status', () => {
  assert.equal(baseStatusForRecordStatus('failed'), 'error');
  assert.equal(baseStatusForRecordStatus('cancelled'), 'warning');
  assert.equal(baseStatusForRecordStatus('skipped'), 'warning');
  assert.equal(baseStatusForRecordStatus('running'), 'running');
});
