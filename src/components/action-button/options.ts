import type { ComponentMetadataOptions } from '../../component/contracts.ts';
import type { ComponentMessage } from '../../component/message.ts';
import type { MessageResolution } from '../../interaction/message.ts';
import type { InlineContent } from '../../visual/inline-content.ts';
import type { ComponentDensity } from '../density.ts';
import type { ButtonPressEvent, ButtonTone } from '../form-controls.ts';
import type { ButtonStylePart } from '../style-parts.ts';


interface ButtonOptionsBase {
  readonly id: string;
  readonly leading?: InlineContent;
  readonly trailing?: InlineContent;
  readonly tone?: ButtonTone;
  readonly density?: ComponentDensity;
  readonly busy?: boolean;
  readonly disabled?: boolean;
  readonly styles?: import("../../element/metadata.ts").ElementStyles<ButtonStylePart, 'focused' | 'hovered' | 'pressed' | 'disabled' | 'busy'>;
  readonly meta?: ComponentMetadataOptions<readonly ['focus', 'layer', 'styles']>;
}

type ButtonName =
  | { readonly label: string; readonly accessibleName?: string }
  | { readonly label?: never; readonly accessibleName: string };

export type ButtonOptions<
  TPressMessage extends ComponentMessage = never,
> = ButtonOptionsBase & ButtonName & (
  | {
      readonly disabled: true;
      readonly onPress?: (event: ButtonPressEvent) => MessageResolution<TPressMessage>;
    }
  | {
      readonly disabled?: boolean;
      readonly onPress: (event: ButtonPressEvent) => MessageResolution<TPressMessage>;
    }
);
