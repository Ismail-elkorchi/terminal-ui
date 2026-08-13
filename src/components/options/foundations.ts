import type { ComponentMessage, ComponentMetadataOptions } from '../../component/index.ts';
import type { Element } from '../../element/index.ts';
import type { PointerInteractionAction, PointerInteractionState } from '../../interaction/index.ts';
import type { MessageResolution } from '../../interaction/message.ts';
import type { LinkActivateEvent, ToggleButtonTransition } from '../../ui-model/foundations.ts';
import type { LinkStylePart, ToggleButtonStylePart, ToolbarStylePart } from '../../ui-model/style-parts.ts';

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
  readonly label: string;
  readonly accessibleName?: string;
  readonly pressed: boolean;
  readonly meta?: ComponentMetadataOptions<readonly ['focus', 'layer', 'styles'], ToggleButtonStylePart>;
}

export type ToggleButtonOptions<TMessage extends ComponentMessage = never> = ToggleButtonBaseOptions & (
  | AvailableControl & {
      readonly onTransition: (action: ToggleButtonTransition) => MessageResolution<TMessage>;
      readonly onPointerAction?: (action: PointerInteractionAction) => MessageResolution<TMessage>;
    }
  | UnavailableControl & { readonly onTransition?: never; readonly onPointerAction?: never }
);

export interface ToolbarOptions<TItems extends readonly Element[]> {
  readonly id: string;
  readonly label: string;
  readonly orientation?: 'horizontal' | 'vertical';
  readonly items: TItems;
  readonly meta?: ComponentMetadataOptions<readonly ['focus', 'layer', 'styles'], ToolbarStylePart>;
}

export type { LinkActivateEvent, ToggleButtonTransition } from '../../ui-model/foundations.ts';
