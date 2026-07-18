import {
  createNotificationState,
  notificationPresentation
} from '@ismail-elkorchi/terminal-ui/behavior';
import {
  dialog,
  notificationStack,
  progressBar,
  statusBar,
  text
} from '@ismail-elkorchi/terminal-ui/components';

statusBar({ id: 'status' });
const notifications = createNotificationState();
notificationStack({
  id: 'live',
  presentation: notificationPresentation(notifications, { mode: 'live' }),
  onDismiss: (id) => ({ kind: 'dismiss' as const, id })
});
notificationStack({
  id: 'history',
  presentation: notificationPresentation(notifications, { mode: 'history' }),
  onAction: (action) => ({ kind: 'notification' as const, action }),
  keys: { home: () => ({ kind: 'home' as const }) }
});
dialog(text('Body'), {
  id: 'dialog',
  modal: true,
  focusPolicy: { initialFocus: { kind: 'element', elementId: 'confirm' }, returnFocus: 'restore' },
  dismissal: {
    escape: true,
    outsidePress: false,
    onDismiss: (reason) => ({ kind: 'dismiss' as const, reason })
  }
});
progressBar({
  id: 'determinate',
  mode: { kind: 'determinate', value: 2, max: 4 }
});
progressBar({
  id: 'indeterminate',
  mode: { kind: 'indeterminate', frame: 2 }
});

// @ts-expect-error status bars require stable identity
statusBar({});
// @ts-expect-error passive live regions do not own local keyboard bindings
notificationStack({
  id: 'invalid-live',
  presentation: { kind: 'live', items: [] },
  keys: { escape: () => ({ kind: 'invalid' as const }) }
});
// @ts-expect-error navigable history requires an action handler
notificationStack({ id: 'invalid-history', presentation: { kind: 'history', items: [] } });
// @ts-expect-error dialog modal policy is required
dialog(text('Body'), { id: 'implicit-dialog' });
progressBar({
  id: 'contradictory-progress',
  // @ts-expect-error indeterminate progress cannot carry determinate values
  mode: { kind: 'indeterminate', value: 2 }
});
// @ts-expect-error progress mode is required
progressBar({ id: 'implicit-progress', value: 2, max: 4 });
