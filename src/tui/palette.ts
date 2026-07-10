import type { RenderNodeOfKind } from '../render-node/index.ts';
import { sanitizeTerminalText } from '../text/index.ts';
import {
  commandGroupSpans, commandMatchSpans, commandMetadataStyle, commandRowStyle, commandSelectionMarkerSpans, commandStatusSpans, styledSpan
} from './command-visual.ts';
import { renderNodeFrameSource } from './frame-source.ts';
import { stringify } from './render-node-props.ts';
import { renderNodeStyle } from './render-node-style.ts';
import type { AccessibleNode } from '../accessibility/index.ts';
import type { TerminalTheme } from '../theme/index.ts';
import type { SearchEntry } from '../components/contracts.ts';
import { paletteWindow } from '../behavior/palette.ts';
import type { PaletteFilterResult, PaletteWindowInput } from '../behavior/palette.ts';
import type { Rect } from './layout.ts';
import type { FrameCellSource, RenderBlock, RenderLine, RenderSpan } from './render-primitives.ts';
import type { HitTarget } from './render-node-renderer.ts';

const renderModelCache = new WeakMap<object, {
  readonly height: number;
  readonly model: PaletteRenderModel;
}>();

interface PaletteRenderModel {
  readonly title: string;
  readonly query: string;
  readonly helpText: string;
  readonly window: PaletteFilterResult<unknown>;
  readonly selectedPreview?: string;
  readonly resultSummary: string;
  readonly availableEntries: number;
}

export function paletteBlock(widget: PaletteNode, height: number, theme: TerminalTheme): RenderBlock {
  const model = paletteRenderModel(widget, height);
  const lines: RenderLine[] = [
    {
      spans: [
        styledSpan(model.title.length === 0 ? 'Palette' : model.title, renderNodeStyle(widget, 'title'), paletteSource(widget, 'title')),
        ...(model.resultSummary.length === 0 ? [] : [styledSpan(
          `  ${model.resultSummary}`,
          renderNodeStyle(widget, 'value', 'disabled'),
          paletteSource(widget, 'result.summary')
        )])
      ]
    },
    {
      spans: [
        styledSpan(`${theme.tokens.symbols.pointer} `, renderNodeStyle(widget, 'placeholder'), paletteSource(widget, 'query.marker', 'decoration')),
        styledSpan(model.query, renderNodeStyle(widget, 'value'), paletteSource(widget, 'query'))
      ]
    }
  ];
  if (model.window.total === 0 && model.availableEntries > 0) {
    const emptyStyle = renderNodeStyle(widget, 'placeholder');
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

export function paletteHitTargets<TMessage>(widget: PaletteNode<TMessage>, bounds: Rect): readonly HitTarget<TMessage>[] {
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

export function paletteAccessibleChildren(widget: PaletteNode, height: number): readonly AccessibleNode[] {
  const { window } = paletteRenderModel(widget, height);
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
  widget: PaletteNode,
  entry: SearchEntry<TValue>,
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

function paletteRenderModel(widget: PaletteNode, height: number): PaletteRenderModel {
  const cached = renderModelCache.get(widget);
  if (cached?.height === height) return cached.model;
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
  const model = {
    title,
    query,
    helpText,
    window,
    ...(selectedPreview === undefined ? {} : { selectedPreview }),
    resultSummary,
    availableEntries: Math.max(0, height - 2 - reserve)
  };
  renderModelCache.set(widget, { height, model });
  return model;
}

function paletteEntries(widget: PaletteNode): readonly SearchEntry<unknown>[] {
  return widget.props.entries.map((entry) => ({
    id: clean(entry.id),
    label: clean(entry.label),
    value: entry.value,
    ...(entry.group === undefined ? {} : { group: clean(entry.group) }),
    ...(entry.description === undefined ? {} : { description: clean(entry.description) }),
    ...(entry.preview === undefined ? {} : { preview: clean(entry.preview) }),
    ...(entry.disabled === true ? { disabled: true } : {}),
    ...(entry.keywords === undefined ? {} : { keywords: entry.keywords.map(clean) })
  }));
}

function selectedInput(widget: PaletteNode): Partial<Pick<PaletteWindowInput<unknown>, 'selected' | 'selectedId'>> {
  const selected = widget.props.selected;
  const selectedId = selectedIdText(widget);
  return {
    ...(selected === undefined ? {} : { selected }),
    ...(selectedId.length === 0 ? {} : { selectedId })
  };
}

function paletteMessageFactory<TMessage>(widget: PaletteNode<TMessage>): ((entry: SearchEntry<unknown>) => TMessage) | undefined {
  return widget.props.toMessage;
}

function scrollInput(widget: PaletteNode): Partial<Pick<PaletteWindowInput<unknown>, 'scroll'>> {
  return widget.props.scroll === undefined ? {} : { scroll: widget.props.scroll };
}

function entryLimit(widget: PaletteNode, height: number): number {
  const maxVisible = widget.props.maxVisible;
  return Math.max(1, Math.min(Math.floor(maxVisible ?? Math.max(1, height - 2)), Math.max(1, height - 2)));
}

function titleText(widget: PaletteNode): string {
  return clean(stringify(widget.props.title));
}

function queryText(widget: PaletteNode): string {
  return clean(stringify(widget.props.query));
}

function selectedIdText(widget: PaletteNode): string {
  return clean(stringify(widget.props.selectedId));
}

function helpTextProp(widget: PaletteNode): string {
  return clean(stringify(widget.props.helpText));
}

function emptyText(widget: PaletteNode): string {
  const text = clean(stringify(widget.props.emptyText));
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
  widget: PaletteNode,
  label: string,
  role: FrameCellSource['role'] = 'text',
  id = widget.id
): FrameCellSource {
  return renderNodeFrameSource(widget, {
    family: 'command',
    role,
    part: label,
    ...(id === undefined || id === widget.id ? {} : { itemId: id }),
    label
  });
}

type PaletteNode<TMessage = unknown> = RenderNodeOfKind<TMessage, 'palette'>;
