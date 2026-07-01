import {
  activityFeed,
  absolute,
  barChart,
  box,
  breadcrumb,
  button,
  canvas,
  chart,
  checkboxList,
  collapsibleSection,
  colorPicker,
  datePicker,
  dropdown,
  areaGrid,
  field,
  form,
  grid,
  inputField,
  menu,
  paginatedTable,
  progressBar,
  radioGroup,
  richText,
  row,
  scrollback,
  sparkline,
  splitPane,
  stack,
  structuredBlock,
  surface,
  sidePanel,
  slider,
  tabs,
  tabOverflowMenu,
  text,
  textArea,
  toggleSwitch,
  viewport
} from '@ismail-elkorchi/terminal-ui/widgets';

import { activityBlocks, dataRows, logItems } from '../data.mjs';
import {
  overlayLabel,
  routeLabel,
  selectedActivityBlock,
  selectedVessel
} from '../state.mjs';
import { themeLabel } from '../theme.mjs';
import { navigationPane } from './chrome.mjs';
import { dashboardPanel } from './dashboard.mjs';
import { compactViewport, densityRole, progressTone } from './view-utils.mjs';

export function mainRegion(state, viewport, variant = responsiveVariant(viewport)) {
  const compact = compactViewport(viewport);
  const inspectorWidth = state.layoutMode === 'wide' ? 30 : compact ? 26 : 32;
  const navWidth = state.layoutMode === 'compact' ? 20 : compact ? 23 : 24;
  const nav = navigationShell(state);
  const workspace = workspacePane(state, viewport);
  const inspector = inspectorPane(state);

  if (variant === 'wide') {
    return areaGrid({
      id: 'main-layout-wide',
      areas: 'nav workspace inspector',
      rows: [{ kind: 'fill' }],
      columns: [
        { kind: 'fixed', cells: navWidth },
        { kind: 'fill', weight: 4 },
        { kind: 'fixed', cells: inspectorWidth }
      ],
      children: { nav, workspace, inspector },
      gap: 1
    });
  }

  if (variant === 'medium') {
    return areaGrid({
      id: 'main-layout-medium',
      areas: 'nav workspace',
      rows: [{ kind: 'fill' }],
      columns: [{ kind: 'fixed', cells: navWidth }, { kind: 'fill', weight: 4 }],
      children: { nav, workspace },
      gap: 1
    });
  }

  return areaGrid({
    id: 'main-layout-narrow',
    areas: 'workspace',
    rows: [{ kind: 'fill' }],
    columns: [{ kind: 'fill' }],
    children: { workspace }
  });
}

function navigationShell(state) {
  return sidePanel({
    id: 'navigation-shell',
    title: 'Watch',
    body: navigationPane(state),
    variant: 'inset',
    density: densityRole(state.density)
  });
}

function workspacePane(state, viewport) {
  return splitPane([
    workspaceNavigation(state, viewport),
    routePanel(state, viewport, state.selectedRoute)
  ], {
    id: 'workspace-shell',
    direction: 'vertical',
    sizes: [{ kind: 'fixed', cells: 2 }, { kind: 'fill' }],
    gap: 0
  });
}

function workspaceNavigation(state, viewport) {
  return stack([
    breadcrumb({
      id: 'workspace-breadcrumb',
      separator: '›',
      items: [
        { id: 'watch', label: 'Watch', message: { kind: 'route', route: 'dashboard' } },
        { id: state.selectedRoute, label: routeLabel(state.selectedRoute), message: { kind: 'route', route: state.selectedRoute } }
      ]
    }),
    tabOverflowMenu({
      id: 'workspace-route-menu',
      selected: state.selectedRoute,
      maxVisible: 4,
      overflowLabel: 'More routes',
      tabs: routeItems().map(({ id, label }) => ({
        id,
        label,
        message: { kind: 'route', route: id }
      }))
    })
  ], {
    id: 'workspace-navigation'
  });
}

function routeItems() {
  return [
    { id: 'dashboard', label: 'Overview' },
    { id: 'data', label: 'Fleet' },
    { id: 'text', label: 'Briefing' },
    { id: 'diagram', label: 'Map' },
    { id: 'forms', label: 'Dispatch' },
    { id: 'activity', label: 'Events' }
  ];
}

function routePanel(state, viewport, id) {
  if (id === 'dashboard') return dashboardPanel(state, viewport);
  if (id === 'data') return dataPanel(state);
  if (id === 'text') return textPanel(state);
  if (id === 'diagram') return diagramPanel(state);
  if (id === 'forms') return formsPanel(state);
  return activityPanel(state, viewport);
}

