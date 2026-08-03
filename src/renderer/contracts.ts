import type { AccessibleSnapshot } from '../accessibility/index.ts';
import type {
  ElementFocusScope,
  ElementVisualState,
  LayerUnderlay
} from '../element/metadata.ts';
import type { Rect } from '../geometry/types.ts';
import type { PointerEventKind, RoutedPointerEvent } from '../input/index.ts';
import type {
  FocusPath,
  MessageResolution,
  PointerFocusIntent,
  ResolvedPointerFocusIntent
} from '../interaction/index.ts';
import type { TextWidthProfile } from '../text/index.ts';
import type { TerminalTheme } from '../theme/index.ts';
import type {
  FrameCellSource,
  RenderNodeFrameSourceOptions,
  RenderBlock,
  RenderLine,
  RenderSpan,
  TerminalLink,
  TerminalStyle
} from '../visual/index.ts';

export interface Measurement {
  readonly minWidth: number;
  readonly minHeight: number;
  readonly preferredWidth: number;
  readonly preferredHeight: number;
  readonly maxWidth?: number;
  readonly maxHeight?: number;
}

export interface MeasurementInput {
  readonly minWidth?: number;
  readonly minHeight?: number;
  readonly preferredWidth: number;
  readonly preferredHeight: number;
  readonly maxWidth?: number;
  readonly maxHeight?: number;
}

export interface CursorPosition {
  readonly row: number;
  readonly column: number;
  readonly style?: TerminalStyle;
  readonly source?: FrameCellSource;
}

export interface RenderTargetCell {
  readonly row: number;
  readonly column: number;
  readonly text: string;
  readonly width: number;
  readonly style?: TerminalStyle;
  readonly link?: TerminalLink;
  readonly source?: FrameCellSource;
  readonly continuation?: boolean;
}

export interface RenderTarget {
  readonly width: number;
  readonly height: number;
  readonly widthProfile: TextWidthProfile;
  write(row: number, column: number, spans: readonly RenderSpan[]): void;
  writeLine(row: number, column: number, line: RenderLine): void;
  writeBlock(row: number, column: number, block: RenderBlock): void;
  writeCell(cell: RenderTargetCell): void;
  clear(rect?: Rect): void;
}

export interface RenderStyleInput<TPart extends string> {
  readonly part: 'root' | TPart;
  readonly state?: ElementVisualState;
  readonly base?: TerminalStyle;
}

export type RenderSourceInput = Omit<
  RenderNodeFrameSourceOptions,
  'rendererFamily'
>;

export interface CanvasPoint {
  readonly x: number;
  readonly y: number;
}

export interface CanvasTransform {
  readonly translateX: number;
  readonly translateY: number;
  readonly scaleX: number;
  readonly scaleY: number;
}

export interface CanvasTransformInput {
  readonly translateX?: number;
  readonly translateY?: number;
  readonly scaleX?: number;
  readonly scaleY?: number;
}

export interface StrokeFillOptions {
  readonly stroke?: RenderSpan;
  readonly fill?: RenderSpan;
}

export interface Canvas2D {
  readonly bounds: Rect;
  readonly widthProfile: TextWidthProfile;
  point(x: number, y: number, span: RenderSpan): void;
  line(x1: number, y1: number, x2: number, y2: number, span: RenderSpan): void;
  polyline(points: readonly CanvasPoint[], span: RenderSpan): void;
  rect(
    bounds: CanvasPoint & { readonly width: number; readonly height: number },
    options: StrokeFillOptions
  ): void;
  circle(center: CanvasPoint, radius: number, options: StrokeFillOptions): void;
  ellipse(center: CanvasPoint, radiusX: number, radiusY: number, options: StrokeFillOptions): void;
  arc(center: CanvasPoint, radius: number, startAngle: number, endAngle: number, options: StrokeFillOptions): void;
  fillPolygon(points: readonly CanvasPoint[], span: RenderSpan): void;
  text(x: number, y: number, spans: readonly RenderSpan[]): void;
  brailleSubcell(columnSubcell: number, rowSubcell: number, style?: TerminalStyle): void;
  clear(bounds?: CanvasPoint & { readonly width: number; readonly height: number }): void;
  translate(dx: number, dy: number): void;
  scale(x: number, y: number): void;
  withTransform(transform: CanvasTransformInput, draw: (canvas: Canvas2D) => void): void;
}

export interface CanvasPainterInput {
  readonly canvas: Canvas2D;
  readonly bounds: Rect;
  readonly theme: TerminalTheme;
  readonly style: (input: RenderStyleInput<'content'>) => TerminalStyle | undefined;
  readonly source: (input?: RenderSourceInput) => FrameCellSource;
}

export type CanvasPainter = (input: CanvasPainterInput) => void;

