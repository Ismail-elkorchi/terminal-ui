import type { RenderNodeLayoutProps } from './shared-layout.ts';
import type { InlineContent } from '../../../visual/inline-content.ts';

export interface RenderTabItem {
  readonly id: string;
  readonly label: string;
  readonly leading?: InlineContent;
  readonly description?: string;
  readonly disabled?: boolean;
  readonly badge?: string;
  readonly closable?: boolean;
}

export type TabsRenderProps<TMessage> = RenderNodeLayoutProps & {
  readonly tabs: readonly RenderTabItem[];
  readonly selected?: string;
  readonly toActionMessage?: (action: import('../../../ui-model/tabs.ts').TabAction) => TMessage;
};
