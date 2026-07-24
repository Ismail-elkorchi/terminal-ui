import process from 'node:process';

import { createMemoryTerminalHost, createTerminalHost } from '@ismail-elkorchi/terminal-ui/host';
import { createTuiRuntime, defineTui, runTui } from '@ismail-elkorchi/terminal-ui/tui';
import type { TuiUpdateResult } from '@ismail-elkorchi/terminal-ui/tui';
import {
  commandInputPresentation,
  commandInputReducer,
  createScrollState,
  palettePresentation,
  paletteReducer,
  preparePaletteIndex,
  selectedPaletteEntry,
  tableReducer,
  tableScrollablePresentation,
  tabsReducer,
  treeReducer,
  treeScrollablePresentation
} from '@ismail-elkorchi/terminal-ui/behavior';
import type {
  CommandInputAction,
  CommandInputState,
  PaletteAction,
  PaletteState,
  ScrollableTableState,
  ScrollableTreeState,
  TabAction,
  TableAction,
  TreeInteractionAction
} from '@ismail-elkorchi/terminal-ui/behavior';
import { renderFramePlain } from '@ismail-elkorchi/terminal-ui/renderer';
import { column, grid, overlay, surface } from '@ismail-elkorchi/terminal-ui/layout';
import {
  button,
  commandInput,
  helpBar,
  palette,
  statusBar,
  structuredBlock,
  table,
  tabs,
  text,
  tree
} from '@ismail-elkorchi/terminal-ui/components';
import type { SearchEntry, TableColumn, TreeNode } from '@ismail-elkorchi/terminal-ui/components';
import type { InputEvent, KeyEvent, MouseEvent } from '@ismail-elkorchi/terminal-ui/input';

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
  readonly palette: PaletteState & { readonly open: boolean; readonly used: boolean };
  readonly resolved: ReadonlySet<string>;
  readonly activity: readonly string[];
  readonly pointer: {
    readonly tree: boolean;
    readonly table: boolean;
    readonly palette: boolean;
  };
}

type WorkspaceMessage =
  | { readonly kind: 'tree'; readonly action: TreeInteractionAction }
  | { readonly kind: 'table'; readonly action: TableAction }
  | { readonly kind: 'tabs'; readonly action: TabAction }
  | { readonly kind: 'command'; readonly action: CommandInputAction }
  | { readonly kind: 'submit'; readonly value: string }
  | { readonly kind: 'openPalette' }
  | { readonly kind: 'closePalette' }
  | { readonly kind: 'palette'; readonly action: PaletteAction }
  | { readonly kind: 'acceptPalette'; readonly source: 'keyboard' | 'pointer'; readonly value?: string }
  | { readonly kind: 'resolve' }
  | { readonly kind: 'exit' };

const tickets: readonly Ticket[] = Object.freeze([
  { id: 'T-101', queue: 'triage', title: 'Resize flicker in split pane', owner: 'Mina', severity: 'high', status: 'running' },
  { id: 'T-102', queue: 'triage', title: 'Palette query loses context', owner: 'Noor', severity: 'medium', status: 'pending' },
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

const paletteEntries: readonly SearchEntry[] = [
  { id: 'issues', label: 'Open issues', value: '/issues', group: 'Navigation' },
  { id: 'activity', label: 'Open activity', value: '/activity', group: 'Navigation' },
  { id: 'resolve', label: 'Resolve selected ticket', value: '/resolve', group: 'Actions' },
  { id: 'notes', label: 'Open notes', value: '/notes', group: 'Navigation' }
];
const workspacePaletteIndex = preparePaletteIndex(paletteEntries);

const suggestions = paletteEntries.map((entry) => ({ label: entry.label, value: entry.value }));

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
    palette: { open: false, used: false, query: '', selectedIndex: 0, selectedIds: [] },
    resolved: new Set<string>(),
    activity: ['Workspace started.', 'Loaded six controlled ticket records.'],
    pointer: { tree: false, table: false, palette: false }
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
    case 'openPalette':
      return updateResult({ ...state, palette: { ...state.palette, open: true } });
    case 'closePalette':
      return updateResult({ ...state, palette: { ...state.palette, open: false, query: '' } });
    case 'palette':
      return updateResult({
        ...state,
        palette: { ...state.palette, ...paletteReducer(state.palette, message.action, { paletteIndex: workspacePaletteIndex }) }
      });
    case 'acceptPalette': {
      const selected = message.value ?? selectedPaletteEntry({ paletteIndex: workspacePaletteIndex, state: state.palette })?.value;
      return updateResult(selected === undefined ? state : applyCommand({
        ...state,
        palette: { ...state.palette, open: false, used: true },
        pointer: { ...state.pointer, palette: message.source === 'pointer' || state.pointer.palette }
      }, selected));
    }
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
    case '/palette': return { ...cleared, palette: { ...state.palette, open: true } };
    case '/issues': return { ...cleared, tab: 'issues' };
    case '/activity': return { ...cleared, tab: 'activity' };
    case '/notes': return { ...cleared, tab: 'notes' };
    case '/resolve': return updateWorkspace(cleared, { kind: 'resolve' }).state;
    default: return cleared;
  }
}

function workspaceView(state: WorkspaceState) {
  const base = grid({
    id: 'workspace-grid',
    areas: `
      header header header
      nav main inspector
      status status status
      command command command
    `,
    rows: [
      { kind: 'fixed', cells: 2 },
      { kind: 'fill' },
      { kind: 'fixed', cells: 1 },
      { kind: 'fixed', cells: commandExpanded(state) ? 5 : 2 }
    ],
    columns: [
      { kind: 'fixed', cells: 24 },
      { kind: 'fill' },
      { kind: 'fixed', cells: 30 }
    ],
    gap: 1,
    children: {
      header: surface(text('Interactive Workspace', { textRole: 'title' }), { id: 'workspace-header', appearance: 'chrome', padding: { left: 1 } }),
      nav: navigationPane(state),
      main: mainPane(state),
      inspector: inspectorPane(state),
      status: workspaceStatus(state),
      command: commandPane(state)
    }
  });
  return overlay([base, ...(state.palette.open ? [paletteLayer(state)] : [])], { id: 'workspace-root' });
}

