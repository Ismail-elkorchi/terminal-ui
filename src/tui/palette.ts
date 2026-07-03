import { sanitizeTerminalText } from '../text/index.ts';
import {
  commandGroupSpans,
  commandMatchSpans,
  commandMetadataStyle,
  commandRowStyle,
  commandSelectionMarkerSpans,
  commandStatusSpans,
  styledSpan
} from './command-visual.ts';
import { widgetFrameSource } from './frame-source.ts';
import { numberProp, stringify } from './widget-props.ts';
import { widgetStyle } from './widget-style.ts';
import type { AccessibleNode } from '../accessibility/index.ts';
import type { TerminalTheme } from '../theme/index.ts';
import type { WidgetSearchEntry, Widget } from '../widgets/index.ts';
import { paletteWindow } from '../widgets/index.ts';
import type { PaletteFilterResult, PaletteWindowInput } from '../widgets/index.ts';
import type { Rect } from './layout.ts';
import type { FrameCellSource, RenderBlock, RenderLine, RenderSpan } from './render-primitives.ts';
import type { HitTarget } from './widget-renderer.ts';

interface PaletteRenderModel {
  readonly title: string;
  readonly query: string;
  readonly helpText: string;
  readonly window: PaletteFilterResult<unknown>;
  readonly selectedPreview?: string;
  readonly resultSummary: string;
  readonly availableEntries: number;
}

export function paletteBlock(widget: Widget, height: number, theme: TerminalTheme): RenderBlock {
  const model = paletteRenderModel(widget, height);
  const lines: RenderLine[] = [
    {
      spans: [
        styledSpan(model.title.length === 0 ? 'Palette' : model.title, widgetStyle(widget, 'title'), paletteSource(widget, 'title')),
        ...(model.resultSummary.length === 0 ? [] : [styledSpan(
          `  ${model.resultSummary}`,
          widgetStyle(widget, 'value', 'disabled'),
          paletteSource(widget, 'result.summary')
        )])
      ]
    },
    {
      spans: [
        styledSpan(`${theme.symbols.pointer} `, widgetStyle(widget, 'placeholder'), paletteSource(widget, 'query.marker', 'decoration')),
        styledSpan(model.query, widgetStyle(widget, 'value'), paletteSource(widget, 'query'))
      ]
    }
  ];
  if (model.window.total === 0 && model.availableEntries > 0) {
    const emptyStyle = widgetStyle(widget, 'placeholder');
    lines.push({
      spans: commandStatusSpans(widget, theme, 'muted', emptyText(widget), {
        ...(emptyStyle === undefined ? {} : { textStyle: emptyStyle }),
        markerSource: paletteSource(widget, 'empty.marker', 'decoration'),
        textSource: paletteSource(widget, 'empty')
      })
    });
  } else {
    lines.push(...model.window.entries.slice(0, model.availableEntries).map((entry, index) => entryLine(
      widget,
      entry,
      index === model.window.selected,
      model.query,
      theme
    )));
  }
  if (model.selectedPreview !== undefined && model.selectedPreview.length > 0 && lines.length < height) {
    lines.push({
      spans: commandStatusSpans(widget, theme, 'info', model.selectedPreview, {
        markerSource: paletteSource(widget, 'preview.marker', 'decoration'),
        textSource: paletteSource(widget, 'preview')
      })
    });
  }
  if (model.helpText.length > 0 && lines.length < height) {
    lines.push({
      spans: commandStatusSpans(widget, theme, 'muted', model.helpText, {
        markerSource: paletteSource(widget, 'help.marker', 'decoration'),
        textSource: paletteSource(widget, 'help')
      })
    });
  }
  return { lines: lines.slice(0, height) };
}

export function paletteHitTargets<TMessage>(widget: Widget<TMessage>, bounds: Rect): readonly HitTarget<TMessage>[] {
  const toMessage = paletteMessageFactory(widget);
  if (toMessage === undefined) return [];
  const model = paletteRenderModel(widget, bounds.height);
  return model.window.entries.slice(0, model.availableEntries).flatMap((entry, index): readonly HitTarget<TMessage>[] => {
    if (entry.disabled === true) return [];
    return [{
      id: `${widget.id ?? widget.kind}:${entry.id}`,
      bounds: {
        row: bounds.row + 2 + index,
        column: bounds.column,
        width: bounds.width,
        height: 1
      },
      message: () => toMessage(entry),
      cursor: 'pointer'
    }];
  });
}

