import { elementFromRenderNode } from '../../render-node/element.ts';
import type { Element } from '../../element/index.ts';
import type { RichTextOptions, TextAreaOptions, TextOptions } from '../../ui-model/options/content.ts';
import {
  componentMetaProps,
  interactionProps,
  textAreaKeyBindings,
  textEditInputHandlers
} from '../factory-internals/interaction.ts';
import { optionalId, requiredId } from '../factory-internals/render-node.ts';
import type {
  ComponentKeyBindingMessages,
  IndependentInteractionOptions,
  InferredElementKeyBindings
} from '../factory-internals/messages.ts';

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
      segments: options.segments,
      ...(options.wrap === undefined ? {} : { wrap: options.wrap })
    },
    ...componentMetaProps(options.meta)
  });
}

export function textArea<
  const TScrollMessage = never,
  const TTextPointerMessage = never,
  const TEditMessage = never,
  const TKeys extends InferredElementKeyBindings | undefined = undefined
>(
  options: IndependentInteractionOptions<
    TextAreaOptions,
    {
      readonly onScroll: TScrollMessage;
      readonly onTextPointer: TTextPointerMessage;
      readonly onEdit: TEditMessage;
    },
    Record<never, never>,
    TKeys
  >
): Element<
  | TScrollMessage
  | TTextPointerMessage
  | TEditMessage
  | ComponentKeyBindingMessages<TKeys>
>;
export function textArea(options: TextAreaOptions<unknown>): Element<unknown> {
  const keys = textAreaKeyBindings(options.onEdit, options.keys);
  return elementFromRenderNode<'textArea', unknown>({
    ...requiredId(options.id, 'textArea'),
    kind: 'textArea',
    props: {
      value: options.value ?? '',
      ...(options.cursor === undefined ? {} : { cursor: options.cursor }),
      ...(options.selection === undefined ? {} : { selection: options.selection }),
      ...(options.highlights === undefined ? {} : { highlights: options.highlights }),
      ...(options.placeholder === undefined ? {} : { placeholder: options.placeholder }),
      ...(options.lineNumbers === undefined ? {} : { lineNumbers: options.lineNumbers }),
      ...(options.activeLine === undefined ? {} : { activeLine: options.activeLine }),
      ...(options.wrap === undefined ? {} : { wrap: options.wrap }),
      ...(options.scroll === undefined ? {} : { scroll: options.scroll }),
      ...(options.scrollbar === undefined ? {} : { scrollbar: options.scrollbar }),
      ...(options.scrollPolicy === undefined ? {} : { scrollPolicy: options.scrollPolicy }),
      ...(options.required === undefined ? {} : { required: options.required }),
      ...(options.disabled === undefined ? {} : { disabled: options.disabled }),
      ...(options.error === undefined ? {} : { error: options.error }),
      ...(options.onScroll === undefined ? {} : { toScrollMessage: options.onScroll }),
      ...(options.onTextPointer === undefined ? {} : { toTextPointerMessage: options.onTextPointer })
    },
    ...interactionProps({
      ...textEditInputHandlers(options.onEdit),
      keys,
      meta: options.meta
    })
  });
}
