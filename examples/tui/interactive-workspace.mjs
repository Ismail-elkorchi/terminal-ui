import process from 'node:process';

import { createMemoryTerminalHost, createTerminalHost } from '@ismail-elkorchi/terminal-ui/host';
import {
  createTuiRuntime,
  defineTui,
  runTui
} from '@ismail-elkorchi/terminal-ui/tui';
import {
  commandInputPresentation,
  commandInputReducer,
  applyScrollEvent,
  createScrollState,
  createSplitPaneState,
  createNotificationState,
  notificationActionFromStack,
  notificationPresentation,
  notificationReducer,
  palettePresentation,
  paletteReducer,
  selectedPaletteEntry,
  splitPanePresentation,
  splitPaneReducer,
  tableReducer,
  tableScrollablePresentation,
  tabsReducer,
  treeScrollablePresentation,
  treeReducer
} from '@ismail-elkorchi/terminal-ui/behavior';
import { renderFramePlain } from '@ismail-elkorchi/terminal-ui/renderer';
import {
  grid,
  overlay,
  splitPane,
  column,
  surface,
  viewport
} from '@ismail-elkorchi/terminal-ui/layout';
import {
  statusIndicator,
  button,
  commandInput,
  helpBar,
  notificationStack,
  palette,
  progressBar,
  statusBar,
  structuredBlock,
  table,
  tabs,
  text,
  tree
} from '@ismail-elkorchi/terminal-ui/components';

const tickets = Object.freeze([
  { id: 'T-101', queue: 'triage', title: 'Resize flicker in split pane', owner: 'Mina', severity: 'high', state: 'running' },
  { id: 'T-102', queue: 'triage', title: 'Palette query loses context', owner: 'Noor', severity: 'medium', state: 'pending' },
  { id: 'T-103', queue: 'review', title: 'Table row hover affordance', owner: 'Ilyas', severity: 'medium', state: 'warning' },
  { id: 'T-104', queue: 'done', title: 'Surface disabled contrast', owner: 'Sara', severity: 'low', state: 'success' },
  { id: 'T-105', queue: 'triage', title: 'Mouse wheel over viewport', owner: 'Lina', severity: 'medium', state: 'pending' },
  { id: 'T-106', queue: 'review', title: 'Command history polish', owner: 'Amin', severity: 'low', state: 'pending' }
]);

const paletteEntries = Object.freeze([
  {
    id: 'open-issues',
    label: 'Open issues tab',
    value: '/issues',
    group: 'Navigation',
    keywords: ['tickets', 'table'],
    preview: 'Focus the main table and issue inspector.'
  },
  {
    id: 'open-activity',
    label: 'Open activity tab',
    value: '/activity',
    group: 'Navigation',
    keywords: ['log', 'viewport'],
    preview: 'Show the scrollable operational log.'
  },
  {
    id: 'resolve-ticket',
    label: 'Resolve selected ticket',
    value: '/resolve',
    group: 'Actions',
    keywords: ['done', 'success'],
    preview: 'Mark the currently selected ticket as handled in app state.'
  },
  {
    id: 'assign-ops',
    label: 'Assign selected ticket to Ops',
    value: '/assign ops',
    group: 'Actions',
    keywords: ['owner', 'team'],
    preview: 'Reassign the selected ticket and append an activity line.'
  },
  {
    id: 'clear-command',
    label: 'Clear command line',
    value: '/clear',
    group: 'Input',
    keywords: ['reset'],
    preview: 'Clear the command bar without changing workspace state.'
  }
]);

const commandSuggestions = Object.freeze(paletteEntries.map((entry) => ({ value: entry.value, label: entry.value })));

function initialState() {
  return {
    tab: 'issues',
    tree: {
      nodes: navigationNodes(),
      selected: 'queue:triage',
      scroll: createScrollState({ contentRows: 10 })
    },
    table: {
      selectedRowId: 'T-101',
      scroll: createScrollState({ contentRows: tickets.length })
    },
    split: createSplitPaneState(3, [0.18, 0.6, 0.22]),
    command: {
      input: { text: '', cursor: 0 },
      history: [],
      suggestions: commandSuggestions
    },
    palette: { open: false, query: '', selectedIndex: 0, selectedIds: [], used: false },
    notifications: createNotificationState(),
    nextNotificationId: 1,
    activityScroll: createScrollState({ contentRows: 3 }),
    log: [
      'Workspace started.',
      'Loaded 6 issues from local state.',
      'Use the tree, tabs, table keys, command bar, or palette.'
    ],
    pointer: { tree: false, table: false, palette: false }
  };
}

