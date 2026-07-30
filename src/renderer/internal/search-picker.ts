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
import { searchPickerWindow } from '../../behavior/search-picker.ts';
import type { SearchPickerWindow, SearchPickerWindowInput } from '../../behavior/search-picker.ts';
import type { Rect } from '../contracts.ts';
import { clipRenderLine, padRenderLine } from '../../visual/render.ts';
import type { FrameCellSource, RenderBlock, RenderLine, RenderSpan } from '../../visual/render.ts';
import type { TextWidthProfile } from '../../text/index.ts';
import type { HitTarget } from '../contracts.ts';
import { interactionVisualState, renderNodeTargetId } from './pointer-interaction.ts';

const renderModelCache = new WeakMap<object, {
  readonly height: number;
  readonly model: SearchPickerRenderModel;
}>();

interface SearchPickerRenderModel {
  readonly title: string;
  readonly query: string;
  readonly helpText: string;
  readonly window: SearchPickerWindow<unknown>;
  readonly selectedPreview?: string;
  readonly resultSummary: string;
  readonly availableEntries: number;
}

export function searchPickerBlock(
  renderNode: SearchPickerNode,
  height: number,
  theme: TerminalTheme,
  width?: number,
  widthProfile?: TextWidthProfile
): RenderBlock {
  const model = searchPickerRenderModel(renderNode, height);
  const lines: RenderLine[] = [
    {
      spans: [
        styledSpan(model.title.length === 0 ? 'Options' : model.title, renderNodeStyle(renderNode, 'title'), searchPickerSource(renderNode, 'title')),
        ...(model.resultSummary.length === 0 ? [] : [styledSpan(
          `  ${model.resultSummary}`,
          renderNodeStyle(renderNode, 'help', 'disabled'),
          searchPickerSource(renderNode, 'result.summary')
        )])
      ]
    },
    {
      spans: [
        styledSpan(`${theme.tokens.symbols.pointer} `, renderNodeStyle(renderNode, 'placeholder'), searchPickerSource(renderNode, 'query.marker', 'decoration')),
        styledSpan(model.query, renderNodeStyle(renderNode, 'value'), searchPickerSource(renderNode, 'query'))
      ]
    }
  ];
  if (model.window.totalCount === 0 && model.availableEntries > 0) {
    const emptyStyle = resolveRenderNodeStyle(renderNode, {
      part: 'empty',
      base: themeStyle('input.placeholder', { dim: true })
    });
    lines.push({
      spans: commandStatusSpans(renderNode, theme, 'muted', emptyText(renderNode), {
        ...(emptyStyle === undefined ? {} : { textStyle: emptyStyle }),
        markerSource: searchPickerSource(renderNode, 'empty.marker', 'decoration'),
        textSource: searchPickerSource(renderNode, 'empty')
      })
    });
  } else {
    lines.push(...model.window.entries.slice(0, model.availableEntries).map((entry, index) => entryLine(
      renderNode,
      entry,
      index === model.window.selectedIndex,
      model.window.startIndex + index,
      model.query,
      theme,
      width,
      widthProfile
    )));
  }
  if (model.selectedPreview !== undefined && model.selectedPreview.length > 0 && lines.length < height) {
    lines.push({
      spans: commandStatusSpans(renderNode, theme, 'info', model.selectedPreview, {
        markerSource: searchPickerSource(renderNode, 'preview.marker', 'decoration'),
        textSource: searchPickerSource(renderNode, 'preview')
      })
    });
  }
  if (model.helpText.length > 0 && lines.length < height) {
    lines.push({
      spans: commandStatusSpans(renderNode, theme, 'muted', model.helpText, {
        markerSource: searchPickerSource(renderNode, 'help.marker', 'decoration'),
        textSource: searchPickerSource(renderNode, 'help')
      })
    });
  }
  return { lines: lines.slice(0, height) };
}

