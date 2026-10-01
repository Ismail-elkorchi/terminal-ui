import type { ControlKeymap } from '../../interaction/control-keymap.ts';
import type { SearchPickerKeyAction } from '../keymaps.ts';
import type { SearchPickerIndex, SearchPickerQueryResult } from '../../behavior/search-picker-index.ts';
import type {
  ScrollableSearchPickerView,
  SearchPickerAcceptEvent,
  SearchPickerControlTransition,
  SearchPickerTransition,
  UnscrolledSearchPickerView,
} from '../../behavior/search-picker.ts';
import type { ComponentMetadataOptions } from '../../component/contracts.ts';
import type { ComponentMessage } from '../../component/message.ts';
import type { MessageResolution } from '../../interaction/message.ts';
import type { ScrollPolicy } from '../../interaction/scroll.ts';
import type { ScrollbarOptions } from '../../interaction/scrollbar.ts';
import type { TextContextMenuEvent } from '../../interaction/text-pointer.ts';
import type { RetainedCallbacks } from '../shared/availability.ts';
import type { SearchPickerStylePart } from '../style-parts.ts';


interface SearchPickerOptionsBase<TValue> {
  readonly keymap?: ControlKeymap<SearchPickerKeyAction>;
  readonly id: string;
  readonly title?: string;
  readonly searchPickerIndex: SearchPickerIndex<TValue>;
  /** Caller-prepared results; null keeps editing responsive while a query is pending. */
  readonly queryResult: SearchPickerQueryResult<TValue> | null;
  readonly maxVisible?: number;
  readonly helpText?: string;
  readonly emptyText?: string;
  readonly styles?: import("../../element/metadata.ts").ElementStyles<SearchPickerStylePart, 'focused' | 'hovered' | 'pressed' | 'active' | 'selected' | 'disabled' | 'busy' | 'readOnly'>;
  readonly meta?: ComponentMetadataOptions<readonly ['focus', 'layer', 'styles']>;
}

interface ActiveSearchPickerCallbacks<
  TTransitionMessage extends ComponentMessage,
  TAcceptMessage extends ComponentMessage,
  TTransition,
> {
  readonly disabled?: boolean;
  readonly readOnly?: boolean;
  readonly busy?: boolean;
  readonly inert?: boolean;
  readonly onTransition: (transition: TTransition) => MessageResolution<TTransitionMessage>;
  readonly onAccept?: (event: SearchPickerAcceptEvent) => MessageResolution<TAcceptMessage>;
  readonly onContextMenu?: (event: TextContextMenuEvent) => MessageResolution<TTransitionMessage>;
}

type InertSearchPickerCallbacks<TTransitionMessage extends ComponentMessage, TAcceptMessage extends ComponentMessage, TTransition> = {
  readonly disabled?: boolean;
  readonly readOnly?: never;
  readonly busy?: boolean;
  readonly inert: true;
} & RetainedCallbacks<ActiveSearchPickerCallbacks<TTransitionMessage, TAcceptMessage, TTransition>>;

type DisabledSearchPickerCallbacks<TTransitionMessage extends ComponentMessage, TAcceptMessage extends ComponentMessage, TTransition> = {
  readonly disabled: true;
  readonly readOnly?: never;
  readonly busy?: never;
  readonly inert?: never;
} & RetainedCallbacks<ActiveSearchPickerCallbacks<TTransitionMessage, TAcceptMessage, TTransition>>;

export type UnscrolledSearchPickerOptions<
  TValue = string,
  TTransitionMessage extends ComponentMessage = never,
  TAcceptMessage extends ComponentMessage = TTransitionMessage,
> = SearchPickerOptionsBase<TValue> & {
  readonly view: UnscrolledSearchPickerView;
  readonly scrollbar?: never;
  readonly scrollPolicy?: never;
} & (ActiveSearchPickerCallbacks<
  TTransitionMessage,
  TAcceptMessage,
  SearchPickerControlTransition
> | DisabledSearchPickerCallbacks<TTransitionMessage, TAcceptMessage, SearchPickerControlTransition> | InertSearchPickerCallbacks<TTransitionMessage, TAcceptMessage, SearchPickerControlTransition>);

export type ScrollableSearchPickerOptions<
  TValue = string,
  TTransitionMessage extends ComponentMessage = never,
  TAcceptMessage extends ComponentMessage = TTransitionMessage,
> = SearchPickerOptionsBase<TValue> & {
  readonly view: ScrollableSearchPickerView;
  readonly scrollbar?: ScrollbarOptions;
  readonly scrollPolicy?: ScrollPolicy;
} & (ActiveSearchPickerCallbacks<
  TTransitionMessage,
  TAcceptMessage,
  SearchPickerTransition
> | DisabledSearchPickerCallbacks<TTransitionMessage, TAcceptMessage, SearchPickerTransition> | InertSearchPickerCallbacks<TTransitionMessage, TAcceptMessage, SearchPickerTransition>);

export type SearchPickerOptions<
  TValue = string,
  TTransitionMessage extends ComponentMessage = never,
  TAcceptMessage extends ComponentMessage = TTransitionMessage,
> = UnscrolledSearchPickerOptions<TValue, TTransitionMessage, TAcceptMessage>
  | ScrollableSearchPickerOptions<TValue, TTransitionMessage, TAcceptMessage>;
