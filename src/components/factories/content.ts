import { elementFromRenderNode } from '../../render-node/element.ts';
import type { Element } from '../element.ts';
import type { RichTextOptions, TextAreaOptions, TextOptions } from '../options/content.ts';
import { interactionProps } from '../factory-internals/interaction.ts';
import { optionalId } from '../factory-internals/layout.ts';

export function text(content: string, options: TextOptions = {}): Element<never> {
  return elementFromRenderNode({
    ...optionalId(options.id),
    kind: 'text',
    props: {
      content,
      ...(options.textRole === undefined ? {} : { textRole: options.textRole })
    },
    ...interactionProps(options)
  });
}

export function richText<TMessage>(options: RichTextOptions<TMessage>): Element<TMessage> {
  return elementFromRenderNode({
    ...optionalId(options.id),
    kind: 'richText',
    props: {
      segments: options.segments,
      ...(options.wrap === undefined ? {} : { wrap: options.wrap })
    },
    ...interactionProps(options)
  });
}

export function textArea<TMessage>(options: TextAreaOptions<TMessage> = {}): Element<TMessage> {
  return elementFromRenderNode({
    ...optionalId(options.id),
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
    ...interactionProps(options)
  });
}
