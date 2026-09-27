import type { RoutedPointerEvent } from '../../dist/renderer/index.js';
import type { MouseButton, MousePointerButton, MouseWheelButton } from '../../dist/input/index.js';

export function routedPointerEvent(
  overrides: Partial<RoutedPointerEvent> = {}
): RoutedPointerEvent {
  const row = overrides.row ?? 0;
  const column = overrides.column ?? 0;
  const button = overrides.button ?? 'left';
  const modifiers = overrides.modifiers ?? { shift: false, alt: false, ctrl: false };
  const deltaRows = overrides.deltaRows ?? 0;
  const deltaColumns = overrides.deltaColumns ?? 0;
  const raw = overrides.kind === 'scroll'
    ? {
      kind: 'mouse' as const,
      sequence: '',
      encoding: 'sgr' as const,
      action: 'wheel' as const,
      button: wheelButton(button),
      row,
      column,
      rawCode: 0,
      modifiers,
      deltaRows,
      deltaColumns
    }
    : {
      kind: 'mouse' as const,
      sequence: '',
      encoding: 'sgr' as const,
      action: 'release' as const,
      button: pointerButton(button),
      row,
      column,
      rawCode: 0,
      modifiers
    };
  return {
    kind: 'click',
    source: 'mouse',
    row,
    column,
    button,
    modifiers,
    deltaRows,
    deltaColumns,
    clickCount: 1,
    raw,
    ...overrides
  };
}

function wheelButton(button: MouseButton): MouseWheelButton {
  switch (button) {
    case 'wheelUp':
    case 'wheelDown':
    case 'wheelLeft':
    case 'wheelRight':
      return button;
    default:
      return 'unknown';
  }
}

function pointerButton(button: MouseButton): MousePointerButton {
  switch (button) {
    case 'left':
    case 'middle':
    case 'right':
    case 'none':
      return button;
    default:
      return 'unknown';
  }
}
