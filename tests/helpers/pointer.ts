import type { RoutedPointerEvent } from '../../dist/renderer/index.js';

export function routedPointerEvent(
  overrides: Partial<RoutedPointerEvent> = {}
): RoutedPointerEvent {
  const row = overrides.row ?? 0;
  const column = overrides.column ?? 0;
  const button = overrides.button ?? 'left';
  const modifiers = overrides.modifiers ?? { shift: false, alt: false, ctrl: false };
  return {
    kind: 'click',
    source: 'mouse',
    row,
    column,
    button,
    modifiers,
    deltaRows: 0,
    deltaColumns: 0,
    clickCount: 1,
    raw: {
      kind: 'mouse',
      sequence: '',
      encoding: 'sgr',
      action: 'release',
      button,
      row,
      column,
      rawCode: 0,
      modifiers
    },
    ...overrides
  };
}
