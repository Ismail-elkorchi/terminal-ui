import { createSuggestionFixture } from '../../../support/collection-fixtures.mjs';
import {
  button,
  commandInput,
  contextMenu,
  dialog,
  disclosure,
  field,
  menuBar,
  menuTrigger,
  tooltip,
  tabs,
  text,
  textArea,
  type CommandInputSubmitEvent,
  type CommandInputTransition,
  type ContextMenuTransition,
  type DialogDismissEvent,
  type DisclosureTransition,
  type ElementMessage,
  type MenuActivateEvent,
  type MenuBarTransition,
  type MenuTriggerTransition,
  type TooltipTransition,
  type TabsTransition,
  type TextAreaControlTransition,
  type TextAreaLayoutRequest,
} from '@ismail-elkorchi/terminal-ui/components';
import { createTextDocument, textCaretAt } from '@ismail-elkorchi/terminal-ui/text';

type Equal<TLeft, TRight> =
  (<T>() => T extends TLeft ? 1 : 2) extends (<T>() => T extends TRight ? 1 : 2) ? true : false;
type Assert<TValue extends true> = TValue;

type ContentMessage = { readonly kind: 'content' };
type ActionMessage = { readonly kind: 'action' };
type DismissMessage = { readonly kind: 'dismiss'; readonly event: DialogDismissEvent };
type TooltipMessage = { readonly kind: 'tooltip'; readonly transition: TooltipTransition };
const content = button({ id: 'content', label: 'Content', onPress: () => ({ kind: 'content' } as const) });
const actions = button({ id: 'action', label: 'Action', onPress: () => ({ kind: 'action' } as const) });

const passiveDialog = dialog({
  id: 'passive-dialog', title: 'Dialog', modal: false, slots: { content, actions },
});
const dismissibleDialog = dialog({
  id: 'dismissible-dialog', title: 'Dialog', modal: false, slots: { content, actions },
  dismissal: { dismissOnEscape: true, dismissOnOutsidePress: true },
  onDismiss: event => ({ kind: 'dismiss', event } as const),
});
const dialogWithoutActions = dialog({
  id: 'content-dialog', title: 'Dialog', modal: false, slots: { content },
});
const hinted = tooltip({
  id: 'hint', trigger: content, content: 'Hint', open: false,
  onTransition: transition => ({ kind: 'tooltip', transition } as const),
});

export type _PassiveDialogMessages = Assert<Equal<ElementMessage<typeof passiveDialog>, ContentMessage | ActionMessage>>;
export type _DismissibleDialogMessages = Assert<Equal<ElementMessage<typeof dismissibleDialog>, ContentMessage | ActionMessage | DismissMessage>>;
export type _DialogWithoutActionMessages = Assert<Equal<ElementMessage<typeof dialogWithoutActions>, ContentMessage>>;
export type _TooltipMessages = Assert<Equal<ElementMessage<typeof hinted>, ContentMessage | TooltipMessage>>;

type ContextTransitionMessage = { readonly kind: 'contextTransition'; readonly transition: ContextMenuTransition };
type ContextActivationMessage = { readonly kind: 'contextActivation'; readonly event: MenuActivateEvent };
type ContextMessage = ContextTransitionMessage | ContextActivationMessage;
const context = contextMenu<ContextMessage>({
  id: 'context', view: { kind: 'closed' },
  onTransition: transition => ({ kind: 'contextTransition', transition }),
  onActivate: event => ({ kind: 'contextActivation', event }),
});
const inferredContext = contextMenu({
  id: 'inferred-context', view: { kind: 'closed' },
  onTransition: transition => ({ kind: 'contextTransition', transition } as const),
});
const disabledContext = contextMenu({ id: 'disabled-context', view: { kind: 'closed' }, disabled: true });
export type _ContextMessages = Assert<Equal<ElementMessage<typeof context>, ContextMessage>>;
export type _InferredContextMessages = Assert<Equal<ElementMessage<typeof inferredContext>, ContextTransitionMessage>>;
export type _DisabledContextMessages = Assert<Equal<ElementMessage<typeof disabledContext>, never>>;

type TriggerTransitionMessage = { readonly kind: 'triggerTransition'; readonly transition: MenuTriggerTransition };
type TriggerActivationMessage = { readonly kind: 'triggerActivation'; readonly event: MenuActivateEvent };
type TriggerMessage = TriggerTransitionMessage | TriggerActivationMessage;
const trigger = menuTrigger<TriggerMessage>({
  id: 'trigger', label: 'Actions', items: [], view: { kind: 'closed' },
  onTransition: transition => ({ kind: 'triggerTransition', transition }),
  onActivate: event => ({ kind: 'triggerActivation', event }),
});
const inferredTrigger = menuTrigger({
  id: 'inferred-trigger', label: 'Actions', items: [], view: { kind: 'closed' },
  onTransition: transition => ({ kind: 'triggerTransition', transition } as const),
});
const inertTrigger = menuTrigger({ id: 'inert-trigger', label: 'Actions', items: [], view: { kind: 'closed' }, inert: true });
export type _TriggerMessages = Assert<Equal<ElementMessage<typeof trigger>, TriggerMessage>>;
export type _InferredTriggerMessages = Assert<Equal<ElementMessage<typeof inferredTrigger>, TriggerTransitionMessage>>;
export type _InertTriggerMessages = Assert<Equal<ElementMessage<typeof inertTrigger>, never>>;