export function searchPickerHitTargets<TMessage>(renderNode: SearchPickerNode<TMessage>, bounds: Rect): readonly HitTarget<TMessage>[] {
  const toMessage = searchPickerMessageFactory(renderNode);
  if (toMessage === undefined) return [];
  const model = searchPickerRenderModel(renderNode, bounds.height);
  return model.window.entries.slice(0, model.availableEntries).flatMap((entry, index): readonly HitTarget<TMessage>[] => {
    if (entry.disabled === true) return [];
    return [{
      id: searchPickerEntryTargetId(renderNode, entry.id),
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

export function searchPickerAccessibleChildren(renderNode: SearchPickerNode, height: number): readonly AccessibleNode[] {
  const { window } = searchPickerRenderModel(renderNode, height);
  return window.entries.map((entry, index) => ({
    id: `${renderNode.id ?? 'searchPicker'}:${entry.id}`,
    role: 'option',
    label: entry.label,
    ...(entry.description === undefined ? {} : { description: entry.description }),
    ...(entry.preview === undefined ? {} : { value: entry.preview }),
    position: {
      positionInSet: window.startIndex + index + 1,
      setSize: window.totalCount,
      ...(entry.group === undefined ? {} : { group: entry.group })
    },
    selected: index === window.selectedIndex,
    disabled: entry.disabled === true
  }));
}

function entryLine<TValue>(
  renderNode: SearchPickerNode,
  entry: SearchEntry<TValue>,
  selected: boolean,
  itemIndex: number,
  query: string,
  theme: TerminalTheme,
  width: number | undefined,
  widthProfile: TextWidthProfile | undefined
): RenderLine {
  const state = interactionVisualState(renderNode, searchPickerEntryTargetId(renderNode, entry.id), {
    disabled: entry.disabled === true,
    selected
  });
  const rowStyle = commandRowStyle(renderNode, state);
  const spans: RenderSpan[] = [
    ...commandSelectionMarkerSpans(renderNode, theme, selected, state, searchPickerSource(renderNode, `entry.${entry.id}.marker`, 'decoration', entry.id, itemIndex, state)),
    ...commandGroupSpans(renderNode, entry.group, state, searchPickerSource(renderNode, `entry.${entry.id}.group`, 'text', entry.id, itemIndex, state)),
    ...commandMatchSpans(entry.label, query, rowStyle, {
      source: searchPickerSource(renderNode, `entry.${entry.id}.label`, 'text', entry.id, itemIndex, state),
      matchSource: searchPickerSource(renderNode, `entry.${entry.id}.match`, 'text', entry.id, itemIndex, state)
    })
  ];
  if (entry.description !== undefined && entry.description.length > 0) {
    spans.push(styledSpan(
      ` · ${entry.description}`,
      commandMetadataStyle(renderNode, state),
      searchPickerSource(renderNode, `entry.${entry.id}.description`, 'text', entry.id, itemIndex, state)
    ));
  }
  const line = { spans };
  if (width === undefined || widthProfile === undefined) return line;
  return padRenderLine(clipRenderLine(line, width, { ellipsis: '…', widthProfile }), width, {
    widthProfile,
    fill: styledSpan(
      ' ',
      rowStyle,
      searchPickerSource(renderNode, `entry.${entry.id}.padding`, 'decoration', entry.id, itemIndex, state)
    )
  });
}

function searchPickerRenderModel(renderNode: SearchPickerNode, height: number): SearchPickerRenderModel {
  const cached = renderModelCache.get(renderNode);
  if (cached?.height === height) return cached.model;
  const title = titleText(renderNode);
  const query = queryText(renderNode);
  const helpText = helpTextProp(renderNode);
  const index = renderNode.props.searchPickerIndex;
  const window = searchPickerWindow({
    searchPickerIndex: index,
    query,
    ...selectedInput(renderNode),
    ...scrollInput(renderNode),
    limit: entryLimit(renderNode, height)
  });
  const selectedPreview = window.selectedEntry?.preview;
  const resultSummary = searchPickerResultSummary(window.totalCount, index.size, query);
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

function selectedInput(renderNode: SearchPickerNode): Partial<Pick<SearchPickerWindowInput<unknown>, 'selectedIndex' | 'selectedId'>> {
  const selectedIndex = renderNode.props.selectedIndex;
  const selectedId = selectedIdText(renderNode);
  return {
    ...(selectedIndex === undefined ? {} : { selectedIndex }),
    ...(selectedId.length === 0 ? {} : { selectedId })
  };
}

function searchPickerMessageFactory<TMessage>(renderNode: SearchPickerNode<TMessage>): ((entry: SearchEntry<unknown>) => TMessage) | undefined {
  return renderNode.props.toMessage;
}

function scrollInput(renderNode: SearchPickerNode): Partial<Pick<SearchPickerWindowInput<unknown>, 'scroll'>> {
  return renderNode.props.scroll === undefined ? {} : { scroll: renderNode.props.scroll };
}

function entryLimit(renderNode: SearchPickerNode, height: number): number {
  const maxVisible = renderNode.props.maxVisible;
  return Math.max(1, Math.min(Math.floor(maxVisible ?? Math.max(1, height - 2)), Math.max(1, height - 2)));
}

function titleText(renderNode: SearchPickerNode): string {
  return clean(stringify(renderNode.props.title));
}

function queryText(renderNode: SearchPickerNode): string {
  return clean(stringify(renderNode.props.query));
}

function selectedIdText(renderNode: SearchPickerNode): string {
  return clean(stringify(renderNode.props.selectedId));
}

function helpTextProp(renderNode: SearchPickerNode): string {
  return clean(stringify(renderNode.props.helpText));
}

function emptyText(renderNode: SearchPickerNode): string {
  const text = clean(stringify(renderNode.props.emptyText));
  return text.length === 0 ? 'No matches' : text;
}

function searchPickerResultSummary(filteredCount: number, totalCount: number, query: string): string {
  if (totalCount === 0) return '0 entries';
  if (query.trim().length === 0) return `${String(totalCount)} ${totalCount === 1 ? 'entry' : 'entries'}`;
  return `${String(filteredCount)}/${String(totalCount)} ${filteredCount === 1 ? 'match' : 'matches'}`;
}

function clean(value: string): string {
  return sanitizeTerminalText(value).text.replace(/\s*\n\s*/gu, ' ');
}

function searchPickerSource(
  renderNode: SearchPickerNode,
  label: string,
  role: FrameCellSource['cellRole'] = 'text',
  id: string | undefined = renderNode.id,
  itemIndex?: number,
  state?: import('../../element/metadata.ts').ElementVisualState
): FrameCellSource {
  return renderNodeFrameSource(renderNode, {
    rendererFamily: 'command',
    cellRole: role,
    partName: label,
    ...(id === undefined || id === renderNode.id ? {} : { itemId: id }),
    ...(itemIndex === undefined ? {} : { itemIndex }),
    ...(isFrameCellInteractionState(state) ? { interactionState: state } : {}),
    description: label
  });
}

function searchPickerEntryTargetId(renderNode: SearchPickerNode, entryId: string): string {
  return renderNodeTargetId(renderNode, entryId);
}

type SearchPickerNode<TMessage = unknown> = RenderNodeOfKind<TMessage, 'searchPicker'>;
