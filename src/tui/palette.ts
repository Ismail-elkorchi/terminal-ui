import { sanitizeTerminalText } from '../text/index.ts';
import { rowWindow } from './data-window.ts';
import { highlightRenderSpans } from './text-highlight.ts';
import { numberProp, stringify } from './widget-props.ts';
import { themeStyle, widgetStyle } from './widget-style.ts';
import type { AccessibleNode } from '../accessibility/index.ts';
import type { TerminalTheme } from '../theme/index.ts';
import type { PaletteEntry, Widget } from '../widgets/index.ts';
import type { RenderBlock, RenderLine, RenderSpan, TerminalStyle } from './render-primitives.ts';
import type { ScrollState } from './scroll.ts';

export interface PaletteWindowInput<TValue = string> {
  readonly entries: readonly PaletteEntry<TValue>[];
  readonly query?: string;
  readonly selected?: number;
  readonly selectedId?: string;
  readonly scroll?: ScrollState;
  readonly limit?: number;
}

export interface PaletteFilterResult<TValue = string> {
  readonly entries: readonly PaletteEntry<TValue>[];
  readonly selected?: number;
  readonly selectedEntry?: PaletteEntry<TValue>;
  readonly total: number;
  readonly start: number;
  readonly end: number;
  readonly omittedBefore: number;
  readonly omittedAfter: number;
}

export function paletteWindow<TValue>(input: PaletteWindowInput<TValue>): PaletteFilterResult<TValue> {
  const filtered = filterPaletteEntries(input.entries, input.query ?? '');
  const total = filtered.length;
  const limit = Math.max(1, Math.floor(input.limit ?? total));
  if (total === 0) {
    return {
      entries: [],
      total,
      start: 0,
      end: 0,
      omittedBefore: 0,
      omittedAfter: 0
    };
  }
  const selectedAbsolute = selectedIndex(filtered, input);
  const window = rowWindow(filtered, {
    viewportRows: limit,
    selectedIndex: selectedAbsolute,
    ...(input.scroll === undefined ? {} : { scroll: input.scroll })
  });
  return {
    entries: window.rows,
    ...(window.selectedVisibleIndex === undefined ? {} : { selected: window.selectedVisibleIndex }),
    ...(filtered[selectedAbsolute] === undefined ? {} : { selectedEntry: filtered[selectedAbsolute] }),
    total,
    start: window.start,
    end: window.end,
    omittedBefore: window.omittedBefore,
    omittedAfter: window.omittedAfter
  };
}

export function filterPaletteEntries<TValue>(
  entries: readonly PaletteEntry<TValue>[],
  query: string
): readonly PaletteEntry<TValue>[] {
  const normalized = query.trim().toLocaleLowerCase();
  if (normalized.length === 0) return entries;
  return entries
    .map((entry, index) => ({ entry, index, score: paletteEntryScore(entry, normalized) }))
    .filter((result) => result.score !== undefined)
    .sort((left, right) => (left.score ?? 0) - (right.score ?? 0) || left.index - right.index)
    .map((result) => result.entry);
}

export function paletteBlock(widget: Widget, height: number, theme: TerminalTheme): RenderBlock {
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
  const lines: RenderLine[] = [
    { spans: [styledSpan(title.length === 0 ? 'Palette' : title, widgetStyle(widget, 'title'))] },
    { spans: [styledSpan('> ', widgetStyle(widget, 'placeholder')), styledSpan(query, widgetStyle(widget, 'value'))] }
  ];
  const reserve = (selectedPreview === undefined || selectedPreview.length === 0 ? 0 : 1)
    + (helpText.length === 0 ? 0 : 1);
  const availableEntries = Math.max(0, height - lines.length - reserve);
  if (window.total === 0 && availableEntries > 0) {
    lines.push({ spans: [styledSpan(emptyText(widget), widgetStyle(widget, 'placeholder'))] });
  } else {
    lines.push(...window.entries.slice(0, availableEntries).map((entry, index) => entryLine(
      widget,
      entry,
      index === window.selected,
      query,
      theme
    )));
  }
  if (selectedPreview !== undefined && selectedPreview.length > 0 && lines.length < height) {
    lines.push({ spans: [styledSpan(selectedPreview, widgetStyle(widget, 'value', 'disabled'))] });
  }
  if (helpText.length > 0 && lines.length < height) {
    lines.push({ spans: [styledSpan(helpText, widgetStyle(widget, 'value', 'disabled'))] });
  }
  return { lines: lines.slice(0, height) };
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

function selectedIndex<TValue>(
  entries: readonly PaletteEntry<TValue>[],
  input: Pick<PaletteWindowInput<TValue>, 'selected' | 'selectedId'>
): number {
  if (input.selectedId !== undefined) {
    const byId = entries.findIndex((entry) => entry.id === input.selectedId);
    if (byId !== -1) return byId;
  }
  return clampIndex(input.selected ?? 0, entries.length);
}

function paletteEntryScore<TValue>(entry: PaletteEntry<TValue>, query: string): number | undefined {
  const haystacks = [
    entry.label,
    entry.id,
    entry.description,
    ...(entry.keywords ?? [])
  ].filter((value): value is string => value !== undefined).map((value) => value.toLocaleLowerCase());
  let best: number | undefined;
  for (const haystack of haystacks) {
    const score = textScore(haystack, query);
    if (score !== undefined && (best === undefined || score < best)) best = score;
  }
  return best;
}

function textScore(text: string, query: string): number | undefined {
  if (text === query) return 0;
  if (text.startsWith(query)) return 1;
  const includes = text.indexOf(query);
  if (includes !== -1) return 10 + includes;
  return subsequenceScore(text, query);
}

function subsequenceScore(text: string, query: string): number | undefined {
  let offset = 0;
  let score = 100;
  for (const character of query) {
    const found = text.indexOf(character, offset);
    if (found === -1) return undefined;
    score += found - offset;
    offset = found + 1;
  }
  return score;
}

function entryLine<TValue>(
  widget: Widget,
  entry: PaletteEntry<TValue>,
  selected: boolean,
  query: string,
  theme: TerminalTheme
): RenderLine {
  const baseStyle = entry.disabled === true ? widgetStyle(widget, 'value', 'disabled') : widgetStyle(widget, 'value');
  const spans: RenderSpan[] = [
    styledSpan(`${selected ? theme.symbols.pointer : theme.symbols.unselected} `, selected ? widgetStyle(widget, 'value', 'selected') : undefined),
    ...highlightRenderSpans(entry.label, query.trim(), {
      ...(baseStyle === undefined ? {} : { baseStyle }),
      matchStyle: themeStyle('menu.match', { underline: true })
    })
  ];
  if (entry.description !== undefined && entry.description.length > 0) {
    spans.push(styledSpan(` - ${entry.description}`, widgetStyle(widget, 'value', entry.disabled === true ? 'disabled' : undefined)));
  }
  return { spans };
}

function styledSpan(text: string, style: TerminalStyle | undefined): RenderSpan {
  return style === undefined ? { text } : { text, style };
}

function paletteEntries(widget: Widget): readonly PaletteEntry<unknown>[] {
  const entries = widget.props['entries'];
  if (!Array.isArray(entries)) return [];
  return entries.flatMap((entry): PaletteEntry<unknown>[] => {
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

function clean(value: string): string {
  return sanitizeTerminalText(value).text.replace(/\s*\n\s*/gu, ' ');
}

function clampIndex(index: number, count: number): number {
  return Math.max(0, Math.min(count - 1, Math.floor(index)));
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