type CommandTransitionMessage = { readonly kind: 'commandTransition'; readonly transition: CommandInputTransition };
type CommandSubmitMessage = { readonly kind: 'commandSubmit'; readonly event: CommandInputSubmitEvent };
const commandView = { input: { text: '', cursor: 0 }, open: false, ...createSuggestionFixture([]) };
const command = commandInput({
  id: 'command', view: commandView,
  onTransition: transition => ({ kind: 'commandTransition', transition } as const),
  onSubmit: event => ({ kind: 'commandSubmit', event } as const),
});
const disabledCommand = commandInput({ id: 'disabled-command', view: commandView, disabled: true });
export type _CommandMessages = Assert<Equal<ElementMessage<typeof command>, CommandTransitionMessage | CommandSubmitMessage>>;
export type _DisabledCommandMessages = Assert<Equal<ElementMessage<typeof disabledCommand>, never>>;

// @ts-expect-error tooltip requires its controlled transition callback
tooltip({ id: 'missing-transition', trigger: content, content: 'Hint', open: false });
// @ts-expect-error a passive dialog cannot declare an onDismiss callback
dialog({ id: 'passive-dismiss', title: 'Dialog', modal: false, slots: { content }, onDismiss: () => ({ kind: 'dismiss' }) });
// @ts-expect-error enabled context menus require a transition callback
contextMenu({ id: 'missing-context-transition', view: { kind: 'closed' } });
// @ts-expect-error enabled menu triggers require a transition callback
menuTrigger({ id: 'missing-trigger-transition', label: 'Actions', items: [], view: { kind: 'closed' } });
// @ts-expect-error implementation-owned command suggestions are not a caller slot
commandInput({ id: 'private-slot', view: commandView, slots: { suggestions: content }, onTransition: () => ({ kind: 'command' }) });


type MenuBarMessage = { readonly kind: 'barTransition'; readonly transition: MenuBarTransition };
const bar = menuBar({
  id: 'bar', items: [], view: { kind: 'closed' },
  onTransition: transition => ({ kind: 'barTransition', transition } as const),
});
const disabledBar = menuBar({ id: 'disabled-bar', items: [], view: { kind: 'closed' }, disabled: true });
export type _MenuBarMessages = Assert<Equal<ElementMessage<typeof bar>, MenuBarMessage>>;
export type _DisabledBarMessages = Assert<Equal<ElementMessage<typeof disabledBar>, never>>;

const labelled = field({ id: 'field', label: 'Content', control: content });
type DisclosureMessage = { readonly kind: 'disclosure'; readonly transition: DisclosureTransition };
const disclosed = disclosure({
  id: 'disclosure', label: 'Details', expanded: true, slots: { content },
  onTransition: transition => ({ kind: 'disclosure', transition } as const),
});
const disabledDisclosure = disclosure({ id: 'disabled-disclosure', label: 'Details', expanded: true, slots: { content }, disabled: true });
export type _FieldMessages = Assert<Equal<ElementMessage<typeof labelled>, ContentMessage>>;
export type _DisclosureMessages = Assert<Equal<ElementMessage<typeof disclosed>, ContentMessage | DisclosureMessage>>;
export type _DisabledDisclosureMessages = Assert<Equal<ElementMessage<typeof disabledDisclosure>, ContentMessage>>;

type TabId = 'first' | 'second';
type TabMessage = { readonly kind: 'tabTransition'; readonly transition: TabsTransition<TabId> };
const tabbed = tabs({
  id: 'tabs', state: {},
  tabs: [{ id: 'first', label: 'First', panel: text({ content: 'First' }) }, { id: 'second', label: 'Second', panel: text({ content: 'Second' }) }],
  onTransition: transition => ({ kind: 'tabTransition', transition } as const),
});
const childTabs = tabs<TabId, ContentMessage | TabMessage>({
  id: 'child-tabs', state: {}, tabs: [{ id: 'first', label: 'First', panel: content }],
  onTransition: transition => ({ kind: 'tabTransition', transition }),
});
export type _InferredTabMessages = Assert<Equal<ElementMessage<typeof tabbed>, TabMessage>>;
export type _PanelAndTabMessages = Assert<Equal<ElementMessage<typeof childTabs>, ContentMessage | TabMessage>>;

type EditorMessage = { readonly kind: 'editor'; readonly transition: TextAreaControlTransition };
const editorState = { document: createTextDocument('Content'), caret: textCaretAt(0) };
const editor = textArea({
  id: 'editor', state: editorState,
  onTransition: (transition: TextAreaControlTransition) => ({ kind: 'editor', transition } as const),
});
type LayoutMessage = { readonly kind: 'layout'; readonly request: TextAreaLayoutRequest };
const disabledEditor = textArea({
  id: 'disabled-editor', state: editorState, disabled: true,
  onLayoutRequest: request => ({ kind: 'layout', request } as const),
});
export type _EditorMessages = Assert<Equal<ElementMessage<typeof editor>, EditorMessage>>;
export type _DisabledEditorLayoutMessages = Assert<Equal<ElementMessage<typeof disabledEditor>, LayoutMessage>>;
