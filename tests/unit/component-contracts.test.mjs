import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('public item contracts stay narrow instead of collapsing into one universal item', async () => {
  const contracts = await readFile(new URL('../../src/components/contracts.ts', import.meta.url), 'utf8');
  const types = await readFile(new URL('../../src/components/types.ts', import.meta.url), 'utf8');

  assert.match(contracts, /export interface ItemBase[\s\S]*readonly id: string;[\s\S]*readonly label: string;[\s\S]*readonly description\?: string;[\s\S]*readonly disabled\?: boolean;/u);
  assert.match(contracts, /export interface ChoiceItem<TValue = string> extends ItemBase[\s\S]*readonly value: TValue;/u);
  assert.match(contracts, /export interface ActionItem<TMessage = never> extends ItemBase[\s\S]*readonly onPress\?: TMessage;[\s\S]*readonly shortcut\?: string;[\s\S]*readonly tone\?: ComponentActionTone;/u);
  assert.match(contracts, /export interface NavigationItem<TMessage = never> extends ItemBase[\s\S]*readonly onSelect\?: TMessage;/u);
  assert.match(contracts, /export interface HierarchyItem<TNode>[\s\S]*readonly children\?: readonly TNode\[\];[\s\S]*readonly expanded\?: boolean;/u);
  assert.match(contracts, /export interface SuggestionItem<TValue = string>[\s\S]*readonly value: TValue;[\s\S]*readonly label\?: string;[\s\S]*readonly description\?: string;[\s\S]*readonly disabled\?: boolean;/u);
  assert.match(contracts, /export interface SearchEntry<TValue = string> extends ChoiceItem<TValue>[\s\S]*readonly group\?: string;[\s\S]*readonly keywords\?: readonly string\[\];[\s\S]*readonly preview\?: string;/u);
  assert.match(contracts, /export interface TreeItemBase<TNode> extends ItemBase, HierarchyItem<TNode> \{\}/u);
  assert.doesNotMatch(contracts, /WidgetValueItem|UniversalItem|BaseSelectable/u);

  assert.doesNotMatch(types, /export type (?:FormOption|MenuItemTone|HelpBinding|ActivityIndicatorStatus|StructuredBlockStatus|StructuredBlockField|CommandBarSuggestion|CommandBarValidationTone|PaletteEntry)\b/u);
  assert.doesNotMatch(types, /export type Widget(?:ChoiceItem|ActionTone|KeyBinding|ProcessStatus|RecordStatus|FieldItem|SuggestionItem|ValidationTone|SearchEntry)[\s\S]*=\s*Widget/u);
  assert.match(types, /readonly options: readonly ChoiceItem<TValue>\[\];/u);
  assert.match(types, /export interface DatePickerDay<TValue = string> extends ChoiceItem<TValue>/u);
  assert.match(types, /export interface MenuItem<TMessage = never> extends ActionItem<TMessage>, HierarchyItem<MenuItem<TMessage>>/u);
  assert.match(types, /export interface TabItem<TMessage = never> extends NavigationItem<TMessage>/u);
  assert.match(types, /readonly bindings: readonly HelpBinding\[\];/u);
  assert.match(types, /export interface NotificationItem extends TitledItem/u);
  assert.match(types, /readonly fields\?: readonly FieldItem\[\];/u);
  assert.match(types, /readonly suggestions\?: readonly SuggestionItem\[\];/u);
  assert.match(types, /readonly entries: readonly SearchEntry<TValue>\[\];/u);

  const treeNode = sliceBetween(types, 'export interface TreeNode', 'export interface TreeOptions');
  assert.doesNotMatch(treeNode, /readonly disabled\?: boolean;/u);

  const menuItem = sliceBetween(types, 'export interface MenuItem', 'export interface MenuOptions');
  assert.doesNotMatch(menuItem, /readonly children\?: readonly MenuItem/u);
  assert.doesNotMatch(menuItem, /readonly expanded\?: boolean;/u);
});

function sliceBetween(source, start, end) {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex);
  assert.notEqual(startIndex, -1, start);
  assert.notEqual(endIndex, -1, end);
  return source.slice(startIndex, endIndex);
}
