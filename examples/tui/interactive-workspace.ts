import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import {
  button,
  column,
  commandInput,
  defineTui,
  dialog,
  dataGrid,
  helpBar,
  overlay,
  prepareCommandSuggestions,
  runTui,
  searchPicker,
  splitPane,
  statusBar,
  surface,
  tabs,
  text,
  tree
} from '@ismail-elkorchi/terminal-ui';
import { createMemoryTerminalHost } from '@ismail-elkorchi/terminal-ui/host';
import { createTuiRuntime } from '@ismail-elkorchi/terminal-ui/tui';
import type { TuiContext, TuiUpdateResult } from '@ismail-elkorchi/terminal-ui';
import {
  commandInputPresentation,
  commandInputReducer,
  createCommandInputState,
  createSearchPickerState,
  createScrollState,
  dataGridReducer,
  prepareTableCollection,
  searchPickerReducer,
  searchPickerPresentation,
  prepareSearchPickerIndex,
  tabsReducer,
  prepareTreeSource,
  prepareTreeView,
  treeReducer
} from '@ismail-elkorchi/terminal-ui/behavior';
import type { CommandInputState, UnscrolledSearchPickerState } from '@ismail-elkorchi/terminal-ui/behavior';
import { renderFramePlain } from '@ismail-elkorchi/terminal-ui/renderer';
import type {
  CommandInputTransition,
  ScrollableDataGridPresentation,
  DataGridTransition,
  SearchEntry,
  SearchPickerControlTransition,
  TableColumn,
  TabsTransition,
  TreeNode,
  ScrollableTreePresentation,
  TreeTransition,
} from '@ismail-elkorchi/terminal-ui';
import { keyInput, pointerInput } from '@ismail-elkorchi/terminal-ui/testing';

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

interface WorkspaceState {
  readonly tab: WorkspaceTab;
  readonly tree: ScrollableTreePresentation;
  readonly table: ScrollableDataGridPresentation;
  readonly command: CommandInputState;
  readonly searchPicker: {
    readonly open: boolean;
    readonly state: UnscrolledSearchPickerState;
  };
  readonly resolved: ReadonlySet<string>;
  readonly activity: readonly string[];
}

type WorkspaceMessage =
  | { readonly kind: 'tree'; readonly action: TreeTransition }
  | { readonly kind: 'table'; readonly action: DataGridTransition }
  | { readonly kind: 'tabs'; readonly action: TabsTransition<WorkspaceTab> }
  | { readonly kind: 'command'; readonly action: CommandInputTransition }
  | { readonly kind: 'submit'; readonly value: string }
  | { readonly kind: 'openSearchPicker' }
  | { readonly kind: 'closeSearchPicker' }
  | { readonly kind: 'searchPicker'; readonly action: SearchPickerControlTransition }
  | { readonly kind: 'acceptSearchPicker'; readonly id: string }
  | { readonly kind: 'resolve' }
  | { readonly kind: 'exit' };

const tickets: readonly Ticket[] = Object.freeze([
  { id: 'T-101', queue: 'triage', title: 'Resize flicker in split pane', owner: 'Mina', severity: 'high', status: 'running' },
  { id: 'T-102', queue: 'triage', title: 'SearchPicker query loses context', owner: 'Noor', severity: 'medium', status: 'pending' },
  { id: 'T-103', queue: 'review', title: 'Table row hover affordance', owner: 'Ilyas', severity: 'medium', status: 'pending' },
  { id: 'T-104', queue: 'done', title: 'Surface disabled contrast', owner: 'Sara', severity: 'low', status: 'success' },
  { id: 'T-105', queue: 'triage', title: 'Mouse wheel over viewport', owner: 'Lina', severity: 'medium', status: 'pending' },
  { id: 'T-106', queue: 'review', title: 'Command history polish', owner: 'Amin', severity: 'low', status: 'pending' }
]);

const tableColumns: readonly TableColumn<Ticket>[] = [
  { id: 'id', header: 'ID', value: (ticket) => ticket.id, width: { kind: 'fixed', cells: 8 } },
  { id: 'title', header: 'Title', value: (ticket) => ticket.title, width: { kind: 'fill' } },
  { id: 'owner', header: 'Owner', value: (ticket) => ticket.owner, width: { kind: 'fixed', cells: 10 } },
  { id: 'severity', header: 'Severity', value: (ticket) => ticket.severity, width: { kind: 'fixed', cells: 10 } },
  { id: 'status', header: 'Status', value: (ticket) => ticket.status, width: { kind: 'fixed', cells: 10 } }
];

