import {
  activeNotificationItems,
  createNotificationState,
  notificationHistoryItems
} from '@ismail-elkorchi/terminal-ui/behavior';
import {
  dialog,
  notificationHistory,
  notificationRegion,
  progressBar,
  statusBar,
  text
} from '@ismail-elkorchi/terminal-ui/components';
import { createScrollState } from '@ismail-elkorchi/terminal-ui/behavior';

statusBar({ id: 'status' });
const notifications = createNotificationState();
notificationRegion({
  id: 'live',
  items: activeNotificationItems(notifications),
  onAction: (action) => ({ kind: 'dismiss' as const, id: action.id })
});
notificationHistory({
  id: 'history',
  items: notificationHistoryItems(notifications),
  scroll: createScrollState(),
  onAction: (action) => ({ kind: 'notification' as const, action })
});
dialog({
  slots: { content: text({ content: 'Body' }) },
  id: 'dialog',
  modal: true,
  focusPolicy: { initialFocus: { kind: 'element', elementId: 'confirm' }, returnFocus: 'restore' },
  dismissal: {
    dismissOnEscape: true,
    dismissOnOutsidePress: false
  },
  onAction: (action) => ({ kind: 'dismiss' as const, action })
});
progressBar({
  id: 'determinate',
  label: 'Progress',
  mode: { kind: 'determinate', value: 2, max: 4 }
});
progressBar({
  id: 'indeterminate',
  label: 'Progress',
  mode: { kind: 'indeterminate', frame: 2 }
});

// @ts-expect-error status bars require stable identity
statusBar({});
// @ts-expect-error navigable history requires an action handler
notificationHistory({ id: 'invalid-history', items: [], scroll: createScrollState() });
// @ts-expect-error dialog modal policy is required
dialog({ slots: { content: text({ content: 'Body' }) }, id: 'implicit-dialog' });
progressBar({
  id: 'contradictory-progress',
  // @ts-expect-error indeterminate progress cannot carry determinate values
  mode: { kind: 'indeterminate', value: 2 }
});
// @ts-expect-error progress mode is required
progressBar({ id: 'implicit-progress', label: 'Progress', value: 2, max: 4 });
