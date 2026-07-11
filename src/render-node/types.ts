import type { AccessibilityOptions, AccessibleNode } from '../accessibility/index.ts';
import type { RegionOpacity } from '../tui/layout.ts';
import type { TerminalStyle } from '../tui/render-primitives.ts';
import type { RenderNodeRenderer } from '../tui/render-node-renderer.ts';
import type { BindableKeyName } from '../input/index.ts';
import type { InputEvent } from '../input/index.ts';
import type { FocusPath } from '../tui/focus.ts';
import type { RenderNodePropsByKind } from './props/index.ts';
import type { RenderNodeId } from '../internal/identity.ts';

interface RenderNodeBase<TMessage, TKind extends RenderNodeKind> {
  readonly id?: RenderNodeId;
  readonly kind: TKind;
  readonly props: RenderNodePropsByKind<TMessage>[TKind];
  readonly layer?: RenderNodeLayerOptions;
  readonly focus?: RenderNodeFocusOptions;
  readonly styles?: RenderNodeStyles;
  readonly children?: readonly RenderNode<TMessage>[];
  readonly keyMap?: RenderNodeKeyMap<TMessage>;
  readonly inputMap?: RenderNodeInputMap<TMessage>;
  readonly accessibility?: RenderNodeAccessibleDefinition;
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
  | 'stack'
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
  | 'checkboxList'
  | 'colorPicker'
  | 'datePicker'
  | 'radioGroup'
  | 'selectBox'
  | 'textInput'
  | 'numberInput'
  | 'menu'
  | 'menuBar'
  | 'contextMenu'
  | 'dropdown'
  | 'divider'
  | 'tooltip'
  | 'notificationStack'
  | 'canvas'
  | 'surface'
  | 'absolute'
  | 'overlay'
  | 'statusBar'
  | 'helpBar'
  | 'activityIndicator'
  | 'progressBar'
  | 'spinner'
  | 'sparkline'
  | 'barChart'
  | 'chart'
  | 'gauge'
  | 'heatmap'
  | 'viewport'
  | 'scrollback'
  | 'structuredBlock'
  | 'activityFeed'
  | 'commandBar'
  | 'palette'
  | 'grid'
  | 'splitPane'
  | 'tabs'
  | 'modal'
  | 'custom';

export type RenderNodeChildren<TMessage> = readonly RenderNode<TMessage>[] | RenderNode<TMessage>;
export interface RenderNodeKeyEvent {
  readonly input: InputEvent;
  readonly focusPath: FocusPath;
}

export type RenderNodeKeyHandler<TMessage> = (event: RenderNodeKeyEvent) => TMessage | undefined;

export type RenderNodeKeyMap<TMessage> = Readonly<Partial<Record<BindableKeyName, RenderNodeKeyHandler<TMessage>>>> & {
  readonly text?: Readonly<Record<string, RenderNodeKeyHandler<TMessage>>>;
};
export type RenderNodeOverflowPriority = 'required' | 'important' | 'secondary' | 'decorative';

export interface RenderNodeLayerOptions {
  readonly zIndex?: number;
  readonly visible?: boolean;
  readonly opacity?: RegionOpacity;
  readonly overflowPriority?: RenderNodeOverflowPriority;
}

export type RenderNodeVisualState =
  | 'default'
  | 'focused'
  | 'selected'
  | 'disabled'
  | 'active'
  | 'error'
  | 'warning'
  | 'success';

export type RenderNodeTextRole =
  | 'title'
  | 'subtitle'
  | 'heading'
  | 'body'
  | 'caption'
  | 'metadata'
  | 'metric'
  | 'badge'
  | 'danger'
  | 'warning'
  | 'success';

export interface RenderNodeStyles {
  readonly root?: TerminalStyle;
  readonly parts?: Readonly<Record<string, TerminalStyle | undefined>>;
  readonly states?: Readonly<Partial<Record<Exclude<RenderNodeVisualState, 'default'>, TerminalStyle>>>;
}

export type RenderNodeFocusScope = 'none' | 'contain';

export interface RenderNodeFocusOptions {
  readonly disabled?: boolean;
  readonly order?: number;
  readonly scope?: RenderNodeFocusScope;
}

export interface RenderNodeInputMap<TMessage> {
  readonly text?: (text: string) => TMessage;
  readonly paste?: (text: string) => TMessage;
}

export type RenderNodeAccessibleDefinition = AccessibleNode | AccessibilityOptions;

export interface CustomRenderNodeRuntime<TMessage = unknown> {
  readonly renderer: RenderNodeRenderer<TMessage, 'custom'>;
}
