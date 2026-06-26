import { toAccessibleSnapshot } from '../accessibility/index.ts';
import type { AccessibleSnapshot } from '../accessibility/index.ts';
import type { ProgressOptions, ProgressState } from './types.ts';

export function createProgress(options: ProgressOptions): ProgressState {
  return makeProgressState({
    id: options.id ?? 'progress',
    label: options.label,
    ...normalizedProgress(options.value, options.max),
    ...(options.status === undefined ? {} : { status: options.status }),
    indeterminate: options.indeterminate ?? options.value === undefined
  });
}

function makeProgressState(
  state: Omit<ProgressState, 'update' | 'snapshot'>
): ProgressState {
  return {
    ...state,
    update(next) {
      const value = next.value ?? state.value;
      const max = next.max ?? state.max;
      return makeProgressState({
        id: state.id,
        label: state.label,
        ...normalizedProgress(value, max),
        ...(next.status === undefined ? ('status' in state ? { status: state.status } : {}) : { status: next.status }),
        indeterminate: next.indeterminate ?? state.indeterminate
      });
    },
    snapshot(): AccessibleSnapshot {
      return toAccessibleSnapshot({
        source: 'progress',
        root: {
          id: state.id,
          role: 'progressbar',
          label: state.label,
          ...(state.status === undefined ? {} : { description: state.status }),
          progress: {
            ...(state.value === undefined ? {} : { value: state.value }),
            ...(state.max === undefined ? {} : { max: state.max }),
            indeterminate: state.indeterminate
          }
        }
      });
    }
  };
}

function normalizedProgress(
  value: number | undefined,
  max: number | undefined
): Pick<ProgressState, 'value' | 'max'> {
  const normalizedMax = max === undefined ? undefined : max > 0 ? max : 100;
  if (value === undefined) return normalizedMax === undefined ? {} : { max: normalizedMax };
  const effectiveMax = normalizedMax ?? 100;
  return {
    value: Math.max(0, Math.min(effectiveMax, value)),
    max: effectiveMax
  };
}
