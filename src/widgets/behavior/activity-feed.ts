import { sanitizeTerminalText } from '../../text/index.ts';
import type { StructuredBlock, StructuredBlockStatus } from '../types.ts';

export interface ActivityFeedState {
  readonly selected?: number;
  readonly expandedIds: readonly string[];
  readonly collapsedIds: readonly string[];
  readonly statusFilter?: readonly StructuredBlockStatus[];
}

export type ActivityFeedAction =
  | { readonly kind: 'select'; readonly index: number }
  | { readonly kind: 'selectNext' }
  | { readonly kind: 'selectPrevious' }
  | { readonly kind: 'toggleBlock'; readonly id?: string }
  | { readonly kind: 'expandBlock'; readonly id?: string }
  | { readonly kind: 'collapseBlock'; readonly id?: string }
  | { readonly kind: 'setStatusFilter'; readonly statuses?: readonly StructuredBlockStatus[] }
  | { readonly kind: 'jumpToFirstProblem' };

export interface ActivityFeedReducerOptions {
  readonly blocks?: readonly StructuredBlock[];
}

export interface ActivityFeedVisibleBlock {
  readonly block: StructuredBlock;
  readonly index: number;
}

const problemStatuses: readonly StructuredBlockStatus[] = ['error', 'failed', 'warning'];

export function activityFeedReducer(
  state: ActivityFeedState,
  action: ActivityFeedAction,
  options: ActivityFeedReducerOptions = {}
): ActivityFeedState {
  const blocks = options.blocks ?? [];
  switch (action.kind) {
    case 'select':
      return withSelected(state, boundedBlockIndex(action.index, blocks.length));
    case 'selectNext':
      return withSelected(state, adjacentVisibleIndex(state, blocks, 1));
    case 'selectPrevious':
      return withSelected(state, adjacentVisibleIndex(state, blocks, -1));
    case 'toggleBlock': {
      const id = action.id ?? selectedBlockId(state, blocks);
      return id === undefined ? state : toggleBlock(state, id);
    }
    case 'expandBlock': {
      const id = action.id ?? selectedBlockId(state, blocks);
      return id === undefined ? state : setBlockCollapsed(state, id, false);
    }
    case 'collapseBlock': {
      const id = action.id ?? selectedBlockId(state, blocks);
      return id === undefined ? state : setBlockCollapsed(state, id, true);
    }
    case 'setStatusFilter':
      return withStatusFilter(state, action.statuses, blocks);
    case 'jumpToFirstProblem':
      return withSelected(state, firstStatusIndex(blocks, problemStatuses) ?? state.selected);
  }
}

export function visibleActivityFeedBlocks(
  blocks: readonly StructuredBlock[],
  state: Pick<ActivityFeedState, 'expandedIds' | 'collapsedIds' | 'statusFilter'>
): readonly ActivityFeedVisibleBlock[] {
  return blocks.flatMap((block, index): readonly ActivityFeedVisibleBlock[] => {
    if (!matchesStatusFilter(block, state.statusFilter)) return [];
    return [{
      index,
      block: {
        ...block,
        collapsed: activityBlockCollapsed(block, state)
      }
    }];
  });
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
  state: Pick<ActivityFeedState, 'expandedIds' | 'collapsedIds' | 'statusFilter'>
): string {
  return visibleActivityFeedBlocks(blocks, state).flatMap(({ block }) => blockTextLines(block)).join('\n');
}

function adjacentVisibleIndex(state: ActivityFeedState, blocks: readonly StructuredBlock[], direction: 1 | -1): number | undefined {
  const visible = visibleActivityFeedBlocks(blocks, state);
  if (visible.length === 0) return undefined;
  const selected = state.selected ?? visible[0]?.index ?? 0;
  const visibleIndex = Math.max(0, visible.findIndex((entry) => entry.index === selected));
  return visible[wrapIndex(visibleIndex + direction, visible.length)]?.index;
}

function firstVisibleIndex(blocks: readonly StructuredBlock[], state: ActivityFeedState): number | undefined {
  return visibleActivityFeedBlocks(blocks, state)[0]?.index;
}

function firstStatusIndex(
  blocks: readonly StructuredBlock[],
  statuses: readonly StructuredBlockStatus[]
): number | undefined {
  const index = blocks.findIndex((block) => block.status !== undefined && statuses.includes(block.status));
  return index === -1 ? undefined : index;
}

function matchesStatusFilter(block: StructuredBlock, statuses: readonly StructuredBlockStatus[] | undefined): boolean {
  return statuses === undefined || statuses.length === 0 || (block.status !== undefined && statuses.includes(block.status));
}

function selectedBlockId(state: ActivityFeedState, blocks: readonly StructuredBlock[]): string | undefined {
  const selected = state.selected === undefined ? undefined : blocks[boundedBlockIndex(state.selected, blocks.length)];
  return selected?.id;
}

function toggleBlock(state: ActivityFeedState, id: string): ActivityFeedState {
  if (state.expandedIds.includes(id)) return setBlockCollapsed(state, id, true);
  if (state.collapsedIds.includes(id)) return setBlockCollapsed(state, id, false);
  return setBlockCollapsed(state, id, true);
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

function withStatusFilter(
  state: ActivityFeedState,
  statuses: readonly StructuredBlockStatus[] | undefined,
  blocks: readonly StructuredBlock[]
): ActivityFeedState {
  if (statuses === undefined || statuses.length === 0) {
    const rest = withSelected({
      expandedIds: state.expandedIds,
      collapsedIds: state.collapsedIds
    }, state.selected);
    return withSelected(rest, firstVisibleIndex(blocks, rest));
  }
  return withSelected({ ...state, statusFilter: statuses }, firstVisibleIndex(blocks, { ...state, statusFilter: statuses }));
}

function withSelected(state: ActivityFeedState | Omit<ActivityFeedState, 'selected'>, selected: number | undefined): ActivityFeedState {
  const rest = {
    expandedIds: state.expandedIds,
    collapsedIds: state.collapsedIds,
    ...(state.statusFilter === undefined ? {} : { statusFilter: state.statusFilter })
  };
  return selected === undefined ? rest : { ...rest, selected };
}

function blockTextLines(block: StructuredBlock): readonly string[] {
  const lines = [
    block.status === undefined ? block.title : `[${block.status}] ${block.title}`,
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

function boundedBlockIndex(index: number, length: number): number {
  const current = Math.max(0, Math.floor(Number.isFinite(index) ? index : 0));
  return length <= 0 ? current : Math.min(length - 1, current);
}

function wrapIndex(index: number, length: number): number {
  return ((index % length) + length) % length;
}
