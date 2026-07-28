import { mergeKeyBindings } from '../../element/metadata-normalization.ts';
import { requiredRenderNodeId } from '../../renderer/model/element.ts';
import { renderNodeLayoutProps } from '../../renderer/model/props/shared-layout.ts';
import type { Element } from '../../element/index.ts';
import type { ElementKeyBindings, ElementKeyHandler } from '../../element/metadata.ts';
import { componentElementFromRenderNode, toRenderNode } from '../../renderer/model/element.ts';
import { renderNodeInteraction as interactionProps } from '../../renderer/model/metadata.ts';
import type { RenderTabItem } from '../../renderer/model/props/tabs.ts';
import type { TabAction } from '../../ui-model/tabs.ts';
import type { TabsOptions } from '../options/tabs.ts';
import { normalizeInlineContent } from '../../visual/inline-content.ts';
import { ignoreMessage } from '../../interaction/message.ts';
import type { MessageResolution } from '../../interaction/message.ts';

export function tabs<TMessage>(options: TabsOptions<TMessage>): Element<TMessage> {
  if (options.maxTabWidth !== undefined && (!Number.isInteger(options.maxTabWidth) || options.maxTabWidth <= 0)) {
    throw new RangeError('tabs maxTabWidth must be a positive integer.');
  }
  const identity = requiredRenderNodeId(options.id, 'tabs');
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
  const whenTabListFocused = (
    action: () => MessageResolution<TMessage>
  ): ElementKeyHandler<TMessage> => (event) =>
    event.focusPath.at(-1) === identity.id ? action() : ignoreMessage();
  const generated = onAction === undefined ? undefined : {
    arrowLeft: whenTabListFocused(() => onAction({ kind: 'move', delta: -1 })),
    arrowRight: whenTabListFocused(() => onAction({ kind: 'move', delta: 1 })),
    home: whenTabListFocused(() => onAction({ kind: 'first' })),
    end: whenTabListFocused(() => onAction({ kind: 'last' })),
    delete: whenTabListFocused(() => {
      const selectedTab = options.tabs.find((tab) => tab.id === selected);
      return selectedTab?.closable === true ? onAction({ kind: 'close', id: selectedTab.id }) : ignoreMessage();
    }),
    enter: whenTabListFocused(() =>
      selected === undefined ? ignoreMessage() : onAction({ kind: 'select', id: selected })
    )
  } satisfies ElementKeyBindings<TMessage>;
  const keys = mergeKeyBindings(generated, options.keys);
  return componentElementFromRenderNode<'tabs', TMessage>({
    ...identity,
    kind: 'tabs',
    props: {
      tabs,
      ...(options.selected === undefined ? {} : { selected: options.selected }),
      ...(options.maxTabWidth === undefined ? {} : { maxTabWidth: options.maxTabWidth }),
      ...(onAction === undefined ? {} : { toActionMessage: (action: TabAction) => onAction(action) }),
      ...renderNodeLayoutProps(options)
    },
    children: options.tabs.map((tab) => toRenderNode(tab.panel)),
    ...interactionProps({ keys, pointer: options.pointer, meta: options.meta })
  });
}
