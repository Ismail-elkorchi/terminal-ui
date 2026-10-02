import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import {
  button,
  createSearchPickerKeymap,
  createTreeKeymap,
  controlKeymapHelp,
  column,
  commandInput,
  defineTui,
  createTuiChild,
  liftTuiResult,
  createTuiControls,
  dialog,
  dataGrid,
  helpBar,
  overlay,
  createCommandSuggestions,
  runTui,
  splitPane,
  statusBar,
  surface,
  tabs,
  text,
  textArea,
  tree
} from '@ismail-elkorchi/terminal-ui';
import type { TuiContext, TuiUpdateResult, TuiChildState, TuiChildMessage, TuiControlMessage } from '@ismail-elkorchi/terminal-ui';
import {
  commandInputView,
  commandInputReducer,
  createCommandInputState,
  createScrollState,
  dataGridReducer,
  createTableCollection,
  tabsReducer,
  createTextAreaState,
  textAreaReducer,
  createTreeSource,
  createTreeView,
  treeReducer
} from '@ismail-elkorchi/terminal-ui/behavior';
import type { CommandInputState } from '@ismail-elkorchi/terminal-ui/behavior';
import type {
  CompleteTableCollection,
  TextAreaTransition,
  CommandInputTransition,
  ScrollableDataGridState,
  DataGridTransition,
  SearchEntry,
  TableColumn,
  TabsTransition,
  TreeNode,
  ScrollableTreeState,
  TreeTransition,
} from '@ismail-elkorchi/terminal-ui';

import { pickerDefinition } from './features/picker.ts';
import type { PickerState, PickerMessage } from './features/picker.ts';

interface Ticket {
  readonly id: string;
  readonly queue: 'triage' | 'review' | 'done';
  readonly title: string;
  readonly owner: string;
  readonly severity: 'low' | 'medium' | 'high';
  readonly status: 'pending' | 'running' | 'success';
}

type NavigationMetadata = Readonly<Record<string, string>>;
type WorkspaceTab = 'issues' | 'activity' | 'notes';

export interface WorkspaceState {
  readonly notes: ReturnType<typeof createTextAreaState>;
  readonly tab: WorkspaceTab;
  readonly tree: ScrollableTreeState;
  readonly table: ScrollableDataGridState;
  readonly command: CommandInputState;
  readonly searchPicker: TuiChildState<PickerState<string>>;
  readonly resolved: ReadonlySet<string>;
  readonly activity: readonly string[];
}

export type WorkspaceMessage =
  | TuiControlMessage<typeof workspaceControls>
  | { readonly kind: 'tree'; readonly transition: TreeTransition }
  | { readonly kind: 'submit'; readonly value: string }
  | { readonly kind: 'picker'; readonly message: TuiChildMessage<PickerMessage<string>> }
  | { readonly kind: 'openSearchPicker' }
  | { readonly kind: 'closeSearchPicker' }
  | { readonly kind: 'resolve' }
  | { readonly kind: 'exit' };

export const incidentCount = 100_000;
const services = ['gateway', 'billing', 'search', 'identity', 'storage', 'scheduler', 'events', 'worker'];
const symptoms = ['timeout', 'retry spike', 'slow query', 'connection reset', 'queue backlog', 'memory pressure'];
const tickets: readonly Ticket[] = Object.freeze(Array.from({ length: incidentCount }, (_, index): Ticket => ({
  id: `INC-${String(index).padStart(6, '0')}`,
  queue: index % 3 === 0 ? 'triage' : index % 3 === 1 ? 'review' : 'done',
  title: `${services[index % services.length] ?? 'gateway'} ${symptoms[index % symptoms.length] ?? 'timeout'} region-${String(index % 31)} trace-${String(index)}`,
  owner: ['Mina', 'Noor', 'Ilyas', 'Sara'][index % 4] ?? 'Mina',
  severity: index % 5 === 0 ? 'high' : index % 2 === 0 ? 'medium' : 'low',
  status: index % 3 === 0 ? 'pending' : index % 3 === 1 ? 'running' : 'success',
})));
const ticketById = new Map(tickets.map(ticket => [ticket.id, ticket]));
const queues = {
  triage: tickets.filter(ticket => ticket.queue === 'triage'),
  review: tickets.filter(ticket => ticket.queue === 'review'),
  done: tickets.filter(ticket => ticket.queue === 'done'),
};

