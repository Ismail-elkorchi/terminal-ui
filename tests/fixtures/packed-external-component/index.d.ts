import type { ComponentMetadataOptions, Element } from '@ismail-elkorchi/terminal-ui/component';

export declare function peerBadge(options: {
  readonly id: string;
  readonly label: string;
  readonly meta?: ComponentMetadataOptions<readonly []>;
}): Element;

export declare function peerBadgeMetrics(): { readonly paints: number; readonly measurements: number; readonly semantics: number };