export const interactiveWorkspaceApp = defineWorkspaceApp();
const commandFocusPath = Object.freeze(['workspace-root', 'workspace-grid', 'workspace-command-surface', 'workspace-command']);

function defineWorkspaceApp() {
  return defineTui({
    id: 'interactive-workspace',
    init: () => initialState(),
    keyBindings: [
      {
        id: 'exit',
        triggers: [{ kind: 'key', key: 'ctrlC' }, { kind: 'key', key: 'ctrlQ' }],
        label: 'Exit',
        message: { kind: 'exit' }
      }
    ],
    update: updateWorkspace,
    view: workspaceView,
    nonTty: { mode: 'last_frame' }
  });
}

function updateWorkspace(state, message) {
  switch (message.kind) {
    case 'tree': {
      const nextTree = treeReducer(state.tree, message.action);
      const stateWithTree = { ...state, tree: nextTree };
      const nextTickets = visibleTickets(stateWithTree);
      const selectedRowId = nextTickets.some((ticket) => ticket.id === state.table.selectedRowId)
        ? state.table.selectedRowId
        : nextTickets[0]?.id;
      return withState({
        ...state,
        tree: nextTree,
        table: { ...state.table, selectedRowId },
        pointer: {
          ...state.pointer,
          tree: message.action.kind === 'select' || message.action.kind === 'toggle' || state.pointer.tree
        },
        log: message.action.kind === 'select'
          ? appendLog(state, `Selected ${message.action.id ?? 'no tree item'}.`)
          : state.log
      });
    }
    case 'setTab':
      return withState({
        ...state,
        tab: message.tab,
        palette: { ...state.palette, open: false },
        log: appendLog(state, `Opened ${message.tab} tab.`)
      });
    case 'scriptSetup':
      {
        const rows = visibleTickets(state);
      return withState({
        ...state,
        tab: 'activity',
        table: tableReducer(
          state.table,
          { kind: 'selectRow', rowId: rows[1]?.id ?? rows[0]?.id ?? '', rowIndex: Math.min(1, Math.max(0, rows.length - 1)) },
          { rows, getRowId: (ticket) => ticket.id, columnCount: 5 }
        ),
        palette: { ...state.palette, open: true, query: 'resolve', selectedIndex: 0 },
        log: appendLog(state, 'Script opened activity and filtered command palette.')
      });
      }
    case 'table':
      {
        const rows = visibleTickets(state);
      return withState({
        ...state,
        table: tableReducer(state.table, message.action, { rows, getRowId: (ticket) => ticket.id, columnCount: 5 }),
        pointer: { ...state.pointer, table: true }
      });
      }
    case 'activityScroll':
      return withState({
        ...state,
        activityScroll: applyScrollEvent(state.activityScroll, message.event)
      });
    case 'split':
      return withState({
        ...state,
        split: splitPaneReducer(state.split, message.action, {
          constraints: [
            { minShare: 0.12, maxShare: 0.32 },
            { minShare: 0.4 },
            { minShare: 0.16, maxShare: 0.34 }
          ]
        })
      });
    case 'commandEdit':
      return withState({ ...state, command: commandInputReducer(state.command, message.action) });
    case 'submitCommand':
      return withState(applyCommand(state, state.command.input.text));
    case 'openPalette':
      return withState({ ...state, palette: { ...state.palette, open: true } });
    case 'closePalette':
      return withState({ ...state, palette: { ...state.palette, open: false, query: '' } });
    case 'paletteEdit':
      return withState({
        ...state,
        palette: reducePaletteState(state.palette, message.action)
      });
    case 'paletteAcceptSelected': {
      const selected = selectedPaletteEntry({ entries: paletteEntries, state: state.palette, limit: 6 });
      return withState(selected === undefined ? state : applyCommand(markPaletteUsed(state), selected.value));
    }
    case 'paletteAccept':
      return withState(applyCommand(markPaletteUsed({
        ...state,
        pointer: { ...state.pointer, palette: message.source === 'pointer' || state.pointer.palette }
      }), message.command));
    case 'notification':
      return withState({
        ...state,
        notifications: notificationReducer(
          state.notifications,
          notificationActionFromStack(message.action, Date.now()),
          { maxVisible: 2 }
        )
      });
    case 'exit':
      return { state, exit: { reason: 'user requested exit' } };
  }
  throw new Error(`Unsupported workspace message: ${String(message?.kind)}`);
}

