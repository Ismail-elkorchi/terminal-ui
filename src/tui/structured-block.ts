import { sanitizeTerminalText, wrapTextCells } from '../text/index.ts';
import { numberProp, stringify } from './widget-props.ts';
import { visibleWindow } from './visible-window.ts';
import type { AccessibleNode } from '../accessibility/index.ts';
import type { TerminalTheme } from '../theme/index.ts';
import type { StructuredBlock, StructuredBlockField, StructuredBlockStatus, Widget } from '../widgets/index.ts';
import type { LayoutNode } from './layout.ts';
import type { RenderBlock, RenderLine, RenderSpan, TerminalStyle } from './render-primitives.ts';

export function structuredBlockText(widget: Widget, node: LayoutNode, theme: TerminalTheme): string {
  return renderBlockText(structuredBlockBlock(widget, node, theme));
}

export function structuredBlockBlock(widget: Widget, node: LayoutNode, theme: TerminalTheme): RenderBlock {
  return {
    lines: structuredBlockLines(blockFromWidget(widget), theme, node.bounds.width)
  };
}

export function structuredBlockAccessibleBase(widget: Widget, id: string): AccessibleNode {
  const block = blockFromWidget(widget);
  const children = structuredBlockAccessibleChildren(block, id);
  return {
    id,
    role: 'text',
    label: block.title,
    value: block.summary ?? block.title,
    description: structuredBlockDescription(block),
    ...(children.length === 0 ? {} : { children })
  };
}

export function activityFeedText(widget: Widget, node: LayoutNode, theme: TerminalTheme): string {
  return renderBlockText(activityFeedBlock(widget, node, theme));
}

export function activityFeedBlock(widget: Widget, node: LayoutNode, theme: TerminalTheme): RenderBlock {
  return {
    lines: activityFeedRows(widget, node, theme)
  };
}

export function activityFeedAccessibleBase(widget: Widget, node: LayoutNode, id: string, focused: boolean): AccessibleNode {
  const blocks = activityFeedBlocks(widget);
  const selected = selectedBlockIndex(widget, blocks.length);
  const window = visibleWindow(blocks.length, Math.max(1, node.bounds.height), selected ?? 0);
  return {
    id,
    role: 'listbox',
    label: id,
    description: blocks.length === 0
      ? 'Showing 0 activity blocks.'
      : `Showing ${String(window.start + 1)}-${String(window.end)} of ${String(blocks.length)} activity blocks.`,
    ...(focused ? { focused } : {})
  };
}

export function activityFeedAccessibleChildren(widget: Widget, node: LayoutNode): readonly AccessibleNode[] {
  const blocks = visibleActivityBlocks(widget, node);
  const selected = selectedBlockIndex(widget, activityFeedBlocks(widget).length);
  return blocks.map(({ block, index }) => ({
    id: `${widget.id ?? 'activityFeed'}:block:${block.id}`,
    role: 'option',
    label: block.title,
    value: block.summary ?? block.title,
    selected: selected === index,
    description: structuredBlockDescription(block)
  }));
}

function activityFeedRows(widget: Widget, node: LayoutNode, theme: TerminalTheme): readonly RenderLine[] {
  const selected = selectedBlockIndex(widget, activityFeedBlocks(widget).length);
  const rows: RenderLine[] = [];
  for (const { block, index } of visibleActivityBlocks(widget, node)) {
    const selectedRow = selected === index;
    const marker = selectedRow ? `${theme.symbols.pointer} ` : '  ';
    const lines = structuredBlockLines(block, theme, Math.max(0, node.bounds.width - marker.length));
    for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
      if (rows.length >= node.bounds.height) return rows;
      const prefix = lineIndex === 0 ? marker : '  ';
      rows.push({
        spans: [
          { text: prefix, ...(selectedRow ? { style: selectedPrefixStyle() } : {}) },
          ...(lines[lineIndex]?.spans ?? [])
        ]
      });
    }
  }
  return rows;
}

function visibleActivityBlocks(
  widget: Widget,
  node: LayoutNode
): readonly { readonly block: StructuredBlock; readonly index: number }[] {
  const blocks = activityFeedBlocks(widget);
  const selected = selectedBlockIndex(widget, blocks.length) ?? 0;
  const window = visibleWindow(blocks.length, Math.max(1, node.bounds.height), selected);
  return blocks.slice(window.start, window.end).map((block, offset) => ({
    block,
    index: window.start + offset
  }));
}

