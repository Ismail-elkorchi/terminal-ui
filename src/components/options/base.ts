import type { AccessibilityOptions, AccessibleNode } from '../../accessibility/index.ts';
import type { RegionOpacity } from '../../tui/layout.ts';
import type { TerminalStyle } from '../../tui/render-primitives.ts';
import type { BindableKeyName } from '../../input/index.ts';
import type { InputEvent } from '../../input/index.ts';
import type { FocusPath } from '../../tui/focus.ts';

export interface ComponentKeyEvent {
  readonly input: InputEvent;
  readonly focusPath: FocusPath;
}

export type ComponentKeyHandler<TMessage> = (event: ComponentKeyEvent) => TMessage | undefined;

export type ComponentKeyBindings<TMessage> = Readonly<Partial<Record<BindableKeyName, ComponentKeyHandler<TMessage>>>> & {
  readonly text?: Readonly<Record<string, ComponentKeyHandler<TMessage>>>;
};
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

export interface ComponentStyles<TPart extends string = never> {
  readonly root?: TerminalStyle;
  readonly parts?: Readonly<Partial<Record<TPart, TerminalStyle>>>;
  readonly states?: Readonly<Partial<Record<Exclude<ComponentVisualState, 'default'>, TerminalStyle>>>;
}

export type ComponentFocusScope = 'none' | 'contain';

export interface ComponentFocusOptions {
  readonly disabled?: boolean;
  readonly order?: number;
  readonly scope?: ComponentFocusScope;
}

export type AccessibleNodeDefinition = AccessibleNode | AccessibilityOptions;

export interface ComponentMeta<TPart extends string = never> {
  readonly accessibility?: AccessibleNodeDefinition;
  readonly focus?: ComponentFocusOptions;
  readonly layer?: ComponentLayerOptions;
  readonly styles?: ComponentStyles<TPart>;
}

export interface ComponentOptions<TPart extends string = never> {
  readonly id?: string;
  readonly meta?: ComponentMeta<TPart>;
}

export interface InteractiveComponentOptions<TPart extends string = never> extends ComponentOptions<TPart> {
  readonly id: string;
}

export interface ComponentTextInputHandlers<TMessage> {
  readonly onInput?: (text: string) => TMessage;
  readonly onPaste?: (text: string) => TMessage;
}
