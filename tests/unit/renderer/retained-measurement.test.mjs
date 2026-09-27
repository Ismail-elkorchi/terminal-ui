import assert from 'node:assert/strict';
import test from 'node:test';
import { text } from '../../../dist/components/index.js';
import { column, measuredViewport } from '../../../dist/layout/index.js';
import { defineTextWidthProfile } from '../../../dist/text/index.js';
import { renderElementFrame } from '../../../dist/renderer/index.js';
import { defaultTheme } from '../../../dist/theme/index.js';
import { componentElement, leafComponentDefinition } from '../../support/component-definition.mjs';

test('retained measurements survive sibling updates and invalidate on constraints and profiles', () => {
  let calls = 0;
  const entry = componentElement({ definition: {
    ...leafComponentDefinition,
    identity: 'optional',
    measure: ({ constraints }) => {
      calls += 1;
      return { minWidth: 0, minHeight: 0, preferredWidth: 40, preferredHeight: Math.ceil(40 / constraints.width) };
    },
    render: () => {},
    accessibility: ({ id }) => ({ id, role: 'text' }),
  } });
  const make = (sibling) => column([
    measuredViewport([entry], { id: 'retained-viewport', onScroll: () => 'scroll', scrollbar: { axis: 'vertical', visible: 'always' } }),
    text({ content: sibling }),
  ], { sizes: [{ kind: 'fill' }, { kind: 'fixed', cells: 1 }] });
  const size = { columns: 20, rows: 5 };
  renderElementFrame(make('initial'), size);
  const startup = calls;
  for (let i = 0; i < 10; i += 1) renderElementFrame(make(String(i)), size);
  assert.equal(calls, startup);
  renderElementFrame(make('resize'), { columns: 10, rows: 5 });
  assert.ok(calls > startup);
  const resized = calls;
  renderElementFrame(make('profile'), size, { widthProfile: defineTextWidthProfile({ emoji: 'wide', ambiguous: 'wide' }) });
  assert.ok(calls > resized);
  const profiled = calls;
  renderElementFrame(make('theme'), size, { theme: { ...defaultTheme, name: 'changed-theme' } });
  assert.ok(calls > profiled);
});
