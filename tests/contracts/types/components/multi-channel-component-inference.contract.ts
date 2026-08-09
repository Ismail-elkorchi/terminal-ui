import {
  commandInput,
  searchPicker,
  textArea,
  tree,
  type CommandInputAction,
  type Element,
  type SearchPickerAction,
  type TextAreaAction,
  type TreeInteractionAction
} from '@ismail-elkorchi/terminal-ui/components';
import { prepareTextDocument, textCaretAt } from '@ismail-elkorchi/terminal-ui/text';
import { prepareSearchPickerIndex } from '@ismail-elkorchi/terminal-ui/behavior';

export type MessageOf<TElement> = TElement extends Element<infer TMessage> ? TMessage : never;
export type Equal<TLeft, TRight> =
  (<T>() => T extends TLeft ? 1 : 2) extends
  (<T>() => T extends TRight ? 1 : 2) ? true : false;
export type Assert<TValue extends true> = TValue;

const explorer = tree({
  id: 'explorer',
  nodes: [{ id: 'src', label: 'src', kind: 'leaf' }],
  onAction: (action: TreeInteractionAction) => ({
    kind: 'tree' as const,
    action
  })
});

const editor = textArea({
  id: 'editor',
  presentation: { document: prepareTextDocument('hello'), caret: textCaretAt(0 )},
  onAction: (action: TextAreaAction) => ({ kind: 'editor' as const, action })
});

const commands = commandInput({
  id: 'commands',
  presentation: { value: '', cursor: 0, suggestions: [] },
  onAction: (action: CommandInputAction) => ({ kind: 'command' as const, action })
});

const search = searchPicker({
  id: 'search',
  searchPickerIndex: prepareSearchPickerIndex([{ id: 'open', label: 'Open', value: 1 }]),
  onAction: (action: SearchPickerAction<number>) => ({
    kind: 'searchPicker' as const,
    action
  })
});

export type TreeMessage =
  { readonly kind: 'tree'; readonly action: TreeInteractionAction };
export interface EditorMessage { readonly kind: 'editor'; readonly action: TextAreaAction }
export type CommandMessage =
  { readonly kind: 'command'; readonly action: CommandInputAction };
export type SearchPickerMessage =
  { readonly kind: 'searchPicker'; readonly action: SearchPickerAction<number> };

export type _TreeActual = Assert<MessageOf<typeof explorer> extends TreeMessage ? true : false>;
export type _TreeExpected = Assert<TreeMessage extends MessageOf<typeof explorer> ? true : false>;
export type _EditorActual = Assert<MessageOf<typeof editor> extends EditorMessage ? true : false>;
export type _EditorExpected = Assert<EditorMessage extends MessageOf<typeof editor> ? true : false>;
export type _CommandActual = Assert<MessageOf<typeof commands> extends CommandMessage ? true : false>;
export type _CommandExpected = Assert<CommandMessage extends MessageOf<typeof commands> ? true : false>;
export type _SearchPickerActual = Assert<MessageOf<typeof search> extends SearchPickerMessage ? true : false>;
export type _SearchPickerExpected = Assert<SearchPickerMessage extends MessageOf<typeof search> ? true : false>;
