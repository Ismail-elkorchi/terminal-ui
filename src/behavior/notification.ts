export type NotificationTone = 'info' | 'success' | 'warning' | 'error' | 'progress';
export type NotificationPlacement = 'top-right' | 'bottom-right' | 'centered-stack';

export interface NotificationItem {
  readonly id: string;
  readonly title: string;
  readonly message?: string;
  readonly tone?: NotificationTone;
  readonly progress?: number;
  readonly detail?: string;
  readonly dismissible?: boolean;
}
