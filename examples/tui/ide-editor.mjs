import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
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
  createNotificationState,
  notificationActionFromStack,
  notificationPresentation,
  notificationReducer,
  createScrollState,
  menuBarPresentation,
  menuBarReducer,
  palettePresentation,
  paletteReducer,
  scrollReducer,
  selectedPaletteEntry,
  tableReducer,
  textAreaPresentation,
  textAreaReducer,
  textInputPresentation,
  textInputReducer,
  treeScrollablePresentation,
  treeReducer,
  visibleTreeRows
} from '@ismail-elkorchi/terminal-ui/behavior';
import { renderFramePlain } from '@ismail-elkorchi/terminal-ui/renderer';
import {
  grid,
  overlay,
  row,
  column,
  surface,
  viewport
} from '@ismail-elkorchi/terminal-ui/layout';
import {
  statusIndicator,
  button,
  commandInput,
  dialog,
  helpBar,
  menuBar,
  notificationStack,
  palette,
  progressBar,
  statusBar,
  structuredBlock,
  table,
  tabs,
  text,
  textArea,
  textInput,
  tree
} from '@ismail-elkorchi/terminal-ui/components';

const MAX_FILE_BYTES = 256_000;

const commandEntries = Object.freeze([
  {
    id: 'open-path',
    label: 'Open path',
    value: '/open ',
    group: 'File',
    keywords: ['folder', 'file', 'workspace'],
    preview: 'Open a file or folder path relative to the current workspace.'
  },
  {
    id: 'open-folder',
    label: 'Open folder',
    value: '/folder ',
    group: 'File',
    keywords: ['workspace', 'directory'],
    preview: 'Replace the workspace root with a directory.'
  },
  {
    id: 'open-file',
    label: 'Open file',
    value: '/file ',
    group: 'File',
    keywords: ['buffer', 'editor'],
    preview: 'Open a UTF-8 text file in the editor.'
  },
  {
    id: 'save',
    label: 'Save active file',
    value: '/save',
    group: 'File',
    keywords: ['write', 'persist'],
    preview: 'Write the active buffer to disk.'
  },
  {
    id: 'close-buffer',
    label: 'Close active buffer',
    value: '/close',
    group: 'File',
    keywords: ['tab', 'buffer'],
    preview: 'Close the active editor tab.'
  },
  {
    id: 'command-palette',
    label: 'Open command palette',
    value: '/palette',
    group: 'Command',
    keywords: ['commands', 'actions'],
    preview: 'Open this command palette.'
  }
]);

const commandSuggestions = Object.freeze(commandEntries.map((entry) => ({
  value: entry.value,
  label: entry.value,
  description: entry.label
})));

const commandFocusPath = Object.freeze(['ide-root', 'ide-grid', 'ide-command-surface', 'ide-command']);

export const ideEditorApp = defineIdeEditorApp();

export function defineIdeEditorApp(options = {}) {
  const defaultRoot = path.resolve(options.defaultRoot ?? process.cwd());
  return defineTui({
    id: 'ide-editor',
    init: () => initialState(defaultRoot),
    keyBindings: [
      {
        id: 'exit',
        triggers: [{ kind: 'key', key: 'ctrlQ' }],
        label: 'Exit',
        message: { kind: 'exit' }
      },
      {
        id: 'escape-palette',
        triggers: [{ kind: 'key', key: 'escape' }],
        phase: 'beforeFocus',
        enabled: ({ state }) => state.palette.open,
        message: { kind: 'closePalette' }
      },
      {
        id: 'escape-chooser',
        triggers: [{ kind: 'key', key: 'escape' }],
        phase: 'beforeFocus',
        enabled: ({ state }) => state.chooser.kind === 'open',
        message: { kind: 'closeChooser' }
      }
    ],
    update: updateIde,
    view: ideView,
    nonTty: { mode: 'last_frame' }
  });
}

function initialState(rootPath) {
  const workspace = loadWorkspace(rootPath);
  return {
    rootPath: workspace.rootPath,
    tree: {
      nodes: workspace.nodes,
      selected: workspace.nodes[0]?.id,
      scroll: createScrollState({ contentRows: visibleTreeRows(workspace.nodes).length })
    },
    treeOmitted: workspace.omitted,
    buffers: {},
    openOrder: [],
    activePath: undefined,
    command: {
      input: { text: '', cursor: 0 },
      history: [],
      suggestions: commandSuggestions
    },
    palette: { open: false, query: '', selectedIndex: 0, used: false },
    menu: { kind: 'closed', active: 'file' },
    chooser: { kind: 'closed' },
    notifications: createNotificationState(),
    nextNotificationId: 1,
    logScroll: createScrollState({ contentRows: 2 }),
    log: [
      `Workspace opened: ${workspace.rootPath}`,
      'Use /open <path>, click a file in the tree, edit text, then use File Save or /save.'
    ],
    ticks: 0,
    pointer: { tree: false, menu: false, bufferTable: false }
  };
}

function updateIde(state, message) {
  switch (message.kind) {
    case 'tick':
      return withState({ ...state, ticks: state.ticks + 1 });
    case 'menuAction':
      return message.action.kind === 'menu'
          && message.action.action.kind === 'activate'
          && message.action.action.id === 'file.quit'
        ? { state, exit: { reason: 'user requested exit from menu' } }
        : withState(handleMenuAction(state, message.action));
    case 'chooserEdit':
      return withState(updateChooserInput(state, message.action));
    case 'chooserTree':
      return withState(updateChooserTree(state, message.action));
    case 'confirmChooser':
      return withState(confirmChooser(state));
    case 'closeChooser':
      return withState({ ...state, chooser: { kind: 'closed' } });
    case 'tree':
      return withState(handleTreeAction(state, message.action));
    case 'bufferTable':
      return withState(handleBufferTableAction(state, message.action));
    case 'logScroll':
      return withState({
        ...state,
        logScroll: applyScrollEvent(state.logScroll, message.event)
      });
    case 'setActiveBuffer':
      return withState(setActiveBuffer({ ...state, pointer: { ...state.pointer, bufferTable: message.source === 'pointer' || state.pointer.bufferTable } }, message.path));
    case 'closeActive':
      return withState(closeActiveBuffer(state));
    case 'closeBuffer':
      return withState(closeBuffer(state, message.path));
    case 'saveActive':
      return withState(saveActiveBuffer(state, message.source));
    case 'editActive':
      return withState(editActiveBuffer(state, message.action));
    case 'commandEdit':
      return withState({ ...state, command: commandInputReducer(state.command, message.action) });
    case 'submitCommand':
      return withState(applyCommand(state, state.command.input.text));
    case 'openPalette':
      return withState({
        ...state,
        pointer: { ...state.pointer, menu: message.source === 'menu' || state.pointer.menu },
        palette: { ...state.palette, open: true, query: '', selectedIndex: 0 }
      });
    case 'closePalette':
      return withState({ ...state, palette: { ...state.palette, open: false, query: '', selectedIndex: 0 } });
    case 'paletteEdit':
      return withState({
        ...state,
        palette: {
          ...state.palette,
          ...paletteReducer(state.palette, message.action, { entries: commandEntries })
        }
      });
    case 'paletteAcceptSelected': {
      const selected = selectedPaletteEntry({ entries: commandEntries, state: state.palette, limit: 7 });
      return withState(selected === undefined ? state : applyCommand(markPaletteUsed(state), selected.value));
    }
    case 'paletteAccept':
      return withState(applyCommand(markPaletteUsed(state), message.command));
    case 'notification':
      return withState({
        ...state,
        notifications: notificationReducer(
          state.notifications,
          notificationActionFromStack(message.action, Date.now()),
          { maxVisible: 3 }
        )
      });
    case 'exit':
      return { state, exit: { reason: 'user requested exit' } };
  }
  throw new Error(`Unsupported IDE message: ${String(message?.kind)}`);
}

