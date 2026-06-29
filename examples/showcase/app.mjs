import { fileURLToPath } from 'node:url';

import { createTerminalHost } from '@ismail-elkorchi/terminal-ui/host';
import { createVisualSnapshot } from '@ismail-elkorchi/terminal-ui/testing';
import {
  createTuiRuntime,
  defineTui,
  diffFrames,
  renderFramePlain,
  renderWidgetFrame,
  runTui
} from '@ismail-elkorchi/terminal-ui/tui';
import { defineTheme, highContrastTheme, modernTheme, noColorTheme } from '@ismail-elkorchi/terminal-ui/theme';
import {
  absolute,
  activityFeed,
  activityIndicator,
  barChart,
  box,
  button,
  canvas,
  checkbox,
  commandBar,
  commandPalette,
  contextMenu,
  custom,
  dropdown,
  field,
  form,
  grid,
  helpBar,
  inputField,
  label,
  list,
  menu,
  menuBar,
  modal,
  numberInput,
  overlay,
  paginator,
  progressBar,
  radioGroup,
  richText,
  row,
  scrollback,
  selectBox,
  sparkline,
  spinner,
  splitPane,
  stack,
  statusBar,
  structuredBlock,
  surface,
  table,
  tabs,
  text,
  textArea,
  textInput,
  tree,
  viewport
} from '@ismail-elkorchi/terminal-ui/widgets';

import {
  activityBlocks,
  commandEntries,
  dataRows,
  logItems,
  navigationNodes,
  paletteSuggestions
} from './data.mjs';

export const showcaseViewport = Object.freeze({ columns: 160, rows: 42 });

const themeSequence = Object.freeze(['studio', 'aurora', 'highContrast', 'noColor']);
const quickActions = Object.freeze(['Palette', 'Handoff', 'Theme', 'Context']);
const commandFocusPath = Object.freeze(['showcase-overlay', 'showcase-shell', 'bottom-chrome', 'showcase-command']);

const studioTheme = defineTheme({
  name: 'studio',
  colors: {
    'app.background': rgb(7, 10, 18),
    'app.foreground': rgb(225, 232, 240),
    'surface.background': rgb(11, 15, 26),
    'surface.foreground': rgb(225, 232, 240),
    'surface.border': rgb(74, 86, 112),
    'surface.title': rgb(141, 176, 255),
    'text.default': rgb(225, 232, 240),
    'text.muted': rgb(128, 143, 166),
    'text.strong': rgb(255, 255, 255),
    'accent.primary': rgb(119, 183, 255),
    'accent.secondary': rgb(245, 166, 255),
    'status.info': rgb(100, 211, 255),
    'status.success': rgb(96, 211, 148),
    'status.warning': rgb(245, 191, 104),
    'status.error': rgb(255, 116, 116),
    'status.pending': rgb(128, 143, 166),
    'status.running': rgb(119, 183, 255),
    'selection.background': rgb(49, 92, 170),
    'selection.foreground': rgb(255, 255, 255),
    'focus.border': rgb(116, 211, 255),
    'focus.background': rgb(32, 48, 79),
    'input.cursor': rgb(255, 255, 255),
    'input.placeholder': rgb(128, 143, 166),
    'menu.match': rgb(245, 166, 255),
    'menu.selected': rgb(116, 211, 255),
    'table.header': rgb(141, 176, 255),
    'table.border': rgb(74, 86, 112),
    'tree.branch': rgb(91, 107, 139),
    'scrollbar.track': rgb(42, 49, 67),
    'scrollbar.thumb': rgb(141, 176, 255),
    'chart.series.1': rgb(96, 211, 148),
    'chart.series.2': rgb(119, 183, 255),
    'chart.series.3': rgb(245, 166, 255)
  }
}, modernTheme);

const auroraTheme = defineTheme({
  name: 'aurora',
  colors: {
    'app.background': rgb(5, 14, 17),
    'surface.background': rgb(7, 22, 26),
    'surface.border': rgb(61, 98, 104),
    'surface.title': rgb(149, 235, 213),
    'text.default': rgb(228, 249, 244),
    'text.muted': rgb(128, 177, 168),
    'accent.primary': rgb(149, 235, 213),
    'accent.secondary': rgb(252, 197, 132),
    'status.info': rgb(118, 205, 255),
    'status.success': rgb(130, 232, 177),
    'status.warning': rgb(252, 197, 132),
    'selection.background': rgb(25, 97, 103),
    'focus.border': rgb(149, 235, 213),
    'menu.match': rgb(252, 197, 132)
  }
}, studioTheme);

export function initialShowcaseState() {
  return {
    selectedRoute: 'dashboard',
    selectedInspector: 'selection',
    selectedNavigation: 'dashboard',
    selectedRow: 1,
    selectedActivity: 1,
    selectedQuickAction: 0,
    selectedPalette: 0,
    navFilter: '',
    commandValue: '',
    commandCursor: 0,
    commandQuery: '',
    paletteOpen: false,
    modalOpen: false,
    contextMenuOpen: false,
    dropdownOpen: false,
    mouseEnabled: true,
    layoutMode: 'balanced',
    density: 3,
    draftText: [
      '# Night watch briefing',
      '',
      'Aster is secure at berth 12. Keep Pulse under channel-C watch until Vector clears the west lane.'
    ].join('\n'),
    lastAction: 'Harbor overview ready. Click, tab, type, or open the palette.',
    themeIndex: 0,
    spinnerFrame: 0,
    scrollRow: 2,
    progress: 72
  };
}

export function createShowcaseApp() {
  return defineTui({
    id: 'terminal-ui-showcase',
    transcript: { enabled: true },
    nonTty: { mode: 'last_frame' },
    init: () => initialShowcaseState(),
    update: updateShowcase,
    view: (state, context) => showcaseView(state, context.viewport),
    subscriptions: () => [tickerSource()],
    accessibility: {
      describe: (state) => ({
        source: 'tui',
        focusPath: ['showcase-shell'],
        root: {
          id: 'terminal-ui-showcase',
          role: 'application',
          label: `Northstar Control, ${routeLabel(state.selectedRoute)} route`,
          children: [
            { id: 'showcase-nav', role: 'tree', label: 'Showcase navigation' },
            { id: 'showcase-workspace', role: 'group', label: 'Tabbed workspace' },
            { id: 'showcase-inspector', role: 'group', label: 'Inspector' },
            { id: 'showcase-command', role: 'textbox', label: 'Command bar', value: state.commandValue }
          ]
        }
      })
    }
  });
}

export function showcaseTheme(state) {
  const name = themeSequence[state.themeIndex % themeSequence.length];
  if (name === 'studio') return studioTheme;
  if (name === 'aurora') return auroraTheme;
  if (name === 'highContrast') return highContrastTheme;
  if (name === 'noColor') return noColorTheme;
  return studioTheme;
}

