import type { InlineContent } from '../visual/inline-content.ts';

export type StatusBarStatus =
  | 'idle'
  | 'pending'
  | 'running'
  | 'success'
  | 'warning'
  | 'error'
  | 'info';

export type ProcessStatus = 'idle' | 'running' | 'success' | 'warning' | 'error';

export type StatusBarSection = 'leading' | 'center' | 'trailing';

interface StatusBarItemContent {
  readonly id: string;
  readonly leading?: InlineContent;
  readonly trailing?: InlineContent;
}

export type StatusBarItem = StatusBarItemContent & (
  | {
      readonly kind: 'text';
      readonly text: string;
    }
  | {
      readonly kind: 'status';
      readonly text: string;
      readonly status: StatusBarStatus;
    }
);
