import { activityBlocks, commandEntries, dataRows } from './data.mjs';

export const showcaseViewport = Object.freeze({ columns: 160, rows: 42 });
export const commandFocusPath = Object.freeze(['showcase-overlay', 'showcase-shell', 'bottom-chrome', 'showcase-command']);
export const commandQueryCells = 24;
export const themeSequence = Object.freeze(['catppuccin', 'tokyoNight', 'highContrast', 'noColor']);
export const quickActions = Object.freeze(['Palette', 'Handoff', 'Theme', 'Context']);

export function initialShowcaseState() {
  return {
    selectedRoute: 'dashboard',
    selectedInspector: 'vessel',
    selectedNavigation: 'dashboard',
    selectedQuickAction: 0,
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
      'Aster is secure at berth 12. Pulse holds at the ferry marker until Vector clears channel C.'
    ].join('\n'),
    lastAction: 'Harbor overview ready. Select a vessel, open a route, or type a command.',
    themeIndex: 0,
    spinnerFrame: 0,
    scrollRow: 2,
    progress: 72,
    fleetTable: {
      selectedRow: 1,
      selectedColumn: 2,
      sort: { column: 'score', direction: 'descending' },
      columnWidths: { name: 10, status: 10 }
    },
    navState: {
      selected: 'dashboard',
      filterQuery: ''
    },
    paletteState: {
      query: '',
      selectedIndex: 0,
      selectedIds: [],
      previewId: commandEntries[0]?.id
    },
    activityState: {
      selected: 1,
      expandedIds: [activityBlocks[1]?.id ?? 'lane'],
      collapsedIds: [],
      statusFilter: []
    },
    scrollbackState: {
      searchQuery: 'lane',
      selectedMatchIndex: 0,
      foldedIds: [],
      followTail: false
    }
  };
}

export function selectedVessel(state) {
  return dataRows[state.fleetTable.selectedRow ?? 0] ?? dataRows[0];
}

export function selectedActivityBlock(state) {
  return activityBlocks[state.activityState.selected ?? 0] ?? activityBlocks[0];
}

export function routeLabel(route) {
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

export function routeForNode(id) {
  return ['dashboard', 'data', 'text', 'diagram', 'forms', 'activity'].includes(id) ? id : 'dashboard';
}

export function overlayLabel(state) {
  if (state.paletteOpen) return 'palette';
  if (state.modalOpen) return 'handoff';
  if (state.contextMenuOpen) return 'context menu';
  if (state.dropdownOpen) return 'theme menu';
  return 'clear';
}

export function statusLabel(state) {
  const overlay = overlayLabel(state);
  if (overlay !== 'clear') return overlay;
  return `${routeLabel(state.selectedRoute)} live`;
}

export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, Math.floor(value)));
}
