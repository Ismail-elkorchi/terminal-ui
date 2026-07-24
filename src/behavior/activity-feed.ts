import { sanitizeTerminalText } from '../text/index.ts';
import type { StructuredBlock } from '../ui-model/documents.ts';
import type { ActivityFeedAction } from '../ui-model/activity-feed.ts';

export interface ActivityFeedState {
  readonly selectedId?: string;
  readonly expandedIds: readonly string[];
  readonly collapsedIds: readonly string[];
}

export interface ActivityFeedReducerOptions {
  readonly blocks?: readonly StructuredBlock[];
}

export interface ActivityFeedVisibleBlock {
  readonly block: StructuredBlock;
  readonly itemIndex: number;
}

export interface ActivityFeedPresentation {
  readonly blocks: readonly StructuredBlock[];
  readonly selectedId?: string;
}

export function activityFeedReducer(
  state: ActivityFeedState,
  action: ActivityFeedAction,
  options: ActivityFeedReducerOptions = {}
): ActivityFeedState {
  const blocks = options.blocks ?? [];
  switch (action.kind) {
    case 'select':
      return blocks.some((block) => block.id === action.id)
        ? withSelectedId(state, action.id)
        : state;
    case 'selectNext':
      return withSelectedId(state, adjacentBlockId(state, blocks, 1));
    case 'selectPrevious':
      return withSelectedId(state, adjacentBlockId(state, blocks, -1));
    case 'selectFirst':
      return withSelectedId(state, blocks[0]?.id);
    case 'selectLast':
      return withSelectedId(state, blocks.at(-1)?.id);
    case 'toggleBlock': {
      const id = action.id ?? selectedBlockId(state, blocks);
      const block = id === undefined ? undefined : blocks.find((item) => item.id === id);
      return block === undefined
        ? state
        : setBlockCollapsed(state, block.id, !activityBlockCollapsed(block, state));
    }
    case 'expandBlock': {
      const id = action.id ?? selectedBlockId(state, blocks);
      return id === undefined || !blocks.some((block) => block.id === id)
        ? state
        : setBlockCollapsed(state, id, false);
    }
    case 'collapseBlock': {
      const id = action.id ?? selectedBlockId(state, blocks);
      return id === undefined || !blocks.some((block) => block.id === id)
        ? state
        : setBlockCollapsed(state, id, true);
    }
  }
}

export function visibleActivityFeedBlocks(
  blocks: readonly StructuredBlock[],
  state: Pick<ActivityFeedState, 'expandedIds' | 'collapsedIds'>
): readonly ActivityFeedVisibleBlock[] {
  return blocks.map((block, itemIndex) => ({
    itemIndex,
    block: {
      ...block,
      collapsed: activityBlockCollapsed(block, state)
    }
  }));
}

export function activityFeedPresentation(
  blocks: readonly StructuredBlock[],
  state: ActivityFeedState
): ActivityFeedPresentation {
  return {
    blocks: visibleActivityFeedBlocks(blocks, state).map((entry) => entry.block),
    ...(state.selectedId === undefined ? {} : { selectedId: state.selectedId })
  };
}

export function activityBlockCollapsed(
  block: Pick<StructuredBlock, 'id' | 'collapsed'>,
  state: Pick<ActivityFeedState, 'expandedIds' | 'collapsedIds'>
): boolean {
  if (state.expandedIds.includes(block.id)) return false;
  if (state.collapsedIds.includes(block.id)) return true;
  return block.collapsed === true;
}

export function copyActivityFeedVisibleText(
  blocks: readonly StructuredBlock[],
  state: Pick<ActivityFeedState, 'expandedIds' | 'collapsedIds'>
): string {
  return visibleActivityFeedBlocks(blocks, state).flatMap(({ block }) => blockTextLines(block)).join('\n');
}

function adjacentBlockId(state: ActivityFeedState, blocks: readonly StructuredBlock[], direction: 1 | -1): string | undefined {
  if (blocks.length === 0) return undefined;
  const currentIndex = state.selectedId === undefined
    ? -1
    : blocks.findIndex((block) => block.id === state.selectedId);
  if (currentIndex < 0) return direction === 1 ? blocks[0]?.id : blocks.at(-1)?.id;
  return blocks[wrapIndex(currentIndex + direction, blocks.length)]?.id;
}

function selectedBlockId(state: ActivityFeedState, blocks: readonly StructuredBlock[]): string | undefined {
  return state.selectedId === undefined || !blocks.some((block) => block.id === state.selectedId)
    ? undefined
    : state.selectedId;
}

function setBlockCollapsed(state: ActivityFeedState, id: string, collapsed: boolean): ActivityFeedState {
  return collapsed
    ? {
        ...state,
        expandedIds: state.expandedIds.filter((current) => current !== id),
        collapsedIds: addUnique(state.collapsedIds, id)
      }
    : {
        ...state,
        expandedIds: addUnique(state.expandedIds, id),
        collapsedIds: state.collapsedIds.filter((current) => current !== id)
      };
}

function withSelectedId(state: ActivityFeedState, selectedId: string | undefined): ActivityFeedState {
  const rest = {
    expandedIds: state.expandedIds,
    collapsedIds: state.collapsedIds
  };
  return selectedId === undefined ? rest : { ...rest, selectedId };
}

function blockTextLines(block: StructuredBlock): readonly string[] {
  const classification = [block.result, block.level]
    .flatMap((value) => value === undefined ? [] : [`[${value}]`])
    .join(' ');
  const lines = [
    classification.length === 0 ? block.title : `${classification} ${block.title}`,
    block.summary,
    ...(block.fields ?? []).map((field) => `${field.label}: ${field.value}`),
    block.collapsed === true ? undefined : block.body,
    block.collapsed === true ? undefined : block.details
  ].filter((line): line is string => line !== undefined && line.length > 0);
  return lines.flatMap((line) => sanitizeTerminalText(line).text.split('\n'));
}

function addUnique(values: readonly string[], value: string): readonly string[] {
  return values.includes(value) ? values : [...values, value];
}

function wrapIndex(index: number, length: number): number {
  return ((index % length) + length) % length;
}
