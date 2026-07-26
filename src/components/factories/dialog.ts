import { mergeKeyBindings, withMetaDefaults } from '../../authoring/metadata.ts';
import { layoutProps, requiredId } from '../../authoring/render-node.ts';
import type { Element } from '../../element/index.ts';
import { componentElementFromRenderNode, toRenderNode } from '../../renderer/model/element.ts';
import { renderNodeInteraction as interactionProps } from '../../renderer/model/metadata.ts';
import type { DialogOptions } from '../options/dialog.ts';
import { normalizeBorderTitle } from '../../visual/border.ts';
import type { DialogDismissReason } from '../../ui-model/dialog.ts';
import type { InitialFocusSelector } from '../../interaction/focus.ts';

export function dialog<TMessage>(child: Element<TMessage>, options: DialogOptions<TMessage>): Element<TMessage> {
  const meta = dialogMeta(options);
  const actionsNode = options.actions === undefined ? undefined : toRenderNode(options.actions);
  const dismissal = options.dismissal;
  const keys = mergeKeyBindings(dismissal?.escape === true
    ? { escape: () => dismissal.onDismiss('escape') }
    : undefined, options.keys);
  return componentElementFromRenderNode<'dialog', TMessage>({
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
  const base = withMetaDefaults(options.meta, { layer: { underlay: 'clear' } });
  const callerFocus = {
    ...(base.focus?.disabled === undefined ? {} : { disabled: base.focus.disabled }),
    ...(base.focus?.order === undefined ? {} : { order: base.focus.order })
  };
  if (!options.modal) {
    return {
      ...base,
      ...(Object.keys(callerFocus).length === 0 ? { focus: {} } : { focus: callerFocus })
    };
  }
  const initialFocus = normalizeInitialFocus(options.focusPolicy.initialFocus);
  return {
    ...base,
    focus: {
      ...callerFocus,
      scope: {
        kind: 'contain' as const,
        ...(initialFocus === undefined ? {} : { initialFocus }),
        restore: options.focusPolicy.returnFocus === 'restore'
      }
    }
  };
}

function normalizeInitialFocus(
  selector: InitialFocusSelector | undefined
): InitialFocusSelector | undefined {
  if (selector === undefined) return undefined;
  if (selector.kind === 'path') {
    if (selector.path.length === 0 || selector.path.some((segment) => segment.trim() === '')) {
      throw new TypeError('dialog focusPolicy.initialFocus path must contain non-empty segments.');
    }
    return { kind: 'path', path: Object.freeze([...selector.path]) };
  }
  const elementId = selector.elementId.trim();
  if (elementId.length === 0) throw new TypeError('dialog focusPolicy.initialFocus elementId must be non-empty.');
  if (selector.kind === 'element') return { kind: 'element', elementId };
  const targetId = selector.targetId.trim();
  if (targetId.length === 0) throw new TypeError('dialog focusPolicy.initialFocus targetId must be non-empty.');
  return { kind: 'elementTarget', elementId, targetId };
}
