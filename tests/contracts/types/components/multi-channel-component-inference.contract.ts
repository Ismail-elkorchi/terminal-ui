import {
  commandInput,
  palette,
  textArea,
  tree,
  type CommandInputAction,
  type Element,
  type PaletteAction,
  type TextAreaAction,
  type TreeAction
} from '@ismail-elkorchi/terminal-ui/components';

export type MessageOf<TElement> = TElement extends Element<infer TMessage> ? TMessage : never;
export type Equal<TLeft, TRight> =
  (<T>() => T extends TLeft ? 1 : 2) extends
  (<T>() => T extends TRight ? 1 : 2) ? true : false;
export type Assert<TValue extends true> = TValue;

const explorer = tree({
  id: 'explorer',
  nodes: [{ id: 'src', label: 'src', kind: 'leaf' }],
  onAction: (action: TreeAction) => ({
    kind: 'tree' as const,
    action
  }),
  keys: { enter: () => ({ kind: 'activate' as const }) }
});

const editor = textArea({
  id: 'editor',
  presentation: { value: 'hello', cursor: 0 },
  onAction: (action: TextAreaAction) => ({ kind: 'editor' as const, action })
});

const commands = commandInput({
  id: 'commands',
  presentation: { value: '', cursor: 0, suggestions: [] },
  onAction: (action: CommandInputAction) => ({ kind: 'command' as const, action }),
  onSubmit: () => ({ kind: 'submit' as const }),
  keys: {
    arrowUp: () => ({ kind: 'history' as const, delta: -1 as const }),
    escape: () => ({ kind: 'close' as const })
  }
});

const search = palette({
  id: 'search',
  entries: [{ id: 'open', label: 'Open', value: 1 }],
  onSelect: (entry) => ({ kind: 'selectEntry' as const, value: entry.value }),
  onAction: (action: PaletteAction) => ({ kind: 'palette' as const, action }),
  keys: {
    enter: () => ({ kind: 'acceptPalette' as const }),
    escape: () => ({ kind: 'closePalette' as const })
  }
});

export type TreeMessage =
  | { readonly kind: 'tree'; readonly action: TreeAction }
  | { readonly kind: 'activate' };
export interface EditorMessage { readonly kind: 'editor'; readonly action: TextAreaAction }
export type CommandMessage =
  | { readonly kind: 'command'; readonly action: CommandInputAction }
  | { readonly kind: 'submit' }
  | { readonly kind: 'history'; readonly delta: -1 }
  | { readonly kind: 'close' };
export type PaletteMessage =
  | { readonly kind: 'selectEntry'; readonly value: number }
  | { readonly kind: 'palette'; readonly action: PaletteAction }
  | { readonly kind: 'acceptPalette' }
  | { readonly kind: 'closePalette' };

export type _TreeActual = Assert<MessageOf<typeof explorer> extends TreeMessage ? true : false>;
export type _TreeExpected = Assert<TreeMessage extends MessageOf<typeof explorer> ? true : false>;
export type _EditorActual = Assert<MessageOf<typeof editor> extends EditorMessage ? true : false>;
export type _EditorExpected = Assert<EditorMessage extends MessageOf<typeof editor> ? true : false>;
export type _CommandActual = Assert<MessageOf<typeof commands> extends CommandMessage ? true : false>;
export type _CommandExpected = Assert<CommandMessage extends MessageOf<typeof commands> ? true : false>;
export type _PaletteActual = Assert<MessageOf<typeof search> extends PaletteMessage ? true : false>;
export type _PaletteExpected = Assert<PaletteMessage extends MessageOf<typeof search> ? true : false>;
