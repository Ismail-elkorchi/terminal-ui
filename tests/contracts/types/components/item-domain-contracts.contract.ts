import type {
  ChoiceItem,
  MenuActionItem,
  MenuCheckItem,
  MenuItem,
  MenuSubmenuItem,
  SearchEntry,
  SuggestionItem,
  TreeNode
} from '@ismail-elkorchi/terminal-ui/components';

const choice: ChoiceItem<number> = { id: 'one', label: 'One', value: 1 };
const action: MenuActionItem = { kind: 'action', id: 'open', label: 'Open' };
const check: MenuCheckItem = { kind: 'check', id: 'autosave', label: 'Autosave', checked: true };
const submenu: MenuSubmenuItem = { kind: 'submenu', id: 'file', label: 'File', children: [action] };
const menuItems: readonly MenuItem[] = [action, check, submenu];
const suggestion: SuggestionItem = { value: '/open', label: 'Open' };
const search: SearchEntry<number> = {
  id: 'file', label: 'File', value: 1, keywords: ['open']
};
const tree: TreeNode = { id: 'src', label: 'src', kind: 'branch', expanded: true, children: [] };
void [choice, menuItems, suggestion, search, tree];

// @ts-expect-error check items require explicit checked state
const invalidCheck: MenuCheckItem = { kind: 'check', id: 'bad-check', label: 'Bad' };
// @ts-expect-error submenus must contain at least one structural child
const invalidSubmenu: MenuSubmenuItem = { kind: 'submenu', id: 'empty', label: 'Empty', children: [] };
// @ts-expect-error action items cannot carry submenu children
const invalidAction: MenuActionItem = { kind: 'action', id: 'bad-action', label: 'Bad', children: [action] };
void [invalidCheck, invalidSubmenu, invalidAction];

// @ts-expect-error action items do not become values implicitly
const invalidChoice: ChoiceItem<number> = action;
void invalidChoice;
