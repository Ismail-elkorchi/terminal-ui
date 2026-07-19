import type { AccessibleNode } from '../../../../accessibility/index.ts';
import type { RenderNodeOfKind, RenderNodesOfKind } from '../../../model/index.ts';
import { clipTextCells, sanitizeTerminalText } from '../../../../text/index.ts';
import type { TerminalTheme } from '../../../../theme/index.ts';
import type { TextWidthProfile } from '../../../../text/index.ts';
import type { CursorPosition } from '../../../model/cursor.ts';
import { block, clipRenderSpans } from '../../frame.ts';
import type { RenderBlock, RenderLine, RenderSpan } from '../../frame.ts';
import {
  formErrorStyle,
  formLine,
  formSpan,
  formValueStyle,
  labelSpans
} from '../../form-visual.ts';
import { singleLineInputBlock, singleLineInputCursor } from '../../input-visual.ts';
import type { Rect } from '../../../model/layout.ts';
import { numberProp, stringify } from '../../render-node-props.ts';
import { selectionFromUnknown } from '../../text-display.ts';

type FormNode = RenderNodeOfKind<unknown, 'form'>;
type FieldNode = RenderNodeOfKind<unknown, 'field'>;
type LabelNode = RenderNodeOfKind<unknown, 'label'>;
type TextInputNode = RenderNodeOfKind<unknown, 'textInput'>;
type NumberInputNode = RenderNodeOfKind<unknown, 'numberInput'>;
type InputControlNode = TextInputNode | NumberInputNode;
type ErrorControlNode = RenderNodesOfKind<
  unknown,
  | 'checkbox'
  | 'checkboxGroup'
  | 'colorSwatchPicker'
  | 'calendar'
  | 'field'
  | 'numberInput'
  | 'radioGroup'
  | 'rangeSlider'
  | 'select'
  | 'slider'
  | 'textInput'
  | 'toggleSwitch'
>;
type DescribedControlNode = RenderNodesOfKind<
  unknown,
  'checkbox' | 'field' | 'numberInput' | 'radioGroup' | 'select' | 'textInput'
>;

export function controlInputBlock(
  value: string,
  widget: InputControlNode,
  bounds: Rect,
  focused: boolean,
  theme: TerminalTheme,
  widthProfile: TextWidthProfile
): RenderBlock {
  const placeholder = clean(stringify(widget.props.placeholder));
  const cursor = widget.kind === 'numberInput' ? widget.props.presentation.cursor : numberProp(widget, 'cursor');
  const selection = selectionFromUnknown(
    value,
    widget.kind === 'numberInput' ? widget.props.presentation.selection : widget.props.selection
  );
  const rows = [
    ...singleLineInputBlock({
      widget,
      bounds,
      theme,
      widthProfile,
      value,
      placeholder,
      focused,
      ...(cursor === undefined ? {} : { cursor }),
      ...(selection === undefined ? {} : { selection })
    }).lines,
    ...errorLines(widget, bounds.width, widthProfile)
  ];
  return block(rows.slice(0, Math.max(0, bounds.height)));
}

export function inputAccessibleBase(
  widget: InputControlNode,
  id: string,
  focused: boolean,
  value: string
): AccessibleNode {
  const description = fieldDescription(widget);
  return {
    id,
    role: 'textbox',
    label: id,
    value,
    ...(description.length === 0 ? {} : { description }),
    ...(widget.props.disabled === true ? { disabled: true } : {}),
    ...(focused ? { focused } : {})
  };
}

export function fieldHeaderLines(widget: FieldNode): readonly (readonly RenderSpan[])[] {
  const rows: (readonly RenderSpan[])[] = [];
  const label = clean(stringify(widget.props.label));
  if (label.length > 0 || widget.props.required === true) {
    rows.push(labelSpans(
      widget,
      'field.label',
      label,
      widget.props.disabled === true ? 'disabled' : undefined,
      widget.props.required === true
    ));
  }
  const description = clean(stringify(widget.props.description));
  if (description.length > 0) {
    rows.push([formSpan(widget, 'description', 'field.description', description, formValueStyle(widget, 'disabled'))]);
  }
  const error = clean(stringify(widget.props.error));
  if (error.length > 0) {
    rows.push([formSpan(widget, 'error', 'validation.error', error, formErrorStyle(widget))]);
  }
  return rows;
}

export function errorLines(
  widget: ErrorControlNode,
  width: number,
  widthProfile: TextWidthProfile
): readonly RenderLine[] {
  const error = clean(stringify(widget.props.error));
  return error.length === 0
    ? []
    : [clippedFormLine(
        [formSpan(widget, 'error', 'validation.error', error, formErrorStyle(widget))],
        width,
        widthProfile
      )];
}

export function clippedFormLine(
  spans: readonly RenderSpan[],
  width: number,
  widthProfile: TextWidthProfile
): RenderLine {
  return formLine(clipRenderSpans(spans, Math.max(0, width), { widthProfile }));
}

export function fieldDescription(widget: DescribedControlNode): string {
  const description = 'description' in widget.props ? widget.props.description : undefined;
  const required = 'required' in widget.props && widget.props.required;
  return [
    clean(stringify(description)),
    required ? 'Required.' : '',
    clean(stringify(widget.props.error))
  ].filter((part) => part.length > 0).join(' ');
}

export function formTitle(widget: FormNode): string {
  return clean(stringify(widget.props.title));
}

export function labelText(widget: LabelNode): string {
  return labelWithRequired(clean(stringify(widget.props.text)), widget.props.required === true);
}

export function labelWithRequired(label: string, required: boolean): string {
  if (label.length === 0) return required ? 'Required' : '';
  return required ? `${label} *` : label;
}

export function inputValue(widget: TextInputNode): string {
  return clean(stringify(widget.props.value));
}

export function numberInputValue(widget: NumberInputNode): string {
  return clean(stringify(widget.props.presentation.value));
}

export function singleLineCursor(
  widget: InputControlNode,
  value: string,
  cursor: number | undefined,
  bounds: Rect,
  theme: TerminalTheme,
  widthProfile: TextWidthProfile
): CursorPosition {
  return singleLineInputCursor({
    widget,
    bounds,
    theme,
    widthProfile,
    value,
    focused: true,
    ...(cursor === undefined ? {} : { cursor })
  });
}

export function clip(value: string, width: number, widthProfile: TextWidthProfile): string {
  return clipTextCells(value, Math.max(0, width), { ellipsis: '…', widthProfile }).text;
}

export function clipNoEllipsis(value: string, width: number, widthProfile: TextWidthProfile): string {
  return clipTextCells(value, Math.max(0, width), { ellipsis: '', widthProfile }).text;
}

export function clean(value: string): string {
  return sanitizeTerminalText(value).text.replace(/\s*\n\s*/gu, ' ');
}

export function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function finiteNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

export function clampNumber(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/0+$/u, '').replace(/\.$/u, '');
}

export function labelPrefix(label: string): string {
  return label.length === 0 ? '' : `${label}: `;
}
