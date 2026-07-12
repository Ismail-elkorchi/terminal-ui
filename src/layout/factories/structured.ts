import { elementFromRenderNode, toRenderNode, toRenderNodes } from '../../render-node/element.ts';
import type { Element, ElementChildren } from '../../element/index.ts';
import type { GridAreasOptions, GridOptions, ModalOptions, SplitPaneOptions, TabsOptions } from '../options.ts';
import { componentMetaProps, interactionProps, mergeKeyBindings, withMetaDefaults } from '../../components/factory-internals/interaction.ts';
import type { RenderTabItem } from '../../render-node/props/layout.ts';
import type { TabAction } from '../../ui-model/tabs.ts';
import {
  layoutProps,
  optionalId,
  requiredId,
  renderNodeChildren
} from '../../components/factory-internals/render-node.ts';
import { assertGridAreaChildren, gridAreaNames, parseGridAreas } from './internals.ts';

export function grid<TMessage>(children: ElementChildren<TMessage>, options: GridOptions): Element<TMessage>;
export function grid<TMessage>(options: GridAreasOptions<TMessage>): Element<TMessage>;
export function grid<TMessage>(
  childrenOrOptions: ElementChildren<TMessage> | GridAreasOptions<TMessage>,
  options?: GridOptions
): Element<TMessage> {
  if (options !== undefined) {
    return elementFromRenderNode<'grid', TMessage>({
      ...optionalId(options.id),
      kind: 'grid',
      props: {
        rows: options.rows,
        columns: options.columns,
        ...(options.gap === undefined ? {} : { gap: options.gap }),
        ...(options.rowGap === undefined ? {} : { rowGap: options.rowGap }),
        ...(options.columnGap === undefined ? {} : { columnGap: options.columnGap }),
        ...layoutProps(options)
      },
      children: renderNodeChildren(childrenOrOptions as ElementChildren<TMessage>),
      ...componentMetaProps(options.meta)
    });
  }

  const areaOptions = childrenOrOptions as GridAreasOptions<TMessage>;
  const template = parseGridAreas(areaOptions.areas);
  const areaNames = gridAreaNames(template);
  assertGridAreaChildren(areaNames, areaOptions.children);
  if (areaOptions.rows.length !== template.length) {
    throw new RangeError(`grid areas rows length ${String(areaOptions.rows.length)} must match template rows ${String(template.length)}.`);
  }
  if (template[0] !== undefined && areaOptions.columns.length !== template[0].length) {
    throw new RangeError(`grid areas columns length ${String(areaOptions.columns.length)} must match template columns ${String(template[0].length)}.`);
  }
  return elementFromRenderNode<'grid', TMessage>({
    ...optionalId(areaOptions.id),
    kind: 'grid',
    props: {
      areas: template,
      areaNames,
      rows: areaOptions.rows,
      columns: areaOptions.columns,
      ...(areaOptions.gap === undefined ? {} : { gap: areaOptions.gap }),
      ...(areaOptions.rowGap === undefined ? {} : { rowGap: areaOptions.rowGap }),
      ...(areaOptions.columnGap === undefined ? {} : { columnGap: areaOptions.columnGap }),
      ...layoutProps(areaOptions)
    },
    children: toRenderNodes(
      areaNames
        .map((name) => areaOptions.children[name])
        .filter((child): child is Element<TMessage> => child !== undefined)
    ),
    ...componentMetaProps(areaOptions.meta)
  });
}

export function splitPane<TMessage>(
  children: ElementChildren<TMessage>,
  options: SplitPaneOptions
): Element<TMessage> {
  return elementFromRenderNode<'splitPane', TMessage>({
    ...optionalId(options.id),
    kind: 'splitPane',
    props: {
      direction: options.direction,
      ...(options.sizes === undefined ? {} : { sizes: options.sizes }),
      ...layoutProps(options)
    },
    children: renderNodeChildren(children),
    ...componentMetaProps(options.meta)
  });
}

export function tabs<TMessage>(options: TabsOptions<TMessage>): Element<TMessage> {
  const tabs: readonly RenderTabItem[] = options.tabs.map((tab) => ({
    id: tab.id,
    label: tab.label,
    ...(tab.description === undefined ? {} : { description: tab.description }),
    ...(tab.disabled === undefined ? {} : { disabled: tab.disabled }),
    ...(tab.badge === undefined ? {} : { badge: tab.badge }),
    ...(tab.closable === undefined ? {} : { closable: tab.closable })
  }));
  const onAction = options.onAction;
  const selected = options.selected ?? options.tabs.find((tab) => tab.disabled !== true)?.id;
  const generated = onAction === undefined ? undefined : {
    arrowLeft: () => onAction({ kind: 'move', delta: -1 }),
    arrowRight: () => onAction({ kind: 'move', delta: 1 }),
    home: () => onAction({ kind: 'first' }),
    end: () => onAction({ kind: 'last' }),
    enter: () => selected === undefined ? undefined : onAction({ kind: 'select', id: selected })
  } satisfies import('../../element/metadata.ts').ElementKeyBindings<TMessage>;
  const keys = mergeKeyBindings(generated, options.keys);
  return elementFromRenderNode<'tabs', TMessage>({
    ...requiredId(options.id, 'tabs'),
    kind: 'tabs',
    props: {
      tabs,
      ...(options.selected === undefined ? {} : { selected: options.selected }),
      ...(onAction === undefined ? {} : { toActionMessage: (action: TabAction) => onAction(action) }),
      ...layoutProps(options)
    },
    children: options.tabs.map((tab) => toRenderNode(tab.panel)),
    ...interactionProps({ keys, meta: options.meta })
  });
}

export function modal<TMessage>(child: Element<TMessage>, options: ModalOptions<TMessage>): Element<TMessage> {
  const meta = withMetaDefaults(options.meta, {
    focus: { scope: 'contain' },
    layer: { opacity: 'opaque' }
  });
  const actionsNode = options.actions === undefined ? undefined : toRenderNode(options.actions);
  return elementFromRenderNode<'modal', TMessage>({
    ...requiredId(options.id, 'modal'),
    kind: 'modal',
    props: {
      ...(options.title === undefined ? {} : { title: options.title }),
      ...(options.border === undefined ? {} : { border: options.border }),
      ...(options.width === undefined ? {} : { width: options.width }),
      ...(options.height === undefined ? {} : { height: options.height }),
      ...layoutProps(options)
    },
    children: actionsNode === undefined ? [toRenderNode(child)] : [toRenderNode(child), actionsNode],
    ...interactionProps({ ...options, meta })
  });
}
