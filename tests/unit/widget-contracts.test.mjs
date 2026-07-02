import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('public item contracts stay narrow instead of collapsing into one universal item', async () => {
  const contracts = await readFile(new URL('../../src/widgets/contracts.ts', import.meta.url), 'utf8');
  const types = await readFile(new URL('../../src/widgets/types.ts', import.meta.url), 'utf8');

  assert.match(contracts, /export interface WidgetItemBase[\s\S]*readonly id: string;[\s\S]*readonly label: string;[\s\S]*readonly description\?: string;[\s\S]*readonly disabled\?: boolean;/u);
  assert.match(contracts, /export interface WidgetChoiceItem<TValue = string> extends WidgetItemBase[\s\S]*readonly value: TValue;/u);
  assert.match(contracts, /export interface WidgetActionItem<TMessage = never> extends WidgetItemBase[\s\S]*readonly message\?: TMessage;[\s\S]*readonly shortcut\?: string;[\s\S]*readonly tone\?: WidgetActionTone;/u);
  assert.match(contracts, /export interface WidgetNavigationItem<TMessage = never> extends WidgetItemBase[\s\S]*readonly message\?: TMessage;/u);
  assert.match(contracts, /export interface WidgetHierarchyItem<TNode>[\s\S]*readonly children\?: readonly TNode\[\];[\s\S]*readonly expanded\?: boolean;/u);
  assert.match(contracts, /export interface WidgetSuggestionItem<TValue = string>[\s\S]*readonly value: TValue;[\s\S]*readonly label\?: string;[\s\S]*readonly description\?: string;[\s\S]*readonly disabled\?: boolean;/u);
  assert.match(contracts, /export interface WidgetSearchEntry<TValue = string> extends WidgetChoiceItem<TValue>[\s\S]*readonly group\?: string;[\s\S]*readonly keywords\?: readonly string\[\];[\s\S]*readonly preview\?: string;/u);
  assert.match(contracts, /export interface WidgetTreeItem<TNode> extends WidgetItemBase, WidgetHierarchyItem<TNode> \{\}/u);
  assert.doesNotMatch(contracts, /WidgetValueItem|UniversalItem|BaseSelectable/u);

  assert.match(types, /export type FormOption<TValue = string> = WidgetChoiceItem<TValue>;/u);
  assert.match(types, /export interface DatePickerDay<TValue = string> extends WidgetChoiceItem<TValue>/u);
  assert.match(types, /export interface MenuItem<TMessage = never> extends WidgetActionItem<TMessage>, WidgetHierarchyItem<MenuItem<TMessage>>/u);
  assert.match(types, /export type CommandBarSuggestion = WidgetSuggestionItem;/u);
  assert.match(types, /export type PaletteEntry<TValue = string> = WidgetSearchEntry<TValue>;/u);
  assert.match(types, /export interface TabItem<TMessage = never> extends WidgetNavigationItem<TMessage>/u);
  assert.match(types, /export type HelpBinding = WidgetKeyBinding;/u);
  assert.match(types, /export interface NotificationItem extends WidgetTitledItem/u);
  assert.match(types, /export type StructuredBlockField = WidgetFieldItem;/u);

  const treeNode = sliceBetween(types, 'export interface TreeNode', 'export interface TreeWidgetOptions');
  assert.doesNotMatch(treeNode, /readonly disabled\?: boolean;/u);

  const menuItem = sliceBetween(types, 'export interface MenuItem', 'export interface MenuWidgetOptions');
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
