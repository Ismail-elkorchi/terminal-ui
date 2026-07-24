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
  renderNode: InputControlNode,
  bounds: Rect,
  focused: boolean,
  theme: TerminalTheme,
  widthProfile: TextWidthProfile
): RenderBlock {
  const placeholder = clean(stringify(renderNode.props.placeholder));
  const cursor = renderNode.kind === 'numberInput' ? renderNode.props.presentation.cursor : numberProp(renderNode, 'cursor');
  const selection = selectionFromUnknown(
    value,
    renderNode.kind === 'numberInput' ? renderNode.props.presentation.selection : renderNode.props.selection
  );
  const rows = [
    ...singleLineInputBlock({
      renderNode,
      bounds,
      theme,
      widthProfile,
      value,
      placeholder,
      focused,
      ...(cursor === undefined ? {} : { cursor }),
      ...(selection === undefined ? {} : { selection })
    }).lines,
    ...errorLines(renderNode, bounds.width, widthProfile)
  ];
  return block(rows.slice(0, Math.max(0, bounds.height)));
}

export function inputAccessibleBase(
  renderNode: InputControlNode,
  id: string,
  focused: boolean,
  value: string
): AccessibleNode {
  const description = fieldDescription(renderNode);
  return {
    id,
    role: 'textbox',
    label: id,
    value,
    ...(description.length === 0 ? {} : { description }),
    ...(renderNode.props.disabled === true ? { disabled: true } : {}),
    ...(focused ? { focused } : {})
  };
}

export function fieldHeaderLines(renderNode: FieldNode): readonly (readonly RenderSpan[])[] {
  const rows: (readonly RenderSpan[])[] = [];
  const label = clean(stringify(renderNode.props.label));
  if (label.length > 0 || renderNode.props.required === true) {
    rows.push(labelSpans(
      renderNode,
      'field.label',
      label,
      renderNode.props.disabled === true ? 'disabled' : undefined,
      renderNode.props.required === true
    ));
  }
  const description = clean(stringify(renderNode.props.description));
  if (description.length > 0) {
    rows.push([formSpan(renderNode, 'description', 'field.description', description, formValueStyle(renderNode, 'disabled'))]);
  }
  const error = clean(stringify(renderNode.props.error));
  if (error.length > 0) {
    rows.push([formSpan(renderNode, 'error', 'validation.error', error, formErrorStyle(renderNode))]);
  }
  return rows;
}

export function errorLines(
  renderNode: ErrorControlNode,
  width: number,
  widthProfile: TextWidthProfile
): readonly RenderLine[] {
  const error = clean(stringify(renderNode.props.error));
  return error.length === 0
    ? []
    : [clippedFormLine(
        [formSpan(renderNode, 'error', 'validation.error', error, formErrorStyle(renderNode))],
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

export function fieldDescription(renderNode: DescribedControlNode): string {
  const description = 'description' in renderNode.props ? renderNode.props.description : undefined;
  const required = 'required' in renderNode.props && renderNode.props.required;
  return [
    clean(stringify(description)),
    required ? 'Required.' : '',
    clean(stringify(renderNode.props.error))
  ].filter((part) => part.length > 0).join(' ');
}

export function formTitle(renderNode: FormNode): string {
  return clean(stringify(renderNode.props.title));
}

export function labelText(renderNode: LabelNode): string {
  return labelWithRequired(clean(stringify(renderNode.props.text)), renderNode.props.required === true);
}

export function labelWithRequired(label: string, required: boolean): string {
  if (label.length === 0) return required ? 'Required' : '';
  return required ? `${label} *` : label;
}

export function inputValue(renderNode: TextInputNode): string {
  return clean(stringify(renderNode.props.value));
}

export function numberInputValue(renderNode: NumberInputNode): string {
  return clean(stringify(renderNode.props.presentation.value));
}

export function singleLineCursor(
  renderNode: InputControlNode,
  value: string,
  cursor: number | undefined,
  bounds: Rect,
  theme: TerminalTheme,
  widthProfile: TextWidthProfile
): CursorPosition {
  return singleLineInputCursor({
    renderNode,
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