export function renderShowcaseFrame(state = initialShowcaseState(), viewport = showcaseViewport) {
  return renderWidgetFrame(showcaseView(state), viewport, { theme: showcaseTheme(state) });
}

export async function runShowcaseScript(messages, options = {}) {
  const host = options.host ?? createTerminalHost({ runtime: 'memory', viewport: options.viewport ?? showcaseViewport });
  const app = createShowcaseApp();
  const runtime = createTuiRuntime({
    app,
    host,
    theme: showcaseTheme,
    initialFocusPath: commandFocusPath
  });
  const frames = [];
  frames.push(await runtime.start());
  for (const step of messages) {
    if (typeof step.input === 'string') {
      const results = await runtime.handleInputChunk({ data: step.input });
      for (const result of results) frames.push(result.frame);
      continue;
    }
    const state = await runtime.dispatch(step);
    const frame = runtime.frame();
    if (frame !== undefined) frames.push(frame);
    if (state.themeIndex !== undefined) {
      // Runtime themes are fixed at construction time; scripted frames still expose theme state in the UI.
    }
  }
  return {
    host,
    runtime,
    frames,
    state: runtime.getState()
  };
}

export function createShowcaseSnapshot(state = initialShowcaseState(), previousState) {
  const frame = renderShowcaseFrame(state);
  const previousFrame = previousState === undefined ? undefined : renderShowcaseFrame(previousState);
  return createVisualSnapshot({
    frame,
    ...(previousFrame === undefined ? {} : { previousFrame, diff: diffFrames(previousFrame, frame) })
  });
}

function updateShowcase(state, message) {
  switch (message.kind) {
    case 'route':
      return {
        state: {
          ...state,
          selectedRoute: message.route,
          selectedNavigation: message.route,
          paletteOpen: false,
          contextMenuOpen: false,
          lastAction: `Opened ${routeLabel(message.route)}.`
        }
      };
    case 'inspector':
      return { state: { ...state, selectedInspector: message.inspector, lastAction: `Inspector: ${message.inspector}.` } };
    case 'palette':
      return { state: { ...state, paletteOpen: message.open, modalOpen: false, contextMenuOpen: false, lastAction: message.open ? 'Command palette opened.' : 'Command palette closed.' } };
    case 'paletteMove':
      return { state: { ...state, selectedPalette: clamp(state.selectedPalette + message.delta, 0, commandEntries.length - 1) } };
    case 'palettePick':
      return { state: applyPaletteEntry(state, commandEntries[state.selectedPalette]) };
    case 'modal':
      return { state: { ...state, modalOpen: message.open, paletteOpen: false, contextMenuOpen: false, lastAction: message.open ? 'Handoff wizard opened.' : 'Handoff wizard closed.' } };
    case 'context':
      return { state: { ...state, contextMenuOpen: message.open, paletteOpen: false, modalOpen: false, lastAction: message.open ? 'Context menu opened.' : 'Context menu closed.' } };
    case 'dropdown':
      return { state: { ...state, dropdownOpen: message.open, lastAction: message.open ? 'Theme dropdown opened.' : 'Theme dropdown closed.' } };
    case 'theme':
      return { state: { ...state, themeIndex: state.themeIndex + 1, lastAction: `Theme changed to ${themeLabel({ ...state, themeIndex: state.themeIndex + 1 })}.` } };
    case 'setTheme':
      return { state: { ...state, themeIndex: themeIndexFor(message.value), dropdownOpen: false, lastAction: `Theme changed to ${message.value}.` } };
    case 'layoutMode':
      return { state: { ...state, layoutMode: message.value, lastAction: `Layout mode set to ${message.value}.` } };
    case 'density':
      return { state: { ...state, density: clamp(message.value, 1, 5), lastAction: `Density set to ${String(clamp(message.value, 1, 5))}.` } };
    case 'toggleMouse':
      return { state: { ...state, mouseEnabled: !state.mouseEnabled, lastAction: `Mouse targets ${state.mouseEnabled ? 'disabled' : 'enabled'}.` } };
    case 'tick':
      return {
        state: {
          ...state,
          spinnerFrame: state.spinnerFrame + 1,
          progress: state.progress >= 100 ? 68 : Math.min(100, state.progress + 2)
        }
      };
    case 'row':
      return { state: { ...state, selectedRow: clamp(message.row, 0, dataRows.length - 1), lastAction: `Selected row ${dataRows[clamp(message.row, 0, dataRows.length - 1)]?.name ?? 'unknown'}.` } };
    case 'activity':
      return { state: { ...state, selectedActivity: clamp(message.index, 0, activityBlocks.length - 1), lastAction: `Selected activity ${activityBlocks[clamp(message.index, 0, activityBlocks.length - 1)]?.title ?? 'unknown'}.` } };
    case 'quick':
      return { state: { ...state, selectedQuickAction: clamp(message.index, 0, 3), lastAction: `Quick action: ${quickActions[clamp(message.index, 0, 3)]}.` } };
    case 'quickPick':
      return { state: applyQuickAction(state, quickActions[state.selectedQuickAction] ?? 'Palette') };
    case 'navFilter':
      return { state: { ...state, navFilter: message.value, commandQuery: message.value.slice(0, 24), lastAction: 'Navigation filter updated.' } };
    case 'navFilterText':
      return { state: { ...state, navFilter: `${state.navFilter}${message.text}`, commandQuery: `${state.navFilter}${message.text}`.slice(0, 24) } };
    case 'command':
      return {
        state: {
          ...state,
          commandValue: message.value,
          commandCursor: clamp(message.cursor ?? message.value.length, 0, message.value.length),
          commandQuery: message.value.replace(/^\/+/u, '').slice(0, 24),
          lastAction: 'Command edited.'
        }
      };
    case 'commandText':
      return { state: editCommand(state, { kind: 'insert', text: message.text }) };
    case 'commandBackspace':
      return { state: editCommand(state, { kind: 'backspace' }) };
    case 'commandDelete':
      return { state: editCommand(state, { kind: 'delete' }) };
    case 'commandMove':
      return { state: editCommand(state, { kind: 'move', delta: message.delta }) };
    case 'commandHome':
      return { state: editCommand(state, { kind: 'home' }) };
    case 'commandEnd':
      return { state: editCommand(state, { kind: 'end' }) };
    case 'submitCommand':
      return { state: runCommand(state) };
    case 'draftText':
      return { state: { ...state, draftText: `${state.draftText}${message.text}`, lastAction: 'Draft text edited.' } };
    case 'draftBackspace':
      return { state: { ...state, draftText: state.draftText.slice(0, -1), lastAction: 'Draft text edited.' } };
    case 'escape':
      return { state: { ...state, paletteOpen: false, modalOpen: false, contextMenuOpen: false, dropdownOpen: false, lastAction: 'Closed transient UI.' } };
    case 'exit':
      return { state, exit: { reason: 'showcase-complete' } };
    default:
      return { state };
  }
}

