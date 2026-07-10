import type { AccessibilityOptions, AccessibleNode } from '../../accessibility/index.ts';
import type { RegionOpacity } from '../../tui/layout.ts';
import type { TerminalStyle } from '../../tui/render-primitives.ts';

export type ComponentKeyBindings<TMessage> = Record<string, TMessage>;
export type ComponentOverflowPriority = 'required' | 'important' | 'secondary' | 'decorative';

export interface ComponentLayerOptions {
  readonly zIndex?: number;
  readonly visible?: boolean;
  readonly opacity?: RegionOpacity;
  readonly overflowPriority?: ComponentOverflowPriority;
}

export type ComponentVisualState =
  | 'default'
  | 'focused'
  | 'selected'
  | 'disabled'
  | 'active'
  | 'error'
  | 'warning'
  | 'success';

export type TextRole =
  | 'title'
  | 'subtitle'
  | 'heading'
  | 'body'
  | 'caption'
  | 'metadata'
  | 'metric'
  | 'badge'
  | 'danger'
  | 'warning'
  | 'success';

export type SurfaceVisualState = Extract<ComponentVisualState, 'active' | 'selected' | 'error' | 'warning' | 'success'>;

export interface ComponentStyleSlots {
  readonly root?: TerminalStyle;
  readonly border?: TerminalStyle;
  readonly title?: TerminalStyle;
  readonly label?: TerminalStyle;
  readonly value?: TerminalStyle;
  readonly placeholder?: TerminalStyle;
  readonly selected?: TerminalStyle;
  readonly focused?: TerminalStyle;
  readonly disabled?: TerminalStyle;
  readonly error?: TerminalStyle;
  readonly warning?: TerminalStyle;
  readonly success?: TerminalStyle;
}

export type ComponentFocusScope = 'none' | 'contain';

export interface ComponentFocusOptions {
  readonly disabled?: boolean;
  readonly order?: number;
  readonly scope?: ComponentFocusScope;
}

export type AccessibleNodeDefinition = AccessibleNode | AccessibilityOptions;

export interface ComponentMeta {
  readonly accessibility?: AccessibleNodeDefinition;
  readonly focus?: ComponentFocusOptions;
  readonly layer?: ComponentLayerOptions;
  readonly styles?: ComponentStyleSlots;
}

export interface ComponentOptions {
  readonly id?: string;
  readonly meta?: ComponentMeta;
}

export interface ComponentTextInputHandlers<TMessage> {
  readonly onInput?: (text: string) => TMessage;
  readonly onPaste?: (text: string) => TMessage;
}