const tableCollections = new WeakMap<readonly Ticket[], CompleteTableCollection<Ticket>>();
function incidentCollection(rows: readonly Ticket[]) {
  let collection = tableCollections.get(rows);
  if (collection === undefined) {
    collection = createTableCollection(rows, ticket => ticket.id);
    tableCollections.set(rows, collection);
  }
  return collection;
}

const tableColumns: readonly TableColumn<Ticket>[] = [
  { id: 'id', header: 'ID', value: (ticket) => ticket.id, width: { kind: 'fixed', cells: 8 } },
  { id: 'title', header: 'Title', value: (ticket) => ticket.title, width: { kind: 'fill' } },
  { id: 'owner', header: 'Owner', value: (ticket) => ticket.owner, width: { kind: 'fixed', cells: 10 } },
  { id: 'severity', header: 'Severity', value: (ticket) => ticket.severity, width: { kind: 'fixed', cells: 10 } },
  { id: 'status', header: 'Status', value: (ticket) => ticket.status, width: { kind: 'fixed', cells: 10 } }
];

const commandEntries: readonly SearchEntry[] = [
  { id: 'issues', label: 'Open issues', value: '/issues', group: 'Navigation' },
  { id: 'activity', label: 'Open activity', value: '/activity', group: 'Navigation' },
  { id: 'resolve', label: 'Resolve selected ticket', value: '/resolve', group: 'Actions' },
  { id: 'notes', label: 'Open notes', value: '/notes', group: 'Navigation' }
];
function* searchPickerBatches(): Generator<readonly SearchEntry[]> {
  yield commandEntries;
  for (let start = 0; start < tickets.length; start += 256) {
    yield tickets.slice(start, start + 256).map(ticket => ({ id: ticket.id,
      label: `${ticket.id} ${ticket.title}`, value: ticket.id,
      keywords: [ticket.owner, ticket.severity, ticket.queue] }));
  }
}
const navigationTreeSource = createTreeSource(navigationNodes());

const pickerKeymap = createSearchPickerKeymap({ next: [{ kind: 'key', key: 'n', modifiers: { ctrl: true } }], previous: [{ kind: 'key', key: 'p', modifiers: { ctrl: true } }] });
const navigationKeymap = createTreeKeymap({ next: [{ kind: 'key', key: 'j' }], previous: [{ kind: 'key', key: 'k' }] });

const workspaceControls = createTuiControls<WorkspaceState>()({
  notes: (notes, transition: TextAreaTransition) => textAreaReducer(notes, transition).state,
  table: (table, transition: DataGridTransition, state) => dataGridReducer(table, transition, {
    collection: incidentCollection(visibleTickets(state)),
    columnIds: tableColumns.map((column) => column.id), pageSize: 12,
  }),
  tab: (tab, transition: TabsTransition<WorkspaceTab>) => tabsReducer(
    { activeId: tab, selectedId: tab }, transition,
    { tabs: [{ id: 'issues' }, { id: 'activity' }, { id: 'notes' }], activation: 'automatic' },
  ).selectedId ?? tab,
  command: (command, transition: CommandInputTransition) => {
    const next = commandInputReducer(command, transition);
    return transitionChangesCommandText(transition) ? withCommandSuggestions(next) : next;
  },
});

const picker = createTuiChild(pickerDefinition(searchPickerBatches, pickerKeymap),
  (message): WorkspaceMessage => ({ kind: 'picker', message }));

const emptyCommandSuggestions = createCommandSuggestions([]);

function navigationNodes(): readonly TreeNode<NavigationMetadata>[] {
  return [{
    id: 'workspace',
    label: 'Workspace',
    kind: 'branch',
    children: [
      { id: 'queue:triage', label: 'Triage', kind: 'leaf', metadata: { queue: 'triage' } },
      { id: 'queue:review', label: 'Review', kind: 'leaf', metadata: { queue: 'review' } },
      { id: 'queue:done', label: 'Done', kind: 'leaf', metadata: { queue: 'done' } }
    ]
  }];
}