function showcaseView(state, viewport = showcaseViewport) {
  const base = grid([
    topChrome(state),
    mainRegion(state, viewport),
    bottomChrome(state)
  ], {
    id: 'showcase-shell',
    rows: [{ kind: 'fixed', cells: 3 }, { kind: 'fill' }, { kind: 'fixed', cells: 4 }],
    columns: [{ kind: 'fill' }],
    accessibility: { role: 'application', label: 'Northstar Control' },
    keyMap: {
      escape: { kind: 'escape' },
      '?': { kind: 'modal', open: true },
      '/': { kind: 'commandText', text: '/' }
    }
  });

  const layers = [base];
  if (state.contextMenuOpen) layers.push(contextMenuOverlay(state));
  if (state.paletteOpen) layers.push(commandPaletteOverlay(state));
  if (state.modalOpen) layers.push(wizardModal(state));
  return overlay(layers, { id: 'showcase-overlay' });
}

function topChrome(state) {
  return stack([
    row([
      menuBar({
        id: 'main-menu',
        selected: 'view',
        items: [
          { id: 'file', label: 'File', shortcut: 'F' },
          { id: 'view', label: 'View', shortcut: 'V', checked: true },
          { id: 'tools', label: 'Tools', shortcut: 'T' },
          { id: 'help', label: 'Help', shortcut: '?' }
        ],
        keyMap: {
          '?': { kind: 'modal', open: true },
          '/': { kind: 'palette', open: true },
          t: { kind: 'theme' }
        }
      }),
      statusBar({
        id: 'top-status',
        text: `Northstar Control  ${routeLabel(state.selectedRoute)}  ${themeLabel(state)}`
      }),
      activityIndicator({
        id: 'top-activity',
        label: statusLabel(state),
        status: state.progress >= 92 ? 'success' : 'running'
      })
    ], { id: 'top-row', gap: 2 }),
    progressBar({
      id: 'top-progress',
      label: 'harbor service',
      value: state.progress,
      max: 100,
      mode: 'full',
      showPercentage: true,
      status: state.progress >= 92 ? 'success' : 'running'
    })
  ], { id: 'top-chrome' });
}

function mainRegion(state, viewport) {
  const wide = viewport.columns >= 150;
  return splitPane([
    navigationPane(state),
    workspacePane(state, viewport),
    inspectorPane(state)
  ], {
    id: 'main-layout',
    direction: 'horizontal',
    sizes: [
      { kind: 'fixed', cells: wide ? 30 : 27 },
      { kind: 'fill', weight: 3 },
      { kind: 'fixed', cells: wide ? 42 : 34 }
    ],
    gap: 1
  });
}

function navigationPane(state) {
  return box(grid([
    text('Navigator', { id: 'nav-title' }),
    inputField({
      id: 'nav-filter',
      value: state.navFilter,
      message: { kind: 'palette', open: true },
      keyMap: {
        enter: { kind: 'palette', open: true },
        backspace: { kind: 'navFilter', value: state.navFilter.slice(0, -1) },
        escape: { kind: 'navFilter', value: '' }
      },
      inputMap: {
        text: (value) => ({ kind: 'navFilterText', text: value }),
        paste: (value) => ({ kind: 'navFilter', value })
      }
    }),
    tree({
      id: 'showcase-nav',
      nodes: navigationNodes,
      selected: state.selectedNavigation,
      filterQuery: state.navFilter,
      toMessage: (node) => ({ kind: 'route', route: routeForNode(node.id) }),
      keyMap: {
        arrowDown: { kind: 'route', route: 'data' },
        arrowUp: { kind: 'route', route: 'dashboard' },
        '/': { kind: 'palette', open: true }
      },
      scrollbar: { visible: true }
    }),
    list({
      id: 'quick-list',
      items: quickActions,
      selected: state.selectedQuickAction,
      toMessage: (value) => quickActionMessage(value),
      keyMap: {
        arrowDown: { kind: 'quick', index: Math.min(quickActions.length - 1, state.selectedQuickAction + 1) },
        arrowUp: { kind: 'quick', index: Math.max(0, state.selectedQuickAction - 1) },
        enter: { kind: 'quickPick' }
      },
      scrollbar: { visible: true }
    })
  ], {
    id: 'nav-grid',
    rows: [
      { kind: 'fixed', cells: 1 },
      { kind: 'fixed', cells: 1 },
      { kind: 'fill' },
      { kind: 'fixed', cells: 6 }
    ],
    columns: [{ kind: 'fill' }],
    gap: 1
  }), {
    id: 'navigation-pane',
    border: { kind: 'rounded', title: 'Explore' },
    padding: { top: 0, right: 1, bottom: 0, left: 1 }
  });
}

function workspacePane(state, viewport) {
  return box(tabs({
    id: 'workspace-tabs',
    selected: state.selectedRoute,
    tabs: [
      showcaseTab(state, 'dashboard', 'Overview', dashboardPanel(state, viewport)),
      showcaseTab(state, 'data', 'Fleet', dataPanel(state)),
      showcaseTab(state, 'text', 'Briefing', textPanel(state)),
      showcaseTab(state, 'diagram', 'Map', diagramPanel(state)),
      showcaseTab(state, 'forms', 'Dispatch', formsPanel(state)),
      showcaseTab(state, 'activity', 'Events', activityPanel(state, viewport))
    ]
  }), {
    id: 'workspace-pane',
    border: { kind: 'rounded', title: 'Workspace' }
  });
}

