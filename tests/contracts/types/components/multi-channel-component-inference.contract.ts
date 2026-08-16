import {
  commandInput,
  prepareCommandSuggestions,
  searchPicker,
  textArea,
  tree,
  type CommandInputSubmitEvent,
  type CommandInputTransition,
  type Element,
  type SearchPickerAcceptEvent,
  type SearchPickerControlTransition,
  type TextAreaAction,
  type TreeActivateEvent,
  type TreeControlTransition,
} from '@ismail-elkorchi/terminal-ui/components';
import { prepareSearchPickerIndex, prepareTreeSource, prepareTreeView } from '@ismail-elkorchi/terminal-ui/behavior';
import { prepareTextDocument, textCaretAt } from '@ismail-elkorchi/terminal-ui/text';

export type MessageOf<TElement> = TElement extends Element<infer TMessage> ? TMessage : never;
export type Assert<TValue extends true> = TValue;

const explorer = tree({
  id: 'explorer',
  view: prepareTreeView(prepareTreeSource([{ id: 'src', label: 'src', kind: 'lazy' }]), { activeId: 'src', selection: { mode: 'none' }, expandedIds: [] }),
  presentation: { activeId: 'src', selection: { mode: 'none' }, expandedIds: [] },
  onTransition: (transition) => ({ kind: 'treeTransition' as const, transition }),
  onActivate: (event) => ({ kind: 'treeActivate' as const, event }),
});

const editor = textArea({
  id: 'editor',
  presentation: { document: prepareTextDocument('hello'), caret: textCaretAt(0) },
  onAction: (action: TextAreaAction) => ({ kind: 'editor' as const, action }),
});

const commands = commandInput({
  id: 'commands',
  presentation: { value: '', cursor: 0, open: false, suggestions: prepareCommandSuggestions([]) },
  onTransition: (transition) => ({ kind: 'commandTransition' as const, transition }),
  onSubmit: (event) => ({ kind: 'commandSubmit' as const, event }),
});

const search = searchPicker({
  id: 'search',
  presentation: { query: { text: '', mode: 'fuzzy' } },
  searchPickerIndex: prepareSearchPickerIndex([{ id: 'open', label: 'Open', value: 1 }]),
  onTransition: (transition) => ({ kind: 'searchTransition' as const, transition }),
  onAccept: (event) => ({ kind: 'searchAccept' as const, event }),
});

type ExplorerMessage = MessageOf<typeof explorer>;
export type _TreeTransition = Assert<{ readonly kind: 'treeTransition'; readonly transition: TreeControlTransition } extends ExplorerMessage ? true : false>;
export type _TreeActivate = Assert<{ readonly kind: 'treeActivate'; readonly event: TreeActivateEvent } extends ExplorerMessage ? true : false>;
export type _Editor = Assert<MessageOf<typeof editor> extends { readonly kind: 'editor'; readonly action: TextAreaAction } ? true : false>;
type CommandMessage = MessageOf<typeof commands>;
export type _CommandTransition = Assert<{ readonly kind: 'commandTransition'; readonly transition: CommandInputTransition } extends CommandMessage ? true : false>;
export type _CommandSubmit = Assert<{ readonly kind: 'commandSubmit'; readonly event: CommandInputSubmitEvent } extends CommandMessage ? true : false>;
type SearchMessage = MessageOf<typeof search>;
export type _SearchTransition = Assert<{ readonly kind: 'searchTransition'; readonly transition: SearchPickerControlTransition } extends SearchMessage ? true : false>;
export type _SearchAccept = Assert<{ readonly kind: 'searchAccept'; readonly event: SearchPickerAcceptEvent } extends SearchMessage ? true : false>;
