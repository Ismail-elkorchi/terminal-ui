import { createAccessibleSnapshot } from '../accessibility/index.ts';
import type { AccessibleSnapshot } from '../accessibility/index.ts';
import type { ProgressOptions, ProgressSnapshot, ProgressState } from './types.ts';
import { isNonArrayObject } from '../foundation/validation.ts';
import { sanitizeTerminalText } from '../text/index.ts';

export function createProgress(options: ProgressOptions): ProgressState;
export function createProgress(options: unknown): ProgressState {
  if (!isNonArrayObject(options)) throw new TypeError('Progress options must be an object.');
  const suppliedId = options['id'];
  const id = suppliedId === undefined
    ? 'progress'
    : requiredProgressText(suppliedId, 'Progress id');
  const label = requiredProgressText(options['label'], 'Progress label');
  return makeProgressState(
    id,
    label,
    prepareProgressSnapshot(options),
  );
}

function requiredProgressText(value: unknown, subject: string): string {
  if (typeof value !== 'string') throw new TypeError(`${subject} must be a string.`);
  const text = sanitizeTerminalText(value).text;
  if (text.trim().length === 0) throw new TypeError(`${subject} must not be empty.`);
  return text;
}

function makeProgressState(
  id: string,
  label: string,
  progress: ProgressSnapshot
): ProgressState {
  const methods = {
    update(next: ProgressSnapshot) {
      return makeProgressState(id, label, prepareProgressSnapshot(next));
    },
    snapshot(): AccessibleSnapshot {
      return createAccessibleSnapshot({
        source: 'progress',
        root: {
          id,
          role: 'progressbar',
          label,
          ...(progress.status === undefined ? {} : { description: progress.status }),
          numericValue: progress.kind === 'determinate'
            ? { current: progress.value, minimum: 0, maximum: progress.max, indeterminate: false }
            : { indeterminate: true }
        }
      });
    }
  };
  return Object.freeze({ id, label, ...progress, ...methods });
}

export function prepareProgressSnapshot(progress: unknown): ProgressSnapshot {
  if (!isNonArrayObject(progress)) throw new TypeError('Progress snapshot must be an object.');
  const status = progress['status'];
  if (status !== undefined && typeof status !== 'string') {
    throw new TypeError('Progress status must be a string when provided.');
  }
  const ownedStatus = status === undefined ? undefined : sanitizeTerminalText(status).text;
  if (progress['kind'] === 'indeterminate') {
    return Object.freeze({
      kind: 'indeterminate',
      ...(ownedStatus === undefined ? {} : { status: ownedStatus })
    });
  }
  if (progress['kind'] !== 'determinate') {
    throw new TypeError("Progress kind must be 'determinate' or 'indeterminate'.");
  }
  const max = progress['max'];
  const value = progress['value'];
  if (typeof max !== 'number' || !Number.isFinite(max) || max <= 0) {
    throw new RangeError('Determinate progress max must be a positive finite number.');
  }
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new RangeError('Determinate progress value must be finite.');
  }
  return Object.freeze({
    kind: 'determinate',
    value: Math.max(0, Math.min(max, value)),
    max,
    ...(ownedStatus === undefined ? {} : { status: ownedStatus })
  });
}