function initialState(context: TuiContext): WorkspaceState {
  return {
    notes: createTextAreaState({ value: 'Incident response notes\n\nHypothesis:\nEvidence:\nNext steps:\n' }),
    tab: 'issues',
    tree: {
      expandedIds: ['workspace'],
      activeId: 'queue:triage',
      selection: { mode: 'single', selectedId: 'queue:triage', selectionFollowsActive: true },
      scroll: createScrollState()
    },
    table: {
      interaction: {
        kind: 'row',
        activeRowId: 'INC-000000',
        selection: { mode: 'single', selectedRowId: 'INC-000000', selectionFollowsActive: true },
      },
      scroll: createScrollState()
    },
    command: createCommandInputState({ suggestions: emptyCommandSuggestions }),
    searchPicker: picker.init({ id: 'command-search', generation: 0 }, context).state,
    resolved: new Set<string>(),
    activity: ['Workspace started.', 'Loaded 100,000 deterministic incident records. Notes and resolution edits stay in memory.']
  };
}

export const incidentWorkbenchApp = defineTui<WorkspaceState, WorkspaceMessage>({
  id: 'incident-workbench',
  init: context => ({
    state: initialState(context),
    focus: {
      kind: 'path',
      path: ['workspace-root', 'workspace-grid', 'workspace-command-surface', 'workspace-command'],
    },
  }),
  update: updateWorkspace,
  view: workspaceView,
  inputBindings: [{
    id: 'exit',
    triggers: [
      { kind: 'key', key: 'c', modifiers: { ctrl: true } },
      { kind: 'key', key: 'q', modifiers: { ctrl: true } }
    ],
    message: { kind: 'exit' }
  }],
  nonTty: { mode: 'last_frame' }
});

function updateWorkspace(
  state: WorkspaceState,
  message: WorkspaceMessage,
  context: TuiContext
): TuiUpdateResult<WorkspaceState, WorkspaceMessage> {
  switch (message.kind) {
    case 'control': return workspaceControls.update(state, message);
    case 'tree': {
      const nextTree = treeReducer(state.tree, message.transition, {
        source: navigationTreeSource,
        view: createTreeView(navigationTreeSource, state.tree),
      });
      const queue = queueFromSelection(selectedTreeId(nextTree));
      const rows = ticketsForQueue(queue);
      const currentRowId = selectedTableRowId(state.table);
      const selectedRowId = currentRowId !== undefined
        && rows.some((ticket) => ticket.id === currentRowId)
        ? currentRowId
        : rows[0]?.id ?? firstTicket().id;
      return updateResult({
        ...state,
        tree: nextTree,
        table: {
          ...state.table,
          interaction: {
            kind: 'row',
            activeRowId: selectedRowId,
            selection: { mode: 'single', selectedRowId, selectionFollowsActive: true },
          },
        }
      });
    }
    case 'submit':
      return message.value.trim() === '/palette' ? updatePicker(state, { kind: 'open' }, context) : updateResult(applyCommand(state, message.value));
    case 'openSearchPicker': return updatePicker(state, { kind: 'open' }, context);
    case 'closeSearchPicker': return updatePicker(state, { kind: 'close' }, context);
    case 'picker': {
      const { outputs, ...updated } = liftTuiResult(state, 'searchPicker', picker.update(state.searchPicker, message.message, context));
      const accepted = outputs?.[0];
      return accepted === undefined ? updated : { ...updated, state: applyCommand(updated.state, accepted) };
    }
    case 'resolve': return updateResult(resolveSelected(state));
    case 'exit':
      return { state, exit: { reason: 'user requested exit' } };
  }
}

function updatePicker(state: WorkspaceState, message: PickerMessage<string>, context: TuiContext): TuiUpdateResult<WorkspaceState, WorkspaceMessage> {
  return liftTuiResult(state, 'searchPicker', picker.update(state.searchPicker, { ...state.searchPicker, message }, context));
}

