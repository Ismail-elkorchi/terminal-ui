import type { RenderNodeOfKind } from '../model/index.ts';
import { sanitizeTerminalText } from '../../text/index.ts';
import {
  commandGroupSpans, commandMatchSpans, commandMetadataStyle, commandRowStyle, commandSelectionMarkerSpans, commandStatusSpans, styledSpan
} from './command-visual.ts';
import { isFrameCellInteractionState, renderNodeFrameSource } from '../../visual/source.ts';
import { stringify } from './render-node-props.ts';
import { resolveRenderNodeStyle, renderNodeStyle, themeStyle } from './render-node-style.ts';
import type { AccessibleNode } from '../../accessibility/index.ts';
import type { TerminalTheme } from '../../theme/index.ts';
import type { SearchEntry } from '../../ui-model/contracts.ts';
import { paletteWindow } from '../../behavior/palette.ts';
import type { PaletteFilterResult, PaletteWindowInput } from '../../behavior/palette.ts';
import type { Rect } from '../model/layout.ts';
import type { FrameCellSource, RenderBlock, RenderLine, RenderSpan } from '../../visual/render.ts';
import type { HitTarget } from '../model/renderer.ts';
import { interactionVisualState, renderNodeTargetId } from './pointer-presentation.ts';

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

export function paletteBlock(renderNode: PaletteNode, height: number, theme: TerminalTheme): RenderBlock {
  const model = paletteRenderModel(renderNode, height);
  const lines: RenderLine[] = [
    {
      spans: [
        styledSpan(model.title.length === 0 ? 'Palette' : model.title, renderNodeStyle(renderNode, 'title'), paletteSource(renderNode, 'title')),
        ...(model.resultSummary.length === 0 ? [] : [styledSpan(
          `  ${model.resultSummary}`,
          renderNodeStyle(renderNode, 'help', 'disabled'),
          paletteSource(renderNode, 'result.summary')
        )])
      ]
    },
    {
      spans: [
        styledSpan(`${theme.tokens.symbols.pointer} `, renderNodeStyle(renderNode, 'placeholder'), paletteSource(renderNode, 'query.marker', 'decoration')),
        styledSpan(model.query, renderNodeStyle(renderNode, 'value'), paletteSource(renderNode, 'query'))
      ]
    }
  ];
  if (model.window.total === 0 && model.availableEntries > 0) {
    const emptyStyle = resolveRenderNodeStyle(renderNode, {
      part: 'empty',
      base: themeStyle('input.placeholder', { dim: true })
    });
    lines.push({
      spans: commandStatusSpans(renderNode, theme, 'muted', emptyText(renderNode), {
        ...(emptyStyle === undefined ? {} : { textStyle: emptyStyle }),
        markerSource: paletteSource(renderNode, 'empty.marker', 'decoration'),
        textSource: paletteSource(renderNode, 'empty')
      })
    });
  } else {
    lines.push(...model.window.entries.slice(0, model.availableEntries).map((entry, index) => entryLine(
      renderNode,
      entry,
      index === model.window.selected,
      model.window.start + index,
      model.query,
      theme
    )));
  }
  if (model.selectedPreview !== undefined && model.selectedPreview.length > 0 && lines.length < height) {
    lines.push({
      spans: commandStatusSpans(renderNode, theme, 'info', model.selectedPreview, {
        markerSource: paletteSource(renderNode, 'preview.marker', 'decoration'),
        textSource: paletteSource(renderNode, 'preview')
      })
    });
  }
  if (model.helpText.length > 0 && lines.length < height) {
    lines.push({
      spans: commandStatusSpans(renderNode, theme, 'muted', model.helpText, {
        markerSource: paletteSource(renderNode, 'help.marker', 'decoration'),
        textSource: paletteSource(renderNode, 'help')
      })
    });
  }
  return { lines: lines.slice(0, height) };
}

