import type {
  ElementAccessibility,
  ElementFocus,
  ElementKeyBindings,
  ElementLayer,
  ElementStyles
} from '../../element/metadata.ts';
import type { RenderNodeRenderer } from './renderer.ts';
import type { RenderNodePropsByKind } from './props/index.ts';
import type { RenderNodeId } from '../../foundation/identity.ts';
import type {
  PointerInteractionAction,
  PointerInteractionState
} from '../../interaction/pointer-interaction.ts';

export interface RenderNodePointerInteraction<TMessage> {
  readonly state?: PointerInteractionState;
  readonly toActionMessage?: (action: PointerInteractionAction) => TMessage;
}

interface RenderNodeBase<TMessage, TKind extends RenderNodeKind> {
  readonly id?: RenderNodeId;
  readonly kind: TKind;
  readonly props: RenderNodePropsByKind<TMessage>[TKind];
  readonly layer?: ElementLayer;
  readonly focus?: ElementFocus;
  readonly styles?: ElementStyles;
  readonly children?: readonly RenderNode<TMessage>[];
  readonly keyMap?: ElementKeyBindings<TMessage>;
  readonly inputMap?: RenderNodeInputMap<TMessage>;
  readonly pointer?: RenderNodePointerInteraction<TMessage>;
  readonly accessibility?: ElementAccessibility;
}

export type RenderNodeOfKind<
  TMessage,
  TKind extends RenderNodeKind
> = RenderNodeBase<TMessage, TKind> & (
  TKind extends 'custom'
    ? { readonly custom: CustomRenderNodeRuntime<TMessage> }
    : { readonly custom?: never }
);

export type RenderNode<TMessage = unknown> = {
  readonly [TKind in RenderNodeKind]: RenderNodeOfKind<TMessage, TKind>;
}[RenderNodeKind];

export type RenderNodesOfKind<TMessage, TKind extends RenderNodeKind> = {
  readonly [TCurrentKind in TKind]: RenderNodeOfKind<TMessage, TCurrentKind>;
}[TKind];

export type RenderNodeKind =
  | 'text'
  | 'richText'
  | 'column'
  | 'row'
  | 'list'
  | 'table'
  | 'tree'
  | 'paginator'
  | 'textArea'
  | 'form'
  | 'field'
  | 'label'
  | 'button'
  | 'checkbox'
  | 'toggleSwitch'
  | 'slider'
  | 'rangeSlider'
  | 'checkboxGroup'
  | 'colorSwatchPicker'
  | 'calendar'
  | 'radioGroup'
  | 'select'
  | 'textInput'
  | 'numberInput'
  | 'menu'
  | 'menuBar'
  | 'contextMenu'
  | 'dropdownMenu'
  | 'divider'
  | 'tooltip'
  | 'notificationStack'
  | 'canvas'
  | 'surface'
  | 'absolute'
  | 'overlay'
  | 'statusBar'
  | 'helpBar'
  | 'statusIndicator'
  | 'progressBar'
  | 'spinner'
  | 'sparkline'
  | 'barChart'
  | 'chart'
  | 'meter'
  | 'heatmap'
  | 'viewport'
  | 'scrollback'
  | 'structuredBlock'
  | 'activityFeed'
  | 'commandInput'
  | 'palette'
  | 'grid'
  | 'splitPane'
  | 'tabs'
  | 'dialog'
  | 'custom';

export type RenderNodeChildren<TMessage> = readonly RenderNode<TMessage>[] | RenderNode<TMessage>;
export interface RenderNodeInputMap<TMessage> {
  readonly text?: (text: string) => TMessage;
  readonly paste?: (text: string) => TMessage;
}

export interface CustomRenderNodeRuntime<TMessage = unknown> {
  readonly renderer: RenderNodeRenderer<TMessage, 'custom'>;
}
