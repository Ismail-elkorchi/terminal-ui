import type { BorderStyle } from '../tui/border.ts';
import type { LayoutInsetInput, LayoutSize } from '../tui/regions.ts';
import {
  box,
  button,
  menu,
  row,
  splitPane,
  stack,
  text
} from './factories.ts';
import type {
  AccessibleNodeDefinition,
  MenuItem,
  Widget,
  WidgetChildren,
  WidgetKeyMap
} from './types.ts';
import {
  navigationButton as visualNavigationButton,
  navigationSeparator,
  navigationStatus
} from './navigation-visual.ts';

export interface NavigationAction<TMessage = never> {
  readonly id: string;
  readonly label: string;
  readonly message?: TMessage;
  readonly disabled?: boolean;
}

export interface BreadcrumbOptions<TMessage = never> {
  readonly id?: string;
  readonly items: readonly NavigationAction<TMessage>[];
  readonly separator?: string;
  readonly keyMap?: WidgetKeyMap<TMessage>;
  readonly accessibility?: AccessibleNodeDefinition;
}

export interface CollapsibleSectionOptions<TMessage = never> {
  readonly id?: string;
  readonly title: string;
  readonly body: WidgetChildren<TMessage>;
  readonly expanded: boolean;
  readonly message?: TMessage;
  readonly disabled?: boolean;
  readonly border?: BorderStyle;
  readonly padding?: LayoutInsetInput;
  readonly keyMap?: WidgetKeyMap<TMessage>;
  readonly accessibility?: AccessibleNodeDefinition;
}

export interface AccordionItem<TMessage = never> {
  readonly id: string;
  readonly title: string;
  readonly body: WidgetChildren<TMessage>;
  readonly expanded?: boolean;
  readonly message?: TMessage;
  readonly disabled?: boolean;
}

export interface AccordionOptions<TMessage = never> {
  readonly id?: string;
  readonly items: readonly AccordionItem<TMessage>[];
  readonly border?: BorderStyle;
  readonly padding?: LayoutInsetInput;
  readonly gap?: number;
  readonly keyMap?: WidgetKeyMap<TMessage>;
  readonly accessibility?: AccessibleNodeDefinition;
}

export interface CarouselItem<TMessage = never> {
  readonly id: string;
  readonly label: string;
  readonly body: Widget<TMessage>;
  readonly disabled?: boolean;
  readonly message?: TMessage;
}

export interface CarouselOptions<TMessage = never> {
  readonly id?: string;
  readonly items: readonly CarouselItem<TMessage>[];
  readonly selected?: string;
  readonly previousMessage?: TMessage;
  readonly nextMessage?: TMessage;
  readonly showDots?: boolean;
  readonly bodySize?: LayoutSize;
  readonly keyMap?: WidgetKeyMap<TMessage>;
  readonly accessibility?: AccessibleNodeDefinition;
}

export interface TabOverflowItem<TMessage = never> {
  readonly id: string;
  readonly label: string;
  readonly message?: TMessage;
  readonly disabled?: boolean;
}

export interface TabOverflowMenuOptions<TMessage = never> {
  readonly id?: string;
  readonly tabs: readonly TabOverflowItem<TMessage>[];
  readonly selected?: string;
  readonly maxVisible?: number;
  readonly overflowLabel?: string;
  readonly keyMap?: WidgetKeyMap<TMessage>;
  readonly accessibility?: AccessibleNodeDefinition;
}

export interface ShortcutItem<TMessage = never> {
  readonly id: string;
  readonly key: string;
  readonly label: string;
  readonly message?: TMessage;
  readonly disabled?: boolean;
}

export interface ShortcutBarOptions<TMessage = never> {
  readonly id?: string;
  readonly shortcuts: readonly ShortcutItem<TMessage>[];
  readonly keyMap?: WidgetKeyMap<TMessage>;
  readonly accessibility?: AccessibleNodeDefinition;
}

