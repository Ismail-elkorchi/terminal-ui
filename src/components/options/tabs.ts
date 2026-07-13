import type { Element } from '../../element/index.ts';
import type { ElementKeyBindings, InteractiveElementOptions } from '../../element/metadata.ts';
import type { LayoutFlowOptions } from '../../geometry/types.ts';
import type { ItemBase } from '../../ui-model/contracts.ts';
import type { TabsStylePart } from '../../ui-model/style-parts.ts';
import type { TabAction } from '../../ui-model/tabs.ts';

export interface TabItem<TMessage = never> extends ItemBase {
  readonly badge?: string;
  readonly closable?: boolean;
  readonly panel: Element<TMessage>;
}

export interface TabsOptions<TMessage = never> extends InteractiveElementOptions<TabsStylePart>, LayoutFlowOptions {
  readonly tabs: readonly TabItem<TMessage>[];
  readonly selected?: string;
  readonly onAction?: (action: TabAction) => TMessage;
  readonly keys?: ElementKeyBindings<TMessage>;
}