export function paletteAccessibleChildren(widget: Widget, height: number): readonly AccessibleNode[] {
  const window = paletteWindow({
    entries: paletteEntries(widget),
    query: queryText(widget),
    ...selectedInput(widget),
    ...scrollInput(widget),
    limit: entryLimit(widget, height)
  });
  return window.entries.map((entry, index) => ({
    id: `${widget.id ?? 'palette'}:${entry.id}`,
    role: 'option',
    label: entry.label,
    ...(entry.description === undefined ? {} : { description: entry.description }),
    ...(entry.preview === undefined ? {} : { value: entry.preview }),
    position: {
      index: window.start + index,
      count: window.total,
      ...(entry.group === undefined ? {} : { group: entry.group })
    },
    selected: index === window.selected,
    disabled: entry.disabled === true
  }));
}

function entryLine<TValue>(
  widget: Widget,
  entry: WidgetSearchEntry<TValue>,
  selected: boolean,
  query: string,
  theme: TerminalTheme
): RenderLine {
  const rowStyle = commandRowStyle(widget, selected, entry.disabled === true);
  const spans: RenderSpan[] = [
    ...commandSelectionMarkerSpans(widget, theme, selected, paletteSource(widget, `entry.${entry.id}.marker`, 'decoration', entry.id)),
    ...commandGroupSpans(widget, entry.group, selected, paletteSource(widget, `entry.${entry.id}.group`, 'text', entry.id)),
    ...commandMatchSpans(entry.label, query, rowStyle, {
      source: paletteSource(widget, `entry.${entry.id}.label`, 'text', entry.id),
      matchSource: paletteSource(widget, `entry.${entry.id}.match`, 'text', entry.id)
    })
  ];
  if (entry.description !== undefined && entry.description.length > 0) {
    spans.push(styledSpan(
      ` · ${entry.description}`,
      commandMetadataStyle(widget, selected, entry.disabled === true),
      paletteSource(widget, `entry.${entry.id}.description`, 'text', entry.id)
    ));
  }
  return { spans };
}

function paletteRenderModel(widget: Widget, height: number): PaletteRenderModel {
  const title = titleText(widget);
  const query = queryText(widget);
  const helpText = helpTextProp(widget);
  const entries = paletteEntries(widget);
  const window = paletteWindow({
    entries,
    query,
    ...selectedInput(widget),
    ...scrollInput(widget),
    limit: entryLimit(widget, height)
  });
  const selectedPreview = window.selectedEntry?.preview;
  const resultSummary = paletteResultSummary(window.total, entries.length, query);
  const reserve = (selectedPreview === undefined || selectedPreview.length === 0 ? 0 : 1)
    + (helpText.length === 0 ? 0 : 1);
  return {
    title,
    query,
    helpText,
    window,
    ...(selectedPreview === undefined ? {} : { selectedPreview }),
    resultSummary,
    availableEntries: Math.max(0, height - 2 - reserve)
  };
}

function paletteEntries(widget: Widget): readonly WidgetSearchEntry<unknown>[] {
  const entries = widget.props['entries'];
  if (!Array.isArray(entries)) return [];
  return entries.flatMap((entry): WidgetSearchEntry<unknown>[] => {
    if (!isRecord(entry)) return [];
    const id = entry['id'];
    const label = entry['label'];
    if (typeof id !== 'string' || typeof label !== 'string') return [];
    const description = entry['description'];
    const preview = entry['preview'];
    const group = entry['group'];
    return [{
      id: clean(id),
      label: clean(label),
      value: entry['value'] ?? id,
      ...(typeof group === 'string' ? { group: clean(group) } : {}),
      ...(typeof description === 'string' ? { description: clean(description) } : {}),
      ...(typeof preview === 'string' ? { preview: clean(preview) } : {}),
      ...(entry['disabled'] === true ? { disabled: true } : {}),
      ...keywordsProp(entry)
    }];
  });
}