function structuredBlockLines(block: StructuredBlock, theme: TerminalTheme, width: number): readonly RenderLine[] {
  const collapsed = block.collapsed === true;
  const fieldLabelWidth = maxFieldLabelWidth(block.fields ?? []);
  const lines: RenderLine[] = [headerLine(block, theme, collapsed)];
  if (block.summary !== undefined && block.summary.length > 0) {
    lines.push(...wrappedTextLines(block.summary, width, block.style));
  }
  for (const field of block.fields ?? []) {
    lines.push(fieldLine(field, fieldLabelWidth));
  }
  if (!collapsed && block.body !== undefined && block.body.length > 0) {
    lines.push(...wrappedTextLines(block.body, width, block.style));
  }
  if (!collapsed && block.details !== undefined && block.details.length > 0) {
    const detailLines = block.details.split('\n');
    for (let index = 0; index < detailLines.length; index += 1) {
      lines.push(...wrappedTextLines(index === 0 ? `Details: ${detailLines[index] ?? ''}` : detailLines[index] ?? '', width, block.style));
    }
  }
  return lines;
}

function structuredBlockDescription(block: StructuredBlock): string {
  const parts = [
    block.status === undefined ? undefined : `status ${block.status}`,
    block.collapsed === true ? 'collapsed' : 'expanded',
    block.fields === undefined ? undefined : `${String(block.fields.length)} fields`
  ].filter((part): part is string => part !== undefined);
  return parts.join(', ');
}

function structuredBlockAccessibleChildren(block: StructuredBlock, id: string): readonly AccessibleNode[] {
  const children: AccessibleNode[] = [];
  if (block.status !== undefined) {
    children.push({
      id: `${id}:status`,
      role: 'status',
      label: 'status',
      value: block.status
    });
  }
  if (block.summary !== undefined && block.summary.length > 0) {
    children.push({
      id: `${id}:summary`,
      role: 'text',
      label: 'summary',
      value: block.summary
    });
  }
  for (const field of block.fields ?? []) {
    children.push({
      id: `${id}:field:${field.label}`,
      role: 'text',
      label: field.label,
      value: field.value
    });
  }
  return children;
}

function blockFromWidget(widget: Widget): StructuredBlock {
  const title = stringify(widget.props['title']);
  return {
    id: widget.id ?? 'structured-block',
    title: title.length === 0 ? widget.id ?? 'Block' : title,
    ...optionalString('summary', widget.props['summary']),
    ...optionalStyle(widget.props['style']),
    ...optionalStatus(widget.props['status']),
    ...optionalFields(widget.props['fields']),
    ...optionalString('body', widget.props['body']),
    ...optionalString('details', widget.props['details']),
    ...(widget.props['collapsed'] === true ? { collapsed: true } : {})
  };
}

function activityFeedBlocks(widget: Widget): readonly StructuredBlock[] {
  return Array.isArray(widget.props['blocks'])
    ? widget.props['blocks'].filter(isStructuredBlock).map(sanitizeBlock)
    : [];
}

function selectedBlockIndex(widget: Widget, length: number): number | undefined {
  const selected = numberProp(widget, 'selected');
  if (selected === undefined || length <= 0) return undefined;
  return Math.max(0, Math.min(length - 1, Math.floor(selected)));
}

function sanitizeBlock(block: StructuredBlock): StructuredBlock {
  return {
    id: cleanLine(block.id),
    title: cleanLine(block.title),
    ...(block.summary === undefined ? {} : { summary: cleanLine(block.summary) }),
    ...(block.style === undefined ? {} : { style: block.style }),
    ...(block.status === undefined ? {} : { status: block.status }),
    ...(block.fields === undefined ? {} : { fields: block.fields.map(sanitizeField) }),
    ...(block.body === undefined ? {} : { body: cleanText(block.body) }),
    ...(block.details === undefined ? {} : { details: cleanText(block.details) }),
    ...(block.collapsed === undefined ? {} : { collapsed: block.collapsed })
  };
}

function sanitizeField(field: StructuredBlockField): StructuredBlockField {
  return {
    label: cleanLine(field.label),
    value: cleanLine(field.value)
  };
}

function isStructuredBlock(value: unknown): value is StructuredBlock {
  return typeof value === 'object'
    && value !== null
    && 'id' in value
    && 'title' in value
    && typeof value.id === 'string'
    && typeof value.title === 'string';
}

