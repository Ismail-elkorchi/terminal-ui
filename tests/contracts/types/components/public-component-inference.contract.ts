import { button, richText, toolbar as semanticToolbar, type Element } from '@ismail-elkorchi/terminal-ui/components';
import { row } from '@ismail-elkorchi/terminal-ui/layout';

export type MessageOf<TElement> = TElement extends Element<infer TMessage> ? TMessage : never;
export type Equal<TLeft, TRight> =
  (<T>() => T extends TLeft ? 1 : 2) extends
  (<T>() => T extends TRight ? 1 : 2) ? true : false;
export type Assert<TValue extends true> = TValue;

const passive = richText({ segments: [] });
const linked = richText({
  id: 'documentation',
  segments: [{ kind: 'text', text: 'Documentation', link: { href: 'https://example.test' } }],
  onLinkActivate: (event) => ({ kind: 'open-link', href: event.link.href } as const),
});
const save = button({ id: 'save', label: 'Save', onAction: () => ({ kind: 'save' } as const) });
const quit = button({ id: 'quit', label: 'Quit', onAction: () => ({ kind: 'quit', force: true } as const) });
const toolbar = row([passive, save, quit] as const);
const wrappedToolbar = semanticToolbar(toolbar, { id: 'toolbar', label: 'Actions' });

export type _Passive = Assert<Equal<MessageOf<typeof passive>, never>>;
export type _Linked = Assert<Equal<
  MessageOf<typeof linked>,
  { readonly kind: 'open-link'; readonly href: string }
>>;
export type _Save = Assert<Equal<MessageOf<typeof save>, { readonly kind: 'save' }>>;
export type _Toolbar = Assert<Equal<
  MessageOf<typeof toolbar>,
  { readonly kind: 'save' } | { readonly kind: 'quit'; readonly force: true }
>>;
export type _WrappedToolbar = Assert<Equal<MessageOf<typeof wrappedToolbar>, MessageOf<typeof toolbar>>>;