export function breadcrumb<TMessage>(options: BreadcrumbOptions<TMessage>): Widget<TMessage> {
  const separator = options.separator ?? '/';
  const currentIndex = Math.max(0, options.items.length - 1);
  return row<TMessage>(options.items.flatMap((item, index): readonly Widget<TMessage>[] => [
    ...(index === 0 ? [] : [navigationSeparator<TMessage>(separator, childId(options.id, `separator:${String(index)}`))]),
    visualNavigationButton<TMessage>({
      item,
      id: childId(options.id, item.id),
      selected: index === currentIndex,
      primary: index === currentIndex
    })
  ]), {
    ...(options.id === undefined ? {} : { id: options.id }),
    gap: 1,
    ...(options.keyMap === undefined ? {} : { keyMap: options.keyMap }),
    ...(options.accessibility === undefined ? {} : { accessibility: options.accessibility })
  });
}

export function collapsibleSection<TMessage>(options: CollapsibleSectionOptions<TMessage>): Widget<TMessage> {
  const header = visualNavigationButton<TMessage>({
    item: {
      id: 'header',
      label: `${options.expanded ? '▾' : '▸'} ${options.title}`,
      ...(options.message === undefined ? {} : { message: options.message }),
      ...(options.disabled === undefined ? {} : { disabled: options.disabled })
    },
    id: childId(options.id, 'header'),
    selected: options.expanded
  });
  return box(stack([
    header,
    ...(options.expanded ? childrenArray(options.body) : [])
  ], {
    id: childId(options.id, 'stack'),
    gap: options.expanded ? 1 : 0
  }), {
    ...(options.id === undefined ? {} : { id: options.id }),
    border: options.border ?? { kind: 'single' },
    padding: options.padding ?? { left: 1, right: 1 },
    ...(options.keyMap === undefined ? {} : { keyMap: options.keyMap }),
    ...(options.accessibility === undefined ? {} : { accessibility: options.accessibility })
  });
}

export function accordion<TMessage>(options: AccordionOptions<TMessage>): Widget<TMessage> {
  return stack(options.items.map((item) => collapsibleSection({
    id: childId(options.id, item.id),
    title: item.title,
    body: item.body,
    expanded: item.expanded === true,
    ...(item.message === undefined ? {} : { message: item.message }),
    ...(item.disabled === undefined ? {} : { disabled: item.disabled }),
    ...(options.border === undefined ? {} : { border: options.border }),
    ...(options.padding === undefined ? {} : { padding: options.padding })
  })), {
    ...(options.id === undefined ? {} : { id: options.id }),
    gap: options.gap ?? 1,
    ...(options.keyMap === undefined ? {} : { keyMap: options.keyMap }),
    ...(options.accessibility === undefined ? {} : { accessibility: options.accessibility })
  });
}

export function carousel<TMessage>(options: CarouselOptions<TMessage>): Widget<TMessage> {
  const item = selectedCarouselItem(options.items, options.selected);
  const sizes: readonly LayoutSize[] = [
    { kind: 'fixed', cells: 1 },
    options.bodySize ?? { kind: 'fill' },
    ...(options.showDots === false ? [] : [{ kind: 'fixed', cells: 1 } satisfies LayoutSize])
  ];
  const controls = row<TMessage>([
    button({
      id: childId(options.id, 'previous'),
      label: '← Previous',
      ...(options.previousMessage === undefined ? { disabled: true } : { message: options.previousMessage })
    }),
    navigationStatus<TMessage>(item === undefined ? 'No item' : item.label, childId(options.id, 'label'), item === undefined ? 'warning' : 'metric'),
    button({
      id: childId(options.id, 'next'),
      label: 'Next →',
      ...(options.nextMessage === undefined ? { disabled: true } : { message: options.nextMessage })
    })
  ], {
    id: childId(options.id, 'controls'),
    gap: 1,
    align: 'center'
  });
  const body = item?.body ?? text('No carousel item', { id: childId(options.id, 'empty') });
  const dots = options.showDots === false ? [] : [carouselDots(options)];
  return splitPane<TMessage>([
    controls,
    body,
    ...dots
  ], {
    ...(options.id === undefined ? {} : { id: options.id }),
    direction: 'vertical',
    sizes,
    gap: 1,
    ...(options.keyMap === undefined ? {} : { keyMap: options.keyMap }),
    ...(options.accessibility === undefined ? {} : { accessibility: options.accessibility })
  });
}

