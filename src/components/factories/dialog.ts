import { interactionProps, withMetaDefaults } from '../../authoring/metadata.ts';
import { layoutProps, requiredId } from '../../authoring/render-node.ts';
import type { Element } from '../../element/index.ts';
import { elementFromRenderNode, toRenderNode } from '../../renderer/model/element.ts';
import type { DialogOptions } from '../options/dialog.ts';

export function dialog<TMessage>(child: Element<TMessage>, options: DialogOptions<TMessage>): Element<TMessage> {
  const meta = withMetaDefaults(options.meta, {
    focus: { scope: 'contain' },
    layer: { opacity: 'opaque' }
  });
  const actionsNode = options.actions === undefined ? undefined : toRenderNode(options.actions);
  return elementFromRenderNode<'dialog', TMessage>({
    ...requiredId(options.id, 'dialog'),
    kind: 'dialog',
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
