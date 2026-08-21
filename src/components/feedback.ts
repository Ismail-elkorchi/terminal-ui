/** Status, progress, and notification feedback components. */
export { activityIndicator, progressBar, statusBar } from './factories/feedback.ts';
export { notificationHistory, notificationRegion } from './factories/notifications.ts';
export type {
  ActivityIndicatorOptions,
  NotificationHistoryOptions,
  NotificationRegionOptions,
  ProgressBarOptions,
  StatusBarOptions,
} from './options/feedback.ts';
export type {
  NotificationItem,
  NotificationPlacement,
  NotificationTone,
  ProgressBarDisplay,
  ProgressBarLabelPosition,
  ProgressBarMode,
  StatusBarItem,
} from '../ui-model/feedback.ts';
export type { NotificationHistoryTransition } from '../ui-model/notification.ts';
export { isNotificationTone, isProcessStatus, isStatusBarStatus } from '../ui-model/status.ts';
