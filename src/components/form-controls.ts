import type { TerminalStyle } from '../visual/render-content.ts';
import type { ChoiceItem } from '../collection/item.ts';

export type ButtonTone = 'default' | 'primary' | 'secondary' | 'ghost' | 'destructive';
export interface ButtonPressEvent {
  readonly kind: 'press';
}
export interface CheckboxTransition {
  readonly kind: 'change';
  readonly checked: boolean;
}
export interface SwitchTransition {
  readonly kind: 'change';
  readonly checked: boolean;
}

export interface SliderTransition {
  readonly kind: 'change';
  readonly value: number;
}
export interface ColorSwatchPickerOption<TValue = string> extends ChoiceItem<TValue> {
  readonly swatch?: string;
  readonly style?: TerminalStyle;
}