export function tabOverflowMenu<TMessage>(options: TabOverflowMenuOptions<TMessage>): Widget<TMessage> {
  const maxVisible = Math.max(0, Math.floor(options.maxVisible ?? 4));
  const visible = options.tabs.slice(0, maxVisible);
  const hidden = options.tabs.slice(maxVisible);
  return row<TMessage>([
    ...visible.map((item) => visualNavigationButton<TMessage>({
      item,
      id: childId(options.id, item.id),
      selected: item.id === options.selected
    })),
    ...(hidden.length === 0
      ? []
      : [
          navigationStatus<TMessage>(options.overflowLabel ?? 'More', childId(options.id, 'overflow-label'), 'metadata'),
          menu({
            id: childId(options.id, 'overflow'),
            ...(options.selected === undefined ? {} : { selected: options.selected }),
            items: hidden.map((item): MenuItem<TMessage> => ({
              id: item.id,
              label: item.label,
              ...(item.message === undefined ? {} : { message: item.message }),
              ...(item.disabled === undefined ? {} : { disabled: item.disabled })
            }))
          })
        ])
  ], {
    ...(options.id === undefined ? {} : { id: options.id }),
    gap: 1,
    ...(options.keyMap === undefined ? {} : { keyMap: options.keyMap }),
    ...(options.accessibility === undefined ? {} : { accessibility: options.accessibility })
  });
}

export function shortcutBar<TMessage>(options: ShortcutBarOptions<TMessage>): Widget<TMessage> {
  return row<TMessage>(options.shortcuts.map((item) => visualNavigationButton<TMessage>({
    item: {
      id: item.id,
      label: `[${item.key}] ${item.label}`,
      ...(item.message === undefined ? {} : { message: item.message }),
      ...(item.disabled === undefined ? {} : { disabled: item.disabled })
    },
    id: childId(options.id, item.id)
  })), {
    ...(options.id === undefined ? {} : { id: options.id }),
    gap: 1,
    ...(options.keyMap === undefined ? {} : { keyMap: options.keyMap }),
    ...(options.accessibility === undefined ? {} : { accessibility: options.accessibility })
  });
}

function carouselDots<TMessage>(options: CarouselOptions<TMessage>): Widget<TMessage> {
  return row(options.items.map((item) => button({
    id: childId(options.id, `dot:${item.id}`),
    label: item.id === options.selected ? '●' : '○',
    ...(item.message === undefined ? {} : { message: item.message }),
    ...(item.disabled === undefined ? {} : { disabled: item.disabled }),
    ...(item.id === options.selected ? { tone: 'secondary' as const } : {})
  })), {
    id: childId(options.id, 'dots'),
    gap: 1,
    align: 'center'
  });
}

function selectedCarouselItem<TMessage>(
  items: readonly CarouselItem<TMessage>[],
  selected: string | undefined
): CarouselItem<TMessage> | undefined {
  return selected === undefined ? items.find((item) => item.disabled !== true) : items.find((item) => item.id === selected);
}

function childrenArray<TMessage>(children: WidgetChildren<TMessage>): readonly Widget<TMessage>[] {
  return Array.isArray(children) ? [...children as readonly Widget<TMessage>[]] : [children as Widget<TMessage>];
}

function childId(id: string | undefined, suffix: string): string {
  return id === undefined ? suffix : `${id}:${suffix}`;
}