function withState(state) {
  return { state };
}

function ideView(state, context) {
  const workspace = context.viewport.columns >= 108 ? wideIdeView(state, context) : narrowIdeView(state, context);
  return overlay([
    workspace,
    ...(state.chooser.kind === 'open' ? [chooserDialog(state)] : []),
    ...(state.palette.open ? [paletteOverlay(state)] : []),
  ], { id: 'ide-root' });
}

function wideIdeView(state, context) {
  const commandRows = commandRowCount(state);
  return grid({
    id: 'ide-grid',
    areas: `
      top top top
      explorer editor inspector
      status status status
      command command command
    `,
    rows: [
      { kind: 'fixed', cells: 1 },
      { kind: 'fill' },
      { kind: 'fixed', cells: 1 },
      { kind: 'fixed', cells: commandRows }
    ],
    columns: [{ kind: 'fixed', cells: 31 }, { kind: 'fill' }, { kind: 'fixed', cells: 38 }],
    gap: 1,
    children: {
      top: topChrome(state),
      explorer: explorerPane(state),
      editor: editorWorkspace(state),
      inspector: inspectorPane(state, context),
      status: bottomStatus(state),
      command: commandPane(state)
    }
  });
}

function narrowIdeView(state, _context) {
  const commandRows = commandRowCount(state);
  return grid({
    id: 'ide-grid',
    areas: `
      top
      editor
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
      top: topChrome(state),
      editor: editorWorkspace(state),
      status: bottomStatus(state),
      command: commandPane(state)
    }
  });
}

function topChrome(state) {
  const items = ideMenuItems(state);
  return surface(menuBar({
    id: 'ide-menu',
    items,
    presentation: menuBarPresentation(items, state.menu),
    onAction: (action) => ({ kind: 'menuAction', action })
  }), {
    id: 'ide-top',
    variant: 'chrome',
    padding: { left: 1, right: 1 }
  });
}

function bottomStatus(state) {
  const active = activeBuffer(state);
  const position = active === undefined ? undefined : textPosition(active.text, active.cursor);
  const selectionLength = active?.selection === undefined
    ? 0
    : Math.abs(active.selection.end - active.selection.start);
  return statusBar({
    id: 'ide-status',
    leading: [
      { id: 'workspace', kind: 'text', text: path.basename(state.rootPath) || state.rootPath },
      { id: 'buffer', kind: 'status', text: active?.label ?? 'No file', status: active?.dirty === true ? 'warning' : 'success' }
    ],
    center: [
      { id: 'position', kind: 'text', text: position === undefined ? 'Ln -, Col -' : `Ln ${String(position.line)}, Col ${String(position.column)}` },
      { id: 'selection', kind: 'text', text: selectionLength === 0 ? 'No selection' : `${String(selectionLength)} selected` }
    ],
    trailing: [
      { id: 'encoding', kind: 'text', text: 'UTF-8' },
      { id: 'newline', kind: 'text', text: active?.text.includes('\r\n') === true ? 'CRLF' : 'LF' },
      { id: 'mode', kind: 'text', text: active === undefined ? 'BROWSE' : 'INSERT' }
    ]
  });
}

function notificationStackWidget(state) {
  const presentation = notificationPresentation(state.notifications, { mode: 'live', now: Date.now() });
  return notificationStack({
    id: 'ide-notifications',
    presentation,
    placement: 'bottom-right',
    maxWidth: 36,
    onDismiss: (id) => ({ kind: 'notification', action: { kind: 'dismiss', id } })
  });
}

function explorerPane(state) {
  return surface(column([
    text('Explorer', { id: 'explorer-title', textRole: 'heading' }),
    text(shortPath(state.rootPath, state.rootPath), { id: 'explorer-root', textRole: 'metadata' }),
    tree({
      id: 'ide-tree',
      ...treeScrollablePresentation(state.tree),
      scrollbar: { visible: 'auto' },
      onAction: (action) => ({ kind: 'tree', action })
    }),
    helpBar({
      id: 'explorer-help',
      groups: [{
        id: 'explorer',
        bindings: [
          { key: 'click', label: 'select/open file' },
          { key: 'disclosure', label: 'toggle folder' },
          { key: 'enter', label: 'open/toggle' },
          { key: 'left/right', label: 'collapse/expand' },
          { key: 'up/down', label: 'move' }
        ]
      }]
    })
  ], {
    id: 'explorer-body',
    gap: 1,
    sizes: [
      { kind: 'fixed', cells: 1 },
      { kind: 'fixed', cells: 1 },
      { kind: 'fill' },
      { kind: 'fixed', cells: 2 }
    ]
  }), {
    id: 'explorer-pane',
    label: 'Workspace',
    variant: 'inset',
    padding: 1
  });
}

function editorWorkspace(state) {
  const openBuffers = state.openOrder.map((filePath) => state.buffers[filePath]).filter(Boolean);
  if (openBuffers.length === 0) {
    return surface(notificationLayer(state, welcomePanel(state)), {
      id: 'empty-editor-surface',
      label: 'Editor',
      variant: 'neutral',
      padding: 1
    });
  }
  return tabs({
    id: 'ide-tabs',
    selected: state.activePath,
    tabs: openBuffers.map((buffer) => ({
      id: buffer.path,
      label: buffer.label,
      ...(buffer.dirty ? { badge: '*' } : {}),
      closable: true,
      description: buffer.path,
      panel: editorPanel(state, buffer)
    })),
    onAction: (action) => ideTabActionMessage(state, action)
  });
}

function ideTabActionMessage(state, action) {
  if (action.kind === 'close') return { kind: 'closeBuffer', path: action.id };
  if (action.kind === 'select') return { kind: 'setActiveBuffer', path: action.id, source: 'tab' };
  if (action.kind === 'first') return { kind: 'setActiveBuffer', path: state.openOrder[0], source: 'keyboard' };
  if (action.kind === 'last') return { kind: 'setActiveBuffer', path: state.openOrder.at(-1), source: 'keyboard' };
  return { kind: 'setActiveBuffer', path: adjacentBufferPath(state, action.delta), source: 'keyboard' };
}

function welcomePanel(state) {
  return column([
    text('Open a folder or file to start editing.', { id: 'welcome-title', textRole: 'heading' }),
    text('/open <path> opens files and folders relative to the current workspace.', { id: 'welcome-open' }),
    text('/save persists the active text buffer. File-tree clicks open text files.', { id: 'welcome-save' }),
    structuredBlock({
      id: 'welcome-workspace',
      title: 'Current workspace',
      summary: state.rootPath,
      fields: [
        { label: 'Tree nodes', value: String(visibleTreeRows(state.tree.nodes).length) },
        { label: 'Omitted', value: String(state.treeOmitted) }
      ]
    })
  ], {
    id: 'welcome-body',
    gap: 1,
    sizes: [
      { kind: 'fixed', cells: 1 },
      { kind: 'fixed', cells: 1 },
      { kind: 'fixed', cells: 1 },
      { kind: 'content', max: 6 }
    ]
  });
}

function editorPanel(state, buffer) {
  return surface(grid({
    id: 'editor-panel-grid',
    areas: `
      meta
      editor
      footer
    `,
    rows: [{ kind: 'fixed', cells: 2 }, { kind: 'fill' }, { kind: 'fixed', cells: 2 }],
    columns: [{ kind: 'fill' }],
    children: {
      meta: row([
        statusIndicator({
          id: 'editor-state',
          label: buffer.dirty ? 'modified' : 'saved',
          status: buffer.dirty ? 'running' : 'success'
        }),
        progressBar({
          id: 'editor-size',
          label: 'size',
          value: Math.min(buffer.text.length, MAX_FILE_BYTES),
          max: MAX_FILE_BYTES,
          display: 'bar+percent'
        })
      ], { id: 'editor-meta', gap: 2 }),
      editor: notificationLayer(state, textArea({
        id: 'ide-editor-text',
        presentation: textAreaPresentation({
          input: {
            text: buffer.text,
            cursor: buffer.cursor,
            ...(buffer.selection === undefined ? {} : { selection: buffer.selection })
          },
          scroll: buffer.scroll
        }),
        lineNumbers: { minWidth: 3 },
        activeLine: true,
        scrollbar: { visible: 'auto' },
        scrollPolicy: { wheel: { rows: 6, columns: 8 } },
        placeholder: 'Write here...',
        onAction: (action) => ({ kind: 'editActive', action })
      })),
      footer: helpBar({
        id: 'editor-help',
        groups: [
          { id: 'editing', bindings: [{ key: 'text', label: 'edit' }, { key: 'File Save', label: 'write file' }] },
          { id: 'navigation', bindings: [{ key: '/close', label: 'close tab' }, { key: 'Tab', label: 'move focus' }] }
        ]
      })
    }
  }), {
    id: 'editor-surface',
    label: `${buffer.label}${buffer.dirty ? ' modified' : ''}`,
    variant: 'neutral',
    padding: 1
  });
}

function notificationLayer(state, child) {
  const notifications = state.notifications.active.length === 0
    ? []
    : [notificationStackWidget(state)];
  return overlay([child, ...notifications], { id: `${child.id ?? 'content'}-notifications` });
}

function inspectorPane(state, context) {
  const active = activeBuffer(state);
  const diagnosticItem = hostInputDiagnostic(context.diagnostics);
  const bufferRows = state.openOrder.map((filePath) => {
    const buffer = state.buffers[filePath];
    return {
      path: filePath,
      dirty: buffer?.dirty === true,
      label: buffer?.label ?? path.basename(filePath),
      size: buffer === undefined ? 'missing' : `${String(lineCount(buffer.text))} lines`
    };
  });
  return surface(column([
    structuredBlock({
      id: 'file-inspector',
      title: active?.label ?? 'No file selected',
      status: diagnosticItem === undefined ? active === undefined ? 'pending' : active.dirty ? 'warning' : 'success' : 'warning',
      summary: active?.label ?? 'Open a file from the tree or command bar.',
      fields: [
        { label: 'Workspace', value: shortPath(state.rootPath, state.rootPath) },
        { label: 'Dirty buffers', value: String(dirtyBuffers(state).length) },
        { label: 'Tree omitted', value: String(state.treeOmitted) },
        { label: 'Lines', value: active === undefined ? '-' : String(lineCount(active.text)) },
        { label: 'Size', value: active === undefined ? '-' : `${String(active.text.length)} chars` },
        ...(diagnosticItem === undefined ? [] : [{ label: 'Host input', value: diagnosticLabel(diagnosticItem) }])
      ],
      body: diagnosticItem?.message ?? latestLogLine(state)
    }),
    table({
      getRowId: (row) => row.path,
      id: 'buffer-table',
      rows: bufferRows,
      presentation: { selectedRowId: state.activePath },
      emptyText: 'No open buffers',
      stickyHeader: true,
      columns: [
        {
          id: 'column-0', value: (row) => row.dirty ? '*' : ' ', header: '', width: { kind: 'fixed', cells: 2 } },
        {
          id: 'buffer-1', value: (row) => row.label, header: 'Buffer', width: { kind: 'fill' } },
        {
          id: 'size-2', value: (row) => row.size, header: 'Size', width: { kind: 'fixed', cells: 10 } }
      ],
      onAction: (action) => ({ kind: 'bufferTable', action })
    }),
    viewport(column(state.log.map((line, index) => text(`${String(index + 1).padStart(2, '0')} ${line}`, {
      id: `ide-log-${String(index)}`
    })), { id: 'ide-log-lines', gap: 0 }), {
      id: 'ide-log',
      scrollRow: state.logScroll.offsetRow,
      scrollColumn: state.logScroll.offsetColumn,
      contentRows: state.log.length,
      contentColumns: maxLineCells(state.log.join('\n')) + 3,
      onScroll: (event) => ({ kind: 'logScroll', event }),
      scrollbar: { visible: 'auto' }
    })
  ], {
    id: 'inspector-body',
    gap: 1,
    sizes: [
      { kind: 'content', max: 9 },
      { kind: 'content', max: 7 },
      { kind: 'fill' }
    ]
  }), {
    id: 'inspector-pane',
    label: 'Context',
    variant: 'inset',
    padding: 1
  });
}

function handleBufferTableAction(state, action) {
  const nextPath = action.kind === 'activate'
    ? action.rowId
    : tableReducer(
        { selectedRowId: state.activePath },
        action,
        { rows: state.openOrder, getRowId: (filePath) => filePath, columnCount: 3 }
      ).selectedRowId;
  if (nextPath === undefined || state.buffers[nextPath] === undefined) return state;
  const source = action.kind === 'selectRow' || action.kind === 'selectCell' ? 'pointer' : 'keyboard';
  return setActiveBuffer({
    ...state,
    pointer: { ...state.pointer, bufferTable: source === 'pointer' || state.pointer.bufferTable }
  }, nextPath);
}

function hostInputDiagnostic(diagnostics) {
  return diagnostics.find((item) =>
    (item.code === 'HOST_PROTOCOL_SKIPPED' || item.code === 'HOST_PROTOCOL_UNSUPPORTED')
    && (item.data?.operation === 'mouseReporting' || item.data?.operation === 'focusReporting' || item.data?.operation === 'bracketedPaste')
  );
}

function diagnosticLabel(item) {
  const operation = typeof item.data?.operation === 'string' ? item.data.operation : 'protocol';
  const target = typeof item.data?.target === 'string' ? item.data.target : item.target ?? item.code;
  return `${operation}:${target}`;
}

function commandPane(state) {
  const expanded = commandInputExpanded(state);
  const presentation = commandInputPresentation(state.command);
  return surface(commandInput({
    id: 'ide-command',
    prompt: '› ',
    presentation: {
      ...presentation,
      suggestions: expanded ? presentation.suggestions : []
    },
    placeholder: 'Type /open, /folder, /save, /palette',
    completionPreview: expanded ? completionPreview(state.command.input.text) : undefined,
    footer: expanded ? 'Enter run | arrows suggestions | Esc clear | Tab focus | Ctrl+Q exit' : undefined,
    display: expanded ? 'expanded' : 'compact',
    onAction: (action) => ({ kind: 'commandEdit', action }),
    onSubmit: { kind: 'submitCommand' },
    keys: {
      arrowUp: () => ({ kind: 'commandEdit', action: { kind: 'moveSuggestion', delta: -1 } }),
      arrowDown: () => ({ kind: 'commandEdit', action: { kind: 'moveSuggestion', delta: 1 } }),
      escape: () => ({ kind: 'commandEdit', action: { kind: 'setValue', value: '' } })
    }
  }), {
    id: 'ide-command-surface',
    label: 'Command',
    variant: 'inset',
    padding: { left: 1, right: 1 }
  });
}

function paletteOverlay(state) {
  return surface(palette({
    id: 'ide-palette',
    title: 'Editor commands',
    entries: commandEntries,
    ...palettePresentation(state.palette),
    maxVisible: 7,
    helpText: 'Type to filter. Enter accepts. Esc closes.',
    onSelect: (entry) => ({ kind: 'paletteAccept', command: entry.value }),
    onAction: (action) => ({ kind: 'paletteEdit', action }),
    keys: {
      enter: () => ({ kind: 'paletteAcceptSelected' }),
      escape: () => ({ kind: 'closePalette' })
    }
  }), {
    id: 'ide-palette-surface',
    label: 'Command palette',
    variant: 'raised',
    shadow: true,
    padding: 1,
    margin: { top: 4, left: 20, right: 20, bottom: 6 },
    meta: {
      layer: { zIndex: 20 },
      focus: { scope: { kind: 'contain' } }
    }
  });
}

function chooserDialog(state) {
  const chooser = state.chooser;
  if (chooser.kind !== 'open') throw new Error('Chooser dialog requires open chooser state.');
  const title = chooser.mode === 'folder' ? 'Open Folder' : 'Open File';
  return dialog(column([
    textInput({
      id: 'ide-chooser-path',
      presentation: textInputPresentation(chooser.input),
      placeholder: chooser.mode === 'folder' ? 'Directory path' : 'File path',
      error: chooser.error,
      onAction: (action) => ({ kind: 'chooserEdit', action }),
      onSubmit: { kind: 'confirmChooser' }
    }),
    tree({
      id: 'ide-chooser-tree',
      ...treeScrollablePresentation(chooser.tree),
      scrollbar: { visible: 'auto' },
      onAction: (action) => ({ kind: 'chooserTree', action })
    }),
    text(
      chooser.mode === 'folder'
        ? 'Select a folder or type a directory path.'
        : 'Select a file or type a file path.',
      { id: 'ide-chooser-help', textRole: 'metadata' }
    )
  ], {
    id: 'ide-chooser-body',
    gap: 1,
    sizes: [{ kind: 'fixed', cells: chooser.error === undefined ? 1 : 2 }, { kind: 'fill' }, { kind: 'fixed', cells: 1 }]
  }), {
    id: 'ide-chooser',
    title,
    width: 76,
    height: 24,
    modal: true,
    focusPolicy: { initialTargetId: 'ide-chooser-path', returnFocus: 'restore' },
    dismissal: {
      escape: true,
      outsidePress: true,
      onDismiss: () => ({ kind: 'closeChooser' })
    },
    actions: row([
      button({ id: 'ide-chooser-cancel', label: 'Cancel', onPress: { kind: 'closeChooser' } }),
      button({ id: 'ide-chooser-confirm', label: title, tone: 'primary', onPress: { kind: 'confirmChooser' } })
    ], { id: 'ide-chooser-actions', gap: 1, justify: 'end' })
  });
}

function ideMenuItems(state) {
  const active = activeBuffer(state);
  return [
    {
      id: 'file',
      label: 'File',
      children: [
        { id: 'file.openFolder', label: 'Open Folder...', shortcut: 'Ctrl+O' },
        { id: 'file.openFile', label: 'Open File...' },
        { id: 'file.save', label: 'Save', shortcut: 'Ctrl+S', disabled: active === undefined || active.dirty !== true },
        { id: 'file.close', label: 'Close Editor', disabled: active === undefined },
        { id: 'file.quit', label: 'Quit', shortcut: 'Ctrl+Q' }
      ]
    },
    {
      id: 'edit',
      label: 'Edit',
      children: [
        { id: 'edit.selectAll', label: 'Select All', disabled: active === undefined },
        { id: 'edit.clearSelection', label: 'Clear Selection', disabled: active?.selection === undefined }
      ]
    },
    {
      id: 'view',
      label: 'View',
      children: [{ id: 'view.palette', label: 'Command Palette...', shortcut: 'Ctrl+P' }]
    },
    {
      id: 'help',
      label: 'Help',
      children: [{ id: 'help.about', label: 'About This Example' }]
    }
  ];
}

function handleMenuAction(state, action) {
  const items = ideMenuItems(state);
  const nextState = {
    ...state,
    menu: menuBarReducer(state.menu, action, items),
    pointer: {
      ...state.pointer,
      menu: action.kind === 'focusHeading' || action.kind === 'activateHeading' || state.pointer.menu
    }
  };
  if (action.kind !== 'menu' || action.action.kind !== 'activate') return nextState;
  switch (action.action.id) {
    case 'file.openFolder': return openChooser(nextState, 'folder');
    case 'file.openFile': return openChooser(nextState, 'file');
    case 'file.save': return saveActiveBuffer(nextState, 'menu');
    case 'file.close': return closeActiveBuffer(nextState);
    case 'file.quit': return nextState;
    case 'edit.selectAll': return selectAllActiveBuffer(nextState);
    case 'edit.clearSelection': return clearActiveSelection(nextState);
    case 'view.palette': return { ...nextState, palette: { ...nextState.palette, open: true, query: '', selectedIndex: 0 } };
    case 'help.about': return notifyState(nextState, 'Terminal UI IDE', 'A hand-written editor built from generic terminal-ui components.', 'info');
    default: return nextState;
  }
}

function openChooser(state, mode) {
  const workspace = loadWorkspace(state.rootPath);
  const input = state.rootPath;
  return {
    ...state,
    menu: { kind: 'closed', active: 'file' },
    chooser: {
      kind: 'open',
      mode,
      rootPath: workspace.rootPath,
      input: { text: input, cursor: input.length },
      omitted: workspace.omitted,
      tree: {
        nodes: workspace.nodes,
        selected: workspace.nodes[0]?.id,
        scroll: createScrollState({ contentRows: visibleTreeRows(workspace.nodes).length })
      }
    }
  };
}

function updateChooserInput(state, action) {
  if (state.chooser.kind !== 'open') return state;
  return {
    ...state,
    chooser: {
      ...state.chooser,
      input: textInputReducer(state.chooser.input, action),
      error: undefined
    }
  };
}

function updateChooserTree(state, action) {
  if (state.chooser.kind !== 'open') return state;
  const selectedNode = action.id === undefined ? undefined : findTreeNode(state.chooser.tree.nodes, action.id);
  let tree = treeReducer(state.chooser.tree, action);
  let omitted = state.chooser.omitted;
  if (
    (action.kind === 'toggle' || action.kind === 'expand')
    && selectedNode?.metadata?.kind === 'directory'
    && typeof selectedNode.metadata.path === 'string'
    && (selectedNode.children === undefined || selectedNode.lazy === true)
  ) {
    const loaded = directoryChildren(state.chooser.rootPath, selectedNode.metadata.path);
    tree = treeReducer(tree, { kind: 'lazySuccess', id: selectedNode.id, children: loaded.nodes });
    omitted += loaded.omitted;
  }
  const selectedPath = selectedNode?.metadata?.kind === 'file' || selectedNode?.metadata?.kind === 'directory'
    ? selectedNode.metadata.path
    : undefined;
  const nextState = {
    ...state,
    chooser: {
      ...state.chooser,
      tree,
      omitted,
      ...(typeof selectedPath !== 'string'
        ? {}
        : { input: { text: selectedPath, cursor: selectedPath.length }, error: undefined })
    }
  };
  return action.kind === 'activate' && typeof selectedPath === 'string'
    ? confirmChooser(nextState)
    : nextState;
}

function confirmChooser(state) {
  if (state.chooser.kind !== 'open') return state;
  const target = resolveUserPath(state.chooser.rootPath, state.chooser.input.text);
  try {
    const stat = fs.statSync(target);
    const valid = state.chooser.mode === 'folder' ? stat.isDirectory() : stat.isFile();
    if (!valid) {
      return {
        ...state,
        chooser: {
          ...state.chooser,
          error: state.chooser.mode === 'folder' ? 'Choose a directory.' : 'Choose a file.'
        }
      };
    }
    const closed = { ...state, chooser: { kind: 'closed' } };
    return state.chooser.mode === 'folder'
      ? openFolder(closed, target, 'chooser')
      : openFile(closed, target, 'chooser');
  } catch (error) {
    return { ...state, chooser: { ...state.chooser, error: errorMessage(error) } };
  }
}

function handleTreeAction(state, action) {
  if (action.kind === 'select') {
    const node = action.id === undefined ? undefined : findTreeNode(state.tree.nodes, action.id);
    const selectedState = {
      ...state,
      tree: treeReducer(state.tree, action),
      pointer: { ...state.pointer, tree: true }
    };
    if (node?.metadata?.kind === 'file' && typeof node.metadata.path === 'string') {
      return openFile(selectedState, node.metadata.path, 'pointer');
    }
    return {
      ...selectedState,
      log: appendLog(selectedState, `Selected ${node?.label ?? action.id ?? 'no tree item'}.`)
    };
  }
  if (action.kind === 'activate') return activateTreeNode(state, action.id);
  if (action.kind === 'toggle' || action.kind === 'expand' || action.kind === 'collapse') {
    const node = findTreeNode(state.tree.nodes, action.id);
    if (node?.metadata?.kind !== 'directory' || typeof node.metadata.path !== 'string') {
      return { ...state, tree: treeReducer(state.tree, action) };
    }
    if (action.kind === 'collapse' || (action.kind === 'toggle' && node.expanded === true)) {
      return collapseDirectoryNode(state, node, action.kind === 'toggle' ? 'pointer' : 'keyboard');
    }
    return expandDirectoryNode(state, node, action.kind === 'toggle' ? 'pointer' : 'keyboard');
  }
  return { ...state, tree: treeReducer(state.tree, action) };
}

function activateTreeNode(state, id) {
  const node = findTreeNode(state.tree.nodes, id);
  const selectedState = {
    ...state,
    tree: treeReducer(state.tree, { kind: 'select', id })
  };
  if (node?.metadata?.kind === 'directory' && typeof node.metadata.path === 'string') {
    return node.expanded === true
      ? collapseDirectoryNode(selectedState, node, 'keyboard')
      : expandDirectoryNode(selectedState, node, 'keyboard');
  }
  if (node?.metadata?.kind === 'file' && typeof node.metadata.path === 'string') {
    return openFile(selectedState, node.metadata.path, 'keyboard');
  }
  return selectedState;
}

function collapseDirectoryNode(state, node, source) {
  const selectedState = {
    ...state,
    tree: treeReducer(state.tree, { kind: 'collapse', id: node.id }),
    pointer: { ...state.pointer, tree: source === 'pointer' || state.pointer.tree }
  };
  return {
    ...selectedState,
    log: appendLog(selectedState, `Collapsed folder from ${source}: ${shortPath(state.rootPath, node.metadata.path)}`)
  };
}

function expandDirectoryNode(state, node, source) {
  if (node.metadata?.kind !== 'directory' || typeof node.metadata.path !== 'string') return state;
  if (node.children !== undefined && node.lazy !== true) {
    return {
      ...state,
      tree: treeReducer(state.tree, { kind: 'expand', id: node.id }),
      log: appendLog(state, `Expanded folder from ${source}: ${shortPath(state.rootPath, node.metadata.path)}`)
    };
  }
  try {
    const loaded = directoryChildren(state.rootPath, node.metadata.path);
    return {
      ...state,
      tree: treeReducer(state.tree, { kind: 'lazySuccess', id: node.id, children: loaded.nodes }),
      treeOmitted: state.treeOmitted + loaded.omitted,
      log: appendLog(state, `Loaded folder from ${source}: ${shortPath(state.rootPath, node.metadata.path)}`)
    };
  } catch (error) {
    return {
      ...state,
      tree: treeReducer(state.tree, { kind: 'lazyError', id: node.id, message: errorMessage(error) }),
      treeOmitted: state.treeOmitted + 1,
      ...notificationPatch(state, 'Folder load failed', errorMessage(error), 'error'),
      log: appendLog(state, `Folder load failed: ${errorMessage(error)}`)
    };
  }
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
  if (command.length === 0) return withHistory;
  if (command === '/palette') return { ...withHistory, palette: { ...withHistory.palette, open: true } };
  if (command === '/save') return saveActiveBuffer(withHistory, 'command');
  if (command === '/close') return closeActiveBuffer(withHistory);
  if (command.startsWith('/open ')) return openPath(withHistory, command.slice('/open '.length), 'command');
  if (command.startsWith('/folder ')) return openFolder(withHistory, resolveUserPath(withHistory.rootPath, command.slice('/folder '.length)), 'command');
  if (command.startsWith('/file ')) return openFile(withHistory, resolveUserPath(withHistory.rootPath, command.slice('/file '.length)), 'command');
  return {
    ...withHistory,
    ...notificationPatch(withHistory, 'Unknown command', command, 'warning'),
    log: appendLog(withHistory, `Unknown command ignored: ${command}`)
  };
}

function openPath(state, input, source) {
  const target = resolveUserPath(state.rootPath, input);
  try {
    const stat = fs.statSync(target);
    if (stat.isDirectory()) return openFolder(state, target, source);
    if (stat.isFile()) return openFile(state, target, source);
    return notifyState(state, 'Unsupported path', target, 'warning');
  } catch (error) {
    return notifyState(state, 'Open failed', errorMessage(error), 'error');
  }
}

function openFolder(state, folderPath, source) {
  try {
    const workspace = loadWorkspace(folderPath);
    return {
      ...state,
      rootPath: workspace.rootPath,
      tree: {
        nodes: workspace.nodes,
        selected: workspace.nodes[0]?.id,
        scroll: createScrollState({ contentRows: visibleTreeRows(workspace.nodes).length })
      },
      treeOmitted: workspace.omitted,
      ...notificationPatch(state, 'Folder opened', workspace.rootPath, 'success'),
      log: appendLog(state, `Opened folder from ${source}: ${workspace.rootPath}`)
    };
  } catch (error) {
    return notifyState(state, 'Open folder failed', errorMessage(error), 'error');
  }
}

function openFile(state, filePath, source) {
  const absolutePath = path.resolve(filePath);
  try {
    const stat = fs.statSync(absolutePath);
    if (!stat.isFile()) return notifyState(state, 'Not a file', absolutePath, 'warning');
    if (stat.size > MAX_FILE_BYTES) return notifyState(state, 'File too large', `${absolutePath} is ${String(stat.size)} bytes`, 'warning');
    const bytes = fs.readFileSync(absolutePath);
    if (isProbablyBinary(bytes)) return notifyState(state, 'Binary file skipped', absolutePath, 'warning');
    const textValue = bytes.toString('utf8');
    const existing = state.buffers[absolutePath];
    const buffer = existing ?? {
      path: absolutePath,
      label: shortPath(state.rootPath, absolutePath),
      text: textValue,
      cursor: 0,
      selection: undefined,
      scroll: textScrollState(textValue),
      dirty: false,
      savedSha: contentFingerprint(textValue)
    };
    const openOrder = state.openOrder.includes(absolutePath) ? state.openOrder : [...state.openOrder, absolutePath];
    return {
      ...state,
      buffers: { ...state.buffers, [absolutePath]: buffer },
      openOrder,
      activePath: absolutePath,
      ...notificationPatch(state, 'File opened', buffer.label, 'success'),
      log: appendLog(state, `Opened file from ${source}: ${buffer.label}`)
    };
  } catch (error) {
    return notifyState(state, 'Open file failed', errorMessage(error), 'error');
  }
}

function editActiveBuffer(state, action) {
  const active = activeBuffer(state);
  if (active === undefined) return state;
  const next = textAreaReducer({
    input: {
      text: active.text,
      cursor: active.cursor,
      ...(active.selection === undefined ? {} : { selection: active.selection })
    },
    scroll: active.scroll
  }, action);
  const changed = next.input.text !== active.text
    || next.input.cursor !== active.cursor
    || next.scroll !== active.scroll
    || !sameSelection(next.input.selection, active.selection);
  if (!changed) return state;
  const updated = {
    ...active,
    text: next.input.text,
    cursor: next.input.cursor,
    scroll: scrollReducer(next.scroll, {
      kind: 'setContent',
      rows: lineCount(next.input.text),
      columns: maxLineCells(next.input.text)
    }),
    ...(next.input.selection === undefined ? { selection: undefined } : { selection: next.input.selection }),
    dirty: contentFingerprint(next.input.text) !== active.savedSha
  };
  return {
    ...state,
    buffers: { ...state.buffers, [active.path]: updated }
  };
}

function selectAllActiveBuffer(state) {
  const active = activeBuffer(state);
  if (active === undefined || active.text.length === 0) return state;
  return {
    ...state,
    buffers: {
      ...state.buffers,
      [active.path]: {
        ...active,
        cursor: active.text.length,
        selection: { start: 0, end: active.text.length }
      }
    }
  };
}

function clearActiveSelection(state) {
  const active = activeBuffer(state);
  if (active?.selection === undefined) return state;
  return {
    ...state,
    buffers: {
      ...state.buffers,
      [active.path]: { ...active, selection: undefined }
    }
  };
}

function saveActiveBuffer(state, source) {
  const active = activeBuffer(state);
  if (active === undefined) return notifyState(state, 'Nothing to save', 'Open or select a file first.', 'warning');
  try {
    fs.writeFileSync(active.path, active.text, 'utf8');
    const updated = { ...active, dirty: false, savedSha: contentFingerprint(active.text) };
    return {
      ...state,
      pointer: { ...state.pointer, menu: source === 'menu' || state.pointer.menu },
      buffers: { ...state.buffers, [active.path]: updated },
      ...notificationPatch(state, 'Saved', active.label, 'success'),
      log: appendLog(state, `Saved from ${source}: ${active.label}`)
    };
  } catch (error) {
    return notifyState(state, 'Save failed', errorMessage(error), 'error');
  }
}

function closeActiveBuffer(state) {
  const active = activeBuffer(state);
  return active === undefined ? state : closeBuffer(state, active.path);
}

function closeBuffer(state, filePath) {
  const buffer = state.buffers[filePath];
  if (buffer === undefined) return state;
  const remainingOrder = state.openOrder.filter((currentPath) => currentPath !== buffer.path);
  const { [buffer.path]: _closed, ...buffers } = state.buffers;
  return {
    ...state,
    buffers,
    openOrder: remainingOrder,
    activePath: state.activePath === buffer.path ? remainingOrder[0] : state.activePath,
    ...notificationPatch(state, 'Closed buffer', buffer.label, buffer.dirty ? 'warning' : 'info'),
    log: appendLog(state, `Closed buffer: ${buffer.label}`)
  };
}

function setActiveBuffer(state, filePath) {
  if (filePath.length === 0 || state.buffers[filePath] === undefined) return state;
  return {
    ...state,
    activePath: filePath,
    log: appendLog(state, `Selected buffer: ${state.buffers[filePath].label}`)
  };
}

function activeBuffer(state) {
  return state.activePath === undefined ? undefined : state.buffers[state.activePath];
}

function adjacentBufferPath(state, delta) {
  if (state.openOrder.length === 0) return state.activePath ?? '';
  const current = Math.max(0, state.openOrder.indexOf(state.activePath ?? state.openOrder[0]));
  return state.openOrder[wrapIndex(current + delta, state.openOrder.length)] ?? state.activePath ?? '';
}

function loadWorkspace(inputPath) {
  const rootPath = fs.realpathSync(path.resolve(inputPath));
  const stat = fs.statSync(rootPath);
  if (!stat.isDirectory()) throw new Error(`${rootPath} is not a directory`);
  const loaded = directoryChildren(rootPath, rootPath);
  return {
    rootPath,
    nodes: [directoryNode(rootPath, rootPath, true, loaded.nodes)],
    omitted: loaded.omitted
  };
}

/**
 * @returns {import('@ismail-elkorchi/terminal-ui/components').TreeNode}
 */
function directoryNode(rootPath, directoryPath, expanded = false, children) {
  const identity = {
    id: nodeId('dir', directoryPath),
    label: path.basename(directoryPath) || directoryPath,
    description: shortPath(rootPath, directoryPath),
    icon: '▣',
    metadata: { kind: 'directory', path: directoryPath }
  };
  return children === undefined
    ? { ...identity, kind: 'lazy', expanded, loading: { kind: 'idle' } }
    : { ...identity, kind: 'branch', expanded, children };
}

/**
 * @returns {{ readonly nodes: readonly import('@ismail-elkorchi/terminal-ui/components').TreeNode[]; readonly omitted: number }}
 */
function directoryChildren(rootPath, directoryPath) {
  let entries;
  try {
    entries = fs.readdirSync(directoryPath, { withFileTypes: true });
  } catch (_error) {
    return {
      omitted: 1,
      nodes: [{
        id: `${nodeId('dir', directoryPath)}:unreadable`,
        label: 'unreadable',
        kind: 'leaf',
        disabled: true,
        metadata: { kind: 'status', path: directoryPath }
      }]
    };
  }
  const sorted = entries
    .filter((entry) => entry.name !== '.' && entry.name !== '..')
    .sort((left, right) => Number(right.isDirectory()) - Number(left.isDirectory()) || left.name.localeCompare(right.name));
  let omitted = 0;
  const nodes = sorted.flatMap((entry) => {
    const absolutePath = path.join(directoryPath, entry.name);
    if (entry.isDirectory()) return [directoryNode(rootPath, absolutePath)];
    if (entry.isFile()) {
      /** @type {import('@ismail-elkorchi/terminal-ui/components').TreeNode} */
      const fileNode = {
        id: nodeId('file', absolutePath),
        label: entry.name,
        kind: 'leaf',
        icon: '•',
        description: shortPath(rootPath, absolutePath),
        metadata: { kind: 'file', path: absolutePath }
      };
      return [fileNode];
    }
    omitted += 1;
    return [];
  });
  return { nodes, omitted };
}

function findTreeNode(nodes, id) {
  for (const node of nodes) {
    if (node.id === id) return node;
    const child = node.kind === 'branch' ? findTreeNode(node.children, id) : undefined;
    if (child !== undefined) return child;
  }
  return undefined;
}

function nodeId(kind, absolutePath) {
  return `${kind}:${absolutePath}`;
}

function resolveUserPath(basePath, value) {
  const trimmed = value.trim();
  if (trimmed.length === 0) return basePath;
  if (trimmed === '~') return os.homedir();
  if (trimmed.startsWith('~/')) return path.resolve(os.homedir(), trimmed.slice(2));
  return path.isAbsolute(trimmed) ? path.resolve(trimmed) : path.resolve(basePath, trimmed);
}

function shortPath(rootPath, filePath) {
  const relative = path.relative(rootPath, filePath);
  return relative.length === 0 ? path.basename(rootPath) || rootPath : relative;
}

function dirtyBuffers(state) {
  return state.openOrder.map((filePath) => state.buffers[filePath]).filter((buffer) => buffer?.dirty === true);
}

function latestLogLine(state) {
  return state.log.at(-1) ?? 'No activity yet.';
}

function lineCount(value) {
  if (value.length === 0) return 0;
  return value.split('\n').length;
}

function textPosition(value, offset) {
  const before = value.slice(0, Math.max(0, Math.min(value.length, offset)));
  const lines = before.split('\n');
  return {
    line: lines.length,
    column: (lines.at(-1)?.length ?? 0) + 1
  };
}

function maxLineCells(value) {
  return value.split('\n').reduce((max, line) => Math.max(max, line.length), 0);
}

function textScrollState(value) {
  return createScrollState({
    contentRows: lineCount(value),
    contentColumns: maxLineCells(value),
    viewportRows: 1,
    viewportColumns: 1
  });
}

function isProbablyBinary(buffer) {
  const sample = buffer.subarray(0, Math.min(buffer.length, 4096));
  return sample.includes(0);
}

function notifyState(state, title, message, tone) {
  return {
    ...state,
    ...notificationPatch(state, title, message, tone),
    log: appendLog(state, `${title}: ${message}`)
  };
}

function notificationPatch(state, title, message, tone) {
  const id = `ide-notice-${String(state.nextNotificationId)}`;
  return {
    nextNotificationId: state.nextNotificationId + 1,
    notifications: notificationReducer(state.notifications, {
      kind: 'enqueue',
      notification: { id, title, message, tone },
      now: Date.now()
    }, { maxVisible: 3 })
  };
}

function appendLog(state, line) {
  return [...state.log, line].slice(-18);
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

function markPaletteUsed(state) {
  return { ...state, palette: { ...state.palette, used: true } };
}

function sameSelection(left, right) {
  if (left === undefined || right === undefined) return left === right;
  return left.start === right.start && left.end === right.end;
}

function contentFingerprint(value) {
  let hash = 2166136261;
  for (const char of value) {
    hash ^= char.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16777619);
  }
  return hash.toString(16);
}

function wrapIndex(index, count) {
  if (count <= 0) return 0;
  return ((index % count) + count) % count;
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

export async function runScriptedIdeEditor() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'terminal-ui-ide-'));
  const notesDir = path.join(root, 'notes');
  fs.mkdirSync(notesDir);
  const readmePath = path.join(notesDir, 'readme.txt');
  const planPath = path.join(root, 'plan.md');
  fs.writeFileSync(readmePath, 'Terminal UI IDE example\n\n- Open files\n- Edit buffers\n', 'utf8');
  fs.writeFileSync(planPath, '# Plan\n\nUse the tree and command bar together.\n', 'utf8');

  const host = createMemoryTerminalHost({ viewport: { columns: 126, rows: 34 } });
  const runtime = createTuiRuntime({
    app: defineIdeEditorApp({ defaultRoot: root }),
    host,
    initialFocusPath: commandFocusPath
  });

  try {
    await runtime.start();
    await runtime.handleInput({ kind: 'text', text: '/open notes/readme.txt', paste: false });
    await runtime.handleInput(keyEvent('enter'));
    await focusUntil(runtime, 'ide-editor-text');
    await runtime.handleInput(keyEvent('end'));
    await runtime.handleInput(keyEvent('enter'));
    await runtime.handleInput({ kind: 'text', text: 'Edited from scripted IDE.', paste: false });

    const editorTextTarget = targetById(runtime, 'ide-editor-text:text');
    await dragSelect(
      runtime,
      editorTextTarget,
      editorTextTarget.bounds.column + 5,
      editorTextTarget.bounds.column + 13
    );
    const pointerSelection = activeBuffer(runtime.getState())?.selection;
    const pointerSelectionLength = pointerSelection === undefined
      ? 0
      : Math.abs(pointerSelection.end - pointerSelection.start);
    await runtime.handleInput({ kind: 'text', text: 'Pointer', paste: false });
    const pointerReplacementApplied = activeBuffer(runtime.getState())?.text.includes('Pointer') === true;

    await click(runtime, targetById(runtime, 'ide-menu:file'));
    await click(runtime, targetById(runtime, 'ide-menu:popup:menu:file.save'));

    const notesTarget = targetById(runtime, `ide-tree:${nodeId('dir', notesDir)}:disclosure`);
    await click(runtime, notesTarget);
    const notesExpanded = findTreeNode(runtime.getState().tree.nodes, nodeId('dir', notesDir))?.expanded === true;
    const readmeVisible = runtime.frame()?.hitTargets?.some((target) => target.id === `ide-tree:${nodeId('file', readmePath)}:body`) === true;
    const readmeTarget = targetById(runtime, `ide-tree:${nodeId('file', readmePath)}:body`);
    await click(runtime, readmeTarget);

    await click(runtime, targetById(runtime, 'ide-menu:file'));
    await click(runtime, targetById(runtime, 'ide-menu:popup:menu:file.openFile'));
    const chooserOpened = runtime.getState().chooser.kind === 'open';
    const chooserFocused = runtime.frame()?.focusPath?.includes('ide-chooser-path') === true;
    await click(runtime, targetById(runtime, `ide-chooser-tree:${nodeId('file', planPath)}:body`));
    await click(runtime, targetById(runtime, 'ide-chooser-confirm:control'));
    const chooserCompleted = runtime.getState().chooser.kind === 'closed';
    const chooserFocusRestored = runtime.frame()?.focusPath?.includes('ide-chooser-path') !== true;

    await click(runtime, targetById(runtime, 'ide-menu:view'));
    await runtime.handleInput(keyEvent('enter'));
    await runtime.handleInput({ kind: 'text', text: 'save', paste: false });
    const paletteQuery = runtime.getState().palette.query;

    const frame = runtime.frame();
    if (frame === undefined) throw new Error('The scripted IDE did not render a frame.');
    const state = runtime.getState();
    return {
      status: 'ok',
      frames: host.frames().length,
      rootOpened: state.rootPath === root,
      activeFile: state.activePath === planPath ? 'plan.md' : path.basename(state.activePath ?? ''),
      savedReadme: fs.readFileSync(readmePath, 'utf8').includes('Edited from scripted IDE.'),
      pointerSelectionLength,
      pointerReplacementApplied,
      openBuffers: state.openOrder.length,
      dirtyBuffers: dirtyBuffers(state).length,
      paletteQuery,
      chooserOpened,
      chooserFocused,
      chooserCompleted,
      chooserFocusRestored,
      notesExpanded,
      readmeVisible,
      pointerTree: state.pointer.tree,
      pointerMenu: state.pointer.menu,
      treeTargets: frame?.hitTargets?.filter((target) => target.id.startsWith('ide-tree:')).length ?? 0,
      menuTargets: frame?.hitTargets?.filter((target) => target.id.startsWith('ide-menu:')).length ?? 0,
      visible: renderFramePlain(frame).includes('Editor commands'),
      outputRows: renderFramePlain(frame).split('\n').length
    };
  } finally {
    await runtime.dispose();
    fs.rmSync(root, { recursive: true, force: true });
  }
}

async function focusUntil(runtime, id, limit = 12) {
  for (let index = 0; index < limit; index += 1) {
    const focusPath = runtime.frame()?.focusPath ?? [];
    if (focusPath.includes(id)) return;
    await runtime.handleInput(keyEvent('tab'));
  }
  throw new Error(`Could not focus ${id}`);
}

function targetById(runtime, id) {
  const target = runtime.frame()?.hitTargets?.find((item) => item.id === id);
  if (target === undefined) throw new Error(`Missing hit target ${id}`);
  return target;
}

async function click(runtime, target) {
  await runtime.handleInput(mouseEvent('press', target, 'left'));
  await runtime.handleInput(mouseEvent('release', target, 'none'));
}

async function dragSelect(runtime, target, startColumn, endColumn) {
  await runtime.handleInput(mouseEventAt('press', target.bounds.row, startColumn, 'left'));
  await runtime.handleInput(mouseEventAt('drag', target.bounds.row, endColumn, 'left'));
  await runtime.handleInput(mouseEventAt('release', target.bounds.row, endColumn, 'none'));
}

function mouseEvent(action, target, button) {
  return mouseEventAt(action, target.bounds.row, target.bounds.column, button);
}

function mouseEventAt(action, row, column, button) {
  return {
    kind: 'mouse',
    sequence: '',
    encoding: 'sgr',
    action,
    button,
    row,
    column,
    rawCode: action === 'drag' ? 32 : 0,
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
    const exit = await runTui(ideEditorApp, createTerminalHost({ runtime: 'node' }), {
      initialFocusPath: commandFocusPath
    });
    if (exit.status !== 'completed') {
      process.exitCode = 1;
    }
  } else {
    const result = await runScriptedIdeEditor();
    console.log(JSON.stringify(result));
  }
}
