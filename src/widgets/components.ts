import type { BorderStyle } from '../tui/border.ts';
import type { LayoutAlignment, LayoutInsetInput } from '../tui/regions.ts';
import type { SurfaceVariant } from '../tui/surface.ts';
import {
  row,
  stack,
  surface,
  text
} from './factories.ts';
import type { AccessibleNodeDefinition, Widget, WidgetChildren, WidgetKeyMap } from './types.ts';

interface ComponentOptions<TMessage> {
  readonly id?: string;
  readonly keyMap?: WidgetKeyMap<TMessage>;
  readonly accessibility?: AccessibleNodeDefinition;
}

export interface PanelOptions<TMessage = never> extends ComponentOptions<TMessage> {
  readonly title?: string;
  readonly body: WidgetChildren<TMessage>;
  readonly footer?: WidgetChildren<TMessage>;
  readonly variant?: SurfaceVariant;
  readonly border?: BorderStyle;
  readonly padding?: LayoutInsetInput;
  readonly gap?: number;
  readonly shadow?: boolean;
}

export interface AppBarOptions<TMessage = never> extends ComponentOptions<TMessage> {
  readonly title?: string;
  readonly leading?: WidgetChildren<TMessage>;
  readonly center?: WidgetChildren<TMessage>;
  readonly trailing?: WidgetChildren<TMessage>;
  readonly gap?: number;
  readonly variant?: SurfaceVariant;
}

export interface SidePanelOptions<TMessage = never> extends ComponentOptions<TMessage> {
  readonly title?: string;
  readonly body: WidgetChildren<TMessage>;
  readonly footer?: WidgetChildren<TMessage>;
  readonly variant?: SurfaceVariant;
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
}

export interface CommandDockOptions<TMessage = never> extends ComponentOptions<TMessage> {
  readonly input: Widget<TMessage>;
  readonly help?: Widget<TMessage>;
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
}

export function panel<TMessage>(options: PanelOptions<TMessage>): Widget<TMessage> {
  return surface<TMessage>(stack<TMessage>([
    ...childrenArray(options.body),
    ...childrenArray(options.footer)
  ], {
    id: childId(options.id, 'content'),
    gap: options.gap ?? 1,
    padding: options.padding ?? 1
  }), {
    ...componentOptions(options),
    variant: options.variant ?? 'raised',
    border: options.border ?? { kind: 'rounded', ...(options.title === undefined ? {} : { title: options.title }) },
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
    ...childrenArray(options.body),
    ...childrenArray(options.footer)
  ], {
    id: childId(options.id, 'content'),
    gap: 1,
    padding: 1
  }), {
    ...componentOptions(options),
    variant: options.variant ?? 'inset',
    border: { kind: 'rounded', ...(options.title === undefined ? {} : { title: options.title }) }
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
    ...labelRows<TMessage>(options.label, `${options.id ?? 'status-dock'}:label`),
    ...childrenArray(options.items)
  ], {
    id: childId(options.id, 'items'),
    gap: 1,
    padding: { left: 1, right: 1 }
  }), {
    ...componentOptions(options),
    variant: 'inset'
  });
}

export function commandDock<TMessage>(options: CommandDockOptions<TMessage>): Widget<TMessage> {
  return surface<TMessage>(stack<TMessage>([
    options.input,
    ...childrenArray(options.help)
  ], {
    id: childId(options.id, 'content'),
    gap: 1,
    padding: { left: 1, right: 1 }
  }), {
    ...componentOptions(options),
    variant: 'raised'
  });
}

export function contentHeader<TMessage>(options: ContentHeaderOptions<TMessage>): Widget<TMessage> {
  return row<TMessage>([
    stack<TMessage>([
      labelWidget<TMessage>(options.title, childId(options.id, 'title')),
      ...labelRows<TMessage>(options.subtitle, childId(options.id, 'subtitle'))
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
    ...childrenArray(options.body),
    ...childrenArray(options.footer)
  ], {
    id: childId(options.id, 'content'),
    gap: 1,
    padding: 1
  }), {
    ...componentOptions(options),
    variant: 'raised',
    border: {
      kind: 'rounded',
      ...(options.title === undefined ? {} : { title: options.title }),
      titleAlign: options.side === 'right' ? 'end' : 'start'
    },
    shadow: true,
    opacity: 'opaque'
  });
}

function appBar<TMessage>(kind: 'topBar' | 'bottomBar', options: AppBarOptions<TMessage>): Widget<TMessage> {
  return surface<TMessage>(row<TMessage>([
    ...childrenArray(options.leading),
    ...labelRows<TMessage>(options.title, `${options.id ?? kind}:title`),
    ...childrenArray(options.center),
    ...childrenArray(options.trailing)
  ], {
    id: childId(options.id, 'content'),
    gap: options.gap ?? 2,
    padding: { left: 1, right: 1 },
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

function labelRows<TMessage>(label: string | undefined, id: string): readonly Widget<TMessage>[] {
  return label === undefined || label.length === 0 ? [] : [labelWidget<TMessage>(label, id)];
}

function labelWidget<TMessage>(label: string, id: string): Widget<TMessage> {
  return text(label, { id });
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
