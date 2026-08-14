import type { ComponentMessage, ComponentMetadataOptions } from '../../component/index.ts';
import type { PointerInteractionAction, PointerInteractionState } from '../../interaction/index.ts';
import type { MessageResolution } from '../../interaction/message.ts';
import type { LinkActivateEvent, ToggleButtonTransition } from '../../ui-model/foundations.ts';
import type { ButtonStylePart, LinkStylePart } from '../../ui-model/style-parts.ts';
import type { ButtonTone } from '../../ui-model/forms.ts';
import type { ComponentDensity } from '../../ui-model/contracts.ts';
import type { InlineContent } from '../../visual/inline-content.ts';

interface AvailableControl {
  readonly disabled?: false;
  readonly pointerState?: PointerInteractionState;
  readonly busy?: boolean;
  readonly inert?: false;
}

interface DisabledControl {
  readonly disabled: true;
  readonly pointerState?: never;
  readonly busy?: never;
  readonly inert?: boolean;
}

interface InertControl {
  readonly disabled?: false;
  readonly pointerState?: never;
  readonly busy?: boolean;
  readonly inert: true;
}

type UnavailableControl = DisabledControl | InertControl;

export interface LinkBaseOptions {
  readonly id: string;
  readonly label: string;
  readonly accessibleName?: string;
  readonly href: string;
  readonly meta?: ComponentMetadataOptions<readonly ['focus', 'layer', 'styles'], LinkStylePart>;
}

export type LinkOptions<TMessage extends ComponentMessage = never> = LinkBaseOptions & (
  | AvailableControl & {
      readonly onActivate: (event: LinkActivateEvent) => MessageResolution<TMessage>;
      readonly onPointerAction?: (action: PointerInteractionAction) => MessageResolution<TMessage>;
    }
  | UnavailableControl & { readonly onActivate?: never; readonly onPointerAction?: never }
);

export interface ToggleButtonBaseOptions {
  readonly id: string;
  readonly leading?: InlineContent;
  readonly trailing?: InlineContent;
  readonly tone?: ButtonTone;
  readonly density?: ComponentDensity;
  readonly pressed: boolean;
  readonly meta?: ComponentMetadataOptions<readonly ['focus', 'layer', 'styles'], ButtonStylePart>;
}

type ToggleButtonName =
  | { readonly label: string; readonly accessibleName?: string }
  | { readonly label?: never; readonly accessibleName: string };

export type ToggleButtonOptions<TMessage extends ComponentMessage = never> = ToggleButtonBaseOptions & ToggleButtonName & (
  | AvailableControl & {
      readonly onTransition: (action: ToggleButtonTransition) => MessageResolution<TMessage>;
      readonly onPointerAction?: (action: PointerInteractionAction) => MessageResolution<TMessage>;
    }
  | UnavailableControl & { readonly onTransition?: never; readonly onPointerAction?: never }
);

export interface ToolbarOptions {
  readonly id: string;
  readonly label: string;
  readonly orientation?: 'horizontal' | 'vertical';
  readonly meta?: ComponentMetadataOptions<readonly ['focus', 'layer'], never>;
}

export type { LinkActivateEvent, ToggleButtonTransition } from '../../ui-model/foundations.ts';