function dashboardPanel(state, viewport) {
  const wide = viewport.columns >= 150;
  return grid([
    wide
      ? summaryCard('Night watch', 'running', 'Harbor stable. West lane is dense, Aster is secured, and Vector is clearing channel C.', [
          { label: 'vessel', value: dataRows[state.selectedRow]?.name ?? 'none' },
          { label: 'service', value: `${String(state.progress)}%` },
          { label: 'command', value: state.commandValue || 'standby' },
          { label: 'theme', value: themeLabel(state) }
        ])
      : summaryCard('Harbor control', 'running', 'Operate the console with keyboard commands, mouse targets, and live panels.', [
          { label: 'route', value: routeLabel(state.selectedRoute) },
          { label: 'action', value: state.lastAction },
          { label: 'theme', value: themeLabel(state) }
        ]),
    wide ? splitPane([
      box(surface([
        absolute(heroCanvas(state), {
          id: 'hero-canvas-region',
          row: 1,
          column: 2,
          width: 52,
          height: 11
        }),
        absolute(box(structuredBlock({
          id: 'hero-copy',
          title: 'Active route',
          status: 'running',
          summary: 'Vector clears channel C while Pulse holds at the ferry marker.',
          fields: [
            { label: 'service', value: `${String(state.progress)}%` },
            { label: 'handoff', value: '3 items' }
          ]
        }), { id: 'hero-copy-card', border: { kind: 'single', title: 'Live route' }, padding: 1 }), {
          id: 'hero-copy-region',
          row: 12,
          column: 2,
          width: 52,
          height: 8
        })
      ], { id: 'hero-surface', label: 'Operations surface' }), {
        id: 'hero-card',
        border: { kind: 'rounded', title: 'Harbor map' },
        padding: 0
      }),
      box(stack([
        barChart({
          id: 'coverage-bars',
          selected: state.selectedRow % 4,
          items: [
            { label: 'berths', value: 95 },
            { label: 'lanes', value: 89 },
            { label: 'crews', value: 91 },
            { label: 'weather', value: 92 }
          ]
        }),
        table({
          id: 'dashboard-table',
          rows: dashboardRows(state),
          selected: 0,
          stickyHeader: true,
          columns: [
            { header: 'Area', width: { kind: 'fixed', cells: 12 } },
            { header: 'State', width: { kind: 'fill' } }
          ]
        }),
        structuredBlock({
          id: 'dashboard-action',
          title: 'Watch',
          status: 'info',
          summary: state.lastAction,
          fields: [
            { label: 'route', value: state.selectedRoute },
            { label: 'overlay', value: overlayLabel(state) }
          ]
        })
      ], { id: 'dashboard-side-stack', gap: 1 }), {
        id: 'dashboard-side',
        border: { kind: 'rounded', title: 'Shift board' },
        padding: 1
      })
    ], {
      id: 'dashboard-body',
      direction: 'horizontal',
      sizes: [{ kind: 'fill', weight: 2 }, { kind: 'fill' }],
      gap: 1
    }) : compactDashboardBody(state)
  ], {
    id: 'dashboard-grid',
    rows: [{ kind: 'fixed', cells: wide ? 6 : 5 }, { kind: 'fill' }],
    columns: [{ kind: 'fill' }],
    gap: 1
  });
}

function compactDashboardBody(state) {
  return splitPane([
    box(grid([
      barChart({
        id: 'compact-coverage-bars',
        selected: state.selectedRow % 4,
        items: [
          { label: 'berths', value: 95 },
          { label: 'lanes', value: 89 },
          { label: 'crews', value: 91 },
          { label: 'weather', value: 92 }
        ]
      }),
      progressBar({ id: 'compact-progress', label: 'service level', value: state.progress, max: 100, mode: 'full', showPercentage: true }),
      sparkline({ id: 'compact-sparkline', values: sparklineValues(state.spinnerFrame) })
    ], {
      id: 'compact-visual-grid',
      rows: [{ kind: 'fixed', cells: 5 }, { kind: 'fixed', cells: 1 }, { kind: 'fixed', cells: 1 }],
      columns: [{ kind: 'fill' }],
      gap: 1
    }), {
      id: 'compact-visuals',
      border: { kind: 'rounded', title: 'Harbor pulse' },
      padding: 1
    }),
    box(structuredBlock({
        id: 'compact-dashboard-action',
        title: 'Current watch',
        status: 'info',
        summary: state.lastAction,
        fields: [
          { label: 'route', value: routeLabel(state.selectedRoute) },
          { label: 'vessel', value: dataRows[state.selectedRow]?.name ?? 'none' },
          { label: 'overlay', value: overlayLabel(state) },
          { label: 'mouse', value: state.mouseEnabled ? 'enabled' : 'disabled' }
        ]
    }), {
      id: 'compact-action',
      border: { kind: 'rounded', title: 'State' },
      padding: 1
    })
  ], {
    id: 'compact-dashboard-body',
    direction: 'vertical',
    sizes: [{ kind: 'fixed', cells: 11 }, { kind: 'fill' }],
    gap: 1
  });
}

function dataPanel(state) {
  return stack([
    table({
      id: 'showcase-table',
      rows: dataRows.map((rowItem) => [rowItem.name, rowItem.type, rowItem.status, rowItem.score]),
      selected: state.selectedRow,
      selectedCell: { row: state.selectedRow, column: 2 },
      stickyHeader: true,
      columns: [
        { header: 'Vessel', width: { kind: 'fixed', cells: 10 }, sort: 'ascending' },
        { header: 'Class', width: { kind: 'fill' } },
        { header: 'State', width: { kind: 'fixed', cells: 10 } },
        { header: 'Signal', width: { kind: 'fixed', cells: 7 }, align: 'end' }
      ],
      keyMap: {
        arrowDown: { kind: 'row', row: Math.min(dataRows.length - 1, state.selectedRow + 1) },
        arrowUp: { kind: 'row', row: Math.max(0, state.selectedRow - 1) }
      },
      scrollbar: { visible: true }
    }),
    row([
      paginator({ id: 'data-pages', label: 'Fleet', page: 1, pageCount: 4 }),
      progressBar({ id: 'data-progress', label: 'cleared', value: 18, max: 24, mode: 'compact' })
    ], { id: 'data-footer', gap: 2 })
  ], { id: 'data-stack', gap: 1 });
}

function textPanel(state) {
  return splitPane([
    box(textArea({
      id: 'draft-area',
      value: state.draftText,
      cursor: state.draftText.length,
      scrollbar: { visible: true },
      keyMap: {
        backspace: { kind: 'draftBackspace' },
        enter: { kind: 'draftText', text: '\n' }
      },
      inputMap: {
        text: (value) => ({ kind: 'draftText', text: value }),
        paste: (value) => ({ kind: 'draftText', text: value })
      }
    }), { id: 'editor-card', border: { kind: 'single', title: 'Shift briefing' }, padding: 1 }),
    box(stack([
      richText({
        id: 'rich-copy',
        segments: [
          { text: 'Advisory: ', style: { bold: true } },
          { text: 'west-lane traffic is dense ', style: { fg: { kind: 'theme', token: 'accent.primary' } } },
          { text: 'until Vector clears channel C.' }
        ],
        wrap: true
      }),
      viewport(text('Watch list\n- Pulse crossing lane C\n- cold-chain block 7\n- west crane cycle time\n- outer marker gusts\n- handoff by 22:30', { id: 'viewport-copy' }), {
        id: 'copy-viewport',
        scrollRow: 2,
        contentRows: 6,
        scrollbar: { visible: true }
      }),
      scrollback({
        id: 'runtime-scrollback',
        items: logItems,
        scroll: { row: state.scrollRow, column: 0, followTail: false },
        scrollbar: { visible: true },
        wrap: true,
        searchQuery: 'lane'
      })
    ], { id: 'text-side-stack', gap: 1 }), { id: 'text-card', border: { kind: 'single', title: 'Advisory stream' }, padding: 1 })
  ], {
    id: 'text-split',
    direction: 'horizontal',
    sizes: [{ kind: 'fill' }, { kind: 'fixed', cells: 35 }],
    gap: 1
  });
}

