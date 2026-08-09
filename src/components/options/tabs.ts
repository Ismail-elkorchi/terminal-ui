import type { Element, ElementMeta } from '../../element/index.ts';
import type { LayoutFlowOptions } from '../../geometry/types.ts';
import type { PointerInteractionState } from '../../interaction/index.ts';
import type { MessageResolution } from '../../interaction/message.ts';
import type { ItemBase } from '../../ui-model/contracts.ts';
import type { TabAction } from '../../ui-model/tabs.ts';
import type { TabsStylePart } from '../../ui-model/style-parts.ts';
import type { InlineContent } from '../../visual/inline-content.ts';

export interface TabItem<TMessage = never> extends ItemBase {
  readonly leading?: InlineContent;
  readonly badge?: string;
  readonly closable?: boolean;
  readonly panel: Element<TMessage>;
}

export interface TabsOptions<TMessage = never> extends LayoutFlowOptions {
  readonly id: string;
  readonly tabs: readonly TabItem<TMessage>[];
  readonly selected?: string;
  readonly maxTabWidth?: number;
  readonly pointerState?: PointerInteractionState;
  readonly onAction: (action: TabAction) => MessageResolution<TMessage>;
  readonly meta?: Pick<ElementMeta<TabsStylePart>, 'focus' | 'layer' | 'styles'>;
}
