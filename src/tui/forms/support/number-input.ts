import type { Rect } from '../../layout.ts';

const STEPPER_WIDTH = 8;
const BUTTON_WIDTH = 3;

export interface NumberInputLayout {
  readonly input: Rect;
  readonly decrement: Rect;
  readonly increment: Rect;
}

export function numberInputLayout(bounds: Rect): NumberInputLayout | undefined {
  if (bounds.width < STEPPER_WIDTH || bounds.height <= 0) return undefined;
  return {
    input: { ...bounds, width: bounds.width - STEPPER_WIDTH },
    decrement: {
      row: bounds.row,
      column: bounds.column + bounds.width - 7,
      width: BUTTON_WIDTH,
      height: 1
    },
    increment: {
      row: bounds.row,
      column: bounds.column + bounds.width - BUTTON_WIDTH,
      width: BUTTON_WIDTH,
      height: 1
    }
  };
}