function withState(state) {
  return { state };
}

function workspaceView(state, context) {
  const wide = context.viewport.columns >= 92;
  const workspace = wide ? wideWorkspace(state) : narrowWorkspace(state);
  const overlays = [
    workspace,
    ...(state.palette.open ? [paletteOverlay(state)] : [])
  ];
  return overlay(overlays, { id: 'workspace-root' });
}

function wideWorkspace(state) {
  const commandRows = commandRowCount(state);
  return grid({
    id: 'workspace-grid',
    areas: `
      header
      body
      status
      command
    `,
    rows: [
      { kind: 'fixed', cells: 1 },
      { kind: 'fill' },
      { kind: 'fixed', cells: 1 },
      { kind: 'fixed', cells: commandRows }
    ],
    columns: [{ kind: 'fill' }],
    gap: 1,
    children: {
      header: headerSurface(),
      body: splitPane([
        navigationSurface(state),
        mainSurface(state),
        inspectorSurface(state)
      ], {
        id: 'workspace-panes',
        direction: 'horizontal',
        ...splitPanePresentation(state.split),
        onAction: (action) => ({ kind: 'split', action })
      }),
      status: workspaceStatus(state),
      command: commandSurface(state)
    }
  });
}

function narrowWorkspace(state) {
  const commandRows = commandRowCount(state);
  return grid({
    id: 'workspace-grid-narrow',
    areas: `
      header
      main
      status
      command
    `,
    rows: [
      { kind: 'fixed', cells: 1 },
      { kind: 'fill' },
      { kind: 'fixed', cells: 1 },
      { kind: 'fixed', cells: commandRows }
    ],
    columns: [{ kind: 'fill' }],
    gap: 1,
    children: {
      header: headerSurface(),
      main: mainSurface(state),
      status: workspaceStatus(state),
      command: commandSurface(state)
    }
  });
}

function headerSurface() {
  return surface(text('Interactive Workspace', { id: 'workspace-title', textRole: 'title' }), {
    id: 'workspace-header',
    variant: 'chrome',
    padding: { left: 1, right: 1 }
  });
}

function workspaceStatus(state) {
  const selected = selectedTicket(state);
  return statusBar({
    id: 'workspace-status',
    leading: [
      { id: 'ticket', kind: 'status', text: `${selected.id} ${selected.state}`, status: ticketStatus(selected) },
      { id: 'owner', kind: 'text', text: selected.owner }
    ],
    center: [
      { id: 'tab', kind: 'text', text: state.tab },
      { id: 'scope', kind: 'text', text: state.tree.selected ?? 'all' }
    ],
    trailing: [
      { id: 'queue', kind: 'text', text: `${String(visibleTickets(state).length)} visible` },
      { id: 'runtime', kind: 'status', text: selected.state === 'running' ? 'working' : 'ready', status: ticketStatus(selected) }
    ]
  });
}

function navigationSurface(state) {
  return surface(column([
    tree({
      id: 'workspace-tree',
      ...treeScrollablePresentation(state.tree),
      onAction: (action) => ({ kind: 'tree', action }),
      scrollbar: { visible: 'auto' }
    }),
    helpBar({
      id: 'nav-help',
      groups: [{
        id: 'navigation',
        bindings: [
          { key: 'click', label: 'select' },
          { key: 'tab', label: 'focus' }
        ]
      }]
    })
  ], {
    id: 'workspace-navigation-body',
    gap: 1,
    sizes: [{ kind: 'fill' }, { kind: 'fixed', cells: 2 }]
  }), {
    id: 'workspace-navigation',
    label: 'Navigator',
    variant: 'inset',
    padding: 1
  });
}

