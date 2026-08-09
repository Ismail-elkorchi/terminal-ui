import type { AccessibilityOptions, AccessibleNode } from '../accessibility/index.ts';
import type { BindableKeyName, InputEvent, InputTrigger } from '../input/index.ts';
import type { FocusPath, InitialFocusSelector } from '../interaction/focus.ts';
import type { PointerInteractionOptions } from '../interaction/pointer-interaction.ts';
import type { MessageResolution } from '../interaction/message.ts';
import type { TerminalStyle } from '../visual/render.ts';

export const elementStateFields = ['disabled', 'busy', 'readOnly', 'inert'] as const;

/**
 * Independent state carried by a component render node.
 *
 * `disabled` suppresses the node's own interaction, while `inert` removes the
 * complete subtree from interaction and accessibility output. `busy` and
 * `readOnly` are semantic state; component behavior decides which actions
 * remain meaningful.
 */
export interface ElementState {
  readonly disabled?: boolean;
  readonly busy?: boolean;
  readonly readOnly?: boolean;
  readonly inert?: boolean;
}

export interface ElementKeyEvent {
  readonly input: InputEvent;
  readonly focusPath: FocusPath;
}

export type ElementKeyHandler<TMessage> = (event: ElementKeyEvent) => MessageResolution<TMessage>;

export interface ElementKeyTriggerBinding<TMessage> {
  readonly trigger: Extract<InputTrigger, { readonly kind: 'key' | 'codePoint' | 'physicalKey' }>;
  readonly onKey: ElementKeyHandler<TMessage>;
}

export type ElementKeyBindings<TMessage> = Readonly<Partial<Record<BindableKeyName, ElementKeyHandler<TMessage>>>> & {
  readonly triggers?: readonly ElementKeyTriggerBinding<TMessage>[];
  readonly text?: Readonly<Record<string, ElementKeyHandler<TMessage>>>;
};

export type ElementOverflowPriority = 'required' | 'important' | 'secondary' | 'decorative';
export type LayerUnderlay = 'clear' | 'preserve' | 'inheritBackground';

export interface ElementLayer {
  readonly zIndex?: number;
  readonly visible?: boolean;
  readonly underlay?: LayerUnderlay;
  /** Dims the complete terminal viewport behind this layer. */
  readonly backdrop?: 'viewport';
  readonly overflowPriority?: ElementOverflowPriority;
}

export type ElementVisualState =
  | 'default'
  | 'focused'
  | 'hovered'
  | 'pressed'
  | 'selected'
  | 'disabled'
  | 'active';

export type ElementTextRole =
  | 'title'
  | 'heading'
  | 'body'
  | 'caption'
  | 'metadata'
  | 'metric'
  | 'badge';

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
  readonly pointer?: PointerInteractionOptions<TMessage>;
}

export interface ElementTextInputHandlers<TMessage> {
  readonly onInput?: (text: string) => TMessage;
  readonly onPaste?: (text: string) => TMessage;
}