function navigationPane(state: WorkspaceState) {
  return surface(column([
    tree({
      id: 'workspace-tree',
      ...treeScrollablePresentation(state.tree),
      scrollbar: { visible: 'auto' },
      onAction: (action): WorkspaceMessage => ({ kind: 'tree', action })
    }),
    helpBar({ id: 'navigation-help', groups: [{ id: 'nav', bindings: [{ key: 'click', label: 'select queue' }] }] })
  ], { sizes: [{ kind: 'fill' }, { kind: 'fixed', cells: 1 }] }), {
    id: 'workspace-navigation',
    appearance: 'inset',
    padding: 1
  });
}

function mainPane(state: WorkspaceState) {
  return tabs({
    id: 'workspace-tabs',
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
  return surface(column(state.activity.map((entry, index) => text(
    `${String(index + 1).padStart(2, '0')} ${entry}`,
    { id: `activity-${String(index)}` }
  ))), { id: 'activity-panel', appearance: 'neutral', padding: 1 });
}

function notesPanel() {
  return surface(column([
    text('This hand-written app composes controlled generic components.'),
    text('Commands: /palette, /issues, /activity, /notes, /resolve.')
  ], { gap: 1 }), { id: 'notes-panel', appearance: 'neutral', padding: 1 });
}

function inspectorPane(state: WorkspaceState) {
  const ticket = selectedTicket(state);
  return surface(column([
    structuredBlock({
      id: 'ticket-inspector',
      title: ticket.title,
      summary: ticket.id,
      result: state.resolved.has(ticket.id) ? 'success' : ticket.status,
      fields: [
        { label: 'Owner', value: ticket.owner },
        { label: 'Queue', value: ticket.queue },
        { label: 'Severity', value: ticket.severity }
      ]
    }),
    button({ id: 'resolve-button', label: 'Resolve selected', tone: 'primary', onPress: (): WorkspaceMessage => ({ kind: 'resolve' }) })
  ], { gap: 1 }), { id: 'workspace-inspector', appearance: 'inset', padding: 1 });
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
  const expanded = commandExpanded(state);
  const presentation = commandInputPresentation(state.command);
  return surface(commandInput<
    WorkspaceMessage,
    WorkspaceMessage,
    never,
    { readonly escape: () => WorkspaceMessage }
  >({
    id: 'workspace-command',
    prompt: '› ',
    placeholder: 'Type /command',
    presentation: { ...presentation, suggestions: expanded ? presentation.suggestions : [] },
    display: expanded ? 'expanded' : 'compact',
    ...(expanded ? { footer: 'Enter run · Tab complete · Ctrl+Q exit' } : {}),
    onAction: (action): WorkspaceMessage => ({ kind: 'command', action }),
    onSubmit: (value): WorkspaceMessage => ({ kind: 'submit', value }),
    keys: { escape: (): WorkspaceMessage => ({ kind: 'command', action: { kind: 'setValue', value: '' } }) }
  }), { id: 'workspace-command-surface', appearance: 'raised', padding: { left: 1, right: 1 } });
}

function paletteLayer(state: WorkspaceState) {
  return surface(palette({
    id: 'workspace-palette',
    title: 'Commands',
    paletteIndex: workspacePaletteIndex,
    ...palettePresentation(state.palette),
    onAction: (action): WorkspaceMessage => ({ kind: 'palette', action }),
    onSelect: (entry): WorkspaceMessage => ({ kind: 'acceptPalette', source: 'pointer', value: entry.value }),
    keys: {
      enter: (): WorkspaceMessage => ({ kind: 'acceptPalette', source: 'keyboard' }),
      escape: (): WorkspaceMessage => ({ kind: 'closePalette' })
    }
  }), {
    id: 'workspace-palette-surface',
    appearance: 'raised',
    shadow: true,
    padding: 1,
    margin: { top: 4, left: 18, right: 18, bottom: 6 },
    meta: { layer: { zIndex: 20 }, focus: { scope: { kind: 'contain' } } }
  });
}

function commandExpanded(state: WorkspaceState): boolean {
  return state.command.input.text.length > 0;
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
    await runtime.dispatch({ kind: 'openPalette' });
    await runtime.handleInput({ kind: 'text', text: 'resolve', paste: false });
    const keyboardPaletteQuery = runtime.state().palette.query;
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
      paletteUsed: state.palette.used,
      pointerTree: state.pointer.tree,
      pointerTable: state.pointer.table,
      pointerPalette: state.pointer.palette,
      tabSelectedByPointer,
      tabSelectedByKeyboard,
      keyboardPaletteQuery,
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
  button: MouseEvent['button']
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

if (process.argv[1] === new URL(import.meta.url).pathname) {
  if (process.stdin.isTTY && process.stdout.isTTY && !process.argv.includes('--scripted')) {
    const exit = await runTui(interactiveWorkspaceApp, createTerminalHost({ runtime: 'node' }), {
      initialFocus: { kind: 'path', path: ['workspace-root', 'workspace-grid', 'workspace-command-surface', 'workspace-command'] }
    });
    if (exit.status !== 'completed') process.exitCode = 1;
  } else {
    console.log(JSON.stringify(await runScriptedWorkspace()));
  }
}
