import { button, type Element } from '@ismail-elkorchi/terminal-ui/components';
import { custom } from '@ismail-elkorchi/terminal-ui/component';

export type MessageOf<TElement> = TElement extends Element<infer TMessage> ? TMessage : never;
export type Equal<TLeft, TRight> =
  (<T>() => T extends TLeft ? 1 : 2) extends
  (<T>() => T extends TRight ? 1 : 2) ? true : false;
export type Assert<TValue extends true> = TValue;

const save = button({ id: 'save', label: 'Save', onPress: () => ({ kind: 'save' } as const) });
const cancel = button({ id: 'cancel', label: 'Cancel', onPress: () => ({ kind: 'cancel' } as const) });
const composite = custom({
  id: 'actions',
  children: [save, cancel] as const,
  renderer: {
    kind: 'composite',
    name: 'actionRow',
    parts: [],
    measure: ({ measureChild }) => {
      const first = measureChild(0);
      const second = measureChild(1);
      return {
        minWidth: first.minWidth + second.minWidth,
        minHeight: Math.max(first.minHeight, second.minHeight),
        preferredWidth: first.preferredWidth + second.preferredWidth,
        preferredHeight: Math.max(first.preferredHeight, second.preferredHeight)
      };
    },
    layout: ({ bounds }) => [
      { ...bounds, width: Math.floor(bounds.width / 2) },
      { ...bounds, column: bounds.column + Math.floor(bounds.width / 2), width: bounds.width - Math.floor(bounds.width / 2) }
    ],
    accessibility: ({ id }) => ({ id, role: 'group', label: 'Actions' })
  }
});

export type _Composite = Assert<Equal<
  MessageOf<typeof composite>,
  { readonly kind: 'save' } | { readonly kind: 'cancel' }
>>;
