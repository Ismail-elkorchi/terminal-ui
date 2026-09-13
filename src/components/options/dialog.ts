import type { Element } from '../../element/index.ts';
import type { ComponentMessage } from '../../component/index.ts';
import type {
  ElementFocus,
  ElementLayer,
  ElementStyles
} from '../../element/metadata.ts';
import type { LayoutFlowOptions } from '../../geometry/types.ts';
import type { DialogStylePart } from '../style-parts.ts';
import type { BorderOptions, BorderTitle } from '../../visual/border.ts';
import type {
  DialogDismissEvent,
  DialogDismissal,
  DialogFocusPolicy
} from '../dialog.ts';
import type { MessageResolution } from '../../interaction/message.ts';

interface DialogBaseOptions<
  TContent extends Element<ComponentMessage>,
  TActions extends Element<ComponentMessage> | undefined,
> extends LayoutFlowOptions {
  readonly id: string;
  readonly border?: BorderOptions;
  readonly width?: number;
  readonly height?: number;
  readonly slots: {
    readonly content: TContent;
    readonly actions?: TActions;
  };
  readonly styles?: ElementStyles<DialogStylePart>;
  readonly meta?: {
    readonly focus?: Pick<ElementFocus, 'disabled' | 'order'>;
    readonly layer?: ElementLayer;
  };
}

type DialogName =
  | { readonly title: BorderTitle; readonly accessibleName?: string }
  | { readonly title?: never; readonly accessibleName: string };

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
  readonly onDismiss?: never;
}

interface DismissibleDialog<TMessage extends ComponentMessage> {
  readonly dismissal: DialogDismissal;
  readonly onDismiss: (event: DialogDismissEvent) => MessageResolution<TMessage>;
}

export type DialogOptions<
  TMessage extends ComponentMessage = never,
  TContent extends Element<ComponentMessage> = Element<ComponentMessage>,
  TActions extends Element<ComponentMessage> | undefined = Element<ComponentMessage> | undefined,
> = DialogBaseOptions<TContent, TActions>
  & DialogName
  & DialogModality
  & (PassiveDialog | DismissibleDialog<TMessage>);

export type {
  DialogDismissEvent,
  DialogDismissReason,
  DialogDismissal,
  DialogFocusPolicy
} from '../dialog.ts';