export type RenderNodeKind =
  | 'text'
  | 'richText'
  | 'disclosure'
  | 'column'
  | 'row'
  | 'flow'
  | 'anchored'
  | 'measuredColumn'
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
  | 'passwordInput'
  | 'numberInput'
  | 'menu'
  | 'menuBar'
  | 'contextMenu'
  | 'dropdownMenu'
  | 'divider'
  | 'tooltip'
  | 'notificationRegion'
  | 'notificationHistory'
  | 'canvas'
  | 'surface'
  | 'absolute'
  | 'overlay'
  | 'statusBar'
  | 'helpBar'
  | 'activityIndicator'
  | 'progressBar'
  | 'sparkline'
  | 'barChart'
  | 'chart'
  | 'meter'
  | 'heatmap'
  | 'viewport'
  | 'logViewer'
  | 'commandInput'
  | 'searchPicker'
  | 'grid'
  | 'splitPane'
  | 'tabs'
  | 'dialog'
  | 'component';

export interface Layer {
  readonly id: string;
  readonly zIndex: number;
  readonly bounds: Rect;
  readonly underlay: LayerUnderlay;
}

export interface LayoutFocusRegion {
  readonly id: string;
  readonly bounds: Rect;
  readonly cursor?: CursorPosition;
  readonly disabled: boolean;
  readonly order?: number;
  readonly scopeId?: string;
}

export interface LayoutNode {
  readonly id?: string;
  readonly identity: string;
  readonly factoryName: string;
  readonly bounds: Rect;
  readonly viewport: Rect;
  readonly layer: Layer;
  readonly visible: boolean;
  readonly inert: boolean;
  readonly focusable: boolean;
  readonly focusScope?: ElementFocusScope;
  readonly focusTargets: readonly LayoutFocusRegion[];
  readonly children: readonly LayoutNode[];
}

export type RenderWorkKind =
  | 'normalized_records'
  | 'query_candidates'
  | 'render_nodes'
  | 'measured_nodes'
  | 'rendered_nodes'
  | 'composed_cells'
  | 'snapshot_rows'
  | 'snapshot_cells'
  | 'emitted_cells'
  | 'hit_target_candidates'
  | 'diff_rows'
  | 'diff_cells'
  | 'diff_operations'
  | 'encoded_bytes';

export interface RenderWorkMeasurement {
  readonly kind: RenderWorkKind;
  readonly count: number;
}

export interface RenderWorkInstrumentation {
  recordWork(measurement: RenderWorkMeasurement): void;
}

export type RenderStage =
  | 'resolve_element'
  | 'layout'
  | 'focus'
  | 'regions'
  | 'composition'
  | 'frame_passes'
  | 'cursor'
  | 'hit_targets'
  | 'accessibility'
  | 'snapshot';

export interface RenderStageMeasurement {
  readonly stage: RenderStage;
  readonly durationMs: number;
}

export interface RenderInstrumentation {
  readonly now: () => number;
  record(measurement: RenderStageMeasurement): void;
  readonly recordWork?: RenderWorkInstrumentation['recordWork'];
}

export type RenderFocusRelation = 'none' | 'self' | 'descendant';

export interface FocusTarget {
  readonly id: string;
  readonly bounds: Rect;
  readonly cursor?: CursorPosition;
  readonly disabled?: boolean;
  readonly order?: number;
  readonly scopeId?: string;
}

export interface HitTarget<TMessage = unknown> {
  readonly id: string;
  readonly bounds: Rect;
  readonly accepts?: readonly PointerEventKind[];
  readonly focus?: PointerFocusIntent;
  message(event: RoutedPointerEvent): MessageResolution<TMessage>;
  readonly cursor?: 'pointer' | 'text' | 'default';
  readonly zIndex?: number;
}

export interface Frame {
  readonly width: number;
  readonly height: number;
  readonly widthProfile: TextWidthProfile;
  readonly cells: readonly FrameCell[];
  readonly hitTargets?: readonly FrameHitTarget[];
  readonly cursor?: CursorPosition;
  readonly focusPath?: FocusPath;
  readonly accessibility: AccessibleSnapshot;
}

export interface FrameCell {
  readonly row: number;
  readonly column: number;
  readonly text: string;
  readonly width: number;
  readonly style?: TerminalStyle;
  readonly link?: TerminalLink;
  readonly source?: FrameCellSource;
  readonly continuation?: boolean;
}

export interface FrameHitTarget {
  readonly id: string;
  readonly bounds: Rect;
  readonly accepts?: readonly PointerEventKind[];
  readonly focus?: ResolvedPointerFocusIntent;
  readonly cursor?: 'pointer' | 'text' | 'default';
  readonly zIndex?: number;
}

export interface RenderDiff {
  readonly width: number;
  readonly height: number;
  readonly widthProfile: TextWidthProfile;
  readonly operations: readonly RenderOperation[];
  readonly cursor?: CursorPosition;
  readonly fullRewrite: boolean;
  readonly dirtyRegions?: readonly Rect[];
}

export interface FrameRowDiff {
  readonly row: number;
  readonly operations: readonly RenderOperation[];
}

export type RenderOperation =
  | { readonly kind: 'write'; readonly row: number; readonly column: number; readonly spans: readonly RenderSpan[] }
  | { readonly kind: 'clearRect'; readonly bounds: Rect };

export type { Rect } from '../geometry/types.ts';
