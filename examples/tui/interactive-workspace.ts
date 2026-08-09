import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import {
  button,
  column,
  commandInput,
  createTerminalHost,
  defineTui,
  dialog,
  helpBar,
  overlay,
  runTui,
  searchPicker,
  splitPane,
  statusBar,
  surface,
  table,
  tabs,
  text,
  tree
} from '@ismail-elkorchi/terminal-ui';
import { createMemoryTerminalHost } from '@ismail-elkorchi/terminal-ui/host';
import { createTuiRuntime } from '@ismail-elkorchi/terminal-ui/tui';
import type { TuiUpdateResult } from '@ismail-elkorchi/terminal-ui';
import {
  commandInputPresentation,
  commandInputReducer,
  createScrollState,
  searchPickerReducer,
  prepareSearchPickerIndex,
  tableReducer,
  tableScrollablePresentation,
  tabsReducer,
  treeReducer
} from '@ismail-elkorchi/terminal-ui/behavior';
import type {
  CommandInputAction,
  CommandInputState,
  SearchPickerAction,
  SearchPickerState,
  ScrollableTableState,
  ScrollableTreeState,
  TabAction,
  TableAction,
  TreeInteractionAction
} from '@ismail-elkorchi/terminal-ui/behavior';
import { renderFramePlain } from '@ismail-elkorchi/terminal-ui/renderer';
import type { SearchEntry, TableColumn, TreeNode } from '@ismail-elkorchi/terminal-ui';
import type { InputEvent, KeyEvent, MousePointerEvent } from '@ismail-elkorchi/terminal-ui/input';

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
  readonly tree: ScrollableTreeState<NavigationMetadata>;
  readonly table: ScrollableTableState;
  readonly command: CommandInputState;
  readonly searchPicker: SearchPickerState & { readonly open: boolean; readonly used: boolean };
  readonly resolved: ReadonlySet<string>;
  readonly activity: readonly string[];
  readonly pointer: {
    readonly tree: boolean;
    readonly table: boolean;
    readonly searchPicker: boolean;
  };
}

type WorkspaceMessage =
  | { readonly kind: 'tree'; readonly action: TreeInteractionAction }
  | { readonly kind: 'table'; readonly action: TableAction }
  | { readonly kind: 'tabs'; readonly action: TabAction }
  | { readonly kind: 'command'; readonly action: CommandInputAction }
  | { readonly kind: 'submit'; readonly value: string }
  | { readonly kind: 'openSearchPicker' }
  | { readonly kind: 'closeSearchPicker' }
  | { readonly kind: 'searchPicker'; readonly action: SearchPickerAction }
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

const suggestions = searchPickerEntries.map((entry) => ({ label: entry.label, value: entry.value }));

function navigationNodes(): readonly TreeNode<NavigationMetadata>[] {
  return [{
    id: 'workspace',
    label: 'Workspace',
    kind: 'branch',
    expanded: true,
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
      nodes: navigationNodes(),
      selected: 'queue:triage',
      scroll: createScrollState({ contentRows: 4, viewportRows: 12 })
    },
    table: {
      selectedRowId: 'T-101',
      scroll: createScrollState({ contentRows: tickets.length, viewportRows: 12 })
    },
    command: {
      input: { text: '', cursor: 0 },
      history: [],
      suggestions
    },
    searchPicker: { open: false, used: false, query: '', selectedId: 'issues' },
    resolved: new Set<string>(),
    activity: ['Workspace started.', 'Loaded six controlled ticket records.'],
    pointer: { tree: false, table: false, searchPicker: false }
  };
}

