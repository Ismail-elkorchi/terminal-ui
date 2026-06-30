import assert from 'node:assert/strict';
import test from 'node:test';

import { renderFramePlain, renderWidgetFrame } from '../../dist/tui/index.js';
import {
  accordion,
  breadcrumb,
  carousel,
  collapsibleSection,
  shortcutBar,
  tabOverflowMenu,
  text
} from '../../dist/widgets/index.js';

function plain(widget, viewport = { columns: 72, rows: 12 }) {
  return renderFramePlain(renderWidgetFrame(widget, viewport));
}

test('breadcrumb renders clickable route parts and separators', () => {
  const widget = breadcrumb({
    id: 'crumbs',
    items: [
      { id: 'home', label: 'Home', message: { kind: 'route', id: 'home' } },
      { id: 'harbor', label: 'Harbor', message: { kind: 'route', id: 'harbor' } },
      { id: 'berth', label: 'Berth 4', message: { kind: 'route', id: 'berth' } }
    ]
  });
  const frame = renderWidgetFrame(widget, { columns: 90, rows: 3 });
  const output = renderFramePlain(frame);

  assert.equal(widget.kind, 'row');
  assert.match(output, /Home/u);
  assert.match(output, /Harbor/u);
  assert.match(output, /Berth 4/u);
  assert.ok(frame.hitTargets?.some((target) => target.id === 'crumbs:harbor:control'));
});

test('collapsibleSection hides and shows body from caller-owned expanded state', () => {
  const collapsed = collapsibleSection({
    id: 'section',
    title: 'Dispatch',
    expanded: false,
    message: { kind: 'toggle' },
    body: text('Hidden details')
  });
  const expanded = collapsibleSection({
    id: 'section',
    title: 'Dispatch',
    expanded: true,
    message: { kind: 'toggle' },
    body: text('Visible details')
  });

  assert.doesNotMatch(plain(collapsed), /Hidden details/u);
  assert.match(plain(expanded), /Visible details/u);
  assert.ok(renderWidgetFrame(expanded, { columns: 44, rows: 8 }).hitTargets?.some((target) => target.id === 'section:header:control'));
});

test('accordion composes multiple collapsible sections with deterministic order', () => {
  const widget = accordion({
    id: 'accordion',
    items: [
      { id: 'routes', title: 'Routes', expanded: true, body: text('North route'), message: { kind: 'routes' } },
      { id: 'alerts', title: 'Alerts', expanded: false, body: text('Hidden alert'), message: { kind: 'alerts' } }
    ]
  });
  const output = plain(widget);

  assert.equal(widget.kind, 'stack');
  assert.match(output, /Routes/u);
  assert.match(output, /North route/u);
  assert.match(output, /Alerts/u);
  assert.doesNotMatch(output, /Hidden alert/u);
});

test('carousel renders selected item with previous next controls and dots', () => {
  const widget = carousel({
    id: 'carousel',
    selected: 'two',
    previousMessage: { kind: 'previous' },
    nextMessage: { kind: 'next' },
    items: [
      { id: 'one', label: 'Map', body: text('Map body'), message: { kind: 'select', id: 'one' } },
      { id: 'two', label: 'Telemetry', body: text('Telemetry body'), message: { kind: 'select', id: 'two' } },
      { id: 'three', label: 'Forecast', body: text('Forecast body'), message: { kind: 'select', id: 'three' } }
    ]
  });
  const frame = renderWidgetFrame(widget, { columns: 56, rows: 7 });
  const output = renderFramePlain(frame);

  assert.equal(widget.kind, 'splitPane');
  assert.match(output, /Previous/u);
  assert.match(output, /Next/u);
  assert.match(output, /Telemetry/u);
  assert.match(output, /Telemetry body/u);
  assert.match(output, /\[ ○ \][\s\S]*\[ ● \][\s\S]*\[ ○ \]/u);
  assert.ok(frame.hitTargets?.some((target) => target.id === 'carousel:next:control'));
  assert.ok(frame.hitTargets?.some((target) => target.id === 'carousel:dot:three:control'));
});

test('tabOverflowMenu renders visible tabs and an overflow menu for hidden tabs', () => {
  const widget = tabOverflowMenu({
    id: 'tabs',
    selected: 'ops',
    maxVisible: 2,
    overflowLabel: 'More tabs',
    tabs: [
      { id: 'dash', label: 'Dashboard', message: { kind: 'tab', id: 'dash' } },
      { id: 'ops', label: 'Ops', message: { kind: 'tab', id: 'ops' } },
      { id: 'reports', label: 'Reports', message: { kind: 'tab', id: 'reports' } },
      { id: 'admin', label: 'Admin', message: { kind: 'tab', id: 'admin' } }
    ]
  });
  const frame = renderWidgetFrame(widget, { columns: 72, rows: 5 });
  const output = renderFramePlain(frame);

  assert.equal(widget.kind, 'row');
  assert.match(output, /Dashboard/u);
  assert.match(output, /\[Ops\]/u);
  assert.match(output, /More tabs/u);
  assert.match(output, /Reports/u);
  assert.match(output, /Admin/u);
  assert.ok(frame.hitTargets?.some((target) => target.id === 'tabs:overflow:reports'));
});

test('shortcutBar renders command hints as ordinary buttons with typed messages', () => {
  const widget = shortcutBar({
    id: 'shortcuts',
    shortcuts: [
      { id: 'palette', key: '/', label: 'Palette', message: { kind: 'palette' } },
      { id: 'save', key: 'Ctrl+S', label: 'Save', message: { kind: 'save' } }
    ]
  });
  const frame = renderWidgetFrame(widget, { columns: 44, rows: 3 });
  const output = renderFramePlain(frame);

  assert.equal(widget.kind, 'row');
  assert.match(output, /\/ Palette/u);
  assert.match(output, /Ctrl\+S Save/u);
  assert.ok(frame.hitTargets?.some((target) => target.id === 'shortcuts:save:control'));
});