function diagramPanel(state) {
  return surface([
    absolute(box(canvas({
      id: 'diagram-canvas',
      label: 'Renderer diagram',
      state,
      painter({ buffer, bounds }) {
        const lines = [
          'outer marker ──▶ west lane ──▶ inner harbor',
          '      │              │             │',
          '      └── Pulse      └── Vector    └── Aster',
          '',
          'pilots • weather • berth windows'
        ];
        for (const [index, lineText] of lines.entries()) {
          buffer.write(bounds.row + index, bounds.column, [{
            text: lineText,
            style: { fg: { kind: 'theme', token: index === 0 ? 'accent.primary' : 'text.default' } }
          }]);
        }
      }
    }), { id: 'canvas-card', border: { kind: 'double', title: 'Route map' }, padding: 1 }), {
      id: 'diagram-canvas-region',
      row: 1,
      column: 1,
      width: 51,
      height: 12
    }),
    absolute(customMeter(), {
      id: 'custom-meter-region',
      row: 14,
      column: 1,
      width: 51,
      height: 4
    }),
    absolute(box(barChart({
      id: 'route-pressure',
      selected: 1,
      items: [
        { label: 'north', value: 42 },
        { label: 'west', value: 86 },
        { label: 'inner', value: 63 }
      ]
    }), { id: 'route-pressure-card', border: { kind: 'single', title: 'Lane pressure' }, padding: 1 }), {
      id: 'route-pressure-region',
      row: 12,
      column: 54,
      width: 37,
      height: 8
    }),
    absolute(box(structuredBlock({
      id: 'route-status',
      title: 'Active instruction',
      status: 'running',
      summary: 'Hold Pulse at the ferry marker until Vector exits the west lane.',
      fields: [
        { label: 'watch', value: '14 min' },
        { label: 'risk', value: 'medium' },
        { label: 'handoff', value: 'pending' }
      ]
    }), { id: 'route-status-card', border: { kind: 'single', title: 'Dispatch note' }, padding: 1 }), {
      id: 'route-status-region',
      row: 19,
      column: 1,
      width: 90,
      height: 9
    }),
    absolute(box(stack([
      text('Channel C is reserved for Vector until the pilot clears the bend.'),
      text('Pulse holds at the ferry marker if crosswind rises again.'),
      text('Aster remains on berth 12 watch until cargo block 7 releases.')
    ]), { id: 'diagram-notes', border: { kind: 'single', title: 'Route notes' }, padding: 1 }), {
      id: 'diagram-notes-region',
      row: 1,
      column: 54,
      width: 37,
      height: 10
    })
  ], { id: 'diagram-surface', label: 'Harbor route surface' });
}

function formsPanel(state) {
  const themeOptions = [
    { id: 'studio', label: 'Studio', value: 'studio' },
    { id: 'aurora', label: 'Aurora', value: 'aurora' },
    { id: 'contrast', label: 'High contrast', value: 'highContrast' },
    { id: 'plain', label: 'No color', value: 'noColor' }
  ];
  return splitPane([
    form([
      field(textInput({ id: 'project-name', value: 'Northstar Control', cursor: 9 }), {
        id: 'project-name-field',
        label: 'Console',
        description: 'Visible name for this operations room'
      }),
      field(numberInput({
        id: 'density',
        value: state.density,
        min: 1,
        max: 5,
        keyMap: {
          arrowUp: { kind: 'density', value: state.density + 1 },
          arrowDown: { kind: 'density', value: state.density - 1 }
        }
      }), {
        id: 'density-field',
        label: 'Density',
        description: 'Controls panel compactness'
      }),
      checkbox({ id: 'mouse-enabled', label: 'Mouse controls', checked: state.mouseEnabled, message: { kind: 'toggleMouse' } }),
      radioGroup({
        id: 'layout-mode',
        label: 'Layout mode',
        selected: state.layoutMode,
        options: [
          { id: 'compact', label: 'Compact', value: 'compact' },
          { id: 'balanced', label: 'Balanced', value: 'balanced' },
          { id: 'wide', label: 'Wide', value: 'wide' }
        ],
        toMessage: (option) => ({ kind: 'layoutMode', value: option.value })
      }),
      selectBox({
        id: 'theme-select',
        label: 'Theme',
        selected: themeLabel(state),
        options: themeOptions,
        toMessage: (option) => ({ kind: 'setTheme', value: option.value })
      }),
      dropdown({
        id: 'theme-dropdown',
        label: 'Theme dropdown',
        open: state.dropdownOpen,
        selected: themeLabel(state),
        items: [
          { id: 'studio', label: 'Studio', checked: themeLabel(state) === 'studio', message: { kind: 'setTheme', value: 'studio' } },
          { id: 'aurora', label: 'Aurora', checked: themeLabel(state) === 'aurora', message: { kind: 'setTheme', value: 'aurora' } },
          { id: 'contrast', label: 'High contrast', checked: themeLabel(state) === 'highContrast', message: { kind: 'setTheme', value: 'highContrast' } },
          { id: 'plain', label: 'No color', checked: themeLabel(state) === 'noColor', message: { kind: 'setTheme', value: 'noColor' } }
        ],
        keyMap: { enter: { kind: 'dropdown', open: !state.dropdownOpen } }
      }),
      row([
        button({ id: 'save-form', label: 'Handoff', message: { kind: 'modal', open: true } }),
        button({ id: 'cycle-theme', label: 'Cycle theme', message: { kind: 'theme' } })
      ], { id: 'form-actions', gap: 1 })
    ], {
      id: 'settings-form',
      title: 'Dispatch controls',
      gap: 1
    }),
    box(menu({
      id: 'form-menu',
      selected: 'open',
      items: [
        { id: 'open', label: 'Open palette', message: { kind: 'palette', open: true }, shortcut: 'P' },
        { id: 'wizard', label: 'Handoff wizard', message: { kind: 'modal', open: true }, shortcut: 'W' },
        { id: 'disabled', label: 'Unavailable action', disabled: true }
      ]
    }), { id: 'form-menu-card', border: { kind: 'single', title: 'Menu' }, padding: 1 })
  ], {
    id: 'forms-split',
    direction: 'horizontal',
    sizes: [{ kind: 'fill' }, { kind: 'fixed', cells: 28 }],
    gap: 1
  });
}

