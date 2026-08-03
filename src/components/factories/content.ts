import { componentElementFromRenderNode } from '../../renderer/model/element.ts';
import type { Element } from '../../element/index.ts';
import type {
  DisclosureOptions,
  RichTextOptions,
  DisabledTextAreaOptions,
  ScrollableTextAreaOptions,
  TextAreaOptions,
  TextOptions,
  UnscrolledTextAreaOptions
} from '../options/content.ts';
import { assertTextDocument } from '../../text/index.ts';
import type { TextAreaAction, TextAreaControlAction } from '../../ui-model/text-area.ts';
import {
  componentMetaProps,
  interactionProps,
  textAreaKeyBindings,
  textActionInputHandlers
} from '../internal/interaction.ts';
import { optionalRenderNodeId, requiredRenderNodeId } from '../../renderer/model/element.ts';
import { normalizeInlineContent } from '../../visual/inline-content.ts';
import {
  activationKeyBindings
} from '../internal/interaction.ts';
import { toRenderNode } from '../../renderer/model/element.ts';
import type { ElementMessage } from '../../element/index.ts';
import type {
  ComponentKeyBindingMessages,
  IndependentInteractionOptions,
  InferredElementKeyBindings
} from '../internal/messages.ts';
import { assertControlContract } from '../internal/control-contract.ts';

export function text(content: string, options: TextOptions = {}): Element {
  return componentElementFromRenderNode<'text'>({
    ...optionalRenderNodeId(options.id),
    kind: 'text',
    props: {
      content,
      ...(options.textRole === undefined ? {} : { textRole: options.textRole })
    },
    ...componentMetaProps(options.meta)
  });
}

export function richText(options: RichTextOptions): Element {
  return componentElementFromRenderNode<'richText'>({
    ...optionalRenderNodeId(options.id),
    kind: 'richText',
    props: {
      segments: normalizeInlineContent(options.segments),
      ...(options.wrap === undefined ? {} : { wrap: options.wrap })
    },
    ...componentMetaProps(options.meta)
  });
}

export function disclosure<
  const TChild extends Element<unknown>,
  const TMessage = never
>(
  child: TChild,
  options: DisclosureOptions<TMessage>
): Element<ElementMessage<TChild> | TMessage> {
  assertControlContract('disclosure', options, options.disabled === true, ['onAction']);
  const onAction = options.disabled === true ? undefined : options.onAction;
  const keys = activationKeyBindings(
    onAction === undefined ? undefined : () => onAction({ kind: 'toggle' }),
    options.keys
  );
  return componentElementFromRenderNode<
    'disclosure',
    ElementMessage<TChild> | TMessage
  >({
    ...requiredRenderNodeId(options.id, 'disclosure'),
    kind: 'disclosure',
    ...(options.disabled === true ? { state: { disabled: true } } : {}),
    props: {
      label: options.label,
      ...(options.summary === undefined
        ? {}
        : { summary: normalizeInlineContent(options.summary) }),
      expanded: options.expanded,
      ...(onAction === undefined ? {} : { toActionMessage: onAction })
    },
    children: [toRenderNode(child)],
    ...(keys === undefined ? {} : { keyMap: keys }),
    ...interactionProps({
      pointer: options.pointer,
      meta: options.meta
    })
  });
}

/* eslint-disable @typescript-eslint/unified-signatures -- Separate overloads preserve contextual action types for passive and scrollable controls. */
export function textArea<
  const TActionMessage = unknown,
  const TPointerMessage = never,
  const TKeys extends InferredElementKeyBindings | undefined = undefined
>(
  options: IndependentInteractionOptions<
    ScrollableTextAreaOptions,
    { readonly onAction: TActionMessage },
    TKeys,
    TPointerMessage
  >
): Element<
  | TActionMessage
  | TPointerMessage
  | ComponentKeyBindingMessages<TKeys>
>;
export function textArea<
  const TActionMessage = never,
  const TPointerMessage = never,
  const TKeys extends InferredElementKeyBindings | undefined = undefined
>(
  options: IndependentInteractionOptions<
    UnscrolledTextAreaOptions,
    { readonly onAction: TActionMessage },
    TKeys,
    TPointerMessage
  >
): Element<
  | TActionMessage
  | TPointerMessage
  | ComponentKeyBindingMessages<TKeys>
>;
export function textArea(options: DisabledTextAreaOptions): Element;
/* eslint-enable @typescript-eslint/unified-signatures */
export function textArea(options: unknown): Element<unknown> {
  return textAreaElement(options as TextAreaOptions<unknown>);
}

function textAreaElement(options: TextAreaOptions<unknown>): Element<unknown> {
  assertControlContract('textArea', options, options.disabled === true, [], ['onAction']);
  const toControlMessage: ((action: TextAreaControlAction) => unknown) | undefined = options.onAction;
  const toActionMessage: ((action: TextAreaAction) => unknown) | undefined = options.onAction === undefined
    ? undefined
    : isScrollableTextAreaOptions(options)
      ? options.onAction
      : (action) => action.kind === 'scroll' ? undefined : toControlMessage?.(action);
  const keys = textAreaKeyBindings(toControlMessage, options.keys);
  const presentation = options.presentation;
  assertTextDocument(presentation.document);
  return componentElementFromRenderNode<'textArea', unknown>({
    ...requiredRenderNodeId(options.id, 'textArea'),
    kind: 'textArea',
    ...(options.disabled === true ? { state: { disabled: true } } : {}),
    props: {
      document: presentation.document,
      caret: presentation.caret,
      ...(presentation.selection === undefined ? {} : { selection: presentation.selection }),
      ...(presentation.revealCaret === undefined ? {} : { revealCaret: presentation.revealCaret }),
      ...(options.highlights === undefined ? {} : { highlights: options.highlights }),
      ...(options.placeholder === undefined ? {} : { placeholder: options.placeholder }),
      ...(options.lineNumbers === undefined ? {} : { lineNumbers: options.lineNumbers }),
      ...(options.activeLine === undefined ? {} : { activeLine: options.activeLine }),
      ...(options.wrap === undefined ? {} : { wrap: options.wrap }),
      ...(presentation.scroll === undefined ? {} : { scroll: presentation.scroll }),
      ...(options.scrollbar === undefined ? {} : { scrollbar: options.scrollbar }),
      ...(options.scrollPolicy === undefined ? {} : { scrollPolicy: options.scrollPolicy }),
      ...(options.required === undefined ? {} : { required: options.required }),
      ...(options.error === undefined ? {} : { error: options.error }),
      ...(toActionMessage === undefined ? {} : { toActionMessage })
    },
    ...interactionProps({
      ...textActionInputHandlers(toControlMessage),
      keys,
      pointer: options.pointer,
      meta: options.meta
    })
  });
}

function isScrollableTextAreaOptions<TMessage>(
  options: TextAreaOptions<TMessage>
): options is ScrollableTextAreaOptions<TMessage> {
  return options.presentation.scroll !== undefined;
}