function mainSurface(state) {
  const tabItems = [
    { id: 'issues' },
    { id: 'activity' },
    { id: 'notes' }
  ];
  return tabs({
    id: 'workspace-tabs',
    selected: state.tab,
    tabs: [
      { id: 'issues', label: 'Issues', description: 'Ticket table', panel: issueTablePanel(state) },
      { id: 'activity', label: 'Activity', description: 'Scrollable log', panel: activityPanel(state) },
      { id: 'notes', label: 'Notes', description: 'Command guide', panel: notesPanel(state) }
    ],
    onAction: (action) => ({
      kind: 'setTab',
      tab: tabsReducer({ selected: state.tab }, action, tabItems).selected ?? state.tab
    })
  });
}

function issueTablePanel(state) {
  const rows = visibleTickets(state);
  return surface(column([
    notificationLayer(state, table({
      getRowId: (ticket) => ticket.id,
      id: 'ticket-table',
      rows,
      presentation: tableScrollablePresentation(state.table),
      stickyHeader: true,
      scrollbar: { visible: 'auto' },
      onAction: (action) => ({ kind: 'table', action }),
      columns: [
        {
          id: 'id-0', value: (ticket) => ticket.id, header: 'ID', width: { kind: 'fixed', cells: 7 } },
        {
          id: 'title-1', value: (ticket) => ticket.title, header: 'Title', width: { kind: 'fill' } },
        {
          id: 'owner-2', value: (ticket) => ticket.owner, header: 'Owner', width: { kind: 'fixed', cells: 8 } },
        {
          id: 'severity-3', value: (ticket) => ticket.severity, header: 'Severity', width: { kind: 'fixed', cells: 10 } },
        {
          id: 'state-4', value: (ticket) => ticket.state, header: 'State', width: { kind: 'fixed', cells: 10 } }
      ]
    })),
    helpBar({
      id: 'table-help',
      groups: [{
        id: 'table',
        bindings: [
          { key: 'up/down', label: 'select row' },
          { key: '/palette', label: 'commands' }
        ]
      }]
    })
  ], {
    id: 'issues-panel-body',
    gap: 1,
    sizes: [{ kind: 'fill' }, { kind: 'fixed', cells: 1 }]
  }), {
    id: 'issues-panel',
    label: 'Ticket queue',
    variant: 'neutral',
    padding: 1
  });
}

function activityPanel(state) {
  const lines = state.log.map((item, index) => text(`${String(index + 1).padStart(2, '0')} ${item}`, {
    id: `activity-line-${String(index)}`
  }));
  return surface(notificationLayer(state, viewport(column(lines, { id: 'activity-lines', gap: 0 }), {
    id: 'activity-viewport',
    scrollRow: state.activityScroll.offsetRow,
    scrollColumn: state.activityScroll.offsetColumn,
    contentRows: lines.length,
    contentColumns: Math.max(0, ...state.log.map((line) => line.length + 3)),
    onScroll: (event) => ({ kind: 'activityScroll', event }),
    scrollbar: { visible: 'auto' }
  })), {
    id: 'activity-panel',
    label: 'Activity log',
    variant: 'neutral',
    padding: 1
  });
}

function notesPanel(state) {
  return surface(notificationLayer(state, column([
    text('This example is intentionally hand-written.', { id: 'note-purpose', textRole: 'body' }),
    text('It combines primitives without app-frame recipes or product composites.', { id: 'note-surface' }),
    text('Useful commands: /palette, /issues, /activity, /resolve, /assign ops.', { id: 'note-commands' })
  ], { id: 'notes-panel-body', gap: 1 })), {
    id: 'notes-panel',
    label: 'Notes',
    variant: 'neutral',
    padding: 1
  });
}

function inspectorSurface(state) {
  const ticket = selectedTicket(state);
  return surface(column([
    structuredBlock({
      id: 'ticket-inspector',
      title: ticket.title,
      status: ticketStatus(ticket),
      summary: `${ticket.id} owned by ${ticket.owner}`,
      fields: [
        { label: 'Queue', value: ticket.queue },
        { label: 'Severity', value: ticket.severity },
        { label: 'State', value: ticket.state }
      ],
      body: 'This panel updates when keyboard commands, palette choices, or tree clicks change app state.'
    }),
    column([
      statusIndicator({ id: 'workspace-activity', label: 'runtime', status: ticket.state === 'running' ? 'running' : 'idle' }),
      progressBar({
        id: 'queue-progress',
        label: 'resolved',
        value: resolvedCount(),
        max: tickets.length,
        display: 'bar+percent'
      })
    ], { id: 'inspector-status-column', gap: 0 }),
    button({
      id: 'resolve-button',
      label: 'Resolve selected',
      tone: 'primary',
      onPress: { kind: 'paletteAccept', command: '/resolve', source: 'button' }
    })
  ], { id: 'workspace-inspector-body', gap: 1 }), {
    id: 'workspace-inspector',
    label: 'Inspector',
    variant: 'inset',
    padding: 1
  });
}