export const interactiveWorkspaceApp = defineTui<WorkspaceState, WorkspaceMessage>({
  id: 'interactive-workspace',
  init: initialState,
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
      const nextTree = treeReducer(state.tree, message.action);
      const queue = queueFromSelection(nextTree.selected);
      const rows = ticketsForQueue(queue);
      const selectedRowId = state.table.selectedRowId !== undefined
        && rows.some((ticket) => ticket.id === state.table.selectedRowId)
        ? state.table.selectedRowId
        : rows[0]?.id ?? firstTicket().id;
      return updateResult({
        ...state,
        tree: nextTree,
        table: {
          ...state.table,
          selectedRowId
        },
        pointer: { ...state.pointer, tree: message.action.kind === 'select' || state.pointer.tree }
      });
    }
    case 'table':
      return updateResult({
        ...state,
        table: tableReducer(state.table, message.action, {
          rows: visibleTickets(state),
          getRowId: (ticket) => ticket.id,
          columnCount: tableColumns.length
        }),
        pointer: { ...state.pointer, table: message.action.kind === 'selectRow' || state.pointer.table }
      });
    case 'tabs': {
      const selected = tabsReducer(
        { selected: state.tab },
        message.action,
        [{ id: 'issues' }, { id: 'activity' }, { id: 'notes' }]
      ).selected as WorkspaceTab | undefined;
      return updateResult(selected === undefined ? state : { ...state, tab: selected });
    }
    case 'command':
      return updateResult({ ...state, command: commandInputReducer(state.command, message.action) });
    case 'submit':
      return updateResult(applyCommand(state, message.value));
    case 'openSearchPicker':
      return updateResult({ ...state, searchPicker: { ...state.searchPicker, open: true } });
    case 'closeSearchPicker':
      return updateResult({ ...state, searchPicker: { ...state.searchPicker, open: false, query: '' } });
    case 'searchPicker':
      if (message.action.kind === 'activate') {
        return updateResult(applyCommand({
          ...state,
          searchPicker: { ...state.searchPicker, open: false, used: true }
        }, message.action.entry.value));
      }
      return updateResult({
        ...state,
        searchPicker: { ...state.searchPicker, ...searchPickerReducer(state.searchPicker, message.action, { searchPickerIndex: workspaceSearchPickerIndex }) }
      });
    case 'resolve': {
      const ticket = selectedTicket(state);
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
    command: {
      ...state.command,
      input: { text: '', cursor: 0 },
      history: command.length === 0 ? state.command.history : [...state.command.history, command]
    }
  };
  switch (command) {
    case '/palette': return { ...cleared, searchPicker: { ...state.searchPicker, open: true } };
    case '/issues': return { ...cleared, tab: 'issues' };
    case '/activity': return { ...cleared, tab: 'activity' };
    case '/notes': return { ...cleared, tab: 'notes' };
    case '/resolve': return updateWorkspace(cleared, { kind: 'resolve' }).state;
    default: return cleared;
  }
}

