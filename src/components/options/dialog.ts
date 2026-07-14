import type { Element } from '../../element/index.ts';
import type { ElementKeyBindings, InteractiveElementOptions } from '../../element/metadata.ts';
import type { LayoutFlowOptions } from '../../geometry/types.ts';
import type { DialogStylePart } from '../../ui-model/style-parts.ts';
import type { BorderOptions, BorderTitle } from '../../visual/border.ts';
import type { DialogDismissal, DialogFocusPolicy } from '../../ui-model/dialog.ts';

interface DialogBaseOptions<TMessage> extends InteractiveElementOptions<DialogStylePart, TMessage>, LayoutFlowOptions {
  readonly title?: BorderTitle;
  readonly border?: BorderOptions;
  readonly width?: number;
  readonly height?: number;
  readonly actions?: Element<TMessage>;
  readonly dismissal?: DialogDismissal<TMessage>;
  readonly keys?: ElementKeyBindings<TMessage>;
}

export type DialogOptions<TMessage = never> = DialogBaseOptions<TMessage> & (
  | {
      readonly modal: true;
      readonly focusPolicy: DialogFocusPolicy;
    }
  | {
      readonly modal: false;
      readonly focusPolicy?: never;
    }
);

export type { DialogDismissReason, DialogDismissal, DialogFocusPolicy } from '../../ui-model/dialog.ts';