function optionalString<TKey extends 'summary' | 'body' | 'details'>(
  key: TKey,
  value: unknown
): Pick<StructuredBlock, TKey> | Record<string, never> {
  return typeof value === 'string' && value.length > 0
    ? { [key]: cleanText(value) } as Pick<StructuredBlock, TKey>
    : {};
}

function optionalStyle(value: unknown): Pick<StructuredBlock, 'style'> | Record<string, never> {
  return isTerminalStyle(value) ? { style: value } : {};
}

function optionalStatus(value: unknown): Pick<StructuredBlock, 'status'> | Record<string, never> {
  return isStatus(value) ? { status: value } : {};
}

function optionalFields(value: unknown): Pick<StructuredBlock, 'fields'> | Record<string, never> {
  if (!Array.isArray(value)) return {};
  const fields = value.filter(isField).map(sanitizeField);
  return fields.length === 0 ? {} : { fields };
}

function isField(value: unknown): value is StructuredBlockField {
  return typeof value === 'object'
    && value !== null
    && 'label' in value
    && 'value' in value
    && typeof value.label === 'string'
    && typeof value.value === 'string';
}

function isStatus(value: unknown): value is StructuredBlockStatus {
  return value === 'pending'
    || value === 'running'
    || value === 'success'
    || value === 'warning'
    || value === 'error'
    || value === 'failed'
    || value === 'cancelled'
    || value === 'skipped'
    || value === 'info';
}

function isTerminalStyle(value: unknown): value is TerminalStyle {
  if (!isRecord(value)) return false;
  const style = value;
  return optionalBoolean(style['bold'])
    && optionalBoolean(style['dim'])
    && optionalBoolean(style['italic'])
    && optionalBoolean(style['underline'])
    && optionalBoolean(style['strikethrough'])
    && optionalBoolean(style['inverse'])
    && optionalBoolean(style['hidden']);
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null;
}

function optionalBoolean(value: unknown): boolean {
  return value === undefined || typeof value === 'boolean';
}

function headerLine(block: StructuredBlock, theme: TerminalTheme, collapsed: boolean): RenderLine {
  const spans: RenderSpan[] = [{ text: collapsed ? theme.symbols.collapsed : theme.symbols.expanded }];
  if (block.status !== undefined) {
    spans.push({ text: ' ' }, { text: `[${block.status}]`, style: statusStyle(block.status) });
  }
  spans.push({ text: ' ' }, { text: block.title, ...(block.style === undefined ? {} : { style: block.style }) });
  return { spans };
}

function fieldLine(field: StructuredBlockField, labelWidth: number): RenderLine {
  return {
    spans: [
      { text: field.label.padEnd(labelWidth), style: { fg: { kind: 'theme', token: 'text.muted' } } },
      { text: ': ', style: { fg: { kind: 'theme', token: 'text.muted' } } },
      { text: field.value }
    ]
  };
}

function wrappedTextLines(text: string, width: number, style: TerminalStyle | undefined): readonly RenderLine[] {
  return text.split('\n').flatMap((line): RenderLine[] => {
    const wrapped = width > 0 ? wrapTextCells(line, width).map((item) => item.text) : [line];
    return wrapped.map((textLine) => ({
      spans: [{ text: textLine, ...(style === undefined ? {} : { style }) }]
    }));
  });
}

function maxFieldLabelWidth(fields: readonly StructuredBlockField[]): number {
  return fields.reduce((width, field) => Math.max(width, field.label.length), 0);
}

function statusStyle(status: StructuredBlockStatus): TerminalStyle {
  return { fg: { kind: 'theme', token: statusToken(status) }, bold: true };
}

function selectedPrefixStyle(): TerminalStyle {
  return {
    fg: { kind: 'theme', token: 'selection.foreground' },
    bg: { kind: 'theme', token: 'selection.background' },
    bold: true
  };
}

function statusToken(status: StructuredBlockStatus): string {
  if (status === 'pending') return 'status.pending';
  if (status === 'running') return 'status.running';
  if (status === 'success') return 'status.success';
  if (status === 'warning' || status === 'skipped' || status === 'cancelled') return 'status.warning';
  if (status === 'error' || status === 'failed') return 'status.error';
  return 'status.info';
}

function renderBlockText(block: RenderBlock): string {
  return block.lines.map((line) => line.spans.map((span) => span.text).join('')).join('\n');
}

function cleanLine(value: string): string {
  return cleanText(value).replace(/\s*\n\s*/gu, ' ');
}

function cleanText(value: string): string {
  return sanitizeTerminalText(value).text;
}
