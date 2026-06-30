import { blockSpan } from '@ismail-elkorchi/terminal-ui/tui';
import {
  absolute,
  barChart,
  box,
  canvas,
  grid,
  progressBar,
  row,
  sparkline,
  splitPane,
  stack,
  structuredBlock,
  surface,
  table,
  text
} from '@ismail-elkorchi/terminal-ui/widgets';

import { dataRows } from '../data.mjs';
import { overlayLabel, routeLabel, selectedVessel } from '../state.mjs';
import { progressTone } from './view-utils.mjs';

export function dashboardPanel(state, viewport) {
  const wide = viewport.columns >= 150;
  return grid([
    operationsHeader(state),
    wide ? wideOperationsFloor(state) : compactOperationsFloor(state)
  ], {
    id: 'dashboard-grid',
    rows: [{ kind: 'fixed', cells: headerHeight(state) }, { kind: 'fill' }],
    columns: [{ kind: 'fill' }],
    gap: Math.max(0, state.density - 3)
  });
}

function operationsHeader(state) {
  const vessel = selectedVessel(state);
  return structuredBlock({
    id: 'operations-summary',
    title: 'Night watch command',
    status: state.progress >= 92 ? 'success' : 'running',
    summary: `${vessel.name} is ${vessel.status}; ${routeLabel(state.selectedRoute)} is active and overlays are ${overlayLabel(state)}.`,
    fields: [
      { label: 'selected', value: vessel.name },
      { label: 'signal', value: `${String(vessel.score)}%` },
      { label: 'service', value: `${String(state.progress)}%` },
      { label: 'last action', value: state.lastAction }
    ]
  });
}

function wideOperationsFloor(state) {
  return splitPane([
    box(surface([
      absolute(heroCanvas(state), {
        id: 'hero-canvas-region',
        row: 1,
        column: 2,
        width: 70,
        height: 17
      }),
      absolute(routeTimeline(state), {
        id: 'timeline-region',
        row: 19,
        column: 2,
        width: 70,
        height: 6
      }),
      absolute(signalStrip(state), {
        id: 'signal-strip-region',
        row: 26,
        column: 2,
        width: 70,
        height: 3
      })
    ], { id: 'operations-surface', label: 'Live harbor surface' }), {
      id: 'operations-map',
      border: { kind: 'rounded', title: 'Live harbor surface' },
      padding: 0
    }),
    stack([
      capacityBoard(state),
      selectedVesselCard(state),
      actionCard(state)
    ], {
      id: 'operations-side-stack',
      gap: 1
    })
  ], {
    id: 'dashboard-body',
    direction: 'horizontal',
    sizes: [{ kind: 'fill', weight: 3 }, { kind: 'fixed', cells: sideWidth(state) }],
    gap: 1
  });
}

function compactOperationsFloor(state) {
  return splitPane([
    box(stack([
      heroCanvas(state),
      routeTimeline(state)
    ], { id: 'compact-map-stack', gap: 1 }), {
      id: 'compact-operations-map',
      border: { kind: 'rounded', title: 'Harbor surface' },
      padding: 1
    }),
    box(stack([
      capacityBoard(state),
      selectedVesselCard(state)
    ], { id: 'compact-side-stack', gap: 1 }), {
      id: 'compact-operation-board',
      border: { kind: 'rounded', title: 'Watch board' },
      padding: 1
    })
  ], {
    id: 'compact-dashboard-body',
    direction: 'vertical',
    sizes: [{ kind: 'fill', weight: 2 }, { kind: 'fixed', cells: 14 }],
    gap: 1
  });
}

function capacityBoard(state) {
  return box(stack([
    barChart({
      id: 'capacity-bars',
      selected: state.fleetTable.selectedRow % 4,
      items: [
        { label: 'berths', value: 95 },
        { label: 'lanes', value: selectedVessel(state).status === 'routing' ? 86 : 72 },
        { label: 'crews', value: 91 },
        { label: 'weather', value: 82 + (state.spinnerFrame % 8) }
      ]
    }),
    progressBar({
      id: 'capacity-progress',
      label: 'service',
      value: state.progress,
      max: 100,
      mode: 'full',
      showPercentage: true,
      status: progressTone(state.progress)
    }),
    sparkline({ id: 'capacity-sparkline', values: sparklineValues(state.spinnerFrame) })
  ], { id: 'capacity-stack', gap: 1 }), {
    id: 'capacity-board',
    border: { kind: 'single', title: 'Capacity' },
    padding: 1
  });
}

