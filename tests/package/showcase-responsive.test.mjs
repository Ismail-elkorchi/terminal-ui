import assert from 'node:assert/strict';
import test from 'node:test';

import { renderFramePlain } from '../../dist/tui/index.js';
import { initialShowcaseState, renderShowcaseFrame } from '../../examples/showcase/app.mjs';

function showcaseText(columns, rows) {
  return renderFramePlain(renderShowcaseFrame(initialShowcaseState(), { columns, rows }));
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