function activityPanel(state, viewport) {
  const feed = activityFeed({
      id: 'activity-feed',
      blocks: activityBlocks,
      selected: state.selectedActivity,
      keyMap: {
        arrowDown: { kind: 'activity', index: Math.min(activityBlocks.length - 1, state.selectedActivity + 1) },
        arrowUp: { kind: 'activity', index: Math.max(0, state.selectedActivity - 1) }
      }
    });
  const selected = structuredBlock({
    id: 'selected-activity',
    title: activityBlocks[state.selectedActivity]?.title ?? 'Activity',
    status: activityBlocks[state.selectedActivity]?.status ?? 'info',
    summary: activityBlocks[state.selectedActivity]?.summary ?? '',
    fields: activityBlocks[state.selectedActivity]?.fields ?? []
  });
  if (viewport.columns < 150) {
    return grid([
      box(feed, { id: 'activity-feed-card', border: { kind: 'rounded', title: 'Live event timeline' }, padding: 1 }),
      box(selected, { id: 'activity-detail-card', border: { kind: 'rounded', title: 'Selected event' }, padding: 1 })
    ], {
      id: 'activity-compact-grid',
      rows: [{ kind: 'fill' }, { kind: 'fixed', cells: 9 }],
      columns: [{ kind: 'fill' }],
      gap: 1
    });
  }
  return splitPane([
    feed,
    box(stack([
      selected,
      contextMenu({
        id: 'inline-context',
        title: 'Context actions',
        selected: 'inspect',
        items: [
          { id: 'inspect', label: 'Inspect', shortcut: 'I' },
          { id: 'copy', label: 'Copy event', shortcut: 'C' },
          { id: 'close', label: 'Close menu', message: { kind: 'context', open: false } }
        ]
      })
    ], { id: 'activity-inspector-stack', gap: 1 }), { id: 'activity-inspector-card', border: { kind: 'single', title: 'Selected event' }, padding: 1 })
  ], {
    id: 'activity-split',
    direction: 'horizontal',
    sizes: [{ kind: 'fill' }, { kind: 'fixed', cells: 32 }],
    gap: 1
  });
}

function inspectorPane(state) {
  return box(tabs({
    id: 'inspector-tabs',
    selected: state.selectedInspector,
    tabs: [
      inspectorTab(state, 'selection', 'Pick', selectionInspector(state)),
      inspectorTab(state, 'a11y', 'A11y', a11yInspector(state)),
      inspectorTab(state, 'render', 'Render', renderInspector(state)),
      inspectorTab(state, 'theme', 'Theme', themeInspector(state))
    ]
  }), {
    id: 'inspector-pane',
    border: { kind: 'rounded', title: 'Inspector' },
    padding: { left: 1, right: 1 }
  });
}

function showcaseTab(state, id, label, panel) {
  return {
    id,
    label,
    message: { kind: 'route', route: id },
    panel: state.selectedRoute === id ? panel : inactivePanel(`workspace-${id}-inactive`)
  };
}

function inspectorTab(state, id, label, panel) {
  return {
    id,
    label,
    message: { kind: 'inspector', inspector: id },
    panel: state.selectedInspector === id ? panel : inactivePanel(`inspector-${id}-inactive`)
  };
}

function inactivePanel(id) {
  return box(text('', { id: `${id}-text` }), {
    id,
    visible: false
  });
}

function selectionInspector(state) {
  const selected = dataRows[state.selectedRow] ?? dataRows[0];
  return stack([
    structuredBlock({
      id: 'selection-card',
      title: routeLabel(state.selectedRoute),
      status: state.paletteOpen || state.modalOpen ? 'running' : 'info',
      summary: `Selected route: ${routeLabel(state.selectedRoute)}`,
      fields: [
        { label: 'vessel', value: selected?.name ?? 'none' },
        { label: 'route', value: state.selectedRoute },
        { label: 'overlay', value: overlayLabel(state) }
      ]
    }),
    table({
      id: 'selection-mini-table',
      rows: [
        ['operator', selected?.owner ?? 'none'],
        ['mouse', state.mouseEnabled ? 'enabled' : 'disabled'],
        ['signal', String(selected?.score ?? 0)],
        ['action', state.lastAction]
      ],
      columns: [{ header: 'Key', width: { kind: 'fixed', cells: 8 } }, { header: 'Value', width: { kind: 'fill' } }],
      selected: 1
    })
  ], { id: 'selection-inspector', gap: 1 });
}

function a11yInspector() {
  return stack([
    text('Accessible snapshot'),
    list({
      id: 'a11y-list',
      items: [
        'application: Northstar Control',
        'tree: operations navigation',
        'group: route workspace',
        'textbox: command bar',
        'status: live operations state'
      ],
      selected: 0
    }),
    progressBar({ id: 'a11y-progress', label: 'coverage', value: 5, max: 5, mode: 'compact', status: 'success' })
  ], { id: 'a11y-inspector', gap: 1 });
}

function renderInspector(state) {
  return stack([
    structuredBlock({
      id: 'render-card',
      title: 'Render pipeline',
      status: 'success',
      summary: 'widget tree → layout tree → frame → diff',
      fields: [
        { label: 'viewport', value: `${showcaseViewport.columns}x${showcaseViewport.rows}` },
        { label: 'theme', value: themeLabel(state) },
        { label: 'transcript', value: 'enabled' }
      ]
    }),
    sparkline({ id: 'diff-sparkline', values: [1, 3, 2, 6, 4, 5, 2, 7, 3] })
  ], { id: 'render-inspector', gap: 1 });
}

function themeInspector(state) {
  return stack([
    text(`Current: ${themeLabel(state)}`),
    barChart({
      id: 'theme-bars',
      items: [
        { label: 'accent', value: 90 },
        { label: 'focus', value: 82 },
        { label: 'status', value: 96 }
      ],
      selected: state.themeIndex % 3
    }),
    button({ id: 'theme-button', label: 'Cycle theme', message: { kind: 'theme' } })
  ], { id: 'theme-inspector', gap: 1 });
}

function bottomChrome(state) {
  return stack([
    commandBar({
      id: 'showcase-command',
      prompt: '›',
      value: state.commandValue,
      cursor: state.commandCursor,
      placeholder: 'Type /palette, /theme, /handoff, /fleet, /dispatch, /events...',
      completionPreview: completionPreview(state.commandValue),
      suggestions: paletteSuggestions,
      selectedSuggestion: state.paletteOpen ? 0 : 1,
      matchQuery: state.commandQuery,
      validation: commandValidation(state.commandValue),
      footer: `Enter runs · Tab focus · Esc closes overlays · ${state.mouseEnabled ? 'mouse on' : 'mouse off'}`,
      keyMap: {
        enter: { kind: 'submitCommand' },
        escape: { kind: 'escape' },
        backspace: { kind: 'commandBackspace' },
        delete: { kind: 'commandDelete' },
        arrowLeft: { kind: 'commandMove', delta: -1 },
        arrowRight: { kind: 'commandMove', delta: 1 },
        home: { kind: 'commandHome' },
        end: { kind: 'commandEnd' },
        arrowUp: { kind: 'paletteMove', delta: -1 },
        arrowDown: { kind: 'paletteMove', delta: 1 }
      },
      inputMap: {
        text: (value) => ({ kind: 'commandText', text: value }),
        paste: (value) => ({ kind: 'commandText', text: value })
      }
    }),
    helpBar({
      id: 'showcase-help',
      bindings: [
        { key: 'Tab', label: 'focus' },
        { key: 'Enter', label: 'activate' },
        { key: '/palette', label: 'commands' },
        { key: '/handoff', label: 'modal' },
        { key: 'Ctrl-C', label: 'exit' }
      ]
    })
  ], { id: 'bottom-chrome' });
}