function resolveSelected(state: WorkspaceState): WorkspaceState {
  const ticket = selectedTicket(state);
  if (state.resolved.has(ticket.id)) return state;
  return { ...state, resolved: new Set([...state.resolved, ticket.id]), activity: [...state.activity, `Resolved ${ticket.id}.`] };
}

function applyCommand(state: WorkspaceState, raw: string): WorkspaceState {
  const command = raw.trim();
  const cleared = {
    ...state,
    command: withCommandSuggestions(
      commandInputReducer(state.command, { kind: 'recordSubmission', value: command }),
    )
  };
  switch (command) {
    case '/issues': return { ...cleared, tab: 'issues' };
    case '/activity': return { ...cleared, tab: 'activity' };
    case '/notes': return { ...cleared, tab: 'notes' };
    case '/resolve': return resolveSelected(cleared);
    default: {
      const ticket = ticketById.get(command);
      if (ticket === undefined) return cleared;
      return {
        ...cleared, tab: 'issues',
        tree: { ...state.tree, activeId: `queue:${ticket.queue}`, selection: { mode: 'single', selectedId: `queue:${ticket.queue}`, selectionFollowsActive: true } },
        table: dataGridReducer(state.table, { kind: 'setActiveRow', rowId: ticket.id }, {
          collection: incidentCollection(ticketsForQueue(ticket.queue)),
          columnIds: tableColumns.map(column => column.id),
          // A search jump anchors the selected row visibly without guessing allocated height.
          pageSize: 1,
        }),
        activity: [...state.activity, `Inspected ${ticket.id}.`],
      };
    }
  }
}

function workspaceView(state: WorkspaceState, context: TuiContext) {
  if (context.terminalSize.columns < 72 || context.terminalSize.rows < 18) {
    return workspaceMinimumSizeNotice();
  }
  const body = splitPane([
    navigationPane(state),
    mainPane(state),
    inspectorPane(state)
  ], {
    id: 'workspace-panes',
    direction: 'horizontal',
    sizes: [
      { kind: 'fixed', cells: 24 },
      { kind: 'fill' },
      { kind: 'fixed', cells: 30 }
    ],
    gap: 1
  });
  const base = column([
    surface(text({ content: 'Incident Workbench', textRole: 'title' }), {
      id: 'workspace-header',
      appearance: 'bar',
      padding: { left: 1, right: 1 }
    }),
    body,
    commandPane(state),
    workspaceStatus(state)
  ], {
    id: 'workspace-grid',
    sizes: [
      { kind: 'fixed', cells: 1 },
      { kind: 'fill' },
      { kind: 'fixed', cells: 3 },
      { kind: 'fixed', cells: 1 }
    ]
  });
  return overlay([base, ...(state.searchPicker.state.open ? [searchPickerLayer(state, context)] : [])], { id: 'workspace-root' });
}

function workspaceMinimumSizeNotice() {
  return surface(column([
    text({ id: 'workspace-size-title', content: 'Incident Workbench', textRole: 'title' }),
    text({ id: 'workspace-size-message', content: 'This example requires at least 72 columns and 18 rows.' }),
  ], { id: 'workspace-size-content', gap: 1 }), {
    id: 'workspace-root',
    appearance: 'inset',
    padding: 1,
    meta: { accessibility: { role: 'application', label: 'Workspace size requirement' } },
  });
}

function navigationPane(state: WorkspaceState) {
  return surface(column([
    tree({
      id: 'workspace-tree',
      keymap: navigationKeymap,
      meta: { accessibleName: 'Project navigation' },
      source: navigationTreeSource,
        view: createTreeView(navigationTreeSource, state.tree),
      state: state.tree,
      scrollbar: { visible: 'auto' },
      onTransition: (transition): WorkspaceMessage => ({ kind: 'tree', transition }),
    }),
    helpBar({ id: 'navigation-help', groups: [{ id: 'nav', bindings: controlKeymapHelp(navigationKeymap, ['previous', 'next']) }] })
  ], { sizes: [{ kind: 'fill' }, { kind: 'fixed', cells: 1 }] }), {
    id: 'workspace-navigation',
    appearance: 'inset',
    padding: { left: 1, right: 1 }
  });
}

