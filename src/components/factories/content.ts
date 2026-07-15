import { elementFromRenderNode } from '../../renderer/model/element.ts';
import type { Element } from '../../element/index.ts';
import type {
  RichTextOptions,
  PassiveTextAreaOptions,
  ScrollableTextAreaOptions,
  TextAreaOptions,
  TextOptions
} from '../options/content.ts';
import type { TextAreaAction, TextAreaControlAction } from '../../ui-model/text-area.ts';
import {
  componentMetaProps,
  interactionProps,
  textAreaKeyBindings,
  textActionInputHandlers
} from '../internal/interaction.ts';
import { optionalId, requiredId } from '../../authoring/render-node.ts';
import { normalizeInlineContent } from '../../visual/inline-content.ts';
import type {
  ComponentKeyBindingMessages,
  IndependentInteractionOptions,
  InferredElementKeyBindings
} from '../internal/messages.ts';

export function text(content: string, options: TextOptions = {}): Element {
  return elementFromRenderNode<'text'>({
    ...optionalId(options.id),
    kind: 'text',
    props: {
      content,
      ...(options.textRole === undefined ? {} : { textRole: options.textRole })
    },
    ...componentMetaProps(options.meta)
  });
}

export function richText(options: RichTextOptions): Element {
  return elementFromRenderNode<'richText'>({
    ...optionalId(options.id),
    kind: 'richText',
    props: {
      segments: normalizeInlineContent(options.segments),
      ...(options.wrap === undefined ? {} : { wrap: options.wrap })
    },
    ...componentMetaProps(options.meta)
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
    Record<never, never>,
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
    PassiveTextAreaOptions,
    { readonly onAction: TActionMessage },
    Record<never, never>,
    TKeys,
    TPointerMessage
  >
): Element<
  | TActionMessage
  | TPointerMessage
  | ComponentKeyBindingMessages<TKeys>
>;
/* eslint-enable @typescript-eslint/unified-signatures */
export function textArea(options: TextAreaOptions<unknown>): Element<unknown> {
  const toControlMessage: ((action: TextAreaControlAction) => unknown) | undefined = options.onAction;
  const toActionMessage: ((action: TextAreaAction) => unknown) | undefined = options.onAction === undefined
    ? undefined
    : isScrollableTextAreaOptions(options)
      ? options.onAction
      : (action) => action.kind === 'scroll' ? undefined : toControlMessage?.(action);
  const keys = textAreaKeyBindings(toControlMessage, options.keys);
  const presentation = options.presentation;
  return elementFromRenderNode<'textArea', unknown>({
    ...requiredId(options.id, 'textArea'),
    kind: 'textArea',
    props: {
      value: presentation.value,
      cursor: presentation.cursor,
      ...(presentation.selection === undefined ? {} : { selection: presentation.selection }),
      ...(options.highlights === undefined ? {} : { highlights: options.highlights }),
      ...(options.placeholder === undefined ? {} : { placeholder: options.placeholder }),
      ...(options.lineNumbers === undefined ? {} : { lineNumbers: options.lineNumbers }),
      ...(options.activeLine === undefined ? {} : { activeLine: options.activeLine }),
      ...(options.wrap === undefined ? {} : { wrap: options.wrap }),
      ...(presentation.scroll === undefined ? {} : { scroll: presentation.scroll }),
      ...(options.scrollbar === undefined ? {} : { scrollbar: options.scrollbar }),
      ...(options.scrollPolicy === undefined ? {} : { scrollPolicy: options.scrollPolicy }),
      ...(options.required === undefined ? {} : { required: options.required }),
      ...(options.disabled === undefined ? {} : { disabled: options.disabled }),
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
