import type {
  AutocompleteComboboxControlTransition,
  AutocompleteComboboxTransition,
  AutocompleteComboboxView,
  ComboboxCommitEvent,
  ComboboxControlTransition,
  ComboboxTransition,
  ScrollableComboboxState,
  UnscrolledComboboxState,
} from '../../behavior/combobox.ts';
import type { CompleteListboxCollection, ListboxView, WindowedListboxCollection } from '../../behavior/listbox.ts';
import type { CollectionQuery } from '../../text/query.ts';
import type { ComponentMessage } from '../../component/message.ts';
import type { ElementMeta } from '../../element/metadata.ts';
import type { AnchoredSurfacePlacement } from '../../interaction/anchored-surface.ts';
import type { MessageResolution } from '../../interaction/message.ts';
import type { ScrollbarOptions } from '../../interaction/scrollbar.ts';
import type { TextContextMenuEvent } from '../../interaction/text-pointer.ts';
import type { RetainedCallbacks } from '../shared/availability.ts';
import type { ComboboxStylePart } from '../style-parts.ts';


type ComboboxOptionsBase<
  TValue,
> = (
  | { readonly collection: CompleteListboxCollection<TValue>; readonly query?: CollectionQuery }
  | { readonly collection: WindowedListboxCollection<TValue>; readonly query?: never }
) & {
  readonly id: string;
  readonly label: string;
  /** Whether to paint the label prefix. Defaults to visible; label remains the accessible name. */
  readonly labelVisibility?: 'visible' | 'hidden';
  readonly optionsView: ListboxView<TValue> | null;
  readonly placeholder?: string;
  readonly placement?: AnchoredSurfacePlacement;
  readonly maxVisibleOptions?: number;
  readonly required?: boolean;
  readonly error?: string;
  readonly styles?: import('../../element/metadata.ts').ElementStyles<ComboboxStylePart, 'focused' | 'hovered' | 'pressed' | 'active' | 'selected' | 'disabled' | 'busy' | 'readOnly'>;
  readonly meta?: Pick<ElementMeta, 'focus' | 'layer'>;
};

interface ActiveComboboxCallbacks<
  TTransition,
  TMessage extends ComponentMessage,
  TCommitMessage extends ComponentMessage = TMessage,
  TContextMessage extends ComponentMessage = TMessage,
> {
  readonly onTransition: (transition: TTransition) => MessageResolution<TMessage>;
  readonly onCommit?: (event: ComboboxCommitEvent) => MessageResolution<TCommitMessage>;
  readonly onContextMenu?: (event: TextContextMenuEvent) => MessageResolution<TContextMessage>;
  readonly disabled?: boolean;
  readonly readOnly?: boolean;
  readonly busy?: boolean;
  readonly inert?: boolean;
}

type UnscrolledComboboxBase<TValue> = ComboboxOptionsBase<TValue> & {
  readonly state: UnscrolledComboboxState;
  readonly scrollbar?: never;
};

type ScrollableComboboxBase<TValue> = ComboboxOptionsBase<TValue> & {
  readonly state: ScrollableComboboxState;
  readonly scrollbar?: ScrollbarOptions;
};

export type ActiveComboboxOptions<
  TValue,
  TMessage extends ComponentMessage,
  TCommitMessage extends ComponentMessage = TMessage,
  TContextMessage extends ComponentMessage = TMessage,
> =
  | UnscrolledComboboxBase<TValue> & ActiveComboboxCallbacks<ComboboxControlTransition, TMessage, TCommitMessage, TContextMessage>
  | ScrollableComboboxBase<TValue> & ActiveComboboxCallbacks<ComboboxTransition, TMessage, TCommitMessage, TContextMessage>;

type InertComboboxAvailability<
  TTransition,
  TMessage extends ComponentMessage,
  TCommitMessage extends ComponentMessage = TMessage,
  TContextMessage extends ComponentMessage = TMessage,
> = {
  readonly disabled?: boolean;
  readonly readOnly?: never;
  readonly busy?: boolean;
  readonly inert: true;
} & RetainedCallbacks<ActiveComboboxCallbacks<TTransition, TMessage, TCommitMessage, TContextMessage>>;

