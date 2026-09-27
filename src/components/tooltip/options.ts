import type { ComponentMetadataOptions } from '../../component/contracts.ts';
import type { ComponentMessage } from '../../component/message.ts';
import type { Element } from '../../element/types.ts';
import type { AnchoredSurfacePlacement } from '../../interaction/anchored-surface.ts';
import type { MessageResolution } from '../../interaction/message.ts';
import type { BorderOptions } from '../../visual/border.ts';
import type { TooltipStylePart } from '../style-parts.ts';
import type { TooltipTone, TooltipTransition } from './contracts.ts';


export interface TooltipOptions<
  TTrigger extends Element<ComponentMessage>,
  TMessage extends ComponentMessage = never
> {
  readonly id: string;
  readonly trigger: TTrigger;
  readonly content: string | readonly string[];
  readonly open: boolean;
  readonly title?: string;
  readonly tone?: TooltipTone;
  readonly placement?: AnchoredSurfacePlacement;
  readonly maxWidth?: number;
  readonly border?: BorderOptions;
  readonly styles?: import("../../element/metadata.ts").ElementStyles<TooltipStylePart>;
  readonly meta?: ComponentMetadataOptions<readonly ['styles']>;
  readonly onTransition: (transition: TooltipTransition) => MessageResolution<TMessage>;
}
