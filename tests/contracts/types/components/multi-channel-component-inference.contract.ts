import {
  commandInput,
  createCommandSuggestions,
  searchPicker,
  textArea,
  tree,
  type CommandInputSubmitEvent,
  type CommandInputTransition,
  type Element,
  type SearchPickerAcceptEvent,
  type SearchPickerControlTransition,
  type TextAreaTransition,
  type TreeActivateEvent,
  type TreeControlTransition,
} from '@ismail-elkorchi/terminal-ui/components';
import { createSearchPickerIndex, createTreeSource, createTreeView } from '@ismail-elkorchi/terminal-ui/behavior';
import { createTextDocument, textCaretAt } from '@ismail-elkorchi/terminal-ui/text';

export type MessageOf<TElement> = TElement extends Element<infer TMessage> ? TMessage : never;
export type Assert<TValue extends true> = TValue;

const explorer = tree({
  id: 'explorer',
  view: createTreeView(createTreeSource([{ id: 'src', label: 'src', kind: 'lazy' }]), { activeId: 'src', selection: { mode: 'none' }, expandedIds: [] }),
  state: { activeId: 'src', selection: { mode: 'none' }, expandedIds: [] },
  onTransition: (transition) => ({ kind: 'treeTransition' as const, transition }),
  onActivate: (event) => ({ kind: 'treeActivate' as const, event }),
});

const editor = textArea({
  id: 'editor',
  state: { document: createTextDocument('hello'), caret: textCaretAt(0) },
  onTransition: (action: TextAreaTransition) => ({ kind: 'editor' as const, action }),
});

const commands = commandInput({
  id: 'commands',
  view: { input: { text: '', cursor: 0 }, open: false, suggestions: createCommandSuggestions([]) },
  onTransition: (transition) => ({ kind: 'commandTransition' as const, transition }),
  onSubmit: (event) => ({ kind: 'commandSubmit' as const, event }),
});

const search = searchPicker({
  id: 'search',
  view: { input: { text: '', cursor: 0 }, query: { mode: 'fuzzy' } },
  searchPickerIndex: createSearchPickerIndex([{ id: 'open', label: 'Open', value: 1 }]),
  onTransition: (transition) => ({ kind: 'searchTransition' as const, transition }),
  onAccept: (event) => ({ kind: 'searchAccept' as const, event }),
});

type ExplorerMessage = MessageOf<typeof explorer>;
export type _TreeTransition = Assert<{ readonly kind: 'treeTransition'; readonly transition: TreeControlTransition } extends ExplorerMessage ? true : false>;
export type _TreeActivate = Assert<{ readonly kind: 'treeActivate'; readonly event: TreeActivateEvent } extends ExplorerMessage ? true : false>;
export type _Editor = Assert<MessageOf<typeof editor> extends { readonly kind: 'editor'; readonly action: TextAreaTransition } ? true : false>;
type CommandMessage = MessageOf<typeof commands>;
export type _CommandTransition = Assert<{ readonly kind: 'commandTransition'; readonly transition: CommandInputTransition } extends CommandMessage ? true : false>;
export type _CommandSubmit = Assert<{ readonly kind: 'commandSubmit'; readonly event: CommandInputSubmitEvent } extends CommandMessage ? true : false>;
type SearchMessage = MessageOf<typeof search>;
export type _SearchTransition = Assert<{ readonly kind: 'searchTransition'; readonly transition: SearchPickerControlTransition } extends SearchMessage ? true : false>;
export type _SearchAccept = Assert<{ readonly kind: 'searchAccept'; readonly event: SearchPickerAcceptEvent } extends SearchMessage ? true : false>;
