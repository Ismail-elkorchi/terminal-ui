import { toAccessibleSnapshot } from '../accessibility/index.ts';
import type { AccessibleSnapshot } from '../accessibility/index.ts';
import type { ProgressOptions, ProgressSnapshot, ProgressState, ProgressUpdate } from './types.ts';

export function createProgress(options: ProgressOptions): ProgressState {
  return makeProgressState(options.id ?? 'progress', options.label, normalizeProgress(options));
}

function makeProgressState(
  id: string,
  label: string,
  progress: ProgressSnapshot
): ProgressState {
  const methods = {
    update(next: ProgressUpdate) {
      return makeProgressState(id, label, normalizeProgress(next));
    },
    snapshot(): AccessibleSnapshot {
      return toAccessibleSnapshot({
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
  return progress.kind === 'determinate'
    ? { id, label, ...progress, ...methods }
    : { id, label, ...progress, ...methods };
}

function normalizeProgress(progress: ProgressSnapshot): ProgressSnapshot {
  if (progress.kind === 'indeterminate') {
    return {
      kind: 'indeterminate',
      ...(progress.frame === undefined ? {} : { frame: Math.max(0, Math.floor(progress.frame)) }),
      ...(progress.status === undefined ? {} : { status: progress.status })
    };
  }
  const max = progress.max > 0 ? progress.max : 100;
  return {
    kind: 'determinate',
    value: Math.max(0, Math.min(max, progress.value)),
    max,
    ...(progress.status === undefined ? {} : { status: progress.status })
  };
}
