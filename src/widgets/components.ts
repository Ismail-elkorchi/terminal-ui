import type { BorderStyle } from '../tui/border.ts';
import type { LayoutAlignment, LayoutInsetInput } from '../tui/regions.ts';
import type { SurfaceVariant } from '../tui/surface.ts';
import {
  row,
  stack,
  surface,
  text
} from './factories.ts';
import type {
  AccessibleNodeDefinition,
  Widget,
  WidgetChildren,
  WidgetDensityRole,
  WidgetKeyMap,
  WidgetOverflowPriority,
  WidgetTextRole
} from './types.ts';

interface ComponentOptions<TMessage> {
  readonly id?: string;
  readonly keyMap?: WidgetKeyMap<TMessage>;
  readonly accessibility?: AccessibleNodeDefinition;
}

export interface PanelOptions<TMessage = never> extends ComponentOptions<TMessage> {
  readonly title?: string;
  readonly header?: WidgetChildren<TMessage>;
  readonly body: WidgetChildren<TMessage>;
  readonly footer?: WidgetChildren<TMessage>;
  readonly status?: WidgetChildren<TMessage>;
  readonly actions?: WidgetChildren<TMessage>;
  readonly variant?: SurfaceVariant;
  readonly border?: BorderStyle;
  readonly padding?: LayoutInsetInput;
  readonly gap?: number;
  readonly density?: WidgetDensityRole;
  readonly shadow?: boolean;
}

export interface AppBarOptions<TMessage = never> extends ComponentOptions<TMessage> {
  readonly title?: string;
  readonly leading?: WidgetChildren<TMessage>;
  readonly center?: WidgetChildren<TMessage>;
  readonly trailing?: WidgetChildren<TMessage>;
  readonly gap?: number;
  readonly variant?: SurfaceVariant;
  readonly density?: WidgetDensityRole;
}

export interface SidePanelOptions<TMessage = never> extends ComponentOptions<TMessage> {
  readonly title?: string;
  readonly body: WidgetChildren<TMessage>;
  readonly footer?: WidgetChildren<TMessage>;
  readonly variant?: SurfaceVariant;
  readonly density?: WidgetDensityRole;
}

export interface ToolbarOptions<TMessage = never> extends ComponentOptions<TMessage> {
  readonly items: WidgetChildren<TMessage>;
  readonly label?: string;
  readonly gap?: number;
}

export interface ActionBarOptions<TMessage = never> extends ComponentOptions<TMessage> {
  readonly actions: WidgetChildren<TMessage>;
  readonly align?: LayoutAlignment;
  readonly gap?: number;
}

export interface StatusDockOptions<TMessage = never> extends ComponentOptions<TMessage> {
  readonly items: WidgetChildren<TMessage>;
  readonly label?: string;
  readonly density?: WidgetDensityRole;
}

export interface CommandDockOptions<TMessage = never> extends ComponentOptions<TMessage> {
  readonly input: Widget<TMessage>;
  readonly help?: Widget<TMessage>;
  readonly status?: WidgetChildren<TMessage>;
  readonly density?: WidgetDensityRole;
}

export interface ContentHeaderOptions<TMessage = never> extends ComponentOptions<TMessage> {
  readonly title: string;
  readonly subtitle?: string;
  readonly actions?: WidgetChildren<TMessage>;
}

export interface DrawerOptions<TMessage = never> extends ComponentOptions<TMessage> {
  readonly title?: string;
  readonly body: WidgetChildren<TMessage>;
  readonly footer?: WidgetChildren<TMessage>;
  readonly side?: 'left' | 'right';
  readonly density?: WidgetDensityRole;
}

export function panel<TMessage>(options: PanelOptions<TMessage>): Widget<TMessage> {
  return surface<TMessage>(stack<TMessage>([
    ...panelHeader(options),
    ...childrenArray(options.body),
    ...panelFooter(options)
  ], {
    id: childId(options.id, 'content'),
    gap: options.gap ?? densityGap(options.density),
    padding: options.padding ?? densityPadding(options.density)
  }), {
    ...componentOptions(options),
    variant: options.variant ?? 'raised',
    border: options.border ?? { kind: 'rounded' },
    ...(options.shadow === undefined ? {} : { shadow: options.shadow })
  });
}