export type InertComboboxOptions<
  TValue,
  TMessage extends ComponentMessage = never,
  TCommitMessage extends ComponentMessage = TMessage,
  TContextMessage extends ComponentMessage = TMessage,
> =
  | UnscrolledComboboxBase<TValue> & InertComboboxAvailability<ComboboxControlTransition, TMessage, TCommitMessage, TContextMessage>
  | ScrollableComboboxBase<TValue> & InertComboboxAvailability<ComboboxTransition, TMessage, TCommitMessage, TContextMessage>;

type DisabledComboboxAvailability<
  TTransition,
  TMessage extends ComponentMessage,
  TCommitMessage extends ComponentMessage = TMessage,
  TContextMessage extends ComponentMessage = TMessage,
> = {
  readonly disabled: true;
  readonly readOnly?: never;
  readonly busy?: never;
  readonly inert?: never;
} & RetainedCallbacks<ActiveComboboxCallbacks<TTransition, TMessage, TCommitMessage, TContextMessage>>;

export type DisabledComboboxOptions<
  TValue,
  TMessage extends ComponentMessage = never,
  TCommitMessage extends ComponentMessage = TMessage,
  TContextMessage extends ComponentMessage = TMessage,
> =
  | UnscrolledComboboxBase<TValue> & DisabledComboboxAvailability<ComboboxControlTransition, TMessage, TCommitMessage, TContextMessage> & {
      readonly state: UnscrolledComboboxState & { readonly open: false };
    }
  | ScrollableComboboxBase<TValue> & DisabledComboboxAvailability<ComboboxTransition, TMessage, TCommitMessage, TContextMessage> & {
      readonly state: ScrollableComboboxState & { readonly open: false };
    };

export type UnscrolledComboboxOptions<
  TValue = string,
  TMessage extends ComponentMessage = never,
  TCommitMessage extends ComponentMessage = TMessage,
  TContextMessage extends ComponentMessage = TMessage,
> = UnscrolledComboboxBase<TValue> & (
  | ActiveComboboxCallbacks<ComboboxControlTransition, TMessage, TCommitMessage, TContextMessage>
  | InertComboboxAvailability<ComboboxControlTransition, TMessage, TCommitMessage, TContextMessage>
  | DisabledComboboxAvailability<ComboboxControlTransition, TMessage, TCommitMessage, TContextMessage> & {
      readonly state: UnscrolledComboboxState & { readonly open: false };
    }
);

export type ScrollableComboboxOptions<
  TValue = string,
  TMessage extends ComponentMessage = never,
  TCommitMessage extends ComponentMessage = TMessage,
  TContextMessage extends ComponentMessage = TMessage,
> = ScrollableComboboxBase<TValue> & (
  | ActiveComboboxCallbacks<ComboboxTransition, TMessage, TCommitMessage, TContextMessage>
  | InertComboboxAvailability<ComboboxTransition, TMessage, TCommitMessage, TContextMessage>
  | DisabledComboboxAvailability<ComboboxTransition, TMessage, TCommitMessage, TContextMessage> & {
      readonly state: ScrollableComboboxState & { readonly open: false };
    }
);

export type ComboboxOptions<
  TValue = string,
  TMessage extends ComponentMessage = never,
  TCommitMessage extends ComponentMessage = TMessage,
  TContextMessage extends ComponentMessage = TMessage,
> =
  | UnscrolledComboboxOptions<TValue, TMessage, TCommitMessage, TContextMessage>
  | ScrollableComboboxOptions<TValue, TMessage, TCommitMessage, TContextMessage>;

type UnscrolledAutocompleteComboboxBase<TValue> = ComboboxOptionsBase<TValue> & {
  readonly view: Extract<AutocompleteComboboxView, { readonly scroll?: never }>;
  readonly scrollbar?: never;
};

type ScrollableAutocompleteComboboxBase<TValue> = ComboboxOptionsBase<TValue> & {
  readonly view: Extract<AutocompleteComboboxView, { readonly scroll: unknown }>;
  readonly scrollbar?: ScrollbarOptions;
};

