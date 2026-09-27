import { isNonArrayObject } from '../../foundation/validation.ts';
import {
  decodeSelectionState,
  type CollectionInteractionState,
  type SelectionState,
} from '../../interaction/collection-interaction.ts';
import { optionalString } from './input-control-helpers.ts';

export function decodeChoiceState(
  value: unknown,
  expectedMode: 'single' | 'multiple',
  owner: string,
  itemIds: readonly string[],
): CollectionInteractionState {
  if (!isNonArrayObject(value)) {
    throw new TypeError(`${owner} state must contain collection interaction state.`);
  }
  const activeId = optionalString(value['activeId'], `${owner} activeId`);
  const selection = decodeSelectionState(value['selection'], `${owner} selection`);
  if (selection.mode !== expectedMode) {
    throw new TypeError(`${owner} selection mode must be ${expectedMode}.`);
  }
  const referencedIds = [
    ...(activeId === undefined ? [] : [activeId]),
    ...choiceSelectedIds(selection),
    ...(selection.mode === 'multiple' && selection.anchorId !== undefined
      ? [selection.anchorId]
      : []),
  ];
  if (referencedIds.some((id) => !itemIds.includes(id))) {
    throw new RangeError(`${owner} interaction must reference an existing item.`);
  }
  return {
    ...(activeId === undefined ? {} : { activeId }),
    selection,
  };
}

export function choiceSelectedIds(selection: SelectionState): readonly string[] {
  if (selection.mode === 'none') return [];
  return selection.mode === 'single'
    ? selection.selectedId === undefined ? [] : [selection.selectedId]
    : selection.selectedIds;
}

export function isChoiceSelected(selection: SelectionState, id: string): boolean {
  return choiceSelectedIds(selection).includes(id);
}