export function topBar<TMessage>(options: AppBarOptions<TMessage>): Widget<TMessage> {
  return appBar('topBar', options);
}

export function bottomBar<TMessage>(options: AppBarOptions<TMessage>): Widget<TMessage> {
  return appBar('bottomBar', options);
}

export function sidePanel<TMessage>(options: SidePanelOptions<TMessage>): Widget<TMessage> {
  return surface<TMessage>(stack<TMessage>([
    ...labelRows<TMessage>(options.title, childId(options.id, 'title'), 'heading'),
    ...childrenArray(options.body),
    ...childrenArray(options.footer)
  ], {
    id: childId(options.id, 'content'),
    gap: densityGap(options.density),
    padding: densityPadding(options.density)
  }), {
    ...componentOptions(options),
    variant: options.variant ?? 'inset',
    border: { kind: 'rounded' }
  });
}

export function toolbar<TMessage>(options: ToolbarOptions<TMessage>): Widget<TMessage> {
  return row<TMessage>([
    ...labelRows<TMessage>(options.label, `${options.id ?? 'toolbar'}:label`),
    ...childrenArray(options.items)
  ], {
    ...componentOptions(options),
    gap: options.gap ?? 1
  });
}

export function actionBar<TMessage>(options: ActionBarOptions<TMessage>): Widget<TMessage> {
  return row<TMessage>(childrenArray(options.actions), {
    ...componentOptions(options),
    gap: options.gap ?? 1,
    align: options.align ?? 'end'
  });
}

export function statusDock<TMessage>(options: StatusDockOptions<TMessage>): Widget<TMessage> {
  return surface<TMessage>(row<TMessage>([
    ...labelRows<TMessage>(options.label, `${options.id ?? 'status-dock'}:label`, 'metadata'),
    ...childrenArray(options.items)
  ], {
    id: childId(options.id, 'items'),
    gap: densityGap(options.density),
    padding: densityHorizontalPadding(options.density)
  }), {
    ...componentOptions(options),
    variant: 'inset'
  });
}

export function commandDock<TMessage>(options: CommandDockOptions<TMessage>): Widget<TMessage> {
  return surface<TMessage>(stack<TMessage>([
    options.input,
    ...childrenArray(options.help),
    ...childrenArray(options.status)
  ], {
    id: childId(options.id, 'content'),
    gap: densityGap(options.density),
    padding: densityHorizontalPadding(options.density)
  }), {
    ...componentOptions(options),
    variant: 'raised'
  });
}

export function contentHeader<TMessage>(options: ContentHeaderOptions<TMessage>): Widget<TMessage> {
  return row<TMessage>([
    stack<TMessage>([
      labelWidget<TMessage>(options.title, childId(options.id, 'title')),
      ...labelRows<TMessage>(options.subtitle, childId(options.id, 'subtitle'), 'subtitle')
    ], { id: childId(options.id, 'copy') }),
    ...childrenArray(options.actions)
  ], {
    ...componentOptions(options),
    gap: 2,
    justify: 'stretch'
  });
}

export function drawer<TMessage>(options: DrawerOptions<TMessage>): Widget<TMessage> {
  return surface<TMessage>(stack<TMessage>([
    ...labelRows<TMessage>(options.title, childId(options.id, 'title'), 'heading'),
    ...childrenArray(options.body),
    ...childrenArray(options.footer)
  ], {
    id: childId(options.id, 'content'),
    gap: densityGap(options.density),
    padding: densityPadding(options.density)
  }), {
    ...componentOptions(options),
    variant: 'raised',
    border: {
      kind: 'rounded',
      titleAlign: options.side === 'right' ? 'end' : 'start'
    },
    shadow: true,
    opacity: 'opaque'
  });
}

function appBar<TMessage>(kind: 'topBar' | 'bottomBar', options: AppBarOptions<TMessage>): Widget<TMessage> {
  return surface<TMessage>(row<TMessage>([
    ...priorityChildren(options.leading, 'important'),
    ...labelRows<TMessage>(options.title, `${options.id ?? kind}:title`, 'title', 'required'),
    ...priorityChildren(options.center, 'secondary'),
    ...priorityChildren(options.trailing, 'important')
  ], {
    id: childId(options.id, 'content'),
    gap: options.gap ?? densityWideGap(options.density),
    padding: densityHorizontalPadding(options.density),
    justify: 'stretch'
  }), {
    ...componentOptions(options),
    variant: options.variant ?? (kind === 'topBar' ? 'raised' : 'inset')
  });
}

