import type { AccessibilityOptions, AccessibleNode } from '../accessibility/index.ts';
import type { BindableKeyName, InputEvent, InputTrigger } from '../input/index.ts';
import type { FocusPath, InitialFocusSelector } from '../interaction/focus.ts';
import type { PointerPresentationOptions } from '../interaction/pointer-presentation.ts';
import type { MessageResolution } from '../interaction/message.ts';
import type { TerminalStyle } from '../visual/render.ts';

export interface ElementKeyEvent {
  readonly input: InputEvent;
  readonly focusPath: FocusPath;
}

export type ElementKeyHandler<TMessage> = (event: ElementKeyEvent) => MessageResolution<TMessage>;

export interface ElementModifiedKeyBinding<TMessage> {
  readonly trigger: Extract<InputTrigger, { readonly kind: 'key' }>;
  readonly onKey: ElementKeyHandler<TMessage>;
}

export type ElementKeyBindings<TMessage> = Readonly<Partial<Record<BindableKeyName, ElementKeyHandler<TMessage>>>> & {
  readonly modified?: readonly ElementModifiedKeyBinding<TMessage>[];
  readonly text?: Readonly<Record<string, ElementKeyHandler<TMessage>>>;
};

export type ElementOverflowPriority = 'required' | 'important' | 'secondary' | 'decorative';
export type ElementLayerOpacity = 'opaque' | 'transparent' | 'inheritBackground';

export interface ElementLayer {
  readonly zIndex?: number;
  readonly visible?: boolean;
  readonly opacity?: ElementLayerOpacity;
  readonly overflowPriority?: ElementOverflowPriority;
}

export type ElementVisualState =
  | 'default'
  | 'focused'
  | 'hovered'
  | 'pressed'
  | 'selected'
  | 'disabled'
  | 'active'
  | 'error'
  | 'warning'
  | 'success';

export type ElementTextRole =
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

export type SurfaceVisualState = Extract<ElementVisualState, 'active' | 'selected' | 'error' | 'warning' | 'success'>;

export interface ElementStyles<TPart extends string = string> {
  readonly root?: TerminalStyle;
  readonly parts?: Readonly<Partial<Record<TPart, TerminalStyle>>>;
  readonly states?: Readonly<Partial<Record<Exclude<ElementVisualState, 'default'>, TerminalStyle>>>;
}

export interface ElementFocusScope {
  readonly kind: 'contain';
  readonly initialFocus?: InitialFocusSelector;
  readonly restore?: boolean;
}

export interface ElementFocus {
  readonly disabled?: boolean;
  readonly order?: number;
  readonly scope?: ElementFocusScope;
}

export type ElementAccessibility = AccessibleNode | AccessibilityOptions;

export interface ElementMeta<TPart extends string = string> {
  readonly accessibility?: ElementAccessibility;
  readonly focus?: ElementFocus;
  readonly layer?: ElementLayer;
  readonly styles?: ElementStyles<TPart>;
}

export interface ElementOptions<TPart extends string = string> {
  readonly id?: string;
  readonly meta?: ElementMeta<TPart>;
}

export interface InteractiveElementOptions<
  TPart extends string = string,
  TMessage = never
> extends ElementOptions<TPart> {
  readonly id: string;
  readonly pointer?: PointerPresentationOptions<TMessage>;
}

export interface ElementTextInputHandlers<TMessage> {
  readonly onInput?: (text: string) => TMessage;
  readonly onPaste?: (text: string) => TMessage;
}