function keywordsProp(entry: Readonly<Record<string, unknown>>): { readonly keywords?: readonly string[] } {
  const keywords = entry['keywords'];
  if (!Array.isArray(keywords)) return {};
  const cleaned = keywords.filter((keyword): keyword is string => typeof keyword === 'string').map(clean);
  return cleaned.length === 0 ? {} : { keywords: cleaned };
}

function selectedInput(widget: Widget): Pick<PaletteWindowInput<unknown>, 'selected' | 'selectedId'> {
  const selected = numberProp(widget, 'selected');
  const selectedId = selectedIdText(widget);
  return {
    ...(selected === undefined ? {} : { selected }),
    ...(selectedId.length === 0 ? {} : { selectedId })
  };
}

function paletteMessageFactory<TMessage>(widget: Widget<TMessage>): ((entry: WidgetSearchEntry<unknown>) => TMessage) | undefined {
  const toMessage = widget.props['toMessage'];
  if (!isPaletteMessageFactory(toMessage)) return undefined;
  return (entry) => toMessage(entry) as TMessage;
}

function scrollInput(widget: Widget): Pick<PaletteWindowInput<unknown>, 'scroll'> {
  const scroll = widget.props['scroll'];
  if (!isRecord(scroll)) return {};
  const offsetRow = scroll['offsetRow'];
  const offsetColumn = scroll['offsetColumn'];
  const contentRows = scroll['contentRows'];
  const contentColumns = scroll['contentColumns'];
  const viewportRows = scroll['viewportRows'];
  const viewportColumns = scroll['viewportColumns'];
  const followTail = scroll['followTail'];
  if (
    typeof offsetRow !== 'number'
    || typeof offsetColumn !== 'number'
    || typeof contentRows !== 'number'
    || typeof contentColumns !== 'number'
    || typeof viewportRows !== 'number'
    || typeof viewportColumns !== 'number'
    || typeof followTail !== 'boolean'
  ) return {};
  return {
    scroll: {
      offsetRow,
      offsetColumn,
      contentRows,
      contentColumns,
      viewportRows,
      viewportColumns,
      followTail
    }
  };
}

function entryLimit(widget: Widget, height: number): number {
  const maxVisible = numberProp(widget, 'maxVisible');
  return Math.max(1, Math.min(Math.floor(maxVisible ?? Math.max(1, height - 2)), Math.max(1, height - 2)));
}

function titleText(widget: Widget): string {
  return clean(stringify(widget.props['title']));
}

function queryText(widget: Widget): string {
  return clean(stringify(widget.props['query']));
}

function selectedIdText(widget: Widget): string {
  return clean(stringify(widget.props['selectedId']));
}

function helpTextProp(widget: Widget): string {
  return clean(stringify(widget.props['helpText']));
}

function emptyText(widget: Widget): string {
  const text = clean(stringify(widget.props['emptyText']));
  return text.length === 0 ? 'No matches' : text;
}

function paletteResultSummary(filteredCount: number, totalCount: number, query: string): string {
  if (totalCount === 0) return '0 entries';
  if (query.trim().length === 0) return `${String(totalCount)} ${totalCount === 1 ? 'entry' : 'entries'}`;
  return `${String(filteredCount)}/${String(totalCount)} ${filteredCount === 1 ? 'match' : 'matches'}`;
}

function clean(value: string): string {
  return sanitizeTerminalText(value).text.replace(/\s*\n\s*/gu, ' ');
}

function paletteSource(
  widget: Widget,
  label: string,
  role: FrameCellSource['role'] = 'text',
  id = widget.id
): FrameCellSource {
  return widgetFrameSource(widget, {
    family: 'command',
    role,
    part: label,
    ...(id === undefined || id === widget.id ? {} : { itemId: id }),
    label
  });
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isPaletteMessageFactory(value: unknown): value is (entry: WidgetSearchEntry<unknown>) => unknown {
  return typeof value === 'function';
}