function commandPaletteOverlay(state) {
  return overlay([
    absolute(opaquePanel('palette-blank'), {
      id: 'palette-blank-placement',
      row: 8,
      column: 29,
      width: 66,
      height: 14,
      zIndex: 19
    }),
    absolute(box(commandPalette({
      id: 'command-palette',
      title: 'Command Palette',
      query: state.commandQuery,
      selected: state.selectedPalette,
      maxVisible: 8,
      entries: commandEntries,
      helpText: 'Search routes, overlays, and shift actions',
      keyMap: {
        escape: { kind: 'palette', open: false },
        arrowUp: { kind: 'paletteMove', delta: -1 },
        arrowDown: { kind: 'paletteMove', delta: 1 },
        enter: { kind: 'palettePick' }
      }
    }), {
      id: 'palette-modal',
      border: { kind: 'double', title: 'Find anything' },
      padding: 1,
      focus: { scope: 'contain' }
    }), {
      id: 'palette-placement',
      row: 8,
      column: 29,
      width: 66,
      height: 14,
      zIndex: 20
    })
  ], { id: 'palette-overlay' });
}

function wizardModal() {
  return modal(stack([
    structuredBlock({
      id: 'wizard-summary',
      title: 'Shift handoff',
      status: 'running',
      summary: 'Prepare the next watch while the live console remains visible underneath.',
      fields: [
        { label: 'watch', value: 'night shift' },
        { label: 'items', value: '3 open' }
      ]
    }),
    row([
      button({ id: 'wizard-close', label: 'Close', message: { kind: 'modal', open: false } }),
      button({ id: 'wizard-theme', label: 'Cycle theme', message: { kind: 'theme' } })
    ], { id: 'wizard-actions', gap: 1 })
  ], { id: 'wizard-stack', gap: 1 }), {
    id: 'release-wizard',
    title: 'Handoff wizard',
    width: 56,
    height: 11,
    zIndex: 30,
    border: { kind: 'rounded' }
  });
}

function contextMenuOverlay() {
  return absolute(contextMenu({
    id: 'floating-context',
    title: 'Context menu',
    selected: 'snapshot',
    items: [
      { id: 'snapshot', label: 'Create snapshot', shortcut: 'S' },
      { id: 'copy', label: 'Copy visible text', shortcut: 'C' },
      { id: 'close', label: 'Close', message: { kind: 'context', open: false }, shortcut: 'Esc' }
    ]
  }), {
    id: 'context-placement',
    row: 8,
    column: 45,
    width: 30,
    height: 8,
    zIndex: 25
  });
}

function customMeter() {
  return custom({
    id: 'custom-meter',
    state: { label: 'Signal meter', value: 87 },
    renderer: {
      render({ widget, node, buffer }) {
        const value = typeof widget.custom?.state?.value === 'number' ? widget.custom.state.value : 0;
        const filled = Math.round(value / 10);
        const bar = `${'█'.repeat(filled)}${'░'.repeat(Math.max(0, 10 - filled))}`;
        buffer.write(node.bounds.row, node.bounds.column, [
          { text: 'Signal meter     ', style: { fg: { kind: 'theme', token: 'text.muted' } } },
          { text: `${bar} ${String(value)}%`, style: { fg: { kind: 'theme', token: 'status.success' }, bold: true } }
        ]);
      },
      accessibility({ id, widget }) {
        return {
          id,
          role: 'meter',
          label: widget.custom?.state?.label ?? 'Signal meter',
          value: `${String(widget.custom?.state?.value ?? 0)}%`
        };
      }
    }
  });
}

function opaquePanel(id) {
  return custom({
    id,
    accessibility: { decorative: true },
    renderer: {
      render({ node, buffer }) {
        const width = Math.max(0, node.bounds.width);
        for (let rowOffset = 0; rowOffset < node.bounds.height; rowOffset += 1) {
          buffer.write(node.bounds.row + rowOffset, node.bounds.column, [{
            text: ' '.repeat(width),
            style: { bg: { kind: 'theme', token: 'surface.background' } }
          }]);
        }
      }
    }
  });
}

function summaryCard(title, status, summary, fields) {
  return structuredBlock({
    id: `summary-${title.toLowerCase().replace(/\s+/gu, '-')}`,
    title,
    status,
    summary,
    fields
  });
}

function heroCanvas(state) {
  return canvas({
    id: 'hero-canvas',
    label: 'Interactive app diagram',
    state,
    painter({ buffer, bounds }) {
      const phase = state.spinnerFrame % 4;
      const lines = [
        'Outer marker      Channel C       Inner harbor',
        '     ●───────────────●─────────────────●',
        '     Pulse           Vector            Aster',
        '       hold            clear             berth 12',
        '',
        'Weather: easing      Cargo: cold-chain clear',
        'Crew: Mira + Rin     Next handoff: 22:30'
      ];
      for (const [index, lineText] of lines.entries()) {
        const active = index === phase * 2 || index === phase * 2 + 1;
        buffer.write(bounds.row + index, bounds.column, [{
          text: lineText,
          style: {
            fg: { kind: 'theme', token: active ? 'accent.primary' : 'text.default' },
            ...(active ? { bold: true } : {})
          }
        }]);
      }
    }
  });
}

function dashboardRows(state) {
  return [
    ['Route', routeLabel(state.selectedRoute)],
    ['Vessel', dataRows[state.selectedRow]?.name ?? 'none'],
    ['Overlay', overlayLabel(state)],
    ['Action', state.lastAction]
  ];
}

function sparklineValues(frame) {
  const base = [2, 5, 4, 7, 8, 6, 9, 11, 10, 13];
  return base.map((value, index) => value + ((frame + index) % 3));
}

function quickActionMessage(value) {
  if (value === 'Palette') return { kind: 'palette', open: true };
  if (value === 'Handoff') return { kind: 'modal', open: true };
  if (value === 'Context') return { kind: 'context', open: true };
  return { kind: 'theme' };
}

