import type { Element } from '../../element/index.ts';
import type { ComponentMessage, ComponentMetadataOptions } from '../../component/index.ts';
import type { LayoutFlowOptions } from '../../geometry/types.ts';
import type { MessageResolution } from '../../interaction/message.ts';
import type { ItemBase } from '../../ui-model/contracts.ts';
import type {
  TabCloseEvent,
  TabsPresentation,
  TabsTransition,
} from '../../ui-model/tabs.ts';
import type { TabsStylePart } from '../../ui-model/style-parts.ts';
import type { InlineContent } from '../../visual/inline-content.ts';

export interface TabItem<
  TId extends string = string,
  TMessage extends ComponentMessage = never,
> extends ItemBase {
  readonly id: TId;
  readonly leading?: InlineContent;
  readonly badge?: string;
  readonly closable?: boolean;
  readonly panel: Element<TMessage>;
}

interface TabsBaseOptions<TId extends string, TMessage extends ComponentMessage> extends LayoutFlowOptions {
  readonly id: string;
  readonly tabs: readonly TabItem<TId, TMessage>[];
  readonly presentation: TabsPresentation<TId>;
  readonly maxTabWidth?: number;
  readonly busy?: boolean;
  readonly inert?: boolean;
  readonly styles?: import('../../element/metadata.ts').ElementStyles<TabsStylePart, 'focused' | 'hovered' | 'pressed' | 'active' | 'selected' | 'disabled' | 'busy'>;
  readonly meta?: ComponentMetadataOptions<readonly ['focus', 'layer', 'styles']>;
}

interface ActiveTabsOptions<TId extends string, TMessage extends ComponentMessage> {
  readonly disabled?: false;
  readonly inert?: false;
  readonly onTransition: (action: TabsTransition<TId>) => MessageResolution<TMessage>;
  readonly onClose?: (event: TabCloseEvent<TId>) => MessageResolution<TMessage>;
}

interface InertTabsOptions {
  readonly disabled?: false;
  readonly inert: true;
  readonly onTransition?: never;
  readonly onClose?: never;
}

interface DisabledTabsOptions {
  readonly disabled: true;
  readonly busy?: never;
  readonly onTransition?: never;
  readonly onClose?: never;
}

export type TabsOptions<
  TId extends string = string,
  TMessage extends ComponentMessage = never,
> = TabsBaseOptions<TId, TMessage>
  & (ActiveTabsOptions<TId, TMessage> | DisabledTabsOptions | InertTabsOptions);

export type {
  TabCloseEvent,
  TabsPresentation,
  TabsTransition,
} from '../../ui-model/tabs.ts';