function childrenArray<TMessage>(children: WidgetChildren<TMessage> | undefined): readonly Widget<TMessage>[] {
  if (children === undefined) return [];
  return Array.isArray(children) ? [...children as readonly Widget<TMessage>[]] : [children as Widget<TMessage>];
}

function panelHeader<TMessage>(options: PanelOptions<TMessage>): readonly Widget<TMessage>[] {
  const title = labelRows<TMessage>(options.title, childId(options.id, 'title'), 'heading', 'required');
  const header = priorityChildren(options.header, 'secondary');
  const actions = priorityChildren(options.actions, 'important');
  return title.length === 0 && header.length === 0 && actions.length === 0
    ? []
    : [row<TMessage>([
        ...title,
        ...header,
        ...actions
      ], {
        id: childId(options.id, 'header'),
        gap: densityGap(options.density),
        justify: 'stretch'
      })];
}

function panelFooter<TMessage>(options: PanelOptions<TMessage>): readonly Widget<TMessage>[] {
  const footer = priorityChildren(options.footer, 'secondary');
  const status = priorityChildren(options.status, 'important');
  return footer.length === 0 && status.length === 0
    ? []
    : [row<TMessage>([
        ...footer,
        ...status
      ], {
        id: childId(options.id, 'footer'),
        gap: densityGap(options.density),
        justify: 'stretch'
      })];
}

function labelRows<TMessage>(
  label: string | undefined,
  id: string,
  textRole: WidgetTextRole = 'body',
  overflowPriority?: WidgetOverflowPriority
): readonly Widget<TMessage>[] {
  return label === undefined || label.length === 0 ? [] : [labelWidget<TMessage>(label, id, textRole, overflowPriority)];
}

function labelWidget<TMessage>(
  label: string,
  id: string,
  textRole: WidgetTextRole = 'body',
  overflowPriority?: WidgetOverflowPriority
): Widget<TMessage> {
  return text(label, { id, textRole, ...(overflowPriority === undefined ? {} : { overflowPriority }) });
}

function componentOptions<TMessage>(options: ComponentOptions<TMessage>): ComponentOptions<TMessage> {
  return {
    ...(options.id === undefined ? {} : { id: options.id }),
    ...(options.keyMap === undefined ? {} : { keyMap: options.keyMap }),
    ...(options.accessibility === undefined ? {} : { accessibility: options.accessibility })
  };
}

function childId(id: string | undefined, suffix: string): string {
  return id === undefined ? suffix : `${id}:${suffix}`;
}

function priorityChildren<TMessage>(
  children: WidgetChildren<TMessage> | undefined,
  overflowPriority: WidgetOverflowPriority
): readonly Widget<TMessage>[] {
  return childrenArray(children).map((child) => withOverflowPriority(child, overflowPriority));
}

function withOverflowPriority<TMessage>(
  widget: Widget<TMessage>,
  overflowPriority: WidgetOverflowPriority
): Widget<TMessage> {
  if (widget.layer?.overflowPriority !== undefined) return widget;
  return {
    ...widget,
    layer: {
      ...widget.layer,
      overflowPriority
    }
  };
}

function densityGap(density: WidgetDensityRole | undefined): number {
  return density === 'compact' ? 0 : density === 'spacious' ? 2 : 1;
}

function densityWideGap(density: WidgetDensityRole | undefined): number {
  return density === 'compact' ? 1 : density === 'spacious' ? 3 : 2;
}

function densityPadding(density: WidgetDensityRole | undefined): LayoutInsetInput {
  return density === 'compact' ? { left: 1, right: 1 } : density === 'spacious' ? 2 : 1;
}

function densityHorizontalPadding(density: WidgetDensityRole | undefined): LayoutInsetInput {
  return density === 'compact'
    ? { left: 1, right: 1 }
    : density === 'spacious'
      ? { left: 2, right: 2 }
      : { left: 1, right: 1 };
}
