import type { LogHistory } from '../../behavior/log-history.ts';
import type {
  LogViewerContextMenuEvent,
  LogViewerControlTransition,
  LogViewerSelection,
  LogViewerTransition,
} from '../../behavior/log-viewer.ts';
import type { ComponentMetadataOptions } from '../../component/contracts.ts';
import type { ComponentMessage } from '../../component/message.ts';
import type { MessageResolution } from '../../interaction/message.ts';
import type { ScrollPolicy, ScrollState } from '../../interaction/scroll.ts';
import type { ScrollbarOptions } from '../../interaction/scrollbar.ts';
import type { LogViewerStylePart } from '../style-parts.ts';


interface LogViewerBaseOptions {
  readonly id: string;
  readonly history: LogHistory;
  readonly wrap?: boolean;
  readonly query?: import('../../text/query.ts').CollectionQuery;
  readonly activeMatchId?: string;
  readonly foldedIds?: readonly string[];
  readonly selection?: LogViewerSelection;
  readonly styles?: import("../../element/metadata.ts").ElementStyles<LogViewerStylePart, 'focused' | 'hovered' | 'active' | 'selected' | 'disabled'>;
  readonly meta?: ComponentMetadataOptions<readonly ['focus', 'layer', 'styles']>;
}

export type LogViewerOptions<TMessage extends ComponentMessage = never> =
  | UnscrolledLogViewerOptions<TMessage>
  | ScrollableLogViewerOptions<TMessage>;

export type UnscrolledLogViewerOptions<TMessage extends ComponentMessage = never> = LogViewerBaseOptions & {
  readonly scroll?: never;
  readonly scrollbar?: never;
  readonly scrollPolicy?: never;
} & (
  | {
      readonly onTransition: (transition: LogViewerControlTransition) => MessageResolution<TMessage>;
      readonly onContextMenu?: (event: LogViewerContextMenuEvent) => MessageResolution<TMessage>;
    }
  | {
      readonly onTransition?: never;
      readonly onContextMenu?: never;
    }
);

export interface ScrollableLogViewerOptions<TMessage extends ComponentMessage = never> extends LogViewerBaseOptions {
  readonly scroll: ScrollState;
  readonly scrollbar?: ScrollbarOptions;
  readonly scrollPolicy?: ScrollPolicy;
  readonly onTransition: (transition: LogViewerTransition) => MessageResolution<TMessage>;
  readonly onContextMenu?: (event: LogViewerContextMenuEvent) => MessageResolution<TMessage>;
}
