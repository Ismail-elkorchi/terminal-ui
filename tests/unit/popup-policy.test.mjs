import assert from 'node:assert/strict';
import test from 'node:test';

import {
  containedPopupFocus,
  popupActiveDescendantId,
  popupAllowsDismissal,
  popupFocusScope,
  popupRelationship,
  standardPopupDismissal,
  standardPopupFocus
} from '../../dist/interaction/index.js';

test('popup policies compose dismissal focus and ownership independently', () => {
  assert.equal(popupAllowsDismissal(standardPopupDismissal, 'escape'), true);
  assert.equal(popupAllowsDismissal({
    dismissOnEscape: false,
    dismissOnOutsidePress: true,
    dismissOnFocusLoss: false
  }, 'escape'), false);
  assert.equal(popupFocusScope(true, standardPopupFocus), undefined);
  assert.deepEqual(popupFocusScope(true, containedPopupFocus), {
    kind: 'contain',
    restoreFocus: true
  });
  assert.equal(popupFocusScope(false, containedPopupFocus), undefined);

  const relationship = popupRelationship('picker');
  assert.deepEqual(relationship, {
    triggerId: 'picker:trigger',
    popupId: 'picker:popup'
  });
  assert.equal(
    popupActiveDescendantId(relationship, 'result'),
    'picker:popup:item:result'
  );
});
