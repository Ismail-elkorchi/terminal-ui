import type { Element } from '@ismail-elkorchi/terminal-ui/component';

export declare function peerBadge(options: {
  readonly id: string;
  readonly label: string;
}): Element;

export declare function peerBadgeMetrics(): { readonly preparations: number; readonly paints: number };