function commandSurface(state) {
  const expanded = commandInputExpanded(state);
  const presentation = commandInputPresentation(state.command);
  return surface(commandInput({
    id: 'workspace-command',
    prompt: '› ',
    presentation: {
      ...presentation,
      suggestions: expanded ? presentation.suggestions : []
    },
    placeholder: 'Type /command',
    completionPreview: expanded ? completionPreview(state.command.input.text) : undefined,
    footer: expanded ? 'Enter run | arrows suggestions | Esc clear | Tab focus | Ctrl+C/Ctrl+Q exit' : undefined,
    display: expanded ? 'expanded' : 'compact',
    onAction: (action) => ({ kind: 'commandEdit', action }),
    onSubmit: { kind: 'submitCommand' },
    keys: {
      arrowUp: () => ({ kind: 'commandEdit', action: { kind: 'moveSuggestion', delta: -1 } }),
      arrowDown: () => ({ kind: 'commandEdit', action: { kind: 'moveSuggestion', delta: 1 } }),
      tab: () => ({ kind: 'commandEdit', action: { kind: 'acceptSuggestion' } }),
      escape: () => ({ kind: 'commandEdit', action: { kind: 'setValue', value: '' } }),
      text: { '/': () => ({ kind: 'openPalette' }) }
    }
  }), {
    id: 'workspace-command-surface',
    label: 'Command',
    variant: 'raised',
    padding: { left: 1, right: 1 }
  });
}

function paletteOverlay(state) {
  return surface(palette({
    id: 'workspace-palette',
    title: 'Commands',
    entries: paletteEntries,
    ...palettePresentation(state.palette),
    onSelect: (entry) => ({ kind: 'paletteAccept', command: entry.value, source: 'pointer' }),
    helpText: 'Type to filter. Enter accepts selected. Esc closes.',
    maxVisible: 6,
    onAction: (action) => ({ kind: 'paletteEdit', action }),
    keys: {
      enter: () => ({ kind: 'paletteAcceptSelected' }),
      escape: () => ({ kind: 'closePalette' })
    }
  }), {
    id: 'workspace-palette-surface',
    label: 'Command palette',
    variant: 'raised',
    shadow: true,
    padding: 1,
    margin: { top: 4, left: 18, right: 18, bottom: 6 },
    meta: {
      layer: { zIndex: 20 },
      focus: { scope: { kind: 'contain' } }
    }
  });
}

function notificationStackForState(state) {
  const presentation = notificationPresentation(state.notifications, { mode: 'live', now: Date.now() });
  return notificationStack({
    id: 'workspace-notifications',
    presentation,
    placement: 'bottom-right',
    onDismiss: (id) => ({ kind: 'notification', action: { kind: 'dismiss', id } })
  });
}

function notificationLayer(state, child) {
  const notifications = state === undefined || state.notifications.active.length === 0
    ? []
    : [notificationStackForState(state)];
  return overlay([child, ...notifications], { id: `${child.id ?? 'content'}-notifications` });
}

function navigationNodes() {
  return [
    {
      id: 'workspace',
      label: 'Workspace',
      kind: 'branch',
      expanded: true,
      children: [
        { id: 'queue:triage', label: 'Triage', kind: 'leaf', description: 'Open triage queue' },
        { id: 'queue:review', label: 'Review', kind: 'leaf', description: 'Items under review' },
        { id: 'queue:done', label: 'Done', kind: 'leaf', description: 'Completed items' }
      ]
    },
    {
      id: 'team',
      label: 'Team',
      kind: 'branch',
      expanded: true,
      children: [
        { id: 'team:ops', label: 'Ops', kind: 'leaf' },
        { id: 'team:design', label: 'Design', kind: 'leaf' }
      ]
    }
  ];
}

