import assert from 'node:assert/strict';
import test from 'node:test';

import { renderFramePlain } from '../../dist/tui/index.js';
import { initialShowcaseState, renderShowcaseFrame } from '../../examples/showcase/app.mjs';

function showcaseFrame(columns, rows) {
  return renderShowcaseFrame(initialShowcaseState(), { columns, rows });
}

function showcaseText(columns, rows) {
  return renderFramePlain(showcaseFrame(columns, rows));
}

test('showcase renders deliberate wide medium and narrow responsive variants', () => {
  const wide = showcaseText(160, 42);
  const medium = showcaseText(120, 34);
  const narrow = showcaseText(84, 30);

  assert.match(wide, /Watch/u);
  assert.match(wide, /Inspector/u);
  assert.match(wide, /Live harbor surface/u);

  assert.match(medium, /Watch/u);
  assert.doesNotMatch(medium, /Inspector/u);
  assert.match(medium, /Harbor surface/u);
  assert.match(medium, /route clearance/u);

  assert.doesNotMatch(narrow, /┌ Watch ─/u);
  assert.doesNotMatch(narrow, /Inspector/u);
  assert.match(narrow, /Harbor surface/u);
  assert.match(narrow, /Watch board/u);
  assert.match(narrow, /route clearance/u);

  for (const text of [wide, medium, narrow]) {
    assert.doesNotMatch(text, /Render pipeline|Accessible snapshot|widget tree/u);
  }
});

test('showcase wide dashboard keeps route timeline readable and source-tagged', () => {
  const frame = showcaseFrame(160, 42);
  const text = renderFramePlain(frame);

  assert.match(text, /outer marker\s+──\s+Atlas\s+──\s+berth 12\s+──\s+handoff/u);
  assert.doesNotMatch(text, /outer ma\s+──/u);
  assert.equal(sourceText(frame, 'timeline-outer'), 'outer marker');
  assert.equal(sourceText(frame, 'timeline-vessel'), 'Atlas');
  assert.equal(sourceText(frame, 'timeline-route-target'), 'berth 12');
  assert.equal(sourceRole(frame, 'timeline-separator-a'), 'separator');
  assert.equal(sourceToken(frame, 'timeline-route-target'), 'status.success');
});

function sourceText(frame, sourceId) {
  return frame.cells
    .filter((cell) => cell.source?.id === sourceId)
    .toSorted((left, right) => left.row - right.row || left.column - right.column)
    .map((cell) => cell.text)
    .join('');
}

function sourceRole(frame, sourceId) {
  return frame.cells.find((cell) => cell.source?.id === sourceId)?.source?.role;
}

function sourceToken(frame, sourceId) {
  const cell = frame.cells.find((current) => current.source?.id === sourceId && current.style?.fg?.kind === 'theme');
  return cell?.style?.fg?.token;
}