function dataPanel(state) {
  const sortedRows = dataRows;
  return stack([
    paginatedTable({
      id: 'showcase-table-pages',
      tableId: 'showcase-table',
      paginatorId: 'data-pages',
      label: 'Fleet',
      page: 1,
      pageSize: 6,
      rows: sortedRows.map((rowItem) => [rowItem.name, rowItem.type, rowItem.status, rowItem.score]),
      selected: state.fleetTable.selectedRow,
      selectedCell: { row: state.fleetTable.selectedRow, column: state.fleetTable.selectedColumn ?? 2 },
      stickyHeader: true,
      columns: [
        { header: 'Vessel', width: { kind: 'fixed', cells: state.fleetTable.columnWidths?.name ?? 10 }, sort: 'ascending', resizable: true },
        { header: 'Class', width: { kind: 'fill' } },
        { header: 'State', width: { kind: 'fixed', cells: state.fleetTable.columnWidths?.status ?? 10 }, resizable: true },
        { header: 'Signal', width: { kind: 'fixed', cells: 7 }, align: 'end' }
      ],
      keyMap: {
        arrowDown: { kind: 'row', row: Math.min(dataRows.length - 1, state.fleetTable.selectedRow + 1) },
        arrowUp: { kind: 'row', row: Math.max(0, state.fleetTable.selectedRow - 1) }
      }
    }),
    row([
      progressBar({ id: 'data-progress', label: `${selectedVessel(state).name} clearance`, value: selectedVessel(state).score, max: 100, mode: 'compact', status: progressTone(selectedVessel(state).score) })
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
    stack([
      richText({
        id: 'rich-copy',
        segments: [
          { text: 'Advisory: ', style: { bold: true } },
          { text: `${selectedVessel(state).name} ${selectedVessel(state).status} `, style: { fg: { kind: 'theme', token: 'accent.primary' } } },
          { text: 'while west-lane traffic stays dense.' }
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
        scroll: { row: state.scrollRow, column: 0, followTail: state.scrollbackState.followTail },
        scrollbar: { visible: true },
        wrap: true,
        searchQuery: state.scrollbackState.searchQuery
      })
    ], { id: 'text-side-stack', gap: 1 })
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
      label: 'Route map',
      state,
      painter({ canvas }) {
        const vessel = selectedVessel(state);
        canvas.rect({ row: 0, column: 0, width: 62, height: 13 }, { stroke: { text: '·', style: { fg: { kind: 'theme', token: 'text.muted' } } } });
        canvas.text(2, 1, [{ text: 'Outer marker ───── west lane ───── inner harbor', style: { fg: { kind: 'theme', token: 'accent.primary' }, bold: true } }]);
        canvas.line(8, 4, 48, 4, { text: '─', style: { fg: { kind: 'theme', token: 'status.success' } } });
        canvas.circle({ x: 10, y: 4 }, 2, { stroke: { text: 'o', style: { fg: { kind: 'theme', token: 'accent.primary' } } } });
        canvas.ellipse({ x: 33, y: 4 }, 5, 2, { stroke: { text: '*', style: { fg: { kind: 'theme', token: 'status.warning' } } } });
        canvas.text(5, 8, [{ text: `${vessel.name}: ${vessel.status}`, style: { fg: { kind: 'theme', token: 'text.default' }, bold: true } }]);
        canvas.text(31, 8, [{ text: `owner ${vessel.owner}`, style: { fg: { kind: 'theme', token: 'text.muted' } } }]);
      }
    }), { id: 'route-map-card', border: { kind: 'double', title: 'Route map' }, padding: 1 }), {
      id: 'route-map-region',
      row: 1,
      column: 1,
      width: 68,
      height: 18
    }),
    absolute(structuredBlock({
      id: 'route-status',
      title: 'Active instruction',
      status: selectedVessel(state).status === 'holding' ? 'warning' : 'running',
      summary: `${selectedVessel(state).name} stays under ${selectedVessel(state).owner}'s watch until the next route clearance.`,
      fields: [
        { label: 'risk', value: selectedVessel(state).score < 75 ? 'medium' : 'low' },
        { label: 'handoff', value: 'pending' }
      ]
    }), {
      id: 'route-note-region',
      row: 20,
      column: 1,
      width: 68,
      height: 8
    }),
    absolute(box(chart({
      id: 'route-pressure',
      legend: true,
      yLabel: 'traffic',
      xLabel: 'watch cycle',
      selected: { series: 'lane', point: state.spinnerFrame % 6 },
      series: [
        { id: 'lane', label: 'lane', kind: 'line', glyph: '+', points: [42, 55, 67, selectedVessel(state).status === 'routing' ? 91 : 76, 70, 63] },
        { id: 'gust', label: 'gust', kind: 'scatter', glyph: 'o', points: [64, 58, 71, 69, 62, 57] }
      ],
      keyMap: { enter: { kind: 'chartPoint', series: 'lane', point: state.spinnerFrame % 6 } },
      toMessage: (point) => ({ kind: 'chartPoint', series: point.series, point: point.point })
    }), { id: 'lane-pressure-card', border: { kind: 'single', title: 'Lane pressure' }, padding: 1 }), {
      id: 'lane-pressure-region',
      row: 1,
      column: 72,
      width: 36,
      height: 12
    }),
    absolute(stack([
      text('Channel C remains the active constraint.'),
      text(`${selectedVessel(state).name} updates the route board immediately.`),
      sparkline({ id: 'route-sparkline', values: [5, 7, 4, 9, 8, 10, 7, 11, 9] })
    ], { id: 'diagram-notes', gap: 1 }), {
      id: 'route-notes-region',
      row: 14,
      column: 72,
      width: 36,
      height: 14
    })
  ], { id: 'diagram-surface', label: 'Harbor route surface' });
}