export function paletteHitTargets<TMessage>(renderNode: PaletteNode<TMessage>, bounds: Rect): readonly HitTarget<TMessage>[] {
  const toMessage = paletteMessageFactory(renderNode);
  if (toMessage === undefined) return [];
  const model = paletteRenderModel(renderNode, bounds.height);
  return model.window.entries.slice(0, model.availableEntries).flatMap((entry, index): readonly HitTarget<TMessage>[] => {
    if (entry.disabled === true) return [];
    return [{
      id: paletteEntryTargetId(renderNode, entry.id),
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

export function paletteAccessibleChildren(renderNode: PaletteNode, height: number): readonly AccessibleNode[] {
  const { window } = paletteRenderModel(renderNode, height);
  return window.entries.map((entry, index) => ({
    id: `${renderNode.id ?? 'palette'}:${entry.id}`,
    role: 'option',
    label: entry.label,
    ...(entry.description === undefined ? {} : { description: entry.description }),
    ...(entry.preview === undefined ? {} : { value: entry.preview }),
    position: {
      positionInSet: window.start + index + 1,
      setSize: window.total,
      ...(entry.group === undefined ? {} : { group: entry.group })
    },
    selected: index === window.selected,
    disabled: entry.disabled === true
  }));
}

function entryLine<TValue>(
  renderNode: PaletteNode,
  entry: SearchEntry<TValue>,
  selected: boolean,
  itemIndex: number,
  query: string,
  theme: TerminalTheme
): RenderLine {
  const state = interactionVisualState(renderNode, paletteEntryTargetId(renderNode, entry.id), {
    disabled: entry.disabled === true,
    selected
  });
  const rowStyle = commandRowStyle(renderNode, state);
  const spans: RenderSpan[] = [
    ...commandSelectionMarkerSpans(renderNode, theme, selected, state, paletteSource(renderNode, `entry.${entry.id}.marker`, 'decoration', entry.id, itemIndex, state)),
    ...commandGroupSpans(renderNode, entry.group, state, paletteSource(renderNode, `entry.${entry.id}.group`, 'text', entry.id, itemIndex, state)),
    ...commandMatchSpans(entry.label, query, rowStyle, {
      source: paletteSource(renderNode, `entry.${entry.id}.label`, 'text', entry.id, itemIndex, state),
      matchSource: paletteSource(renderNode, `entry.${entry.id}.match`, 'text', entry.id, itemIndex, state)
    })
  ];
  if (entry.description !== undefined && entry.description.length > 0) {
    spans.push(styledSpan(
      ` · ${entry.description}`,
      commandMetadataStyle(renderNode, state),
      paletteSource(renderNode, `entry.${entry.id}.description`, 'text', entry.id, itemIndex, state)
    ));
  }
  return { spans };
}

function paletteRenderModel(renderNode: PaletteNode, height: number): PaletteRenderModel {
  const cached = renderModelCache.get(renderNode);
  if (cached?.height === height) return cached.model;
  const title = titleText(renderNode);
  const query = queryText(renderNode);
  const helpText = helpTextProp(renderNode);
  const index = renderNode.props.index;
  const window = paletteWindow({
    index,
    query,
    ...selectedInput(renderNode),
    ...scrollInput(renderNode),
    limit: entryLimit(renderNode, height)
  });
  const selectedPreview = window.selectedEntry?.preview;
  const resultSummary = paletteResultSummary(window.total, index.size, query);
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
  renderModelCache.set(renderNode, { height, model });
  return model;
}

function selectedInput(renderNode: PaletteNode): Partial<Pick<PaletteWindowInput<unknown>, 'selected' | 'selectedId'>> {
  const selected = renderNode.props.selected;
  const selectedId = selectedIdText(renderNode);
  return {
    ...(selected === undefined ? {} : { selected }),
    ...(selectedId.length === 0 ? {} : { selectedId })
  };
}

function paletteMessageFactory<TMessage>(renderNode: PaletteNode<TMessage>): ((entry: SearchEntry<unknown>) => TMessage) | undefined {
  return renderNode.props.toMessage;
}

function scrollInput(renderNode: PaletteNode): Partial<Pick<PaletteWindowInput<unknown>, 'scroll'>> {
  return renderNode.props.scroll === undefined ? {} : { scroll: renderNode.props.scroll };
}

function entryLimit(renderNode: PaletteNode, height: number): number {
  const maxVisible = renderNode.props.maxVisible;
  return Math.max(1, Math.min(Math.floor(maxVisible ?? Math.max(1, height - 2)), Math.max(1, height - 2)));
}

function titleText(renderNode: PaletteNode): string {
  return clean(stringify(renderNode.props.title));
}

function queryText(renderNode: PaletteNode): string {
  return clean(stringify(renderNode.props.query));
}

function selectedIdText(renderNode: PaletteNode): string {
  return clean(stringify(renderNode.props.selectedId));
}

function helpTextProp(renderNode: PaletteNode): string {
  return clean(stringify(renderNode.props.helpText));
}

function emptyText(renderNode: PaletteNode): string {
  const text = clean(stringify(renderNode.props.emptyText));
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
  renderNode: PaletteNode,
  label: string,
  role: FrameCellSource['role'] = 'text',
  id: string | undefined = renderNode.id,
  itemIndex?: number,
  state?: import('../../element/metadata.ts').ElementVisualState
): FrameCellSource {
  return renderNodeFrameSource(renderNode, {
    family: 'command',
    role,
    part: label,
    ...(id === undefined || id === renderNode.id ? {} : { itemId: id }),
    ...(itemIndex === undefined ? {} : { itemIndex }),
    ...(isFrameCellInteractionState(state) ? { state } : {}),
    label
  });
}

function paletteEntryTargetId(renderNode: PaletteNode, entryId: string): string {
  return renderNodeTargetId(renderNode, entryId);
}

type PaletteNode<TMessage = unknown> = RenderNodeOfKind<TMessage, 'palette'>;
