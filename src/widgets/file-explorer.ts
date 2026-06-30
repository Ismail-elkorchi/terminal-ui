import type { LayoutSize } from '../tui/regions.ts';
import type { ScrollState } from '../tui/scroll.ts';
import type { ScrollbarOptions } from '../tui/scrollbar.ts';
import {
  button,
  field,
  inputField,
  modal,
  row,
  splitPane,
  stack,
  surface,
  text,
  tree
} from './factories.ts';
import type {
  AccessibleNodeDefinition,
  Widget,
  WidgetChildren,
  WidgetInputMap,
  WidgetKeyMap,
  TreeNode
} from './types.ts';

export type FileExplorerEntryKind = 'file' | 'directory' | 'symlink' | 'other';

export interface FileExplorerEntry {
  readonly id: string;
  readonly name: string;
  readonly path: string;
  readonly kind: FileExplorerEntryKind;
  readonly children?: readonly FileExplorerEntry[];
  readonly expanded?: boolean;
  readonly disabled?: boolean;
  readonly lazy?: boolean;
  readonly lazyStatus?: 'pending' | 'error' | 'empty';
  readonly lazyMessage?: string;
  readonly icon?: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface FileExplorerBreadcrumb {
  readonly id: string;
  readonly label: string;
  readonly path: string;
  readonly kind: FileExplorerEntryKind;
}

export interface FileExplorerWidgetOptions<TMessage = never> {
  readonly id?: string;
  readonly entries: readonly FileExplorerEntry[];
  readonly selected?: string;
  readonly filterQuery?: string;
  readonly scroll?: ScrollState;
  readonly scrollbar?: ScrollbarOptions;
  readonly emptyText?: string;
  readonly preview?: WidgetChildren<TMessage>;
  readonly previewSize?: LayoutSize;
  readonly toMessage?: (entry: FileExplorerEntry) => TMessage;
  readonly keyMap?: WidgetKeyMap<TMessage>;
  readonly accessibility?: AccessibleNodeDefinition;
}

export interface FileDialogOptions<TMessage = never> extends FileExplorerWidgetOptions<TMessage> {
  readonly title?: string;
  readonly width?: number;
  readonly height?: number;
  readonly zIndex?: number;
  readonly filterLabel?: string;
  readonly filterValue?: string;
  readonly filterInputMap?: WidgetInputMap<TMessage>;
  readonly confirmLabel?: string;
  readonly confirmMessage?: TMessage;
  readonly cancelLabel?: string;
  readonly cancelMessage?: TMessage;
}

export function fileExplorer<TMessage>(options: FileExplorerWidgetOptions<TMessage>): Widget<TMessage> {
  const selected = selectedEntry(options.entries, options.selected);
  const breadcrumbs = fileExplorerBreadcrumbs(options.entries, selected?.id);
  const explorerTree = tree({
    id: childId(options.id, 'tree'),
    nodes: fileExplorerEntriesToTreeNodes(options.entries),
    ...(options.selected === undefined ? {} : { selected: options.selected }),
    ...(options.filterQuery === undefined ? {} : { filterQuery: options.filterQuery }),
    ...(options.scroll === undefined ? {} : { scroll: options.scroll }),
    ...(options.scrollbar === undefined ? {} : { scrollbar: options.scrollbar }),
    emptyText: options.emptyText ?? 'No files',
    ...(options.toMessage === undefined
      ? {}
      : {
          toMessage: (node: TreeNode): TMessage => options.toMessage?.(treeNodeEntry(node)) as TMessage
        }),
    ...(options.keyMap === undefined ? {} : { keyMap: options.keyMap }),
    ...(options.accessibility === undefined ? {} : { accessibility: options.accessibility })
  });
  const body = stack<TMessage>([
    breadcrumbRow<TMessage>(breadcrumbs, childId(options.id, 'breadcrumbs')),
    explorerTree
  ], {
    id: childId(options.id, 'body'),
    gap: 1
  });
  if (options.preview === undefined) return body;
  return splitPane<TMessage>([
    body,
    surface<TMessage>(stack<TMessage>(childrenArray(options.preview), {
      id: childId(options.id, 'preview-content')
    }), {
      id: childId(options.id, 'preview'),
      label: selected === undefined ? 'Preview' : selected.name,
      variant: 'inset',
      border: { kind: 'single', title: 'Preview' }
    })
  ], {
    ...(options.id === undefined ? {} : { id: options.id }),
    direction: 'horizontal',
    sizes: [{ kind: 'fill' }, options.previewSize ?? { kind: 'fixed', cells: 34 }],
    gap: 1
  });
}

export function fileDialog<TMessage>(options: FileDialogOptions<TMessage>): Widget<TMessage> {
  const filter = options.filterInputMap === undefined
    ? undefined
    : field(inputField({
      id: childId(options.id, 'filter-input'),
      value: options.filterValue ?? options.filterQuery ?? '',
      inputMap: options.filterInputMap
    }), {
      id: childId(options.id, 'filter'),
      label: options.filterLabel ?? 'Filter'
    });
  const content = [
    ...(filter === undefined ? [] : [filter]),
    fileExplorer(options),
    actionRow(options)
  ];
  const sizes: LayoutSize[] = [
    ...(filter === undefined ? [] : [{ kind: 'fixed', cells: 3 } satisfies LayoutSize]),
    { kind: 'fill' },
    { kind: 'fixed', cells: 1 }
  ];
  return modal<TMessage>(stack<TMessage>([
    splitPane<TMessage>(content, {
      id: childId(options.id, 'layout'),
      direction: 'vertical',
      sizes,
      gap: 1
    })
  ], {
    id: childId(options.id, 'content'),
    padding: 1
  }), {
    ...(options.id === undefined ? {} : { id: options.id }),
    title: options.title ?? 'Select file',
    ...(options.width === undefined ? {} : { width: options.width }),
    ...(options.height === undefined ? {} : { height: options.height }),
    ...(options.zIndex === undefined ? {} : { zIndex: options.zIndex }),
    ...(options.keyMap === undefined ? {} : { keyMap: options.keyMap }),
    ...(options.accessibility === undefined ? {} : { accessibility: options.accessibility })
  });
}

export function fileExplorerEntriesToTreeNodes(entries: readonly FileExplorerEntry[]): readonly TreeNode[] {
  return entries.map((entry) => ({
    id: entry.id,
    label: entry.name,
    icon: entry.icon ?? defaultIcon(entry.kind),
    ...(entry.children === undefined ? {} : { children: fileExplorerEntriesToTreeNodes(entry.children) }),
    ...(entry.expanded === undefined ? {} : { expanded: entry.expanded }),
    ...(entry.disabled === undefined ? {} : { disabled: entry.disabled }),
    ...(entry.lazy === undefined ? {} : { lazy: entry.lazy }),
    ...(entry.lazyStatus === undefined ? {} : { lazyStatus: entry.lazyStatus }),
    ...(entry.lazyMessage === undefined ? {} : { lazyMessage: entry.lazyMessage }),
    metadata: {
      ...(entry.metadata ?? {}),
      path: entry.path,
      kind: entry.kind,
      name: entry.name
    }
  }));
}

export function fileExplorerBreadcrumbs(
  entries: readonly FileExplorerEntry[],
  selectedId: string | undefined
): readonly FileExplorerBreadcrumb[] {
  if (selectedId === undefined) return [];
  return findBreadcrumbs(entries, selectedId) ?? [];
}

function actionRow<TMessage>(options: FileDialogOptions<TMessage>): Widget<TMessage> {
  const actions = [
    ...(options.cancelMessage === undefined
      ? []
      : [
          button({
            id: childId(options.id, 'cancel'),
            label: options.cancelLabel ?? 'Cancel',
            message: options.cancelMessage
          })
        ]),
    ...(options.confirmMessage === undefined
      ? []
      : [
          button({
            id: childId(options.id, 'confirm'),
            label: options.confirmLabel ?? 'Open',
            message: options.confirmMessage
          })
        ])
  ];
  return row(actions, {
    id: childId(options.id, 'actions'),
    gap: 1,
    align: 'end'
  });
}

function breadcrumbRow<TMessage>(
  breadcrumbs: readonly FileExplorerBreadcrumb[],
  id: string
): Widget<TMessage> {
  if (breadcrumbs.length === 0) return text('No selection', { id });
  return row(breadcrumbs.flatMap((part, index): readonly Widget<TMessage>[] => [
    ...(index === 0 ? [] : [text('/', { id: `${id}:separator:${String(index)}` })]),
    text(part.label, { id: `${id}:${part.id}` })
  ]), {
    id,
    gap: 1
  });
}

function findBreadcrumbs(
  entries: readonly FileExplorerEntry[],
  selectedId: string
): readonly FileExplorerBreadcrumb[] | undefined {
  for (const entry of entries) {
    const current = {
      id: entry.id,
      label: entry.name,
      path: entry.path,
      kind: entry.kind
    };
    if (entry.id === selectedId) return [current];
    const childPath = entry.children === undefined ? undefined : findBreadcrumbs(entry.children, selectedId);
    if (childPath !== undefined) return [current, ...childPath];
  }
  return undefined;
}

function selectedEntry(entries: readonly FileExplorerEntry[], selectedId: string | undefined): FileExplorerEntry | undefined {
  if (selectedId === undefined) return undefined;
  for (const entry of entries) {
    if (entry.id === selectedId) return entry;
    const child = entry.children === undefined ? undefined : selectedEntry(entry.children, selectedId);
    if (child !== undefined) return child;
  }
  return undefined;
}

function treeNodeEntry(node: TreeNode): FileExplorerEntry {
  const metadata = node.metadata ?? {};
  const kind = fileExplorerEntryKind(metadata['kind']);
  return {
    id: node.id,
    name: typeof metadata['name'] === 'string' ? metadata['name'] : node.label,
    path: typeof metadata['path'] === 'string' ? metadata['path'] : node.id,
    kind,
    ...(node.children === undefined ? {} : { children: node.children.map(treeNodeEntry) }),
    ...(node.expanded === undefined ? {} : { expanded: node.expanded }),
    ...(node.disabled === undefined ? {} : { disabled: node.disabled }),
    ...(node.lazy === undefined ? {} : { lazy: node.lazy }),
    ...(node.lazyStatus === undefined ? {} : { lazyStatus: node.lazyStatus }),
    ...(node.lazyMessage === undefined ? {} : { lazyMessage: node.lazyMessage }),
    ...(node.icon === undefined ? {} : { icon: node.icon }),
    metadata
  };
}

function fileExplorerEntryKind(value: unknown): FileExplorerEntryKind {
  return value === 'file' || value === 'directory' || value === 'symlink' || value === 'other' ? value : 'other';
}

function defaultIcon(kind: FileExplorerEntryKind): string {
  switch (kind) {
    case 'directory':
      return '▸';
    case 'symlink':
      return '↪';
    case 'file':
      return '·';
    case 'other':
      return '◇';
  }
}

function childrenArray<TMessage>(children: WidgetChildren<TMessage>): readonly Widget<TMessage>[] {
  return Array.isArray(children) ? [...children as readonly Widget<TMessage>[]] : [children as Widget<TMessage>];
}

function childId(id: string | undefined, suffix: string): string {
  return id === undefined ? suffix : `${id}:${suffix}`;
}
