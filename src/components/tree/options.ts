import type {
  ScrollableTreeState,
  TreeActivateEvent,
  TreeControlTransition,
  TreeSource,
  TreeTransition,
  UnscrolledTreeState,
} from '../../behavior/tree.ts';
import type { ComponentMetadataOptions } from '../../component/contracts.ts';
import type { ComponentMessage } from '../../component/message.ts';
import type { MessageResolution } from '../../interaction/message.ts';
import type { ScrollPolicy } from '../../interaction/scroll.ts';
import type { ScrollbarOptions } from '../../interaction/scrollbar.ts';
import type { RetainedCallbacks } from '../shared/availability.ts';
import type { TreeStylePart } from '../style-parts.ts';


interface TreeCommonOptions {
  readonly id: string;
  readonly emptyText?: string;
  readonly busy?: boolean;
  readonly inert?: boolean;
  readonly styles?: import("../../element/metadata.ts").ElementStyles<TreeStylePart, 'focused' | 'hovered' | 'pressed' | 'active' | 'selected' | 'disabled' | 'busy'>;
  readonly meta?: ComponentMetadataOptions<readonly ['focus', 'layer', 'styles']>;
}

type TreeBaseOptions<TMetadata extends Readonly<Record<string, unknown>>> = TreeCommonOptions & {
  readonly source: TreeSource<TMetadata>;
};

export type TreeOptions<
  TMetadata extends Readonly<Record<string, unknown>> = Readonly<Record<string, unknown>>,
  TTransitionMessage extends ComponentMessage = never,
  TActivateMessage extends ComponentMessage = TTransitionMessage,
> = UnscrolledTreeOptions<TMetadata, TTransitionMessage, TActivateMessage>
  | ScrollableTreeOptions<TMetadata, TTransitionMessage, TActivateMessage>;

interface ActiveTreeCallbacks<
  TTransitionMessage extends ComponentMessage,
  TActivateMessage extends ComponentMessage,
> {
  readonly disabled?: boolean;
  readonly inert?: boolean;
  readonly onTransition: (transition: TreeTransition) => MessageResolution<TTransitionMessage>;
  readonly onActivate?: (event: TreeActivateEvent) => MessageResolution<TActivateMessage>;
}

type TreeCallbacks<TTransition, TTransitionMessage extends ComponentMessage, TActivateMessage extends ComponentMessage> =
  Omit<ActiveTreeCallbacks<TTransitionMessage, TActivateMessage>, 'onTransition'> & {
    readonly onTransition: (transition: TTransition) => MessageResolution<TTransitionMessage>;
  };

type InertTreeCallbacks<TTransition, TTransitionMessage extends ComponentMessage, TActivateMessage extends ComponentMessage> = {
  readonly disabled?: boolean;
  readonly inert: true;
} & RetainedCallbacks<TreeCallbacks<TTransition, TTransitionMessage, TActivateMessage>>;

type DisabledTreeCallbacks<TTransition, TTransitionMessage extends ComponentMessage, TActivateMessage extends ComponentMessage> = {
  readonly disabled: true;
  readonly busy?: never;
} & RetainedCallbacks<TreeCallbacks<TTransition, TTransitionMessage, TActivateMessage>>;

type UnavailableTreeCallbacks<TTransition, TTransitionMessage extends ComponentMessage, TActivateMessage extends ComponentMessage> =
  DisabledTreeCallbacks<TTransition, TTransitionMessage, TActivateMessage>
  | InertTreeCallbacks<TTransition, TTransitionMessage, TActivateMessage>;

export type UnscrolledTreeOptions<
  TMetadata extends Readonly<Record<string, unknown>> = Readonly<Record<string, unknown>>,
  TTransitionMessage extends ComponentMessage = never,
  TActivateMessage extends ComponentMessage = TTransitionMessage,
> = TreeBaseOptions<TMetadata> & {
  readonly state: UnscrolledTreeState;
  readonly scrollbar?: never;
  readonly scrollPolicy?: never;
} & (TreeCallbacks<TreeControlTransition, TTransitionMessage, TActivateMessage> | UnavailableTreeCallbacks<TreeControlTransition, TTransitionMessage, TActivateMessage>);

export type ScrollableTreeOptions<
  TMetadata extends Readonly<Record<string, unknown>> = Readonly<Record<string, unknown>>,
  TTransitionMessage extends ComponentMessage = never,
  TActivateMessage extends ComponentMessage = TTransitionMessage,
> = TreeBaseOptions<TMetadata> & {
  readonly state: ScrollableTreeState;
  readonly scrollbar?: ScrollbarOptions;
  readonly scrollPolicy?: ScrollPolicy;
} & (ActiveTreeCallbacks<TTransitionMessage, TActivateMessage> | UnavailableTreeCallbacks<TreeTransition, TTransitionMessage, TActivateMessage>);