const searchPickerEntries: readonly SearchEntry[] = [
  { id: 'issues', label: 'Open issues', value: '/issues', group: 'Navigation' },
  { id: 'activity', label: 'Open activity', value: '/activity', group: 'Navigation' },
  { id: 'resolve', label: 'Resolve selected ticket', value: '/resolve', group: 'Actions' },
  { id: 'notes', label: 'Open notes', value: '/notes', group: 'Navigation' }
];
const workspaceSearchPickerIndex = prepareSearchPickerIndex(searchPickerEntries);
const navigationTreeSource = prepareTreeSource(navigationNodes());

const emptyCommandSuggestions = prepareCommandSuggestions([]);

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

function initialState(): WorkspaceState {
  return {
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
        activeRowId: 'T-101',
        selection: { mode: 'single', selectedRowId: 'T-101', selectionFollowsActive: true },
      },
      scroll: createScrollState()
    },
    command: createCommandInputState({ suggestions: emptyCommandSuggestions }),
    searchPicker: {
      open: false,
      state: createSearchPickerState({ query: { text: '', mode: 'fuzzy' } }, workspaceSearchPickerIndex),
    },
    resolved: new Set<string>(),
    activity: ['Workspace started.', 'Loaded six controlled ticket records.']
  };
}

export const interactiveWorkspaceApp = defineTui<WorkspaceState, WorkspaceMessage>({
  id: 'interactive-workspace',
  init: () => ({
    state: initialState(),
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
  message: WorkspaceMessage
): TuiUpdateResult<WorkspaceState, WorkspaceMessage> {
  switch (message.kind) {
    case 'tree': {
      const nextTree = treeReducer(state.tree, message.action, {
        view: prepareTreeView(navigationTreeSource, state.tree),
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
    case 'table':
      return updateResult({
        ...state,
        table: dataGridReducer(state.table, message.action, {
          collection: prepareTableCollection(visibleTickets(state), (ticket) => ticket.id),
          columnIds: tableColumns.map((column) => column.id),
          pageSize: 12,
        })
      });
    case 'tabs': {
      const selected = tabsReducer(
        { activeId: state.tab, selectedId: state.tab },
        message.action,
        { tabs: [{ id: 'issues' }, { id: 'activity' }, { id: 'notes' }], activation: 'automatic' },
      ).selectedId;
      return updateResult(selected === undefined ? state : { ...state, tab: selected });
    }
    case 'command': {
      const command = commandInputReducer(state.command, message.action);
      return updateResult({
        ...state,
        command: transitionChangesCommandText(message.action)
          ? withCommandSuggestions(command)
          : command,
      });
    }
    case 'submit':
      return updateResult(applyCommand(state, message.value));
    case 'openSearchPicker':
      return updateResult({
        ...state,
        searchPicker: {
          ...state.searchPicker,
          open: true,
        },
      });
    case 'closeSearchPicker':
      return updateResult({
        ...state,
        searchPicker: {
          open: false,
          state: createSearchPickerState({ query: { text: '', mode: 'fuzzy' } }, workspaceSearchPickerIndex),
        },
      });
    case 'searchPicker':
      return updateResult({
        ...state,
        searchPicker: {
          ...state.searchPicker,
          state: searchPickerReducer(state.searchPicker.state, message.action, {
            searchPickerIndex: workspaceSearchPickerIndex,
          }),
        }
      });
    case 'acceptSearchPicker': {
      const entry = searchPickerEntries.find((candidate) => candidate.id === message.id);
      return updateResult(entry === undefined ? state : applyCommand({
        ...state,
        searchPicker: {
          ...state.searchPicker,
          open: false,
        },
      }, entry.value));
    }
    case 'resolve': {
      const ticket = selectedTicket(state);
      if (state.resolved.has(ticket.id)) return updateResult(state);
      const resolved = new Set(state.resolved);
      resolved.add(ticket.id);
      return updateResult({
        ...state,
        resolved,
        activity: [...state.activity, `Resolved ${ticket.id}.`]
      });
    }
    case 'exit':
      return { state, exit: { reason: 'user requested exit' } };
  }
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
    case '/palette': return {
      ...cleared,
      searchPicker: {
        ...state.searchPicker,
        open: true,
      },
    };
    case '/issues': return { ...cleared, tab: 'issues' };
    case '/activity': return { ...cleared, tab: 'activity' };
    case '/notes': return { ...cleared, tab: 'notes' };
    case '/resolve': return updateWorkspace(cleared, { kind: 'resolve' }).state;
    default: return cleared;
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
    surface(text({ content: 'Interactive Workspace', textRole: 'title' }), {
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
  return overlay([base, ...(state.searchPicker.open ? [searchPickerLayer(state)] : [])], { id: 'workspace-root' });
}

function workspaceMinimumSizeNotice() {
  return surface(column([
    text({ id: 'workspace-size-title', content: 'Interactive Workspace', textRole: 'title' }),
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
      meta: { accessibleName: 'Project navigation' },
      view: prepareTreeView(navigationTreeSource, state.tree),
      presentation: state.tree,
      scrollbar: { visible: 'auto' },
      onTransition: (action): WorkspaceMessage => ({ kind: 'tree', action }),
    }),
    helpBar({ id: 'navigation-help', groups: [{ id: 'nav', bindings: [
      { binding: { kind: 'key', key: 'arrowUp' }, label: 'previous queue' },
      { binding: { kind: 'key', key: 'arrowDown' }, label: 'next queue' },
    ] }] })
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
    presentation: { activeId: state.tab, selectedId: state.tab },
    tabs: [
      { id: 'issues', label: 'Issues', panel: issuesPanel(state) },
      { id: 'activity', label: 'Activity', panel: activityPanel(state) },
      { id: 'notes', label: 'Notes', panel: notesPanel() }
    ],
    onTransition: (action): WorkspaceMessage => ({ kind: 'tabs', action })
  });
}

function issuesPanel(state: WorkspaceState) {
  const rows = visibleTickets(state);
  return surface(dataGrid({
    id: 'ticket-table',
    meta: { accessibleName: 'Issues' },
    rows,
    getRowId: (ticket) => ticket.id,
    columns: tableColumns,
    presentation: state.table,
    scrollbar: { visible: 'auto' },
    stickyHeader: true,
    onTransition: (action): WorkspaceMessage => ({ kind: 'table', action })
  }), { id: 'issues-panel', appearance: 'neutral', padding: 1 });
}

function activityPanel(state: WorkspaceState) {
  return surface(column(state.activity.map((entry, index) => text({ content: `${String(index + 1).padStart(2, '0')} ${entry}`, id: `activity-${String(index)}` }))), { id: 'activity-panel', appearance: 'neutral', padding: 1 });
}

function notesPanel() {
  return surface(column([
    text({ content: 'This hand-written app composes controlled generic components.' }),
    text({ content: 'Commands: /palette, /issues, /activity, /notes, /resolve.' })
  ], { gap: 1 }), { id: 'notes-panel', appearance: 'neutral', padding: 1 });
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
      : button({ id: 'resolve-button', label: 'Resolve selected', tone: 'primary', onAction: (): WorkspaceMessage => ({ kind: 'resolve' }) })
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
  const presentation = commandInputPresentation(state.command);
  return surface(commandInput({
    id: 'workspace-command',
    prompt: '› ',
    placeholder: 'Type /command',
    presentation,
    display: 'popup',
    placement: 'above',
    maxVisibleSuggestions: 6,
    meta: { accessibleName: 'Command input' },
    onTransition: (action): WorkspaceMessage => ({ kind: 'command', action }),
    onSubmit: (event): WorkspaceMessage => ({ kind: 'submit', value: event.value })
  }), {
    id: 'workspace-command-surface',
    appearance: 'bar',
    padding: { left: 1, right: 1 }
  });
}

function searchPickerLayer(state: WorkspaceState) {
  return dialog({
    slots: {
      content: searchPicker<string, WorkspaceMessage, WorkspaceMessage>({
        id: 'workspace-search-picker',
        searchPickerIndex: workspaceSearchPickerIndex,
        presentation: searchPickerPresentation(state.searchPicker.state),
        meta: { accessibleName: 'Command search' },
        onTransition: (action): WorkspaceMessage => ({ kind: 'searchPicker', action }),
        onAccept: (event): WorkspaceMessage => ({ kind: 'acceptSearchPicker', id: event.id }),
      })
    },
    id: 'workspace-search-picker-dialog',
    title: 'Commands',
    modal: true,
    focusPolicy: {
      initialFocus: { kind: 'element', elementId: 'workspace-search-picker' },
      returnFocus: 'restore'
    },
    dismissal: {
      dismissOnEscape: true,
      dismissOnOutsidePress: true
    },
    onAction: (): WorkspaceMessage => ({ kind: 'closeSearchPicker' }),
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
  return queue === undefined ? tickets : tickets.filter((ticket) => ticket.queue === queue);
}

function visibleTickets(state: WorkspaceState): readonly Ticket[] {
  return ticketsForQueue(queueFromSelection(selectedTreeId(state.tree)));
}

function selectedTicket(state: WorkspaceState): Ticket {
  return visibleTickets(state).find((ticket) => ticket.id === selectedTableRowId(state.table))
    ?? visibleTickets(state)[0]
    ?? firstTicket();
}

function selectedTreeId(state: ScrollableTreePresentation): string | undefined {
  return state.selection.mode === 'single' ? state.selection.selectedId : undefined;
}

function selectedTableRowId(state: ScrollableDataGridPresentation): string | undefined {
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
    : searchPickerEntries
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
      : prepareCommandSuggestions(entries),
  });
}

function transitionChangesCommandText(action: CommandInputTransition): boolean {
  return action.kind === 'edit'
    || action.kind === 'undo'
    || action.kind === 'redo'
    || action.kind === 'historyPrevious'
    || action.kind === 'historyNext'
    || action.kind === 'setValue';
}

function updateResult(state: WorkspaceState): TuiUpdateResult<WorkspaceState, WorkspaceMessage> {
  return { state };
}

export async function runScriptedWorkspace() {
  const host = createMemoryTerminalHost({ terminalSize: { columns: 112, rows: 32 } });
  const runtime = createTuiRuntime({ app: interactiveWorkspaceApp, host });
  try {
    await runtime.start();
    const pickerInitiallyClosed = !runtime.state().searchPicker.open;
    await runtime.dispatch({ kind: 'openSearchPicker' });
    await runtime.handleInput(keyInput('escape'));
    const pickerClosedByDismissal = !runtime.state().searchPicker.open;
    await runtime.dispatch({ kind: 'openSearchPicker' });
    await runtime.handleInput({ kind: 'text', text: 'resolve', paste: false });
    const keyboardSearchPickerQuery = searchPickerPresentation(runtime.state().searchPicker.state).query.text;
    await runtime.handleInput(keyInput('enter'));
    await click(runtime, targetById(runtime, 'workspace-tree:queue:review:body'));
    await click(runtime, targetByPrefix(runtime, 'ticket-table:row:T-103'));
    await click(runtime, targetById(runtime, 'workspace-tabs:tab:activity'));
    const tabSelectedByPointer = runtime.state().tab === 'activity';
    await runtime.handleInput(keyInput('arrowLeft'));
    const tabSelectedByKeyboard = runtime.state().tab === 'issues';
    await runtime.resize({ columns: 88, rows: 24 });
    const focusValidAfterResize = (runtime.frame()?.focusPath?.length ?? 0) > 0;
    await runtime.resize({ columns: 112, rows: 32 });
    const frame = runtime.frame();
    if (frame === undefined) throw new Error('The scripted workspace did not render.');
    const state = runtime.state();
    return {
      status: 'completed',
      frames: host.frames().length,
      selectedNode: selectedTreeId(state.tree),
      selectedTicket: selectedTicket(state).id,
      activeTab: state.tab,
      pickerInitiallyClosed,
      pickerClosedByDismissal,
      paletteCommandApplied: state.resolved.has('T-101'),
      tabSelectedByPointer,
      tabSelectedByKeyboard,
      keyboardSearchPickerQuery,
      tableHitTargets: frame.hitTargets?.filter((target) => target.id.startsWith('ticket-table')).length ?? 0,
      focusValidAfterResize,
      statusVisible: renderFramePlain(frame).includes(selectedTicket(state).id),
      visible: renderFramePlain(frame).includes('Interactive Workspace')
    };
  } finally {
    await runtime.dispose();
  }
}

function targetById(runtime: ReturnType<typeof createTuiRuntime<WorkspaceState, WorkspaceMessage>>, id: string) {
  const target = runtime.frame()?.hitTargets?.find((item) => item.id === id);
  if (target === undefined) throw new Error(`Missing hit target ${id}`);
  return target;
}

function targetByPrefix(runtime: ReturnType<typeof createTuiRuntime<WorkspaceState, WorkspaceMessage>>, prefix: string) {
  const target = runtime.frame()?.hitTargets?.find((item) => item.id.startsWith(prefix));
  if (target === undefined) throw new Error(`Missing hit target ${prefix}`);
  return target;
}

async function click(
  runtime: ReturnType<typeof createTuiRuntime<WorkspaceState, WorkspaceMessage>>,
  target: ReturnType<typeof targetById>
): Promise<void> {
  await runtime.handleInput(pointerInput({
    action: 'press', row: target.bounds.row, column: target.bounds.column, button: 'left',
  }));
  await runtime.handleInput(pointerInput({
    action: 'release', row: target.bounds.row, column: target.bounds.column, button: 'none',
  }));
}

const isMain = process.argv[1] !== undefined
  && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  if (process.stdin.isTTY && process.stdout.isTTY && !process.argv.includes('--scripted')) {
    const exit = await runTui(interactiveWorkspaceApp);
    if (exit.status !== 'completed') process.exitCode = 1;
  } else {
    console.log(JSON.stringify(await runScriptedWorkspace()));
  }
}