function formsPanel(state) {
  const themeOptions = [
    { id: 'catppuccin', label: 'Catppuccin', value: 'catppuccin', swatch: '●' },
    { id: 'tokyoNight', label: 'Tokyo Night', value: 'tokyoNight', swatch: '◆' },
    { id: 'highContrast', label: 'High contrast', value: 'highContrast', swatch: '■' },
    { id: 'noColor', label: 'No color', value: 'noColor', swatch: '◇' }
  ];
  const channelOptions = [
    { id: 'vhf', label: 'VHF', value: 'vhf' },
    { id: 'ais', label: 'AIS', value: 'ais' },
    { id: 'sms', label: 'SMS', value: 'sms' }
  ];
  return splitPane([
    form([
      field(inputField({ id: 'console-name', value: 'Northstar Control' }), {
        id: 'console-name-field',
        label: 'Console',
        description: 'Visible name for this operations room'
      }),
      field(slider({
        id: 'density',
        value: state.density,
        min: 1,
        max: 5,
        width: 9,
        decrementMessage: { kind: 'density', value: state.density - 1 },
        incrementMessage: { kind: 'density', value: state.density + 1 },
        toMessage: (value) => ({ kind: 'density', value })
      }), {
        id: 'density-field',
        label: 'Density',
        description: 'Changes spacing and side-board proportions'
      }),
      toggleSwitch({ id: 'mouse-enabled', label: 'Mouse controls', checked: state.mouseEnabled, message: { kind: 'toggleMouse' } }),
      checkboxList({
        id: 'dispatch-channels',
        label: 'Dispatch channels',
        options: channelOptions,
        selected: state.selectedChannels,
        toMessage: (option, checked) => ({ kind: 'channel', id: option.id, checked })
      }),
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
      colorPicker({
        id: 'theme-select',
        label: 'Theme',
        selected: themeLabel(state),
        columns: 2,
        options: themeOptions,
        toMessage: (option) => ({ kind: 'setTheme', value: option.value })
      }),
      datePicker({
        id: 'dispatch-date',
        label: 'Dispatch window',
        selected: state.dispatchDate,
        days: dispatchDays(),
        toMessage: (day) => ({ kind: 'dispatchDate', value: day.value })
      }),
      dropdown({
        id: 'theme-dropdown',
        label: 'Theme menu',
        open: state.dropdownOpen,
        selected: themeLabel(state),
        items: themeOptions.map((option) => ({
          id: option.id,
          label: option.label,
          checked: themeLabel(state) === option.value,
          message: { kind: 'setTheme', value: option.value }
        })),
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
        { id: 'context', label: 'Route context', message: { kind: 'context', open: true }, shortcut: 'C' }
      ]
    }), { id: 'form-menu-card', border: { kind: 'single', title: 'Actions' }, padding: 1 })
  ], {
    id: 'forms-split',
    direction: 'horizontal',
    sizes: [{ kind: 'fill' }, { kind: 'fixed', cells: 28 }],
    gap: 1
  });
}

