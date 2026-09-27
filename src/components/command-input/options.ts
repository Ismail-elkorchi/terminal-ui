import type {
  CommandInputSubmitEvent,
  CommandInputTransition,
  CommandInputView,
} from '../../behavior/command-input.ts';
import type { ComponentMetadataOptions } from '../../component/contracts.ts';
import type { ComponentMessage } from '../../component/message.ts';
import type { AnchoredSurfacePlacement } from '../../interaction/anchored-surface.ts';
import type { MessageResolution } from '../../interaction/message.ts';
import type { TextContextMenuEvent } from '../../interaction/text-pointer.ts';
import type { CommandInputDisplay, CommandInputValidation } from '../command-input.ts';
import type { RetainedCallbacks } from '../shared/availability.ts';
import type { CommandInputStylePart } from '../style-parts.ts';


interface CommandInputOptionsBase {
  readonly id: string;
  readonly view: CommandInputView;
  readonly prompt?: string;
  readonly placeholder?: string;
  readonly completionPreview?: string;
  readonly validation?: CommandInputValidation;
  readonly footer?: string;
  readonly query?: import('../../text/query.ts').CollectionQuery;
  readonly display?: CommandInputDisplay;
  readonly placement?: AnchoredSurfacePlacement;
  readonly maxVisibleSuggestions?: number;
  readonly styles?: import("../../element/metadata.ts").ElementStyles<CommandInputStylePart, 'focused' | 'hovered' | 'pressed' | 'active' | 'selected' | 'disabled' | 'readOnly'>;
  readonly meta?: ComponentMetadataOptions<readonly ['focus', 'layer', 'styles']>;
}

export type CommandInputOptions<
  TTransitionMessage extends ComponentMessage = never,
  TSubmitMessage extends ComponentMessage = TTransitionMessage,
> = CommandInputOptionsBase & (
  | {
      readonly disabled: true;
      readonly readOnly?: never;
    } & RetainedCallbacks<{
      readonly onTransition: (transition: CommandInputTransition) => MessageResolution<TTransitionMessage>;
      readonly onSubmit?: (event: CommandInputSubmitEvent) => MessageResolution<TSubmitMessage>;
      readonly onContextMenu?: (event: TextContextMenuEvent) => MessageResolution<TTransitionMessage>;
    }>
  | {
      readonly disabled?: boolean;
      readonly readOnly?: boolean;
      readonly onTransition: (transition: CommandInputTransition) => MessageResolution<TTransitionMessage>;
      readonly onSubmit?: (event: CommandInputSubmitEvent) => MessageResolution<TSubmitMessage>;
      readonly onContextMenu?: (event: TextContextMenuEvent) => MessageResolution<TTransitionMessage>;
    }
);
