import { createControlKeymap } from '../interaction/control-keymap.ts';
import type { ControlKeymap, ControlKeymapDefaults, ControlKeymapOverrides } from '../interaction/control-keymap.ts';
import type { KeyboardBinding } from '../interaction/key-binding.ts';
import type { BindableKeyName, KeyModifierTrigger } from '../input/types.ts';

const key = (name: BindableKeyName, modifiers?: KeyModifierTrigger): KeyboardBinding => ({
  kind: 'key', key: name, ...(modifiers === undefined ? {} : { modifiers }),
});
const repeating = (...bindings: readonly KeyboardBinding[]): readonly KeyboardBinding[] =>
  bindings.flatMap((binding) => [binding, { ...binding, eventType: 'repeat' as const }]);
const action = (label: string, ...bindings: readonly KeyboardBinding[]) => ({ label, bindings });

const listboxDefaults: ControlKeymapDefaults<ListboxKeyAction> = {
  previous: action('Previous item', ...repeating(key('arrowUp'))),
  next: action('Next item', ...repeating(key('arrowDown'))),
  previousPage: action('Previous page', ...repeating(key('pageUp'))),
  nextPage: action('Next page', ...repeating(key('pageDown'))),
  first: action('First item', ...repeating(key('home'))),
  last: action('Last item', ...repeating(key('end'))),
  select: action('Select item', key('space')),
  activate: action('Activate item', key('enter')),
};
export type ListboxKeyAction = 'previous' | 'next' | 'previousPage' | 'nextPage' | 'first' | 'last' | 'select' | 'activate';
export function createListboxKeymap(overrides?: ControlKeymapOverrides<ListboxKeyAction>): ControlKeymap<ListboxKeyAction> {
  return createControlKeymap(listboxDefaults, overrides);
}

const treeDefaults: ControlKeymapDefaults<TreeKeyAction> = {
  previous: listboxDefaults.previous,
  next: listboxDefaults.next,
  expand: action('Expand item', ...repeating(key('arrowRight'))),
  collapse: action('Collapse item', ...repeating(key('arrowLeft'))),
  select: listboxDefaults.select,
  activate: listboxDefaults.activate,
};
export type TreeKeyAction = 'previous' | 'next' | 'expand' | 'collapse' | 'select' | 'activate';
export function createTreeKeymap(overrides?: ControlKeymapOverrides<TreeKeyAction>): ControlKeymap<TreeKeyAction> {
  return createControlKeymap(treeDefaults, overrides);
}

const textDefaults: ControlKeymapDefaults<TextEditingKeyAction> = {
  moveLeft: action('Move left', ...repeating(key('arrowLeft'))),
  moveRight: action('Move right', ...repeating(key('arrowRight'))),
  moveHome: action('Line start', ...repeating(key('home'))),
  moveEnd: action('Line end', ...repeating(key('end'))),
  selectLeft: action('Select left', ...repeating(key('arrowLeft', { shift: true }))),
  selectRight: action('Select right', ...repeating(key('arrowRight', { shift: true }))),
  selectHome: action('Select to line start', ...repeating(key('home', { shift: true }))),
  selectEnd: action('Select to line end', ...repeating(key('end', { shift: true }))),
  moveWordLeft: action('Previous word', ...repeating(key('arrowLeft', { ctrl: true }), key('arrowLeft', { alt: true }))),
  moveWordRight: action('Next word', ...repeating(key('arrowRight', { ctrl: true }), key('arrowRight', { alt: true }))),
  selectWordLeft: action('Select previous word', ...repeating(key('arrowLeft', { ctrl: true, shift: true }), key('arrowLeft', { alt: true, shift: true }))),
  selectWordRight: action('Select next word', ...repeating(key('arrowRight', { ctrl: true, shift: true }), key('arrowRight', { alt: true, shift: true }))),
  selectAll: action('Select all', key('a', { ctrl: true })),
  deleteBackward: action('Delete previous character', ...repeating(key('backspace'))),
  deleteForward: action('Delete next character', ...repeating(key('delete'))),
  deleteWordBackward: action('Delete previous word', ...repeating(key('backspace', { ctrl: true }), key('backspace', { alt: true }))),
  deleteWordForward: action('Delete next word', ...repeating(key('delete', { ctrl: true }), key('delete', { alt: true }))),
};
export type TextEditingKeyAction = 'moveLeft' | 'moveRight' | 'moveHome' | 'moveEnd'
  | 'selectLeft' | 'selectRight' | 'selectHome' | 'selectEnd'
  | 'moveWordLeft' | 'moveWordRight' | 'selectWordLeft' | 'selectWordRight'
  | 'selectAll' | 'deleteBackward' | 'deleteForward' | 'deleteWordBackward' | 'deleteWordForward';
