/** Status, progress, and notification feedback components. */
export type { NotificationHistoryTransition } from '../behavior/notification-history.ts';
export type {
  NotificationItem,
  NotificationPlacement,
  NotificationTone,
} from '../behavior/notification.ts';
export { activityIndicator } from './feedback/activity-indicator.ts';
export type {
  ActivityIndicatorOptions,
  ProgressBarOptions,
  StatusBarOptions,
} from './feedback/options.ts';
export { progressBar } from './feedback/progress-bar.ts';
export type {
  ProgressBarDisplay,
  ProgressBarLabelPosition,
  ProgressBarMode,
} from './feedback/progress.ts';
export type { StatusBarItem } from './feedback/status-bar-contracts.ts';
export { statusBar } from './feedback/status-bar.ts';
export { notificationHistory, notificationRegion } from './notifications/definition.ts';
export type {
  NotificationHistoryOptions,
  NotificationRegionOptions,
} from './notifications/options.ts';
export { isNotificationTone, isProcessStatus, isStatusBarStatus } from './status.ts';
