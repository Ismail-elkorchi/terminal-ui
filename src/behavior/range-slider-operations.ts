import type {
  RangeSliderTransition,
  RangeSliderReducerOptions,
  RangeSliderState
} from './range-slider.ts';

export function rangeSliderReducer(
  state: RangeSliderState,
  transition: RangeSliderTransition,
  options: RangeSliderReducerOptions = {}
): RangeSliderState {
  const min = finite(options.range?.min, 0);
  const max = Math.max(min, finite(options.range?.max, 100));
  const step = Math.max(Number.EPSILON, finite(options.step, 1));
  const normalized = normalizeState(state, min, max);
  switch (transition.kind) {
    case 'selectHandle':
      return normalized.activeHandle === transition.handle ? normalized : { ...normalized, activeHandle: transition.handle };
    case 'step': {
      const direction = transition.direction === 'increment' ? 1 : -1;
      return setHandle(normalized, normalized.activeHandle, handleValue(normalized, normalized.activeHandle) + direction * step, min, max);
    }
    case 'set':
      return setHandle(normalized, transition.handle, transition.value, min, max);
  }
}

function normalizeState(state: RangeSliderState, min: number, max: number): RangeSliderState {
  const start = clamp(finite(state.value.start, min), min, max);
  const end = clamp(finite(state.value.end, max), start, max);
  return { value: { start, end }, activeHandle: state.activeHandle };
}

function setHandle(
  state: RangeSliderState,
  handle: RangeSliderState['activeHandle'],
  value: number,
  min: number,
  max: number
): RangeSliderState {
  const next = finite(value, handleValue(state, handle));
  return handle === 'start'
    ? { value: { start: clamp(next, min, state.value.end), end: state.value.end }, activeHandle: handle }
    : { value: { start: state.value.start, end: clamp(next, state.value.start, max) }, activeHandle: handle };
}

function handleValue(state: RangeSliderState, handle: RangeSliderState['activeHandle']): number {
  return handle === 'start' ? state.value.start : state.value.end;
}

function finite(value: number | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}
