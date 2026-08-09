import type { Element } from '../../element/index.ts';
import type { ComponentMessage } from '../../component/index.ts';
import type {
  ElementFocus,
  ElementLayer,
  ElementStyles
} from '../../element/metadata.ts';
import type { LayoutFlowOptions } from '../../geometry/types.ts';
import type { DialogStylePart } from '../../ui-model/style-parts.ts';
import type { BorderOptions, BorderTitle } from '../../visual/border.ts';
import type {
  DialogAction,
  DialogDismissal,
  DialogFocusPolicy
} from '../../ui-model/dialog.ts';
import type { MessageResolution } from '../../interaction/message.ts';

interface DialogBaseOptions extends LayoutFlowOptions {
  readonly id: string;
  readonly title?: BorderTitle;
  readonly border?: BorderOptions;
  readonly width?: number;
  readonly height?: number;
  readonly slots: {
    readonly content: Element<ComponentMessage>;
    readonly actions?: Element<ComponentMessage>;
  };
  readonly meta?: {
    readonly focus?: Pick<ElementFocus, 'disabled' | 'order'>;
    readonly layer?: ElementLayer;
    readonly styles?: ElementStyles<DialogStylePart>;
  };
}

type DialogModality =
  | {
      readonly modal: true;
      readonly focusPolicy: DialogFocusPolicy;
    }
  | {
      readonly modal: false;
      readonly focusPolicy?: never;
    };

interface PassiveDialog {
  readonly dismissal?: never;
  readonly onAction?: never;
}

interface DismissibleDialog<TMessage extends ComponentMessage> {
  readonly dismissal: DialogDismissal;
  readonly onAction: (action: DialogAction) => MessageResolution<TMessage>;
}

export type DialogOptions<TMessage extends ComponentMessage = never> = DialogBaseOptions
  & DialogModality
  & (PassiveDialog | DismissibleDialog<TMessage>);

export type {
  DialogAction,
  DialogDismissReason,
  DialogDismissal,
  DialogFocusPolicy
} from '../../ui-model/dialog.ts';
