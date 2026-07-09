import type { AccessibilityOptions, AccessibleNode } from '../accessibility/index.ts';
import type { RegionOpacity } from '../tui/layout.ts';
import type { TerminalStyle } from '../tui/render-primitives.ts';
import type { RenderNodeRenderer } from '../tui/render-node-renderer.ts';

export interface RenderNode<TMessage = unknown> {
  readonly id?: string;
  readonly kind: RenderNodeKind;
  readonly props: RenderNodeProps;
  readonly layer?: RenderNodeLayerOptions;
  readonly focus?: RenderNodeFocusOptions;
  readonly styles?: RenderNodeStyleSlots;
  readonly children?: readonly RenderNode<TMessage>[];
  readonly keyMap?: RenderNodeKeyMap<TMessage>;
  readonly inputMap?: RenderNodeInputMap<TMessage>;
  readonly accessibility?: RenderNodeAccessibleDefinition;
  readonly custom?: CustomRenderNodeRuntime<TMessage>;
}

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

export type RenderNodeProps = Record<string, unknown>;
export type RenderNodeChildren<TMessage> = readonly RenderNode<TMessage>[] | RenderNode<TMessage>;
export type RenderNodeKeyMap<TMessage> = Record<string, TMessage>;
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

export interface RenderNodeStyleSlots {
  readonly root?: TerminalStyle;
  readonly border?: TerminalStyle;
  readonly title?: TerminalStyle;
  readonly label?: TerminalStyle;
  readonly value?: TerminalStyle;
  readonly placeholder?: TerminalStyle;
  readonly selected?: TerminalStyle;
  readonly focused?: TerminalStyle;
  readonly disabled?: TerminalStyle;
  readonly error?: TerminalStyle;
  readonly warning?: TerminalStyle;
  readonly success?: TerminalStyle;
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
  readonly renderer: RenderNodeRenderer<TMessage>;
  readonly state?: unknown;
}
