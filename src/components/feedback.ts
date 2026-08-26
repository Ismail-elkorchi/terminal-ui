/** Status, progress, and notification feedback components. */
export { activityIndicator, progressBar, statusBar } from './factories/feedback-indicators.ts';
export { notificationHistory, notificationRegion } from './factories/notifications.ts';
export type {
  ActivityIndicatorOptions,
  NotificationHistoryOptions,
  NotificationRegionOptions,
  ProgressBarOptions,
  StatusBarOptions,
} from './options/feedback-and-visualizations.ts';
export type {
  NotificationItem,
  NotificationPlacement,
  NotificationTone,
} from '../behavior/notification.ts';
export type {
  ProgressBarDisplay,
  ProgressBarLabelPosition,
  ProgressBarMode,
} from './progress.ts';
export type {
  StatusBarItem,
} from './status-bar.ts';
export type { NotificationHistoryTransition } from '../behavior/notification-history.ts';
export { isNotificationTone, isProcessStatus, isStatusBarStatus } from './status.ts';
