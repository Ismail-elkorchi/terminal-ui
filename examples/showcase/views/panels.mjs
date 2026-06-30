import {
  activityFeed,
  absolute,
  barChart,
  box,
  button,
  canvas,
  checkbox,
  dropdown,
  field,
  form,
  grid,
  inputField,
  menu,
  numberInput,
  paginator,
  progressBar,
  radioGroup,
  richText,
  row,
  scrollback,
  selectBox,
  sparkline,
  splitPane,
  stack,
  structuredBlock,
  surface,
  table,
  tabs,
  text,
  textArea,
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
import { compactViewport, progressTone } from './view-utils.mjs';

export function mainRegion(state, viewport) {
  const compact = compactViewport(viewport);
  const inspectorWidth = state.layoutMode === 'wide' ? 30 : compact ? 26 : 32;
  const navWidth = state.layoutMode === 'compact' ? 20 : compact ? 23 : 24;
  return splitPane([
    box(navigationPane(state), {
      id: 'navigation-shell',
      border: { kind: 'rounded', title: 'Watch' },
      padding: { left: 1, right: 1 }
    }),
    workspacePane(state, viewport),
    inspectorPane(state)
  ], {
    id: 'main-layout',
    direction: 'horizontal',
    sizes: [
      { kind: 'fixed', cells: navWidth },
      { kind: 'fill', weight: 4 },
      { kind: 'fixed', cells: inspectorWidth }
    ],
    gap: 1
  });
}

function workspacePane(state, viewport) {
  return tabs({
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
  });
}

function showcaseTab(state, id, label, panel) {
  return {
    id,
    label,
    message: { kind: 'route', route: id },
    panel: state.selectedRoute === id ? panel : box(text('', { id: `workspace-${id}-inactive-text` }), {
      id: `workspace-${id}-inactive`,
      visible: false
    })
  };
}

function dataPanel(state) {
  const sortedRows = dataRows;
  return stack([
    table({
      id: 'showcase-table',
      rows: sortedRows.map((rowItem) => [rowItem.name, rowItem.type, rowItem.status, rowItem.score]),
      selected: state.fleetTable.selectedRow,
      selectedCell: { row: state.fleetTable.selectedRow, column: state.fleetTable.selectedColumn ?? 2 },
      stickyHeader: true,
      columns: [
        { header: 'Vessel', width: { kind: 'fixed', cells: state.fleetTable.columnWidths?.name ?? 10 }, sort: 'ascending' },
        { header: 'Class', width: { kind: 'fill' } },
        { header: 'State', width: { kind: 'fixed', cells: state.fleetTable.columnWidths?.status ?? 10 } },
        { header: 'Signal', width: { kind: 'fixed', cells: 7 }, align: 'end' }
      ],
      keyMap: {
        arrowDown: { kind: 'row', row: Math.min(dataRows.length - 1, state.fleetTable.selectedRow + 1) },
        arrowUp: { kind: 'row', row: Math.max(0, state.fleetTable.selectedRow - 1) }
      },
      scrollbar: { visible: true }
    }),
    row([
      paginator({ id: 'data-pages', label: 'Fleet', page: 1, pageCount: 4 }),
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
    absolute(box(barChart({
      id: 'route-pressure',
      selected: 1,
      items: [
        { label: 'north', value: 42 },
        { label: 'west', value: selectedVessel(state).status === 'routing' ? 91 : 76 },
        { label: 'inner', value: 63 }
      ]
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
    { id: 'catppuccin', label: 'Catppuccin', value: 'catppuccin' },
    { id: 'tokyo-night', label: 'Tokyo Night', value: 'tokyoNight' },
    { id: 'contrast', label: 'High contrast', value: 'highContrast' },
    { id: 'plain', label: 'No color', value: 'noColor' }
  ];
  return splitPane([
    form([
      field(inputField({ id: 'console-name', value: 'Northstar Control' }), {
        id: 'console-name-field',
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
        description: 'Changes spacing and side-board proportions'
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
  return box(tabs({
    id: 'inspector-tabs',
    selected: state.selectedInspector,
    tabs: [
      inspectorTab(state, 'vessel', 'Vessel', vesselInspector(state)),
      inspectorTab(state, 'route', 'Route', routeInspector(state)),
      inspectorTab(state, 'event', 'Event', eventInspector(state)),
      inspectorTab(state, 'theme', 'Theme', themeInspector(state))
    ]
  }), {
    id: 'inspector-pane',
    border: { kind: 'rounded', title: 'Inspector' },
    padding: { left: 1, right: 1 }
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
    barChart({
      id: 'route-bars',
      items: [
        { label: 'traffic', value: 78 },
        { label: 'weather', value: 82 },
        { label: 'crew', value: 91 }
      ],
      selected: state.spinnerFrame % 3
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
