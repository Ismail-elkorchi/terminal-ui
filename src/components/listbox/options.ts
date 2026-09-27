import type {
  CompleteListboxCollection,
  ListboxActivateEvent,
  ListboxControlTransition,
  ListboxOptionMapper,
  ListboxTransition,
  ScrollableListboxState,
  UnscrolledListboxState,
  WindowedListboxCollection,
} from '../../behavior/listbox.ts';
import type { ComponentMetadataOptions } from '../../component/contracts.ts';
import type { ComponentMessage } from '../../component/message.ts';
import type { MessageResolution } from '../../interaction/message.ts';
import type { ScrollPolicy } from '../../interaction/scroll.ts';
import type { ScrollbarOptions } from '../../interaction/scrollbar.ts';
import type { DataListStylePart } from '../style-parts.ts';


type ListboxCommonOptions<TValue> = ListboxDataOptions<TValue> & {
  readonly id: string;
  readonly busy?: boolean;
  readonly inert?: boolean;
  readonly styles?: import("../../element/metadata.ts").ElementStyles<DataListStylePart, 'focused' | 'hovered' | 'pressed' | 'active' | 'selected' | 'disabled' | 'busy'>;
  readonly meta?: ComponentMetadataOptions<readonly ['focus', 'layer', 'styles']>;
};

type ListboxDataOptions<TValue> =
  | {
      readonly items: readonly TValue[];
      readonly toOption: ListboxOptionMapper<TValue>;
      readonly collection?: never;
      readonly query?: import('../../text/query.ts').CollectionQuery;
    }
  | {
      readonly collection: CompleteListboxCollection<TValue>;
      readonly items?: never;
      readonly toOption?: never;
      readonly query?: import('../../text/query.ts').CollectionQuery;
    }
  | {
      readonly collection: WindowedListboxCollection<TValue>;
      readonly items?: never;
      readonly toOption?: never;
      readonly query?: never;
    };

interface ActiveListboxCallbacks<TMessage extends ComponentMessage> {
  readonly disabled?: boolean;
  readonly inert?: boolean;
  readonly onTransition: (transition: ListboxTransition) => MessageResolution<TMessage>;
  readonly onActivate?: (event: ListboxActivateEvent) => MessageResolution<TMessage>;
}

interface InertListboxCallbacks {
  readonly disabled?: boolean;
  readonly inert: true;
  readonly onTransition?: never;
  readonly onActivate?: never;
}

interface DisabledListboxCallbacks {
  readonly disabled: true;
  readonly busy?: never;
  readonly onTransition?: never;
  readonly onActivate?: never;
}

type UnavailableListboxCallbacks = DisabledListboxCallbacks | InertListboxCallbacks;

export type ListboxOptions<TValue, TMessage extends ComponentMessage = never> =
  | UnscrolledListboxOptions<TValue, TMessage>
  | ScrollableListboxOptions<TValue, TMessage>;

export type UnscrolledListboxOptions<TValue, TMessage extends ComponentMessage = never> = ListboxCommonOptions<TValue> & {
  readonly state: UnscrolledListboxState;
  readonly scrollbar?: never;
  readonly scrollPolicy?: never;
} & (Omit<ActiveListboxCallbacks<TMessage>, 'onTransition'> & {
  readonly onTransition: (transition: ListboxControlTransition) => MessageResolution<TMessage>;
} | UnavailableListboxCallbacks);

export type ScrollableListboxOptions<TValue, TMessage extends ComponentMessage = never> = ListboxCommonOptions<TValue> & {
  readonly state: ScrollableListboxState;
  readonly scrollbar?: ScrollbarOptions;
  readonly scrollPolicy?: ScrollPolicy;
} & (ActiveListboxCallbacks<TMessage> | UnavailableListboxCallbacks);