function visibleTickets(state) {
  const selected = state.tree.selected ?? '';
  if (selected.startsWith('queue:')) {
    const queue = selected.slice('queue:'.length);
    return tickets.filter((ticket) => ticket.queue === queue);
  }
  if (selected === 'team:ops') return tickets.filter((ticket) => ticket.owner === 'Lina' || ticket.owner === 'Mina');
  return tickets;
}

function selectedTicket(state) {
  const rows = visibleTickets(state);
  return rows.find((ticket) => ticket.id === state.table.selectedRowId) ?? rows[0] ?? tickets[0];
}

function applyCommand(state, rawCommand) {
  const command = rawCommand.trim();
  const withHistory = {
    ...state,
    command: {
      input: { text: '', cursor: 0 },
      history: command.length === 0 ? state.command.history : [...state.command.history, command],
      suggestions: commandSuggestions
    },
    palette: { ...state.palette, open: false, query: '', selectedIndex: 0 }
  };
  if (command === '/palette') return { ...withHistory, palette: { ...withHistory.palette, open: true } };
  if (command === '/issues') return { ...withHistory, tab: 'issues', log: appendLog(withHistory, 'Command switched to issues.') };
  if (command === '/activity') return { ...withHistory, tab: 'activity', log: appendLog(withHistory, 'Command switched to activity.') };
  if (command === '/resolve') {
    const ticket = selectedTicket(withHistory);
    return {
      ...withHistory,
      ...notificationPatch(withHistory, `${ticket.id} resolved`, 'Generated by the interactive workspace example.', 'success'),
      log: appendLog(withHistory, `Resolved ${ticket.id}.`)
    };
  }
  if (command === '/assign ops') {
    const ticket = selectedTicket(withHistory);
    return {
      ...withHistory,
      ...notificationPatch(withHistory, `${ticket.id} assigned to Ops`, 'Generated by the interactive workspace example.', 'info'),
      log: appendLog(withHistory, `Assigned ${ticket.id} to Ops.`)
    };
  }
  if (command === '/clear' || command.length === 0) return withHistory;
  return {
    ...withHistory,
    ...notificationPatch(withHistory, `Unknown command: ${command}`, 'Generated by the interactive workspace example.', 'warning'),
    log: appendLog(withHistory, `Unknown command ignored: ${command}.`)
  };
}

function markPaletteUsed(state) {
  return { ...state, palette: { ...state.palette, used: true } };
}

function reducePaletteState(state, action) {
  return {
    ...state,
    ...paletteReducer(state, action, { entries: paletteEntries })
  };
}

function notificationPatch(state, title, message, tone) {
  const id = `notice-${String(state.nextNotificationId)}`;
  return {
    nextNotificationId: state.nextNotificationId + 1,
    notifications: notificationReducer(state.notifications, {
      kind: 'enqueue',
      notification: { id, title, message, tone },
      now: Date.now()
    }, { maxVisible: 2 })
  };
}

function appendLog(state, line) {
  return [...state.log, line].slice(-12);
}

function completionPreview(value) {
  if (value.length === 0) return undefined;
  const suggestion = commandSuggestions.find((item) => item.value.startsWith(value) && item.value !== value);
  return suggestion === undefined ? undefined : suggestion.value.slice(value.length);
}

function commandInputExpanded(state) {
  return state.command.input.text.length > 0 || state.command.selectedSuggestion !== undefined;
}

function commandRowCount(state) {
  return commandInputExpanded(state) ? 6 : 3;
}

function ticketStatus(ticket) {
  if (ticket.state === 'success') return 'success';
  if (ticket.state === 'warning') return 'warning';
  if (ticket.state === 'running') return 'running';
  return 'pending';
}

function resolvedCount() {
  return tickets.filter((ticket) => ticket.state === 'success').length;
}