function dispatchDays() {
  return Array.from({ length: 21 }, (_, index) => {
    const day = index + 1;
    const value = `2026-06-${String(day).padStart(2, '0')}`;
    return {
      id: value,
      label: String(day),
      value,
      today: day === 15
    };
  });
}

function activityPanel(state, viewport) {
  const feed = activityFeed({
      id: 'activity-feed',
      blocks: activityBlocks,
      selected: state.activityState.selected,
      keyMap: {
        arrowDown: { kind: 'activityNext' },
        arrowUp: { kind: 'activityPrevious' }
      }
    });
  const selected = eventCard(state);
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
    selected
  ], {
    id: 'activity-split',
    direction: 'horizontal',
    sizes: [{ kind: 'fill' }, { kind: 'fixed', cells: 34 }],
    gap: 1
  });
}

function inspectorPane(state) {
  return sidePanel({
    id: 'inspector-pane',
    title: 'Inspector',
    body: tabs({
      id: 'inspector-tabs',
      selected: state.selectedInspector,
      tabs: [
        inspectorTab(state, 'vessel', 'Vessel', vesselInspector(state)),
        inspectorTab(state, 'route', 'Route', routeInspector(state)),
        inspectorTab(state, 'event', 'Event', eventInspector(state)),
        inspectorTab(state, 'theme', 'Theme', themeInspector(state))
      ]
    }),
    variant: 'inset',
    density: densityRole(state.density)
  });
}

function inspectorTab(state, id, label, panel) {
  return {
    id,
    label,
    message: { kind: 'inspector', inspector: id },
    panel: state.selectedInspector === id ? panel : box(text('', { id: `inspector-${id}-inactive-text` }), {
      id: `inspector-${id}-inactive`,
      visible: false
    })
  };
}

function vesselInspector(state) {
  const vessel = selectedVessel(state);
  return stack([
    structuredBlock({
      id: 'vessel-card',
      title: `${vessel.name} watch`,
      status: vessel.score < 75 ? 'warning' : 'success',
      summary: `${vessel.type} vessel under ${vessel.owner}'s responsibility.`,
      fields: [
        { label: 'state', value: vessel.status },
        { label: 'signal', value: `${String(vessel.score)}%` },
        { label: 'route', value: routeLabel(state.selectedRoute) },
        { label: 'overlay', value: overlayLabel(state) }
      ]
    }),
    progressBar({ id: 'vessel-signal', label: 'signal', value: vessel.score, max: 100, mode: 'full', status: progressTone(vessel.score) })
  ], { id: 'vessel-inspector', gap: 1 });
}

function routeInspector(state) {
  const vessel = selectedVessel(state);
  return stack([
    structuredBlock({
      id: 'route-card',
      title: routeLabel(state.selectedRoute),
      status: vessel.status === 'routing' ? 'running' : 'info',
      summary: `${vessel.name} is the active object for this route view.`,
      fields: [
        { label: 'layout', value: state.layoutMode },
        { label: 'density', value: String(state.density) },
        { label: 'last action', value: state.lastAction }
      ]
    }),
    collapsibleSection({
      id: 'route-conditions',
      title: 'Conditions',
      expanded: true,
      message: { kind: 'inspector', inspector: 'route' },
      body: barChart({
        id: 'route-bars',
        items: [
          { label: 'traffic', value: 78 },
          { label: 'weather', value: 82 },
          { label: 'crew', value: 91 }
        ],
        selected: state.spinnerFrame % 3
      })
    })
  ], { id: 'route-inspector', gap: 1 });
}

function eventInspector(state) {
  return stack([
    eventCard(state),
    progressBar({ id: 'event-progress', label: 'handoff', value: state.activityState.selected + 1, max: activityBlocks.length, mode: 'compact', status: 'running' })
  ], { id: 'event-inspector', gap: 1 });
}

function themeInspector(state) {
  return stack([
    text(`Current: ${themeLabel(state)}`, { textRole: 'metadata' }),
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

function eventCard(state) {
  const block = selectedActivityBlock(state);
  return structuredBlock({
    id: 'selected-activity',
    title: block.title,
    status: block.status ?? 'info',
    summary: block.summary ?? '',
    fields: block.fields ?? []
  });
}

function responsiveVariant(viewport) {
  if (viewport.columns < 100) return 'narrow';
  if (viewport.columns < 150) return 'medium';
  return 'wide';
}