function workspaceView(state: WorkspaceState) {
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

function navigationPane(state: WorkspaceState) {
  return surface(column([
    tree({
      id: 'workspace-tree',
      ...state.tree,
      scrollbar: { visible: 'auto' },
      onAction: (action): WorkspaceMessage => ({ kind: 'tree', action })
    }),
    helpBar({ id: 'navigation-help', groups: [{ id: 'nav', bindings: [{ key: 'click', label: 'select queue' }] }] })
  ], { sizes: [{ kind: 'fill' }, { kind: 'fixed', cells: 1 }] }), {
    id: 'workspace-navigation',
    appearance: 'inset',
    padding: { left: 1, right: 1 }
  });
}

function mainPane(state: WorkspaceState) {
  return tabs({
    id: 'workspace-tabs',
    maxTabWidth: 28,
    selected: state.tab,
    tabs: [
      { id: 'issues', label: 'Issues', panel: issuesPanel(state) },
      { id: 'activity', label: 'Activity', panel: activityPanel(state) },
      { id: 'notes', label: 'Notes', panel: notesPanel() }
    ],
    onAction: (action): WorkspaceMessage => ({ kind: 'tabs', action })
  });
}

function issuesPanel(state: WorkspaceState) {
  const rows = visibleTickets(state);
  return surface(table({
    id: 'ticket-table',
    rows,
    getRowId: (ticket) => ticket.id,
    columns: tableColumns,
    presentation: tableScrollablePresentation(state.table),
    scrollbar: { visible: 'auto' },
    stickyHeader: true,
    onAction: (action): WorkspaceMessage => ({ kind: 'table', action })
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
  return surface(column([
    column([
      text({ content: ticket.title, textRole: 'heading' }),
      text({ content: `${ticket.id} · ${state.resolved.has(ticket.id) ? 'resolved' : ticket.status}`, textRole: 'metadata' }),
      text({ content: `Owner     ${ticket.owner}` }),
      text({ content: `Queue     ${ticket.queue}` }),
      text({ content: `Severity  ${ticket.severity}` })
    ], { id: 'ticket-inspector', gap: 1 }),
    button({ id: 'resolve-button', label: 'Resolve selected', tone: 'primary', onAction: (): WorkspaceMessage => ({ kind: 'resolve' }) })
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
  const showSuggestions = state.command.input.text.length > 0;
  return surface(commandInput({
    id: 'workspace-command',
    prompt: '› ',
    placeholder: 'Type /command',
    presentation: { ...presentation, suggestions: showSuggestions ? presentation.suggestions : [] },
    display: 'popup',
    placement: 'above',
    maxVisibleSuggestions: 6,
    onAction: (action): WorkspaceMessage => action.kind === 'submit'
      ? { kind: 'submit', value: action.value }
      : { kind: 'command', action }
  }), {
    id: 'workspace-command-surface',
    appearance: 'bar',
    padding: { left: 1, right: 1 }
  });
}

function searchPickerLayer(state: WorkspaceState) {
  return dialog({
    slots: {
      content: searchPicker({
        id: 'workspace-search-picker',
        searchPickerIndex: workspaceSearchPickerIndex,
        query: state.searchPicker.query,
        ...(state.searchPicker.selectedId === undefined
          ? {}
          : { selectedId: state.searchPicker.selectedId }),
        onAction: (action): WorkspaceMessage => ({ kind: 'searchPicker', action })
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
      escape: true,
      outsidePress: true
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
  return ticketsForQueue(queueFromSelection(state.tree.selected));
}

function selectedTicket(state: WorkspaceState): Ticket {
  return visibleTickets(state).find((ticket) => ticket.id === state.table.selectedRowId)
    ?? visibleTickets(state)[0]
    ?? firstTicket();
}

function firstTicket(): Ticket {
  const ticket = tickets[0];
  if (ticket === undefined) throw new Error('The workspace requires at least one ticket');
  return ticket;
}

function updateResult(state: WorkspaceState): TuiUpdateResult<WorkspaceState, WorkspaceMessage> {
  return { state };
}

export async function runScriptedWorkspace() {
  const host = createMemoryTerminalHost({ terminalSize: { columns: 112, rows: 32 } });
  const runtime = createTuiRuntime({ app: interactiveWorkspaceApp, host });
  try {
    await runtime.start();
    await runtime.dispatch({ kind: 'openSearchPicker' });
    await runtime.handleInput({ kind: 'text', text: 'resolve', paste: false });
    const keyboardSearchPickerQuery = runtime.state().searchPicker.query;
    await runtime.handleInput(keyEvent('enter'));
    await click(runtime, targetById(runtime, 'workspace-tree:queue:review:body'));
    await click(runtime, targetByPrefix(runtime, 'ticket-table:row:T-103'));
    await click(runtime, targetById(runtime, 'workspace-tabs:tab:activity'));
    const tabSelectedByPointer = runtime.state().tab === 'activity';
    await runtime.handleInput(keyEvent('arrowLeft'));
    const tabSelectedByKeyboard = runtime.state().tab === 'issues';
    await runtime.resize({ columns: 88, rows: 24 });
    const focusValidAfterResize = (runtime.frame()?.focusPath?.length ?? 0) > 0;
    await runtime.resize({ columns: 112, rows: 32 });
    const frame = runtime.frame();
    if (frame === undefined) throw new Error('The scripted workspace did not render.');
    const state = runtime.state();
    return {
      status: 'ok',
      frames: host.frames().length,
      selectedNode: state.tree.selected,
      selectedTicket: selectedTicket(state).id,
      activeTab: state.tab,
      searchPickerUsed: state.searchPicker.used,
      pointerTree: state.pointer.tree,
      pointerTable: state.pointer.table,
      pointerSearchPicker: state.pointer.searchPicker,
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
  await runtime.handleInput(mouseEvent('press', target.bounds.row, target.bounds.column, 'left'));
  await runtime.handleInput(mouseEvent('release', target.bounds.row, target.bounds.column, 'none'));
}

function keyEvent(key: KeyEvent['key']): KeyEvent {
  return {
    kind: 'key',
    key,
    sequence: '',
    modifiers: { shift: false, alt: false, ctrl: false, meta: false },
    eventType: 'press',
    location: 'standard'
  };
}

function mouseEvent(
  action: 'press' | 'release',
  row: number,
  column: number,
  button: MousePointerEvent['button']
): InputEvent {
  return {
    kind: 'mouse',
    sequence: '',
    encoding: 'sgr',
    action,
    button,
    row,
    column,
    rawCode: 0,
    modifiers: { shift: false, alt: false, ctrl: false }
  };
}

const isMain = process.argv[1] !== undefined
  && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  if (process.stdin.isTTY && process.stdout.isTTY && !process.argv.includes('--scripted')) {
    const host = createTerminalHost({ runtime: 'node' });
    try {
      const exit = await runTui(interactiveWorkspaceApp, host, {
        initialFocus: { kind: 'path', path: ['workspace-root', 'workspace-grid', 'workspace-command-surface', 'workspace-command'] }
      });
      if (exit.status !== 'completed') process.exitCode = 1;
    } finally {
      await host.dispose();
    }
  } else {
    console.log(JSON.stringify(await runScriptedWorkspace()));
  }
}