export async function runScriptedWorkspace() {
  const host = createMemoryTerminalHost({ viewport: { columns: 112, rows: 32 } });
  const runtime = createTuiRuntime({ app: interactiveWorkspaceApp, host, initialFocusPath: commandFocusPath });
  try {
    await runtime.start();
    await runtime.handleInput({ kind: 'text', text: '/palette', paste: false });
    await runtime.handleInput(keyEvent('enter'));
    await runtime.handleInput({ kind: 'text', text: 'resolve', paste: false });
    const keyboardPaletteQuery = runtime.getState().palette.query;
    await runtime.handleInput(keyEvent('enter'));
    await runtime.handleInput({ kind: 'text', text: '/issues', paste: false });
    const commandAfterPaletteAccept = runtime.getState().command.input.text;
    await runtime.handleInput(keyEvent('enter'));

    const treeTarget = targetById(runtime, 'workspace-tree:queue:review:body');
    await click(runtime, treeTarget);
    const tableHitTargets = runtime.frame()?.hitTargets?.filter((target) => target.id.startsWith('ticket-table')).length ?? 0;
    const tableTarget = targetByPrefix(runtime, 'ticket-table:row:T-103');
    await click(runtime, tableTarget);
    await runtime.dispatch({ kind: 'scriptSetup' });
    const paletteTarget = targetByPrefix(runtime, 'workspace-palette:resolve-ticket');
    await click(runtime, paletteTarget);

    await click(runtime, targetById(runtime, 'workspace-tabs:tab:notes'));
    const tabSelectedByPointer = runtime.getState().tab === 'notes';
    await runtime.handleInput(keyEvent('arrowLeft'));
    const tabSelectedByKeyboard = runtime.getState().tab === 'activity';

    await runtime.handleInput({ kind: 'resize', viewport: { columns: 76, rows: 24 } });
    const narrowFrame = runtime.frame();
    if (narrowFrame === undefined) throw new Error('The scripted workspace lost its frame after resize.');
    const narrowRows = renderFramePlain(narrowFrame).split('\n').length;
    const focusAfterNarrowResize = runtime.frame()?.focusPath ?? [];
    await runtime.handleInput({ kind: 'resize', viewport: { columns: 112, rows: 32 } });

    const frame = runtime.frame();
    if (frame === undefined) throw new Error('The scripted workspace did not render a frame.');
    const state = runtime.getState();
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
      commandAfterPaletteAccept,
      tableHitTargets,
      narrowRows,
      focusValidAfterResize: focusAfterNarrowResize.length > 0,
      statusVisible: renderFramePlain(frame).includes(selectedTicket(state).id),
      visible: renderFramePlain(frame).includes('Resolved T-106.'),
      outputRows: renderFramePlain(frame).split('\n').length
    };
  } finally {
    await runtime.dispose();
  }
}

function targetById(runtime, id) {
  const target = runtime.frame()?.hitTargets?.find((item) => item.id === id);
  if (target === undefined) throw new Error(`Missing hit target ${id}`);
  return target;
}

function targetByPrefix(runtime, prefix) {
  const target = runtime.frame()?.hitTargets?.find((item) => item.id.startsWith(prefix));
  if (target === undefined) throw new Error(`Missing hit target with prefix ${prefix}`);
  return target;
}

async function click(runtime, target) {
  await runtime.handleInput(mouseEvent('press', target, 'left'));
  await runtime.handleInput(mouseEvent('release', target, 'left'));
}

function mouseEvent(action, target, button) {
  return {
    kind: 'mouse',
    sequence: '',
    encoding: 'sgr',
    action,
    button,
    row: target.bounds.row,
    column: target.bounds.column,
    rawCode: 0,
    modifiers: { shift: false, alt: false, ctrl: false }
  };
}

/**
 * @param {import('@ismail-elkorchi/terminal-ui/input').KeyName} key
 * @returns {import('@ismail-elkorchi/terminal-ui/input').KeyEvent}
 */
function keyEvent(key) {
  return {
    kind: 'key',
    key,
    sequence: '',
    shift: false,
    alt: false,
    ctrl: false,
    meta: false
  };
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  if (process.stdin.isTTY === true && process.stdout.isTTY === true && !process.argv.includes('--scripted')) {
    const exit = await runTui(interactiveWorkspaceApp, createTerminalHost({ runtime: 'node' }), {
      initialFocusPath: commandFocusPath
    });
    if (exit.status !== 'completed') {
      process.exitCode = 1;
    }
  } else {
    const result = await runScriptedWorkspace();
    console.log(JSON.stringify(result));
  }
}
