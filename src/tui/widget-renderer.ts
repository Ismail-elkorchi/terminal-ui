import type { AccessibleNode } from '../accessibility/index.ts';
import type { TerminalTheme } from '../theme/index.ts';
import type { Widget } from '../widgets/types.ts';
import type { FrameBuffer } from './frame.ts';
import type { LayoutNode, Rect } from './layout.ts';

export interface WidgetMeasureInput<TMessage = unknown> {
  readonly widget: Widget<TMessage>;
  readonly bounds: Rect;
  readonly theme: TerminalTheme;
}

export interface WidgetMeasureResult {
  readonly minWidth: number;
  readonly minHeight: number;
  readonly preferredWidth: number;
  readonly preferredHeight: number;
  readonly maxWidth?: number;
  readonly maxHeight?: number;
}

export interface WidgetLayoutInput<TMessage = unknown> {
  readonly widget: Widget<TMessage>;
  readonly bounds: Rect;
  readonly theme: TerminalTheme;
  readonly childMeasures: readonly WidgetMeasureResult[];
}

export interface WidgetRenderInput<TMessage = unknown> {
  readonly widget: Widget<TMessage>;
  readonly node: LayoutNode;
  readonly buffer: FrameBuffer;
  readonly theme: TerminalTheme;
  readonly focused: boolean;
  renderChildren(target?: FrameBuffer): void;
}

export interface WidgetAccessibilityInput<TMessage = unknown> {
  readonly widget: Widget<TMessage>;
  readonly node: LayoutNode;
  readonly id: string;
  readonly focused: boolean;
  readonly theme: TerminalTheme;
}

export interface WidgetFocusInput<TMessage = unknown> {
  readonly widget: Widget<TMessage>;
  readonly bounds: Rect;
  readonly theme: TerminalTheme;
}

export interface FocusTarget {
  readonly id: string;
  readonly bounds: Rect;
  readonly cursor?: {
    readonly row: number;
    readonly column: number;
  };
  readonly disabled?: boolean;
  readonly order?: number;
  readonly scopeId?: string;
}

export interface WidgetHitInput<TMessage = unknown> {
  readonly widget: Widget<TMessage>;
  readonly bounds: Rect;
  readonly theme: TerminalTheme;
}

export interface HitTarget<TMessage = unknown> {
  readonly id: string;
  readonly bounds: Rect;
  readonly message: TMessage;
  readonly cursor?: 'pointer' | 'text' | 'default';
  readonly zIndex?: number;
}

export interface WidgetRenderer<TMessage = unknown> {
  measure?(input: WidgetMeasureInput<TMessage>): WidgetMeasureResult;
  layout?(input: WidgetLayoutInput<TMessage>): readonly Rect[];
  render(input: WidgetRenderInput<TMessage>): void;
  accessibility?(input: WidgetAccessibilityInput<TMessage>): AccessibleNode;
  focusTargets?(input: WidgetFocusInput<TMessage>): readonly FocusTarget[];
  hitTargets?(input: WidgetHitInput<TMessage>): readonly HitTarget<TMessage>[];
}
