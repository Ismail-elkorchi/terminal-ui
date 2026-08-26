import type { ComponentMessage, ComponentMetadataOptions } from '../../component/index.ts';
import type { MessageResolution } from '../../interaction/message.ts';
import type { LinkActivateEvent, ToggleButtonTransition } from '../foundation-controls.ts';
import type { ButtonStylePart, DividerStylePart, LinkStylePart } from '../style-parts.ts';
import type { DividerLineKind, DividerOrientation } from '../divider.ts';
import type { ButtonTone } from '../form-controls.ts';
import type { ComponentDensity } from '../density.ts';
import type { InlineContent } from '../../visual/inline-content.ts';

interface AvailableControl {
  readonly disabled?: false;
  readonly busy?: boolean;
  readonly inert?: false;
}

interface DisabledControl {
  readonly disabled: true;
  readonly busy?: never;
  readonly inert?: boolean;
}

interface InertControl {
  readonly disabled?: false;
  readonly busy?: boolean;
  readonly inert: true;
}

type UnavailableControl = DisabledControl | InertControl;

export interface LinkBaseOptions {
  readonly id: string;
  readonly label: string;
  readonly accessibleName?: string;
  readonly href: string;
  readonly styles?: import("../../element/metadata.ts").ElementStyles<LinkStylePart, 'focused' | 'hovered' | 'pressed' | 'disabled' | 'busy'>;
  readonly meta?: ComponentMetadataOptions<readonly ['focus', 'layer', 'styles']>;
}

export type LinkOptions<TMessage extends ComponentMessage = never> = LinkBaseOptions & (
  | AvailableControl & {
      readonly onActivate: (event: LinkActivateEvent) => MessageResolution<TMessage>;
    }
  | UnavailableControl & { readonly onActivate?: never }
);

export interface ToggleButtonBaseOptions {
  readonly id: string;
  readonly leading?: InlineContent;
  readonly trailing?: InlineContent;
  readonly tone?: ButtonTone;
  readonly density?: ComponentDensity;
  readonly pressed: boolean;
  readonly styles?: import("../../element/metadata.ts").ElementStyles<ButtonStylePart, 'focused' | 'hovered' | 'pressed' | 'disabled' | 'busy'>;
  readonly meta?: ComponentMetadataOptions<readonly ['focus', 'layer', 'styles']>;
}

type ToggleButtonName =
  | { readonly label: string; readonly accessibleName?: string }
  | { readonly label?: never; readonly accessibleName: string };

export type ToggleButtonOptions<TMessage extends ComponentMessage = never> = ToggleButtonBaseOptions & ToggleButtonName & (
  | AvailableControl & {
      readonly onTransition: (transition: ToggleButtonTransition) => MessageResolution<TMessage>;
    }
  | UnavailableControl & { readonly onTransition?: never }
);

export interface ToolbarOptions {
  readonly id: string;
  readonly label: string;
  readonly orientation?: 'horizontal' | 'vertical';
  readonly meta?: ComponentMetadataOptions<readonly ['focus', 'layer']>;
}

export interface DividerOptions {
  readonly id?: string;
  readonly orientation?: DividerOrientation;
  readonly line?: DividerLineKind;
  readonly label?: string;
  readonly labelAlign?: 'start' | 'center' | 'end';
  readonly styles?: import('../../element/metadata.ts').ElementStyles<DividerStylePart>;
  readonly meta?: ComponentMetadataOptions<readonly ['styles', 'layer']>;
}

export type { LinkActivateEvent, ToggleButtonTransition } from '../foundation-controls.ts';
export type { DividerLineKind, DividerOrientation } from '../divider.ts';
