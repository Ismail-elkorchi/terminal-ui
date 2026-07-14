import { mergeKeyBindings, withMetaDefaults } from '../../authoring/metadata.ts';
import { layoutProps, requiredId } from '../../authoring/render-node.ts';
import type { Element } from '../../element/index.ts';
import { elementFromRenderNode, toRenderNode } from '../../renderer/model/element.ts';
import { renderNodeInteraction as interactionProps } from '../../renderer/model/metadata.ts';
import type { DialogOptions } from '../options/dialog.ts';
import { normalizeBorderTitle } from '../../visual/border.ts';
import type { DialogDismissReason } from '../../ui-model/dialog.ts';

export function dialog<TMessage>(child: Element<TMessage>, options: DialogOptions<TMessage>): Element<TMessage> {
  const meta = dialogMeta(options);
  const actionsNode = options.actions === undefined ? undefined : toRenderNode(options.actions);
  const dismissal = options.dismissal;
  const keys = mergeKeyBindings(dismissal?.escape === true
    ? { escape: () => dismissal.onDismiss('escape') }
    : undefined, options.keys);
  return elementFromRenderNode<'dialog', TMessage>({
    ...requiredId(options.id, 'dialog'),
    kind: 'dialog',
    props: {
      ...(options.title === undefined ? {} : { title: normalizeBorderTitle(options.title) }),
      ...(options.border === undefined ? {} : { border: options.border }),
      ...(options.width === undefined ? {} : { width: options.width }),
      ...(options.height === undefined ? {} : { height: options.height }),
      modal: options.modal,
      dismissOnOutsidePress: dismissal?.outsidePress === true,
      ...(dismissal === undefined
        ? {}
        : { toDismissMessage: (reason: DialogDismissReason) => dismissal.onDismiss(reason) }),
      ...layoutProps(options)
    },
    children: actionsNode === undefined ? [toRenderNode(child)] : [toRenderNode(child), actionsNode],
    ...interactionProps({ ...options, keys, meta })
  });
}

function dialogMeta<TMessage>(options: DialogOptions<TMessage>) {
  const base = withMetaDefaults(options.meta, { layer: { opacity: 'opaque' } });
  const authoredFocus = {
    ...(base.focus?.disabled === undefined ? {} : { disabled: base.focus.disabled }),
    ...(base.focus?.order === undefined ? {} : { order: base.focus.order })
  };
  if (!options.modal) {
    return {
      ...base,
      ...(Object.keys(authoredFocus).length === 0 ? { focus: {} } : { focus: authoredFocus })
    };
  }
  const initialTargetId = options.focusPolicy.initialTargetId?.trim();
  if (options.focusPolicy.initialTargetId !== undefined && initialTargetId === '') {
    throw new TypeError('dialog focusPolicy.initialTargetId must be a non-empty ID.');
  }
  return {
    ...base,
    focus: {
      ...authoredFocus,
      scope: {
        kind: 'contain' as const,
        ...(initialTargetId === undefined ? {} : { initialTargetId }),
        restore: options.focusPolicy.returnFocus === 'restore'
      }
    }
  };
}
