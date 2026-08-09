import type {
  ElementAccessibility,
  ElementFocus,
  ElementKeyBindings,
  ElementLayer,
  ElementState,
  ElementStyles
} from '../../element/metadata.ts';
import type { RenderNodeRenderer } from './renderer.ts';
import type { RenderNodePropsByKind } from './props/index.ts';
import type {
  PointerInteractionAction,
  PointerInteractionState
} from '../../interaction/pointer-interaction.ts';
import type { RenderNodeKind } from '../contracts.ts';

export type { RenderNodeKind } from '../contracts.ts';

export interface RenderNodePointerInteraction<TMessage> {
  readonly state?: PointerInteractionState;
  readonly toActionMessage?: (action: PointerInteractionAction) => TMessage;
}

interface RenderNodeBase<TMessage, TKind extends RenderNodeKind> {
  readonly id?: string;
  readonly kind: TKind;
  readonly props: RenderNodePropsByKind<TMessage>[TKind];
  readonly layer?: ElementLayer;
  readonly focus?: ElementFocus;
  readonly styles?: ElementStyles;
  readonly children?: readonly RenderNode<TMessage>[];
  /** Children visible to public element inspection. */
  readonly inspectionChildren?: readonly RenderNode<TMessage>[];
  readonly keyMap?: ElementKeyBindings<TMessage>;
  readonly inputMap?: RenderNodeInputMap<TMessage>;
  readonly pointer?: RenderNodePointerInteraction<TMessage>;
  readonly messageMap?: (message: unknown) => unknown;
  readonly accessibility?: ElementAccessibility;
  readonly focusable?: true;
  readonly state?: ElementState;
  /** Internal marker for structural nodes owned by a component implementation. */
  readonly transparentFocusIdentity?: true;
}

export type RenderNodeOfKind<
  TMessage,
  TKind extends RenderNodeKind
> = RenderNodeBase<TMessage, TKind> & (
  TKind extends 'component'
    ? { readonly definition: RuntimeComponentDefinition<TMessage> }
    : { readonly definition?: never }
);

export type RenderNode<TMessage = unknown> = {
  readonly [TKind in RenderNodeKind]: RenderNodeOfKind<TMessage, TKind>;
}[RenderNodeKind];

export type RenderNodesOfKind<TMessage, TKind extends RenderNodeKind> = {
  readonly [TCurrentKind in TKind]: RenderNodeOfKind<TMessage, TCurrentKind>;
}[TKind];

export type RenderNodeChildren<TMessage> = readonly RenderNode<TMessage>[] | RenderNode<TMessage>;
export interface RenderNodeInputMap<TMessage> {
  readonly text?: (text: string) => TMessage;
  readonly paste?: (text: string) => TMessage;
}

export interface RuntimeComponentDefinition<TMessage = unknown> {
  readonly name: string;
  readonly sensitiveInput: boolean;
  readonly inspection: import('../../element/inspection.ts').ComponentCapabilityInspection;
  readonly renderer: RenderNodeRenderer<TMessage, 'component'>;
}
