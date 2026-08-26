import type { AccessibilityOptions, AccessibleNode } from '../accessibility/index.ts';
import type { BindableKeyName, InputEvent, InputTrigger } from '../input/index.ts';
import type { FocusPath, InitialFocusSelector } from '../interaction/focus.ts';
import type { MessageResolution } from '../interaction/message.ts';
import type { TerminalStyle } from '../visual/render-content.ts';
import type { ElementVisualState } from '../visual/frame-source.ts';

export type { ElementVisualState } from '../visual/frame-source.ts';

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

export interface ElementStateStyles<TPart extends string = string> {
  readonly root?: TerminalStyle;
  readonly parts?: Readonly<Partial<Record<TPart, TerminalStyle>>>;
}

export type ElementTextRole =
  | 'title'
  | 'heading'
  | 'body'
  | 'caption'
  | 'metadata'
  | 'metric'
  | 'badge';

export interface ElementStyles<
  TPart extends string = string,
  TState extends Exclude<ElementVisualState, 'default'> = never,
> {
  readonly root?: TerminalStyle;
  readonly parts?: Readonly<Partial<Record<TPart, TerminalStyle>>>;
  readonly states?: [TState] extends [never]
    ? never
    : Readonly<Partial<Record<TState, ElementStateStyles<TPart>>>>;
}

export interface ElementFocusScope {
  readonly kind: 'contain';
  readonly initialFocus?: InitialFocusSelector;
  readonly restoreFocus?: boolean;
}

export interface ElementFocus {
  readonly disabled?: boolean;
  readonly order?: number;
  readonly scope?: ElementFocusScope;
}

export type ElementAccessibility = AccessibleNode | AccessibilityOptions;

export interface ElementMeta {
  readonly accessibility?: ElementAccessibility;
  readonly focus?: ElementFocus;
  readonly layer?: ElementLayer;
}

export interface ElementOptions<
  TPart extends string = string,
  TState extends Exclude<ElementVisualState, 'default'> = never,
> {
  readonly id?: string;
  readonly meta?: ElementMeta;
  readonly styles?: ElementStyles<TPart, TState>;
}

/** Identity and semantic metadata for elements that do not paint a styleable anatomy. */
export interface StructuralElementOptions {
  readonly id?: string;
  readonly meta?: ElementMeta;
}

export interface InteractiveElementOptions<
  TPart extends string = string,
  TState extends Exclude<ElementVisualState, 'default'> = never,
> extends ElementOptions<TPart, TState> {
  readonly id: string;
}
