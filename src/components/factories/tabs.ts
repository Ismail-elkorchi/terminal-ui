import { mergeKeyBindings } from '../../authoring/metadata.ts';
import { layoutProps, requiredId } from '../../authoring/render-node.ts';
import type { Element } from '../../element/index.ts';
import type { ElementKeyBindings } from '../../element/metadata.ts';
import { elementFromRenderNode, toRenderNode } from '../../renderer/model/element.ts';
import { renderNodeInteraction as interactionProps } from '../../renderer/model/metadata.ts';
import type { RenderTabItem } from '../../renderer/model/props/tabs.ts';
import type { TabAction } from '../../ui-model/tabs.ts';
import type { TabsOptions } from '../options/tabs.ts';
import { normalizeInlineContent } from '../../visual/inline-content.ts';

export function tabs<TMessage>(options: TabsOptions<TMessage>): Element<TMessage> {
  const tabs: readonly RenderTabItem[] = options.tabs.map((tab) => ({
    id: tab.id,
    label: tab.label,
    ...(tab.leading === undefined ? {} : { leading: normalizeInlineContent(tab.leading) }),
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
  } satisfies ElementKeyBindings<TMessage>;
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
    ...interactionProps({ keys, pointer: options.pointer, meta: options.meta })
  });
}
