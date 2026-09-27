import type {
  NotificationDismissEvent,
  NotificationHistoryTransition,
} from '../../behavior/notification-history.ts';
import type { NotificationItem, NotificationPlacement } from '../../behavior/notification.ts';
import type { ComponentMetadataOptions } from '../../component/contracts.ts';
import type { ComponentMessage } from '../../component/message.ts';
import type { MessageResolution } from '../../interaction/message.ts';
import type { NotificationHistoryStylePart, NotificationStylePart } from '../style-parts.ts';


interface NotificationOptionsBase<
  TPart extends string,
  TVisualState extends import('../../component/index.ts').ComponentVisualState,
> {
  readonly id: string;
  readonly placement?: NotificationPlacement;
  readonly maxWidth?: number;
  readonly styles?: import('../../element/metadata.ts').ElementStyles<TPart, TVisualState>;
  readonly meta?: ComponentMetadataOptions<readonly ['focus', 'layer', 'styles']>;
}

interface NotificationRegionOptionsBase<TVisualState extends import('../../component/index.ts').ComponentVisualState>
  extends NotificationOptionsBase<NotificationStylePart, TVisualState> {
  readonly items: readonly NotificationItem[];
}

export type NotificationRegionOptions<TMessage extends ComponentMessage = never> =
  | (NotificationRegionOptionsBase<'hovered' | 'pressed'> & {
      readonly onDismiss: (event: NotificationDismissEvent) => MessageResolution<TMessage>;
    })
  | (NotificationRegionOptionsBase<never> & {
      readonly onDismiss?: never;
    });

export interface NotificationHistoryOptions<TMessage extends ComponentMessage = never>
  extends NotificationOptionsBase<
    NotificationHistoryStylePart,
    'hovered' | 'pressed' | 'active' | 'selected' | 'disabled'
  > {
  readonly items: readonly NotificationItem[];
  readonly selectedId?: string;
  readonly scroll: import('../../interaction/scroll.ts').ScrollState;
  readonly scrollbar?: import('../../interaction/scrollbar.ts').ScrollbarOptions;
  readonly scrollPolicy?: import('../../interaction/scroll.ts').ScrollPolicy;
  readonly onTransition: (transition: NotificationHistoryTransition) => MessageResolution<TMessage>;
}