function mainPane(state: WorkspaceState) {
  return tabs({
    id: 'workspace-tabs',
    meta: { accessibleName: 'Workspace panels' },
    maxTabWidth: 28,
    state: { activeId: state.tab, selectedId: state.tab },
    tabs: [
      { id: 'issues', label: 'Issues', panel: issuesPanel(state) },
      { id: 'activity', label: 'Activity', panel: activityPanel(state) },
      { id: 'notes', label: 'Notes', panel: notesPanel(state) }
    ],
    onTransition: workspaceControls.onTransition('tab')
  });
}

function issuesPanel(state: WorkspaceState) {
  const rows = visibleTickets(state);
  return surface(dataGrid({
    id: 'ticket-table',
    meta: { accessibleName: 'Issues' },
    collection: incidentCollection(rows),
    columns: tableColumns,
    ...workspaceControls.bind('table', state),
    scrollbar: { visible: 'auto' },
    stickyHeader: true,
  }), { id: 'issues-panel', appearance: 'neutral', padding: 1 });
}

function activityPanel(state: WorkspaceState) {
  return surface(column(state.activity.map((entry, index) => text({ content: `${String(index + 1).padStart(2, '0')} ${entry}`, id: `activity-${String(index)}` }))), { id: 'activity-panel', appearance: 'neutral', padding: 1 });
}

function notesPanel(state: WorkspaceState) {
  return surface(textArea({
    id: 'incident-notes',
    meta: { accessibleName: 'Incident response notes' },
    ...workspaceControls.bind('notes', state),
    lineNumbers: true,
    scrollbar: { visible: 'auto' },
  }), { id: 'notes-panel', appearance: 'neutral', padding: 1 });
}

function inspectorPane(state: WorkspaceState) {
  const ticket = selectedTicket(state);
  const resolved = state.resolved.has(ticket.id);
  return surface(column([
    column([
      text({ content: ticket.title, textRole: 'heading' }),
      text({ content: `${ticket.id} · ${resolved ? 'resolved' : ticket.status}`, textRole: 'metadata' }),
      text({ content: `Owner     ${ticket.owner}` }),
      text({ content: `Queue     ${ticket.queue}` }),
      text({ content: `Severity  ${ticket.severity}` })
    ], { id: 'ticket-inspector', gap: 1 }),
    resolved
      ? button({ id: 'resolve-button', label: 'Resolved', tone: 'primary', disabled: true })
      : button({ id: 'resolve-button', label: 'Resolve selected', tone: 'primary', onPress: (): WorkspaceMessage => ({ kind: 'resolve' }) })
  ], { gap: 1 }), {
    id: 'workspace-inspector',
    appearance: 'inset',
    padding: { left: 1, right: 1 }
  });
}

function workspaceStatus(state: WorkspaceState) {
  const ticket = selectedTicket(state);
  return statusBar({
    id: 'workspace-status',
    leading: [{ id: 'selected', kind: 'status', text: ticket.id, status: state.resolved.has(ticket.id) ? 'success' : ticket.status }],
    center: [{ id: 'tab', kind: 'text', text: state.tab }],
    trailing: [{ id: 'count', kind: 'text', text: `${String(visibleTickets(state).length)} visible` }]
  });
}

function commandPane(state: WorkspaceState) {
  const commandView = commandInputView(state.command);
  return surface(commandInput({
    id: 'workspace-command',
    prompt: '› ',
    placeholder: 'Type /command',
    view: commandView,
    display: 'popup',
    placement: 'above',
    maxVisibleSuggestions: 6,
    meta: { accessibleName: 'Command input' },
    onTransition: workspaceControls.onTransition('command'),
    onSubmit: (event): WorkspaceMessage => ({ kind: 'submit', value: event.value })
  }), {
    id: 'workspace-command-surface',
    appearance: 'bar',
    padding: { left: 1, right: 1 }
  });
}