const textInputDefaults: ControlKeymapDefaults<TextInputKeyAction> = { ...textDefaults, submit: action('Submit', key('enter')) };
export type TextInputKeyAction = TextEditingKeyAction | 'submit';
export function createTextInputKeymap(overrides?: ControlKeymapOverrides<TextInputKeyAction>): ControlKeymap<TextInputKeyAction> {
  return createControlKeymap(textInputDefaults, overrides);
}

const searchPickerDefaults: ControlKeymapDefaults<SearchPickerKeyAction> = {
  ...textDefaults,
  previous: listboxDefaults.previous,
  next: listboxDefaults.next,
  undo: action('Undo', key('z', { ctrl: true })),
  redo: action('Redo', key('y', { ctrl: true })),
  accept: action('Accept result', key('enter')),
};
export type SearchPickerKeyAction = TextEditingKeyAction | 'previous' | 'next' | 'undo' | 'redo' | 'accept';
export function createSearchPickerKeymap(overrides?: ControlKeymapOverrides<SearchPickerKeyAction>): ControlKeymap<SearchPickerKeyAction> {
  return createControlKeymap(searchPickerDefaults, overrides);
}

const textAreaDefaults: ControlKeymapDefaults<TextAreaKeyAction> = {
  ...textDefaults,
  moveLineUp: action('Previous visual line', ...repeating(key('arrowUp'))),
  moveLineDown: action('Next visual line', ...repeating(key('arrowDown'))),
  selectLineUp: action('Select previous visual line', ...repeating(key('arrowUp', { shift: true }))),
  selectLineDown: action('Select next visual line', ...repeating(key('arrowDown', { shift: true }))),
  previousPage: action('Previous page', ...repeating(key('pageUp'))),
  nextPage: action('Next page', ...repeating(key('pageDown'))),
  selectPreviousPage: action('Select previous page', ...repeating(key('pageUp', { shift: true }))),
  selectNextPage: action('Select next page', ...repeating(key('pageDown', { shift: true }))),
  moveDocumentStart: action('Document start', key('home', { ctrl: true })),
  moveDocumentEnd: action('Document end', key('end', { ctrl: true })),
  selectDocumentStart: action('Select to document start', key('home', { ctrl: true, shift: true })),
  selectDocumentEnd: action('Select to document end', key('end', { ctrl: true, shift: true })),
  undo: searchPickerDefaults.undo,
  redo: action('Redo', key('y', { ctrl: true }), key('z', { ctrl: true, shift: true })),
  newline: action('Insert newline', key('enter')),
};
export type TextAreaKeyAction = TextEditingKeyAction | 'moveLineUp' | 'moveLineDown' | 'selectLineUp' | 'selectLineDown'
  | 'previousPage' | 'nextPage' | 'selectPreviousPage' | 'selectNextPage'
  | 'moveDocumentStart' | 'moveDocumentEnd' | 'selectDocumentStart' | 'selectDocumentEnd'
  | 'undo' | 'redo' | 'newline';
export function createTextAreaKeymap(overrides?: ControlKeymapOverrides<TextAreaKeyAction>): ControlKeymap<TextAreaKeyAction> {
  return createControlKeymap(textAreaDefaults, overrides);
}


const dataGridDefaults: ControlKeymapDefaults<DataGridKeyAction> = {
  previousRow: listboxDefaults.previous,
  nextRow: listboxDefaults.next,
  previousColumn: action('Previous column', ...repeating(key('arrowLeft'))),
  nextColumn: action('Next column', ...repeating(key('arrowRight'))),
  previousPage: listboxDefaults.previousPage,
  nextPage: listboxDefaults.nextPage,
  firstRow: listboxDefaults.first,
  lastRow: listboxDefaults.last,
  select: listboxDefaults.select,
  activate: listboxDefaults.activate,
  sort: action('Sort column', key('s', { alt: true })),
  shrinkColumn: action('Shrink column', key('arrowLeft', { alt: true })),
  growColumn: action('Grow column', key('arrowRight', { alt: true })),
};
export type DataGridKeyAction = 'previousRow' | 'nextRow' | 'previousColumn' | 'nextColumn'
  | 'previousPage' | 'nextPage' | 'firstRow' | 'lastRow' | 'select' | 'activate'
  | 'sort' | 'shrinkColumn' | 'growColumn';
export function createDataGridKeymap(overrides?: ControlKeymapOverrides<DataGridKeyAction>): ControlKeymap<DataGridKeyAction> {
  return createControlKeymap(dataGridDefaults, overrides);
}
