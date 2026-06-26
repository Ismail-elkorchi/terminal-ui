import { sanitizeTerminalText } from '../text/index.ts';
import { numberProp, stringify } from './widget-props.ts';
import { visibleWindow } from './visible-window.ts';
import type { AccessibleNode } from '../accessibility/index.ts';
import type { StructuredBlock, StructuredBlockField, StructuredBlockStatus, Widget } from '../widgets/index.ts';
import type { LayoutNode } from './layout.ts';

export function structuredBlockText(widget: Widget): string {
  return structuredBlockLines(blockFromWidget(widget)).join('\n');
}

export function structuredBlockAccessibleBase(widget: Widget, id: string): AccessibleNode {
  const block = blockFromWidget(widget);
  return {
    id,
    role: 'text',
    label: block.title,
    value: block.summary ?? block.title,
    description: structuredBlockDescription(block)
  };
}

export function activityFeedText(widget: Widget, node: LayoutNode): string {
  return activityFeedRows(widget, node).map((row) => row.text).join('\n');
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

function activityFeedRows(widget: Widget, node: LayoutNode): readonly { readonly text: string }[] {
  const selected = selectedBlockIndex(widget, activityFeedBlocks(widget).length);
  const rows: { readonly text: string }[] = [];
  for (const { block, index } of visibleActivityBlocks(widget, node)) {
    const marker = selected === index ? '> ' : '  ';
    const lines = structuredBlockLines(block);
    for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
      if (rows.length >= node.bounds.height) return rows;
      const prefix = lineIndex === 0 ? marker : '  ';
      rows.push({ text: `${prefix}${lines[lineIndex] ?? ''}` });
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

function structuredBlockLines(block: StructuredBlock): readonly string[] {
  const collapsed = block.collapsed === true;
  const lines = [`${collapsed ? '[+]' : '[-]'}${statusText(block.status)} ${block.title}`.trim()];
  if (block.summary !== undefined && block.summary.length > 0) lines.push(block.summary);
  for (const field of block.fields ?? []) {
    lines.push(`${field.label}: ${field.value}`);
  }
  if (!collapsed && block.body !== undefined && block.body.length > 0) {
    lines.push(...block.body.split('\n'));
  }
  if (!collapsed && block.details !== undefined && block.details.length > 0) {
    lines.push(...block.details.split('\n').map((line, index) => index === 0 ? `Details: ${line}` : line));
  }
  return lines.map(cleanLine);
}

function structuredBlockDescription(block: StructuredBlock): string {
  const parts = [
    block.status === undefined ? undefined : `status ${block.status}`,
    block.collapsed === true ? 'collapsed' : 'expanded',
    block.fields === undefined ? undefined : `${String(block.fields.length)} fields`
  ].filter((part): part is string => part !== undefined);
  return parts.join(', ');
}

function blockFromWidget(widget: Widget): StructuredBlock {
  const title = stringify(widget.props['title']);
  return {
    id: widget.id ?? 'structured-block',
    title: title.length === 0 ? widget.id ?? 'Block' : title,
    ...optionalString('summary', widget.props['summary']),
    ...optionalString('tone', widget.props['tone']),
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
    ...(block.tone === undefined ? {} : { tone: block.tone }),
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

function optionalString<TKey extends 'summary' | 'tone' | 'body' | 'details'>(
  key: TKey,
  value: unknown
): Pick<StructuredBlock, TKey> | Record<string, never> {
  return typeof value === 'string' && value.length > 0
    ? { [key]: cleanText(value) } as Pick<StructuredBlock, TKey>
    : {};
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
    || value === 'failed'
    || value === 'cancelled';
}

function statusText(status: StructuredBlockStatus | undefined): string {
  return status === undefined ? '' : ` [${status}]`;
}

function cleanLine(value: string): string {
  return cleanText(value).replace(/\s*\n\s*/gu, ' ');
}

function cleanText(value: string): string {
  return sanitizeTerminalText(value).text;
}
