import type { ControlKeymap } from '../../interaction/control-keymap.ts';
import type { TextAreaKeyAction } from '../keymaps.ts';
import type {
  ScrollableTextAreaControlState,
  TextAreaControlTransition,
  TextAreaTransition,
  UnscrolledTextAreaControlState,
} from '../../behavior/text-area.ts';
import type { ComponentMetadataOptions } from '../../component/contracts.ts';
import type { ComponentMessage } from '../../component/message.ts';
import type { MessageResolution } from '../../interaction/message.ts';
import type { ScrollPolicy } from '../../interaction/scroll.ts';
import type { ScrollbarOptions } from '../../interaction/scrollbar.ts';
import type { TextContextMenuEvent } from '../../interaction/text-pointer.ts';
import type { RetainedCallbacks } from '../shared/availability.ts';
import type { TextAreaStylePart } from '../style-parts.ts';
import type { TextAreaLineNumberOptions, TextAreaWrapOptions } from './contracts.ts';
import type { TextAreaDecorations } from './decorations.ts';


interface TextAreaBaseOptions<TMessage extends ComponentMessage> {
  /** Completed cooperative layout. A mismatched capability is rejected, never warmed synchronously. */
  readonly preparedLayout?: import('./contracts.ts').PreparedTextAreaLayout | null;
  /** Accepted pending-layout demand; prepare it in an ordinary replaceable effect. */
  readonly onLayoutRequest?: (request: import('./contracts.ts').TextAreaLayoutRequest) => MessageResolution<TMessage>;
  readonly onLayout?: (snapshot: import('./contracts.ts').TextAreaLayoutSnapshot) => MessageResolution<TMessage>;
  readonly keymap?: ControlKeymap<TextAreaKeyAction>;
  readonly id: string;
  readonly decorations?: TextAreaDecorations;
  readonly placeholder?: string;
  readonly lineNumbers?: boolean | TextAreaLineNumberOptions;
  readonly highlightActiveLine?: boolean;
  readonly wrap?: boolean | TextAreaWrapOptions;
  readonly required?: boolean;
  readonly error?: string;
  readonly readOnly?: boolean;
  /** Accepted editor work is pending; this semantic state does not reject further input. */
  readonly busy?: boolean;
  readonly styles?: import("../../element/metadata.ts").ElementStyles<TextAreaStylePart, 'focused' | 'hovered' | 'active' | 'selected' | 'disabled' | 'readOnly'>;
  readonly meta?: ComponentMetadataOptions<readonly ['focus', 'layer', 'styles']>;
}

export type TextAreaOptions<TMessage extends ComponentMessage = never> =
  | UnscrolledTextAreaOptions<TMessage>
  | ScrollableTextAreaOptions<TMessage>
  | DisabledTextAreaOptions<TMessage>;

export type UnscrolledTextAreaOptions<TMessage extends ComponentMessage = never> =
  & TextAreaBaseOptions<TMessage>
  & {
    readonly disabled?: boolean;
    readonly state: UnscrolledTextAreaControlState;
    readonly scrollbar?: never;
    readonly scrollPolicy?: never;
    readonly onTransition: (transition: TextAreaControlTransition) => MessageResolution<TMessage>;
    readonly onContextMenu?: (event: TextContextMenuEvent) => MessageResolution<TMessage>;
  };

export type ScrollableTextAreaOptions<TMessage extends ComponentMessage = never> =
  & TextAreaBaseOptions<TMessage>
  & {
    readonly disabled?: boolean;
    readonly state: ScrollableTextAreaControlState;
    readonly scrollbar?: ScrollbarOptions;
    readonly scrollPolicy?: ScrollPolicy;
    readonly onTransition: (transition: TextAreaTransition) => MessageResolution<TMessage>;
    readonly onContextMenu?: (event: TextContextMenuEvent) => MessageResolution<TMessage>;
  };

export type DisabledTextAreaOptions<TMessage extends ComponentMessage = never> = TextAreaBaseOptions<TMessage> & {
  readonly disabled: true;
  readonly readOnly?: never;
} & (
  | {
      readonly state: UnscrolledTextAreaControlState;
      readonly scrollbar?: never;
      readonly scrollPolicy?: never;
    } & RetainedCallbacks<UnscrolledTextAreaOptions<TMessage>>
  | {
      readonly state: ScrollableTextAreaControlState;
      readonly scrollbar?: ScrollbarOptions;
      readonly scrollPolicy?: ScrollPolicy;
    } & RetainedCallbacks<ScrollableTextAreaOptions<TMessage>>
);