function searchPickerLayer(state: WorkspaceState, context: TuiContext) {
  return dialog({
    slots: {
      content: column([picker.view(state.searchPicker, context), helpBar({ id: 'picker-help', groups: [{ id: 'picker', bindings: controlKeymapHelp(pickerKeymap, ['previous', 'next', 'accept']) }] })], { sizes: [{ kind: 'fill' }, { kind: 'fixed', cells: 1 }] })
    },
    id: 'workspace-search-picker-dialog',
    title: state.searchPicker.state.construction.error?.message ?? state.searchPicker.state.error?.message ?? (state.searchPicker.state.construction.pending ? 'Indexing… you can keep typing' : state.searchPicker.state.pending ? 'Searching… type to replace query' : 'Search 100,000 incidents and commands'),
    modal: true,
    focusPolicy: {
      initialFocus: { kind: 'element', elementId: picker.elementId(state.searchPicker, 'picker') },
      returnFocus: 'restore'
    },
    dismissal: {
      dismissOnEscape: true,
      dismissOnOutsidePress: true
    },
    onDismiss: (): WorkspaceMessage => ({ kind: 'closeSearchPicker' }),
    padding: { left: 1, right: 1 },
    margin: 2,
    maxWidth: 72,
    maxHeight: 18
  });
}

function queueFromSelection(selection: string | undefined): Ticket['queue'] | undefined {
  if (selection === 'queue:triage') return 'triage';
  if (selection === 'queue:review') return 'review';
  if (selection === 'queue:done') return 'done';
  return undefined;
}

function ticketsForQueue(queue: Ticket['queue'] | undefined): readonly Ticket[] {
  return queue === undefined ? tickets : queues[queue];
}

function visibleTickets(state: WorkspaceState): readonly Ticket[] {
  return ticketsForQueue(queueFromSelection(selectedTreeId(state.tree)));
}

function selectedTicket(state: WorkspaceState): Ticket {
  return visibleTickets(state).find((ticket) => ticket.id === selectedTableRowId(state.table))
    ?? visibleTickets(state)[0]
    ?? firstTicket();
}

function selectedTreeId(state: ScrollableTreeState): string | undefined {
  return state.selection.mode === 'single' ? state.selection.selectedId : undefined;
}

function selectedTableRowId(state: ScrollableDataGridState): string | undefined {
  return state.interaction.kind === 'row' && state.interaction.selection.mode === 'single'
    ? state.interaction.selection.selectedRowId
    : undefined;
}

function firstTicket(): Ticket {
  const ticket = tickets[0];
  if (ticket === undefined) throw new Error('The workspace requires at least one ticket');
  return ticket;
}

function withCommandSuggestions(command: CommandInputState): CommandInputState {
  const value = command.editor.input.text;
  const normalized = value.toLocaleLowerCase('en-US');
  const entries = normalized.length === 0
    ? []
    : commandEntries
      .filter((entry) => entry.value.toLocaleLowerCase('en-US').startsWith(normalized))
      .map((entry) => ({
        id: entry.id,
        label: entry.label,
        completion: {
          range: { startOffset: 0, endOffsetExclusive: value.length },
          text: entry.value,
        },
      }));
  return commandInputReducer(command, {
    kind: 'setSuggestions',
    suggestions: entries.length === 0
      ? emptyCommandSuggestions
      : createCommandSuggestions(entries),
  });
}

function transitionChangesCommandText(transition: CommandInputTransition): boolean {
  return transition.kind === 'edit'
    || transition.kind === 'undo'
    || transition.kind === 'redo'
    || transition.kind === 'historyPrevious'
    || transition.kind === 'historyNext'
    || transition.kind === 'setValue';
}

function updateResult(state: WorkspaceState): TuiUpdateResult<WorkspaceState, WorkspaceMessage> {
  return { state };
}

const isMain = process.argv[1] !== undefined
  && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const exit = await runTui(incidentWorkbenchApp);
  if (exit.status !== 'completed') process.exitCode = 1;
}
