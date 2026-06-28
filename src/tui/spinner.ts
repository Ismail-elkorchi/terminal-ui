import type { ActivityIndicatorStatus } from '../widgets/types.ts';

export interface SpinnerState {
  readonly frameIndex: number;
  readonly status?: ActivityIndicatorStatus;
}

export type SpinnerAction =
  | { readonly kind: 'advance' }
  | { readonly kind: 'reset'; readonly frameIndex?: number; readonly status?: ActivityIndicatorStatus }
  | { readonly kind: 'status'; readonly status: ActivityIndicatorStatus };

export interface SpinnerReducerOptions {
  readonly frameCount?: number;
}

export function spinnerReducer(
  state: SpinnerState,
  action: SpinnerAction,
  options: SpinnerReducerOptions = {}
): SpinnerState {
  switch (action.kind) {
    case 'advance':
      return {
        ...state,
        frameIndex: nextSpinnerFrameIndex(state.frameIndex, options.frameCount)
      };
    case 'reset':
      return {
        frameIndex: normalizeSpinnerFrameIndex(action.frameIndex ?? 0, options.frameCount),
        ...(action.status === undefined ? {} : { status: action.status })
      };
    case 'status':
      return {
        ...state,
        status: action.status
      };
  }
}

export function nextSpinnerFrameIndex(frameIndex: number, frameCount = 1): number {
  return normalizeSpinnerFrameIndex(frameIndex + 1, frameCount);
}

export function normalizeSpinnerFrameIndex(frameIndex: number, frameCount = 1): number {
  const count = Number.isFinite(frameCount) ? Math.max(1, Math.floor(frameCount)) : 1;
  const index = Number.isFinite(frameIndex) ? Math.floor(frameIndex) : 0;
  return ((index % count) + count) % count;
}