function selectedVesselCard(state) {
  const vessel = selectedVessel(state);
  return structuredBlock({
    id: 'selected-vessel-card',
    title: `${vessel.name} · ${vessel.type}`,
    status: vessel.status === 'holding' || vessel.status === 'watch' ? 'warning' : vessel.status === 'routing' ? 'running' : 'success',
    summary: `${vessel.owner} owns this watch item. Selecting a different fleet row updates this card, the map node, and the inspector.`,
    fields: [
      { label: 'state', value: vessel.status },
      { label: 'signal', value: `${String(vessel.score)}%` },
      { label: 'route', value: routeLabel(state.selectedRoute) },
      { label: 'overlay', value: overlayLabel(state) }
    ]
  });
}

function actionCard(state) {
  return structuredBlock({
    id: 'dashboard-action-card',
    title: 'Operations pulse',
    status: 'info',
    summary: state.lastAction,
    fields: [
      { label: 'density', value: String(state.density) },
      { label: 'layout', value: state.layoutMode },
      { label: 'mouse', value: state.mouseEnabled ? 'enabled' : 'disabled' }
    ]
  });
}

function routeTimeline(state) {
  const vessel = selectedVessel(state);
  return box(stack([
    row([
      text('outer marker'),
      text('──'),
      text(vessel.name, { id: 'timeline-vessel' }),
      text('──'),
      text(vessel.status === 'routing' ? 'channel C' : 'berth 12'),
      text('──'),
      text('handoff')
    ], { id: 'timeline-row', gap: 1 }),
    progressBar({
      id: 'timeline-progress',
      label: 'route clearance',
      value: Math.max(20, vessel.score - 10 + (state.spinnerFrame % 6)),
      max: 100,
      mode: 'full',
      status: vessel.score < 75 ? 'warning' : 'running'
    })
  ], { id: 'timeline-stack', gap: 1 }), {
    id: 'route-timeline',
    border: { kind: 'single', title: 'Route timeline' },
    padding: 1
  });
}

function signalStrip(state) {
  return row(dataRows.slice(0, 4).map((vessel, index) =>
    text(`${index === state.fleetTable.selectedRow ? '›' : ' '} ${vessel.name} ${String(Math.min(100, vessel.score + (index === state.fleetTable.selectedRow ? state.spinnerFrame % 5 : 0)))}%`)
  ), { id: 'signal-strip', gap: 3 });
}

function heroCanvas(state) {
  return canvas({
    id: 'hero-canvas',
    label: 'Live harbor map',
    state,
    painter({ canvas }) {
      const phase = state.spinnerFrame % 5;
      const vessel = selectedVessel(state);
      const muted = { fg: { kind: 'theme', token: 'text.muted' } };
      const bright = { fg: { kind: 'theme', token: 'accent.primary' }, bold: true };
      const soft = { fg: { kind: 'theme', token: 'status.success' } };
      const warn = { fg: { kind: 'theme', token: 'status.warning' }, bold: true };

      canvas.rect({ row: 0, column: 0, width: 66, height: 15 }, { stroke: { text: '·', style: muted } });
      canvas.text(2, 0, [{ text: 'Northstar harbor radar', style: bright }]);
      canvas.line(8, 3, 31, 3, { text: '─', style: soft });
      canvas.line(32, 3, 57, 3, { text: '─', style: soft });
      for (const [index, x] of [7, 32, 58].entries()) {
        const active = index === phase % 3;
        canvas.point(x, 3, { text: active ? '◉' : '●', style: active ? bright : soft });
      }
      canvas.text(2, 4, [{ text: 'outer marker          channel C             inner harbor', style: muted }]);
      canvas.text(7, 6, [
        { text: vessel.name.padEnd(10, ' '), style: bright },
        { text: ' vector lane ', style: vessel.status === 'routing' ? warn : muted },
        { text: ' berth 12 ', style: vessel.status === 'moored' ? bright : soft }
      ]);
      canvas.text(4, 9, [{ text: `watch owner: ${vessel.owner}`, style: soft }]);
      canvas.text(36, 9, [{ text: `signal ${String(vessel.score)}%`, style: vessel.score < 75 ? warn : soft }]);
      for (let offset = 0; offset < 15; offset += 1) {
        canvas.braillePoint(96 + offset, 5 + ((offset + phase) % 7), { fg: { kind: 'theme', token: 'accent.primary' } });
      }
      canvas.text(58, 1, [blockSpan('upper', { fg: { kind: 'theme', token: 'accent.primary' } })]);
      canvas.text(59, 1, [blockSpan('lower', { fg: { kind: 'theme', token: 'accent.primary' } })]);
    }
  });
}

function sparklineValues(frame) {
  const base = [2, 5, 4, 7, 8, 6, 9, 11, 10, 13];
  return base.map((value, index) => value + ((frame + index) % 3));
}

function headerHeight(state) {
  return state.density >= 4 ? 6 : 5;
}

function sideWidth(state) {
  if (state.layoutMode === 'wide') return 32;
  if (state.layoutMode === 'compact') return 25;
  return 29;
}
