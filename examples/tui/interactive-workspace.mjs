import process from 'node:process';

import { createMemoryTerminalHost, createTerminalHost } from '@ismail-elkorchi/terminal-ui/host';
import {
  commandBarReducer,
  createTuiRuntime,
  defineTui,
  renderFramePlain,
  runTui
} from '@ismail-elkorchi/terminal-ui/tui';
import {
  activityIndicator,
  button,
  commandBar,
  grid,
  helpBar,
  notificationStack,
  overlay,
  palette,
  progressBar,
  stack,
  statusBar,
  structuredBlock,
  surface,
  table,
  tabs,
  text,
  tree,
  viewport,
  paletteReducer,
  selectedPaletteEntry,
  tableReducer,
  treeStateReducer
} from '@ismail-elkorchi/terminal-ui/widgets';

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
    tree: { selected: 'queue:triage' },
    table: { selectedRow: 0 },
    command: {
      input: { text: '', cursor: 0 },
      history: [],
      suggestions: commandSuggestions
    },
    palette: { open: false, query: '', selectedIndex: 0, selectedIds: [], used: false },
    notifications: [],
    nextNotificationId: 1,
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
      { id: 'exit', keys: ['ctrlC', 'ctrlQ'], label: 'Exit', message: { kind: 'exit' } }
    ],
    update: updateWorkspace,
    view: workspaceView,
    nonTty: { mode: 'last_frame' }
  });
}

