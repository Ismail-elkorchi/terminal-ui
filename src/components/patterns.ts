/** First-party application patterns built from the foundational controls. */
export { commandInput, searchPicker } from './factories/documents.ts';
export { logViewer } from './factories/log-viewer.ts';
export { notificationHistory, notificationRegion } from './factories/notifications.ts';
export { activityIndicator, helpBar, progressBar, statusBar } from './factories/feedback.ts';
export type * from './options/documents.ts';
export type {
  ActivityIndicatorOptions,
  HelpBarOptions,
  NotificationHistoryOptions,
  NotificationRegionOptions,
  ProgressBarOptions,
  StatusBarOptions,
} from './options/feedback.ts';
