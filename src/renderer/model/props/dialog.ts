import type { BorderOptions, BorderTitle } from '../../../visual/border.ts';
import type { RenderNodeLayoutProps } from './shared-layout.ts';
import type { DialogDismissReason } from '../../../ui-model/dialog.ts';

export type DialogRenderProps<TMessage> = RenderNodeLayoutProps & {
  readonly title?: BorderTitle;
  readonly border?: BorderOptions;
  readonly width?: number;
  readonly height?: number;
  readonly modal: boolean;
  readonly dismissOnOutsidePress: boolean;
  readonly toDismissMessage?: (reason: DialogDismissReason) => TMessage;
};
