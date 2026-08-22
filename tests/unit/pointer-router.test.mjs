import assert from 'node:assert/strict';
import test from 'node:test';
import { createPointerRouter } from '../../dist/renderer/internal/pointer-router.js';
import { ignoreMessage, isIgnoredMessage } from '../../dist/interaction/index.js';

const bounds = Object.freeze({ row: 1, column: 1, width: 8, height: 1 });
const rightPress = Object.freeze({
  kind: 'mouse',
  sequence: '\u001B[<2;1;1M',
  encoding: 'sgr',
  action: 'press',
  button: 'right',
  row: 1,
  column: 1,
  rawCode: 2,
  modifiers: Object.freeze({ shift: false, alt: false, ctrl: false }),
});

test('context menus bubble from an ignored text target to its owning ancestor', () => {
  const router = createPointerRouter({ now: () => 0 });
  const regions = [{
    id: 'region',
    zIndex: 0,
    order: 0,
    bounds,
    underlay: 'preserve',
    cells: [],
    graphics: [],
    metadata: {},
    focusTargets: [],
    hitTargets: [{
      id: 'ancestor',
      ownerIdentity: '4:root',
      bounds,
      accepts: ['contextMenu'],
      message: () => ({ kind: 'ancestor-context' }),
      zIndex: 0,
    }, {
      id: 'text',
      ownerIdentity: '4:root5:field',
      bounds,
      accepts: ['pointerDown', 'contextMenu'],
      message: () => ignoreMessage(),
      zIndex: 0,
    }],
  }];

  const results = router.route(regions, rightPress);

  assert.deepEqual(results.flatMap((result) =>
    isIgnoredMessage(result.message) ? [] : [result.message]
  ), [{ kind: 'ancestor-context' }]);
});

test('context-menu bubbling stops at the first handled target', () => {
  const router = createPointerRouter({ now: () => 0 });
  let ancestorCalls = 0;
  const regions = [{
    id: 'region',
    zIndex: 0,
    order: 0,
    bounds,
    underlay: 'preserve',
    cells: [],
    graphics: [],
    metadata: {},
    focusTargets: [],
    hitTargets: [{
      id: 'ancestor',
      ownerIdentity: '4:root',
      bounds,
      accepts: ['contextMenu'],
      message: () => {
        ancestorCalls += 1;
        return { kind: 'ancestor-context' };
      },
      zIndex: 0,
    }, {
      id: 'text',
      ownerIdentity: '4:root5:field',
      bounds,
      accepts: ['pointerDown', 'contextMenu'],
      message: (event) => event.kind === 'contextMenu'
        ? { kind: 'field-context' }
        : ignoreMessage(),
      zIndex: 0,
    }],
  }];

  const results = router.route(regions, rightPress);

  assert.deepEqual(results.flatMap((result) =>
    isIgnoredMessage(result.message) ? [] : [result.message]
  ), [{ kind: 'field-context' }]);
  assert.equal(ancestorCalls, 0);
});