/** A dynamically selected scroll mode can emit either transition family. */
type DynamicAutocompleteComboboxBase<TValue> = ComboboxOptionsBase<TValue> & {
  readonly view: AutocompleteComboboxView;
  readonly scrollbar?: never;
};

export type ActiveAutocompleteComboboxOptions<
  TValue,
  TMessage extends ComponentMessage,
  TCommitMessage extends ComponentMessage = TMessage,
  TContextMessage extends ComponentMessage = TMessage,
> =
  | UnscrolledAutocompleteComboboxBase<TValue>
    & ActiveComboboxCallbacks<AutocompleteComboboxControlTransition, TMessage, TCommitMessage, TContextMessage>
  | ScrollableAutocompleteComboboxBase<TValue>
    & ActiveComboboxCallbacks<AutocompleteComboboxTransition, TMessage, TCommitMessage, TContextMessage>
  | DynamicAutocompleteComboboxBase<TValue>
    & ActiveComboboxCallbacks<AutocompleteComboboxTransition, TMessage, TCommitMessage, TContextMessage>;

type AutocompleteComboboxAvailability<
  TTransition,
  TMessage extends ComponentMessage,
  TCommitMessage extends ComponentMessage = TMessage,
  TContextMessage extends ComponentMessage = TMessage,
> =
  | ActiveComboboxCallbacks<TTransition, TMessage, TCommitMessage, TContextMessage>
  | InertComboboxAvailability<TTransition, TMessage, TCommitMessage, TContextMessage>
  | DisabledComboboxAvailability<TTransition, TMessage, TCommitMessage, TContextMessage> & {
      readonly view: { readonly open: false };
    };

export type UnscrolledAutocompleteComboboxOptions<
  TValue = string,
  TMessage extends ComponentMessage = never,
  TCommitMessage extends ComponentMessage = TMessage,
  TContextMessage extends ComponentMessage = TMessage,
> = UnscrolledAutocompleteComboboxBase<TValue>
  & AutocompleteComboboxAvailability<AutocompleteComboboxControlTransition, TMessage, TCommitMessage, TContextMessage>;

export type ScrollableAutocompleteComboboxOptions<
  TValue = string,
  TMessage extends ComponentMessage = never,
  TCommitMessage extends ComponentMessage = TMessage,
  TContextMessage extends ComponentMessage = TMessage,
> = ScrollableAutocompleteComboboxBase<TValue>
  & AutocompleteComboboxAvailability<AutocompleteComboboxTransition, TMessage, TCommitMessage, TContextMessage>;

export type DynamicAutocompleteComboboxOptions<
  TValue = string,
  TMessage extends ComponentMessage = never,
  TCommitMessage extends ComponentMessage = TMessage,
  TContextMessage extends ComponentMessage = TMessage,
> = DynamicAutocompleteComboboxBase<TValue>
  & AutocompleteComboboxAvailability<AutocompleteComboboxTransition, TMessage, TCommitMessage, TContextMessage>;

export type AutocompleteComboboxOptions<
  TValue = string,
  TMessage extends ComponentMessage = never,
  TCommitMessage extends ComponentMessage = TMessage,
  TContextMessage extends ComponentMessage = TMessage,
> =
  | UnscrolledAutocompleteComboboxOptions<TValue, TMessage, TCommitMessage, TContextMessage>
  | ScrollableAutocompleteComboboxOptions<TValue, TMessage, TCommitMessage, TContextMessage>
  | DynamicAutocompleteComboboxOptions<TValue, TMessage, TCommitMessage, TContextMessage>;

export type AnyComboboxOptions<
  TValue = string,
  TMessage extends ComponentMessage = never,
  TCommitMessage extends ComponentMessage = TMessage,
  TContextMessage extends ComponentMessage = TMessage,
> = ComboboxOptions<TValue, TMessage, TCommitMessage, TContextMessage> | AutocompleteComboboxOptions<TValue, TMessage, TCommitMessage, TContextMessage>;