function applyQuickAction(state, value) {
  if (value === 'Palette') return { ...state, paletteOpen: true, modalOpen: false, contextMenuOpen: false, lastAction: 'Command palette opened.' };
  if (value === 'Handoff') return { ...state, modalOpen: true, paletteOpen: false, contextMenuOpen: false, lastAction: 'Handoff wizard opened.' };
  if (value === 'Context') return { ...state, contextMenuOpen: true, paletteOpen: false, modalOpen: false, lastAction: 'Context menu opened.' };
  return { ...state, themeIndex: state.themeIndex + 1, lastAction: `Theme changed to ${themeLabel({ ...state, themeIndex: state.themeIndex + 1 })}.` };
}

function applyPaletteEntry(state, entry) {
  if (entry === undefined) return { ...state, paletteOpen: false, lastAction: 'No palette entry selected.' };
  if (entry.id === 'theme') return { ...state, paletteOpen: false, themeIndex: state.themeIndex + 1, lastAction: 'Palette changed the theme.' };
  if (entry.id === 'modal') return { ...state, paletteOpen: false, modalOpen: true, contextMenuOpen: false, lastAction: 'Palette opened the handoff wizard.' };
  const route = routeForNode(entry.id);
  return {
    ...state,
    selectedRoute: route,
    selectedNavigation: route,
    paletteOpen: false,
    contextMenuOpen: false,
    lastAction: `Palette opened ${routeLabel(route)}.`
  };
}

function editCommand(state, action) {
  const value = state.commandValue;
  const cursor = clamp(state.commandCursor, 0, value.length);
  if (action.kind === 'insert') {
    const next = `${value.slice(0, cursor)}${action.text}${value.slice(cursor)}`;
    return commandState(state, next, cursor + action.text.length);
  }
  if (action.kind === 'backspace') {
    if (cursor === 0) return state;
    const next = `${value.slice(0, cursor - 1)}${value.slice(cursor)}`;
    return commandState(state, next, cursor - 1);
  }
  if (action.kind === 'delete') {
    if (cursor >= value.length) return state;
    const next = `${value.slice(0, cursor)}${value.slice(cursor + 1)}`;
    return commandState(state, next, cursor);
  }
  if (action.kind === 'move') return commandState(state, value, clamp(cursor + action.delta, 0, value.length));
  if (action.kind === 'home') return commandState(state, value, 0);
  return commandState(state, value, value.length);
}

function commandState(state, value, cursor) {
  return {
    ...state,
    commandValue: value,
    commandCursor: cursor,
    commandQuery: value.replace(/^\/+/u, '').slice(0, 24)
  };
}

function runCommand(state) {
  const command = state.commandValue.trim();
  if (command.length === 0 || command === '/palette') {
    return { ...commandState(state, command, command.length), paletteOpen: true, modalOpen: false, contextMenuOpen: false, lastAction: 'Command opened the palette.' };
  }
  if (command === '/theme') return { ...state, commandValue: '', commandCursor: 0, commandQuery: '', themeIndex: state.themeIndex + 1, lastAction: 'Command cycled the theme.' };
  if (command === '/handoff' || command === '/wizard') return { ...state, commandValue: '', commandCursor: 0, commandQuery: '', modalOpen: true, paletteOpen: false, contextMenuOpen: false, lastAction: 'Command opened the handoff wizard.' };
  if (command === '/context') return { ...state, commandValue: '', commandCursor: 0, commandQuery: '', contextMenuOpen: true, paletteOpen: false, modalOpen: false, lastAction: 'Command opened the context menu.' };
  const route = routeCommand(command);
  if (route !== undefined) {
    return {
      ...state,
      commandValue: '',
      commandCursor: 0,
      commandQuery: '',
      selectedRoute: route,
      selectedNavigation: route,
      paletteOpen: false,
      lastAction: `Command opened ${routeLabel(route)}.`
    };
  }
  return { ...state, paletteOpen: true, commandQuery: command.replace(/^\/+/u, ''), lastAction: `No direct command for ${command}; opened palette.` };
}

function routeCommand(command) {
  const key = command.replace(/^\/+/u, '');
  if (['dashboard', 'data', 'text', 'diagram', 'forms', 'activity'].includes(key)) return key;
  if (key === 'overview') return 'dashboard';
  if (key === 'fleet') return 'data';
  if (key === 'briefing') return 'text';
  if (key === 'map') return 'diagram';
  if (key === 'dispatch') return 'forms';
  if (key === 'events') return 'activity';
  if (key === 'canvas') return 'diagram';
  return undefined;
}

function completionPreview(value) {
  const commands = ['/palette', '/theme', '/handoff', '/overview', '/fleet', '/briefing', '/map', '/dispatch', '/events', '/context'];
  if (value.length === 0) return undefined;
  const match = commands.find((command) => command.startsWith(value) && command !== value);
  return match?.slice(value.length);
}

function commandValidation(value) {
  if (value.length === 0) return { tone: 'info', message: 'ready for command or text input' };
  if (!value.startsWith('/')) return { tone: 'warning', message: 'commands begin with /' };
  return { tone: 'info', message: completionPreview(value) === undefined ? 'command ready' : 'completion available' };
}

function tickerSource() {
  return {
    id: 'showcase-ticker',
    source: 'timer',
    async *messages(context) {
      while (!context.signal.aborted) {
        await context.clock.sleep(700, context.signal);
        if (!context.signal.aborted) yield { kind: 'tick' };
      }
    }
  };
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, Math.floor(value)));
}

function rgb(r, g, b) {
  return { kind: 'rgb', r, g, b };
}

function routeForNode(id) {
  return ['dashboard', 'data', 'text', 'diagram', 'forms', 'activity'].includes(id) ? id : 'dashboard';
}

function routeLabel(route) {
  const labels = {
    dashboard: 'Overview',
    data: 'Fleet board',
    text: 'Briefing room',
    diagram: 'Route map',
    forms: 'Dispatch desk',
    activity: 'Live events'
  };
  return labels[route] ?? 'Overview';
}

function themeLabel(state) {
  return themeSequence[state.themeIndex % themeSequence.length] ?? 'studio';
}

function themeIndexFor(value) {
  return Math.max(0, themeSequence.findIndex((item) => item === value));
}

function overlayLabel(state) {
  if (state.paletteOpen) return 'palette';
  if (state.modalOpen) return 'modal';
  if (state.contextMenuOpen) return 'context menu';
  return 'none';
}

function statusLabel(state) {
  const overlay = overlayLabel(state);
  if (overlay !== 'none') return overlay;
  return `${routeLabel(state.selectedRoute)} live`;
}

async function main() {
  if (process.stdout.isTTY !== true) {
    console.log(renderFramePlain(renderShowcaseFrame(initialShowcaseState(), showcaseViewport)));
    return;
  }
  const app = createShowcaseApp();
  const host = createTerminalHost();
  const exit = await runTui(app, host, { theme: showcaseTheme, initialFocusPath: commandFocusPath });
  if (exit.status === 'error') {
    process.exitCode = 1;
    console.error(exit.diagnostics.map((item) => item.message).join('\n'));
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main();
}