function updateWorkspace(state, message) {
  switch (message.kind) {
    case 'selectNode': {
      const nextTree = treeStateReducer(state.tree, { kind: 'select', id: message.id });
      return withState({
        ...state,
        tree: nextTree,
        pointer: { ...state.pointer, tree: message.source === 'pointer' || state.pointer.tree },
        log: appendLog(state, `Selected ${message.id}.`)
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
      return withState({
        ...state,
        tab: 'activity',
        table: tableReducer(state.table, { kind: 'selectRow', row: 1 }, { rowCount: visibleTickets(state).length, columnCount: 5 }),
        palette: { ...state.palette, open: true, query: 'resolve', selectedIndex: 0 },
        log: appendLog(state, 'Script opened activity and filtered command palette.')
      });
    case 'table':
      return withState({
        ...state,
        table: tableReducer(state.table, message.action, { rowCount: visibleTickets(state).length, columnCount: 5 })
      });
    case 'selectTableRow':
      return withState({
        ...state,
        table: tableReducer(state.table, { kind: 'selectRow', row: message.row }, { rowCount: visibleTickets(state).length, columnCount: 5 }),
        pointer: { ...state.pointer, table: message.source === 'pointer' || state.pointer.table },
        log: appendLog(state, `Selected table row ${String(message.row + 1)}.`)
      });
    case 'commandEdit':
      return withState({ ...state, command: commandBarReducer(state.command, message.action) });
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
    case 'dismissNotification':
      return withState({
        ...state,
        notifications: state.notifications.filter((item) => item.id !== message.id)
      });
    case 'exit':
      return { state, exit: { reason: 'user requested exit' } };
  }
}

function withState(state) {
  return { state };
}

function workspaceView(state, context) {
  const wide = context.viewport.columns >= 92;
  const shell = wide ? wideWorkspace(state) : narrowWorkspace(state);
  const overlays = [
    shell,
    ...(state.palette.open ? [paletteOverlay(state)] : [])
  ];
  return overlay(overlays, { id: 'workspace-root' });
}

function wideWorkspace(state) {
  const commandRows = commandRowCount(state);
  return grid({
    id: 'workspace-grid',
    areas: `
      header header header
      nav    main   inspector
      command command command
    `,
    rows: [{ kind: 'fixed', cells: 2 }, { kind: 'fill' }, { kind: 'fixed', cells: commandRows }],
    columns: [{ kind: 'fixed', cells: 25 }, { kind: 'fill' }, { kind: 'fixed', cells: 32 }],
    gap: 1,
    children: {
      header: headerSurface(state),
      nav: navigationSurface(state),
      main: mainSurface(state),
      inspector: inspectorSurface(state),
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
      command
    `,
    rows: [{ kind: 'fixed', cells: 2 }, { kind: 'fill' }, { kind: 'fixed', cells: commandRows }],
    columns: [{ kind: 'fill' }],
    gap: 1,
    children: {
      header: headerSurface(state),
      main: mainSurface(state),
      command: commandSurface(state)
    }
  });
}

function headerSurface(state) {
  const selected = selectedTicket(state);
  return surface(stack([
    text('Interactive Workspace', { id: 'workspace-title', textRole: 'title' }),
    statusBar({ id: 'workspace-status', text: `${selected.id} ${selected.state} | ${state.tab} | ${state.tree.selected ?? 'all'}` })
  ], {
    id: 'workspace-header-body',
    gap: 0,
    sizes: [{ kind: 'fixed', cells: 1 }, { kind: 'fixed', cells: 1 }]
  }), {
    id: 'workspace-header',
    variant: 'chrome',
    padding: { left: 1, right: 1 }
  });
}

function navigationSurface(state) {
  return surface(stack([
    tree({
      id: 'workspace-tree',
      nodes: navigationNodes(),
      selected: state.tree.selected,
      toMessage: (node) => ({ kind: 'selectNode', id: node.id, source: 'pointer' }),
      keyMap: {
        arrowDown: { kind: 'selectNode', id: nextNodeId(state.tree.selected), source: 'keyboard' },
        arrowUp: { kind: 'selectNode', id: previousNodeId(state.tree.selected), source: 'keyboard' }
      },
      scrollbar: { visible: 'auto' }
    }),
    helpBar({
      id: 'nav-help',
      bindings: [
        { key: 'click', label: 'select' },
        { key: 'tab', label: 'focus' }
      ]
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
  return tabs({
    id: 'workspace-tabs',
    selected: state.tab,
    tabs: [
      { id: 'issues', label: 'Issues', description: 'Ticket table', message: { kind: 'setTab', tab: 'issues' }, panel: issueTablePanel(state) },
      { id: 'activity', label: 'Activity', description: 'Scrollable log', message: { kind: 'setTab', tab: 'activity' }, panel: activityPanel(state) },
      { id: 'notes', label: 'Notes', description: 'Command guide', message: { kind: 'setTab', tab: 'notes' }, panel: notesPanel(state) }
    ],
    keyMap: {
      arrowLeft: { kind: 'setTab', tab: previousTab(state.tab) },
      arrowRight: { kind: 'setTab', tab: nextTab(state.tab) }
    }
  });
}

function issueTablePanel(state) {
  const rows = visibleTickets(state).map(ticketTableRow);
  const selected = Math.min(state.table.selectedRow ?? 0, Math.max(0, rows.length - 1));
  return surface(stack([
    notificationLayer(state, table({
      id: 'ticket-table',
      rows,
      selected,
      stickyHeader: true,
      scrollbar: { visible: 'auto' },
      toMessage: ({ rowIndex }) => ({ kind: 'selectTableRow', row: rowIndex, source: 'pointer' }),
      columns: [
        { header: 'ID', width: { kind: 'fixed', cells: 7 } },
        { header: 'Title', width: { kind: 'fill' } },
        { header: 'Owner', width: { kind: 'fixed', cells: 8 } },
        { header: 'Severity', width: { kind: 'fixed', cells: 10 } },
        { header: 'State', width: { kind: 'fixed', cells: 10 } }
      ],
      keyMap: {
        arrowDown: { kind: 'table', action: { kind: 'selectRow', row: selected + 1 } },
        arrowUp: { kind: 'table', action: { kind: 'selectRow', row: selected - 1 } },
        enter: { kind: 'submitCommand' }
      }
    })),
    helpBar({
      id: 'table-help',
      bindings: [
        { key: 'up/down', label: 'select row' },
        { key: '/palette', label: 'commands' }
      ]
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

function ticketTableRow(ticket) {
  return [ticket.id, ticket.title, ticket.owner, ticket.severity, ticket.state];
}

function activityPanel(state) {
  const lines = state.log.map((item, index) => text(`${String(index + 1).padStart(2, '0')} ${item}`, {
    id: `activity-line-${String(index)}`
  }));
  return surface(notificationLayer(state, viewport(stack(lines, { id: 'activity-lines', gap: 0 }), {
    id: 'activity-viewport',
    contentRows: lines.length,
    scrollbar: { visible: 'auto' }
  })), {
    id: 'activity-panel',
    label: 'Activity log',
    variant: 'neutral',
    padding: 1
  });
}

function notesPanel(state) {
  return surface(notificationLayer(state, stack([
    text('This example is intentionally hand-written.', { id: 'note-purpose', textRole: 'body' }),
    text('It combines primitives without app-shell recipes or product composites.', { id: 'note-surface' }),
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
  return surface(stack([
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
    stack([
      activityIndicator({ id: 'workspace-activity', label: 'runtime', status: ticket.state === 'running' ? 'running' : 'idle' }),
      progressBar({
        id: 'queue-progress',
        label: 'resolved',
        value: resolvedCount(),
        max: tickets.length,
        showPercentage: true
      })
    ], { id: 'inspector-status-stack', gap: 0 }),
    button({
      id: 'resolve-button',
      label: 'Resolve selected',
      tone: 'primary',
      message: { kind: 'paletteAccept', command: '/resolve', source: 'button' }
    })
  ], { id: 'workspace-inspector-body', gap: 1 }), {
    id: 'workspace-inspector',
    label: 'Inspector',
    variant: 'inset',
    padding: 1
  });
}

function commandSurface(state) {
  const expanded = commandBarExpanded(state);
  return surface(commandBar({
    id: 'workspace-command',
    prompt: '› ',
    value: state.command.input.text,
    cursor: state.command.input.cursor,
    placeholder: 'Type /command',
    suggestions: expanded ? state.command.suggestions : [],
    selectedSuggestion: state.command.selectedSuggestion,
    completionPreview: expanded ? completionPreview(state.command.input.text) : undefined,
    footer: expanded ? 'Enter run | arrows suggestions | Esc clear | Tab focus | Ctrl+C/Ctrl+Q exit' : undefined,
    display: expanded ? 'expanded' : 'compact',
    inputMap: {
      text: (value) => ({ kind: 'commandEdit', action: { kind: 'insert', text: value } })
    },
    keyMap: {
      backspace: { kind: 'commandEdit', action: { kind: 'deleteBackward' } },
      delete: { kind: 'commandEdit', action: { kind: 'deleteForward' } },
      arrowLeft: { kind: 'commandEdit', action: { kind: 'moveLeft' } },
      arrowRight: { kind: 'commandEdit', action: { kind: 'moveRight' } },
      arrowUp: { kind: 'commandEdit', action: { kind: 'selectSuggestion', direction: -1 } },
      arrowDown: { kind: 'commandEdit', action: { kind: 'selectSuggestion', direction: 1 } },
      tab: { kind: 'commandEdit', action: { kind: 'acceptSuggestion' } },
      enter: { kind: 'submitCommand' },
      escape: { kind: 'commandEdit', action: { kind: 'setValue', value: '' } },
      '/': { kind: 'openPalette' }
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
    query: state.palette.query,
    selected: state.palette.selectedIndex,
    toMessage: (entry) => ({ kind: 'paletteAccept', command: entry.value, source: 'pointer' }),
    helpText: 'Type to filter. Enter accepts selected. Esc closes.',
    maxVisible: 6,
    inputMap: {
      text: (value) => ({ kind: 'paletteEdit', action: { kind: 'insertQuery', text: value } })
    },
    keyMap: {
      backspace: { kind: 'paletteEdit', action: { kind: 'deleteQueryBackward' } },
      arrowDown: { kind: 'paletteEdit', action: { kind: 'moveFilteredSelection', delta: 1, entries: paletteEntries } },
      arrowUp: { kind: 'paletteEdit', action: { kind: 'moveFilteredSelection', delta: -1, entries: paletteEntries } },
      enter: { kind: 'paletteAcceptSelected' },
      escape: { kind: 'closePalette' }
    }
  }), {
    id: 'workspace-palette-surface',
    label: 'Command palette',
    variant: 'raised',
    zIndex: 20,
    focus: { scope: 'contain' },
    shadow: true,
    padding: 1,
    margin: { top: 4, left: 18, right: 18, bottom: 6 }
  });
}

function notificationStackForState(state) {
  return notificationStack({
    id: 'workspace-notifications',
    items: state.notifications,
    placement: 'bottom-right',
    maxVisible: 2,
    toDismissMessage: (item) => ({ kind: 'dismissNotification', id: item.id })
  });
}

function notificationLayer(state, child) {
  const notifications = state === undefined || state.notifications.length === 0
    ? []
    : [notificationStackForState(state)];
  return overlay([child, ...notifications], { id: `${child.id ?? 'content'}-notifications` });
}

function navigationNodes() {
  return [
    {
      id: 'workspace',
      label: 'Workspace',
      expanded: true,
      children: [
        { id: 'queue:triage', label: 'Triage', description: 'Open triage queue' },
        { id: 'queue:review', label: 'Review', description: 'Items under review' },
        { id: 'queue:done', label: 'Done', description: 'Completed items' }
      ]
    },
    {
      id: 'team',
      label: 'Team',
      expanded: true,
      children: [
        { id: 'team:ops', label: 'Ops' },
        { id: 'team:design', label: 'Design' }
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
  return rows[Math.min(state.table.selectedRow ?? 0, Math.max(0, rows.length - 1))] ?? tickets[0];
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
    ...paletteReducer(state, action)
  };
}

function notificationPatch(state, title, message, tone) {
  return {
    nextNotificationId: state.nextNotificationId + 1,
    notifications: [
      ...state.notifications,
      {
        id: `notice-${String(state.nextNotificationId)}`,
        title,
        message,
        tone
      }
    ]
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

function commandBarExpanded(state) {
  return state.command.input.text.length > 0 || state.command.selectedSuggestion !== undefined;
}

function commandRowCount(state) {
  return commandBarExpanded(state) ? 6 : 3;
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

const nodeOrder = Object.freeze(['workspace', 'queue:triage', 'queue:review', 'queue:done', 'team', 'team:ops', 'team:design']);

function nextNodeId(current) {
  return nodeOrder[wrapIndex(nodeOrder.indexOf(current ?? 'workspace') + 1, nodeOrder.length)] ?? 'workspace';
}

function previousNodeId(current) {
  return nodeOrder[wrapIndex(nodeOrder.indexOf(current ?? 'workspace') - 1, nodeOrder.length)] ?? 'workspace';
}

const tabOrder = Object.freeze(['issues', 'activity', 'notes']);

function nextTab(tab) {
  return tabOrder[wrapIndex(tabOrder.indexOf(tab) + 1, tabOrder.length)] ?? 'issues';
}

function previousTab(tab) {
  return tabOrder[wrapIndex(tabOrder.indexOf(tab) - 1, tabOrder.length)] ?? 'issues';
}

function wrapIndex(index, count) {
  if (count <= 0) return 0;
  return ((index % count) + count) % count;
}

export async function runScriptedWorkspace() {
  const host = createMemoryTerminalHost({ viewport: { columns: 112, rows: 32 } });
  const runtime = createTuiRuntime({ app: interactiveWorkspaceApp, host, initialFocusPath: commandFocusPath });
  try {
    await runtime.start();
    await runtime.handleInput({ kind: 'text', text: '/palette' });
    await runtime.handleInput(keyEvent('enter'));
    await runtime.handleInput({ kind: 'text', text: 'resolve' });
    const keyboardPaletteQuery = runtime.getState().palette.query;
    await runtime.handleInput(keyEvent('enter'));
    await runtime.handleInput({ kind: 'text', text: '/issues' });
    const commandAfterPaletteAccept = runtime.getState().command.input.text;
    await runtime.handleInput(keyEvent('enter'));

    const treeTarget = targetById(runtime, 'workspace-tree:queue:review:body');
    await click(runtime, treeTarget);
    const tableHitTargets = runtime.frame()?.hitTargets?.filter((target) => target.id.startsWith('ticket-table')).length ?? 0;
    const tableTarget = targetByPrefix(runtime, 'ticket-table:row:0');
    await click(runtime, tableTarget);
    await runtime.dispatch({ kind: 'scriptSetup' });
    const paletteTarget = targetByPrefix(runtime, 'workspace-palette:resolve-ticket');
    await click(runtime, paletteTarget);

    const frame = runtime.frame();
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
      keyboardPaletteQuery,
      commandAfterPaletteAccept,
      tableHitTargets,
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

function keyEvent(key) {
  return {
    kind: 'key',
    key,
    sequence: '',
    modifiers: { shift: false, alt: false, ctrl: false }
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
