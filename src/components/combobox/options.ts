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
import type { ChoiceItem } from '../../collection/item.ts';
import type { ComponentMessage } from '../../component/message.ts';
import type { ElementMeta } from '../../element/metadata.ts';
import type { AnchoredSurfacePlacement } from '../../interaction/anchored-surface.ts';
import type { MessageResolution } from '../../interaction/message.ts';
import type { ScrollbarOptions } from '../../interaction/scrollbar.ts';
import type { TextContextMenuEvent } from '../../interaction/text-pointer.ts';
import type { RetainedCallbacks } from '../shared/availability.ts';
import type { ComboboxStylePart } from '../style-parts.ts';


interface ComboboxOptionsBase<TValue> {
  readonly id: string;
  readonly label: string;
  readonly options: readonly ChoiceItem<TValue>[];
  readonly placeholder?: string;
  readonly placement?: AnchoredSurfacePlacement;
  readonly maxVisibleOptions?: number;
  readonly required?: boolean;
  readonly error?: string;
  readonly styles?: import('../../element/metadata.ts').ElementStyles<ComboboxStylePart, 'focused' | 'hovered' | 'pressed' | 'active' | 'selected' | 'disabled' | 'busy' | 'readOnly'>;
  readonly meta?: Pick<ElementMeta, 'focus' | 'layer'>;
}

interface ActiveComboboxCallbacks<TTransition, TMessage extends ComponentMessage> {
  readonly onTransition: (transition: TTransition) => MessageResolution<TMessage>;
  readonly onCommit?: (event: ComboboxCommitEvent) => MessageResolution<TMessage>;
  readonly onContextMenu?: (event: TextContextMenuEvent) => MessageResolution<TMessage>;
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

export type ActiveComboboxOptions<TValue, TMessage extends ComponentMessage> =
  | UnscrolledComboboxBase<TValue> & ActiveComboboxCallbacks<ComboboxControlTransition, TMessage>
  | ScrollableComboboxBase<TValue> & ActiveComboboxCallbacks<ComboboxTransition, TMessage>;

type InertComboboxAvailability<TTransition, TMessage extends ComponentMessage> = {
  readonly disabled?: boolean;
  readonly readOnly?: never;
  readonly busy?: boolean;
  readonly inert: true;
} & RetainedCallbacks<ActiveComboboxCallbacks<TTransition, TMessage>>;

export type InertComboboxOptions<TValue, TMessage extends ComponentMessage = never> =
  | UnscrolledComboboxBase<TValue> & InertComboboxAvailability<ComboboxControlTransition, TMessage>
  | ScrollableComboboxBase<TValue> & InertComboboxAvailability<ComboboxTransition, TMessage>;

type DisabledComboboxAvailability<TTransition, TMessage extends ComponentMessage> = {
  readonly disabled: true;
  readonly readOnly?: never;
  readonly busy?: never;
  readonly inert?: never;
} & RetainedCallbacks<ActiveComboboxCallbacks<TTransition, TMessage>>;

export type DisabledComboboxOptions<TValue, TMessage extends ComponentMessage = never> =
  | UnscrolledComboboxBase<TValue> & DisabledComboboxAvailability<ComboboxControlTransition, TMessage> & {
      readonly state: UnscrolledComboboxState & { readonly open: false };
    }
  | ScrollableComboboxBase<TValue> & DisabledComboboxAvailability<ComboboxTransition, TMessage> & {
      readonly state: ScrollableComboboxState & { readonly open: false };
    };

export type UnscrolledComboboxOptions<
  TValue = string,
  TMessage extends ComponentMessage = never,
> = UnscrolledComboboxBase<TValue> & (
  | ActiveComboboxCallbacks<ComboboxControlTransition, TMessage>
  | InertComboboxAvailability<ComboboxControlTransition, TMessage>
  | DisabledComboboxAvailability<ComboboxControlTransition, TMessage> & {
      readonly state: UnscrolledComboboxState & { readonly open: false };
    }
);

export type ScrollableComboboxOptions<
  TValue = string,
  TMessage extends ComponentMessage = never,
> = ScrollableComboboxBase<TValue> & (
  | ActiveComboboxCallbacks<ComboboxTransition, TMessage>
  | InertComboboxAvailability<ComboboxTransition, TMessage>
  | DisabledComboboxAvailability<ComboboxTransition, TMessage> & {
      readonly state: ScrollableComboboxState & { readonly open: false };
    }
);

export type ComboboxOptions<TValue = string, TMessage extends ComponentMessage = never> =
  | UnscrolledComboboxOptions<TValue, TMessage>
  | ScrollableComboboxOptions<TValue, TMessage>;

type UnscrolledAutocompleteComboboxBase<TValue> = ComboboxOptionsBase<TValue> & {
  readonly view: Extract<AutocompleteComboboxView, { readonly scroll?: never }>;
  readonly scrollbar?: never;
};

type ScrollableAutocompleteComboboxBase<TValue> = ComboboxOptionsBase<TValue> & {
  readonly view: Extract<AutocompleteComboboxView, { readonly scroll: unknown }>;
  readonly scrollbar?: ScrollbarOptions;
};

export type ActiveAutocompleteComboboxOptions<
  TValue,
  TMessage extends ComponentMessage,
> =
  | UnscrolledAutocompleteComboboxBase<TValue>
    & ActiveComboboxCallbacks<AutocompleteComboboxControlTransition, TMessage>
  | ScrollableAutocompleteComboboxBase<TValue>
    & ActiveComboboxCallbacks<AutocompleteComboboxTransition, TMessage>;

export type AutocompleteComboboxOptions<
  TValue = string,
  TMessage extends ComponentMessage = never,
> =
  | ActiveAutocompleteComboboxOptions<TValue, TMessage>
  | UnscrolledAutocompleteComboboxBase<TValue> & InertComboboxAvailability<AutocompleteComboboxControlTransition, TMessage>
  | ScrollableAutocompleteComboboxBase<TValue> & InertComboboxAvailability<AutocompleteComboboxTransition, TMessage>
  | UnscrolledAutocompleteComboboxBase<TValue> & DisabledComboboxAvailability<AutocompleteComboboxControlTransition, TMessage> & {
      readonly view: Extract<AutocompleteComboboxView, { readonly scroll?: never }>
        & { readonly open: false };
    }
  | ScrollableAutocompleteComboboxBase<TValue> & DisabledComboboxAvailability<AutocompleteComboboxTransition, TMessage> & {
      readonly view: Extract<AutocompleteComboboxView, { readonly scroll: unknown }>
        & { readonly open: false };
    };

export type AnyComboboxOptions<
  TValue = string,
  TMessage extends ComponentMessage = never,
> = ComboboxOptions<TValue, TMessage> | AutocompleteComboboxOptions<TValue, TMessage>;
