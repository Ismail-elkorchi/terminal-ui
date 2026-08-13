import {
  defineComponent,
  ignoreMessage,
  mapComponentStyles,
} from '../../component/index.ts';
import type { ComponentMessage } from '../../component/index.ts';
import type { Element, ElementMessage } from '../../element/index.ts';
import {
  assertOptionalEnum,
  isNonArrayObject,
  isStringMember,
} from '../../foundation/validation.ts';
import type { LayoutFlowOptions } from '../../geometry/types.ts';
import { column, normalizeLayoutFlowOptions, portal, surface } from '../../layout/index.ts';
import type { InitialFocusSelector } from '../../interaction/focus.ts';
import type { MessageResolution } from '../../interaction/message.ts';
import type { DialogOptions } from '../options/dialog.ts';
import type { DialogAction, DialogDismissal, DialogFocusPolicy } from '../../ui-model/dialog.ts';
import type { DialogStylePart } from '../../ui-model/style-parts.ts';
import {
  type BorderOptions,
  type BorderTitle,
  borderTitleAccessibleText,
  normalizeBorderTitle,
} from '../../visual/border.ts';
import { divider } from './menus.ts';

interface PreparedDialog {
  readonly title?: BorderTitle;
  readonly label: string;
  readonly border: BorderOptions;
  readonly width?: number;
  readonly height?: number;
  readonly modal: boolean;
  readonly focusPolicy?: DialogFocusPolicy;
  readonly dismissal?: DialogDismissal;
  readonly layout: LayoutFlowOptions;
}

type DialogComponentOptions = Omit<
  DialogOptions<ComponentMessage>,
  'id' | 'slots' | 'meta' | 'onAction'
>;

const dialogSlots = {
  content: { cardinality: 'one', owner: 'caller', messages: 'bubble' },
  actions: { cardinality: 'optional', owner: 'caller', messages: 'bubble' },
} as const;

const instantiateDialog = defineComponent<
  DialogComponentOptions,
  PreparedDialog,
  DialogAction,
  DialogStylePart,
  readonly [],
  'required',
  readonly ['focus', 'layer', 'styles'],
  typeof dialogSlots
>({
  name: 'terminal-ui/components/dialog',
  identity: 'required',
  structure: 'composed',
  semantics: 'semantic',
  accessibleRole: 'dialog',
  slots: dialogSlots,
  metadata: ['focus', 'layer', 'styles'],
  parts: ['background', 'border', 'title', 'actionSeparator'],
  prepare(value) {
    const modal = value.modal;
    if (typeof modal !== 'boolean') throw new TypeError('dialog modal must be a boolean.');
    const title = prepareDialogTitle(value.title);
    const label = prepareDialogAccessibleName(value.accessibleName, title);
    const border = prepareDialogBorder(value.border) ?? { kind: 'single' as const };
    const width = prepareDialogDimension(value.width, 'width');
    const height = prepareDialogDimension(value.height, 'height');
    const focusPolicy = prepareDialogFocusPolicy(value.focusPolicy, modal);
    const dismissal = prepareDialogDismissal(value.dismissal);
    const layout = normalizeLayoutFlowOptions(value, 'dialog');
    if (
      width !== undefined &&
      ((layout.minWidth ?? 0) > width || (layout.maxWidth ?? width) < width)
    ) {
      throw new RangeError('dialog width conflicts with minWidth or maxWidth.');
    }
    if (
      height !== undefined &&
      ((layout.minHeight ?? 0) > height || (layout.maxHeight ?? height) < height)
    ) {
      throw new RangeError('dialog height conflicts with minHeight or maxHeight.');
    }
    return {
      ...(title === undefined ? {} : { title }),
      label,
      border,
      ...(width === undefined ? {} : { width }),
      ...(height === undefined ? {} : { height }),
      modal,
      ...(focusPolicy === undefined ? {} : { focusPolicy }),
      ...(dismissal === undefined ? {} : { dismissal }),
      layout,
    };
  },
  layer({ model }) {
    return {
      zIndex: 20,
      underlay: 'clear',
      ...(model.modal ? { backdrop: 'viewport' as const } : {}),
    };
  },
  focusScope({ model }) {
    if (!model.modal) return undefined;
    return {
      kind: 'contain',
      ...(model.focusPolicy?.initialFocus === undefined
        ? {}
        : { initialFocus: model.focusPolicy.initialFocus }),
      restore: model.focusPolicy?.returnFocus === 'restore',
    };
  },
  keys({ model }) {
    return model.dismissal?.escape === true
      ? { escape: () => ({ kind: 'dismiss', reason: 'escape' }) }
      : {};
  },
  compose({ id, model, slots, emit, styles, layer }) {
    const body = slots.actions === undefined ? slots.content : column([
      slots.content,
      divider({
        id: `${id ?? 'dialog'}:action-separator`,
        meta: {
          styles: mapComponentStyles(styles, {
            line: ['actionSeparator', 'border'] as const,
          }) ?? {},
        },
      }),
      slots.actions,
    ], {
      id: `${id ?? 'dialog'}:content`,
      sizes: [
        { kind: 'fill' },
        { kind: 'fixed', cells: 1 },
        { kind: 'content' },
      ],
    });
    const width = model.width;
    const height = model.height;
    const panel = surface(body, {
      id: `${id ?? 'dialog'}:surface`,
      appearance: 'raised',
      ...(model.title === undefined ? {} : { title: model.title }),
      border: model.border,
      shadow: true,
      ...model.layout,
      minWidth: width ?? Math.max(5, model.layout.minWidth ?? 0),
      minHeight: height ?? Math.max(4, model.layout.minHeight ?? 0),
      ...(width === undefined
        ? model.layout.maxWidth === undefined ? {} : { maxWidth: model.layout.maxWidth }
        : { maxWidth: width }),
      ...(height === undefined
        ? model.layout.maxHeight === undefined ? {} : { maxHeight: model.layout.maxHeight }
        : { maxHeight: height }),
      ...(styles === undefined ? {} : {
        meta: {
          styles: mapComponentStyles(styles, {
            background: 'background',
            border: 'border',
            title: 'title',
          }) ?? {},
        },
      }),
    });
    return portal(panel, {
      id: `${id ?? 'dialog'}:portal`,
      anchor: { kind: 'allocation' },
      placement: 'center',
      meta: {
        layer: {
          ...layer,
          zIndex: 20,
          underlay: 'clear',
          ...(model.modal ? { backdrop: 'viewport' as const } : {}),
        },
      },
      ...(model.dismissal?.outsidePress === true
        ? { onOutsidePress: () => emit({ kind: 'dismiss', reason: 'outsidePress' }) }
        : {}),
    });
  },
  accessibility({ id, model, children }) {
    return {
      id,
      role: 'dialog',
      label: model.label,
      ...(model.modal
        ? { scope: { kind: 'modal' as const, trapsFocus: true, obscuresBackground: true } }
        : {}),
      children,
    };
  },
});

export function dialog<
  const TContent extends Element<ComponentMessage>,
  const TActions extends Element<ComponentMessage> | undefined = undefined,
  const TMessage extends ComponentMessage = never,
>(
  options: Omit<DialogOptions<TMessage>, 'slots'> & {
    readonly slots: { readonly content: TContent; readonly actions?: TActions };
  },
): Element<ElementMessage<TContent> | ElementMessage<NonNullable<TActions>> | TMessage> {
  if (options.dismissal === undefined) {
    const ignoreDismissal = (): MessageResolution<TMessage> => ignoreMessage();
    return instantiateDialog({
      ...options,
      slots: options.slots,
      onAction: ignoreDismissal,
    });
  }
  const onAction = options.onAction;
  if (typeof onAction !== 'function') {
    throw new TypeError('dialog onAction must be a function.');
  }
  return instantiateDialog({
    ...options,
    slots: options.slots,
    onAction: (action: DialogAction): MessageResolution<TMessage> => onAction(action),
  });
}

function prepareDialogAccessibleName(
  value: string | undefined,
  title: BorderTitle | undefined,
): string {
  const label = value ?? borderTitleAccessibleText(title);
  if (typeof label !== 'string' || label.trim() === '') {
    throw new TypeError('dialog requires a non-empty title or accessibleName.');
  }
  return label;
}

function prepareDialogTitle(value: DialogComponentOptions['title']): BorderTitle | undefined {
  if (value === undefined) return undefined;
  try {
    return normalizeBorderTitle(value);
  } catch (cause) {
    throw new TypeError('dialog title is invalid.', { cause });
  }
}

function prepareDialogBorder(value: DialogComponentOptions['border']): BorderOptions | undefined {
  if (value === undefined) return undefined;
  if (!isNonArrayObject(value)) throw new TypeError('dialog border must be an object.');
  const kind = value.kind;
  if (!isStringMember(kind, [
    'none',
    'single',
    'double',
    'rounded',
    'heavy',
    'ascii',
    'dashed',
    'dotted',
    'empty',
  ])) {
    throw new TypeError('dialog border.kind is invalid.');
  }
  const titleAlign = value.titleAlign;
  assertOptionalEnum(titleAlign, ['start', 'center', 'end'], 'dialog border.titleAlign');
  return Object.freeze({ kind, ...(titleAlign === undefined ? {} : { titleAlign }) });
}

function prepareDialogDimension(
  value: DialogComponentOptions['width'],
  name: 'width' | 'height',
): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`dialog ${name} must be a non-negative safe integer.`);
  }
  return value;
}

function prepareDialogFocusPolicy(
  value: DialogComponentOptions['focusPolicy'],
  modal: boolean,
): DialogFocusPolicy | undefined {
  if (!modal) {
    if (value !== undefined) throw new TypeError('Non-modal dialog cannot define focusPolicy.');
    return undefined;
  }
  if (!isNonArrayObject(value)) throw new TypeError('Modal dialog requires focusPolicy.');
  if (!isStringMember(value.returnFocus, ['restore', 'none'])) {
    throw new TypeError('dialog focusPolicy.returnFocus must be "restore" or "none".');
  }
  const initialFocus = value.initialFocus === undefined
    ? undefined
    : prepareInitialFocus(value.initialFocus);
  return Object.freeze({
    ...(initialFocus === undefined ? {} : { initialFocus }),
    returnFocus: value.returnFocus,
  });
}

function prepareInitialFocus(value: InitialFocusSelector): InitialFocusSelector {
  if (!isNonArrayObject(value)) throw new TypeError('dialog initialFocus must be an object.');
  const kind = value.kind;
  if (!isStringMember(kind, ['path', 'element', 'elementTarget'])) {
    throw new TypeError('dialog initialFocus kind is invalid.');
  }
  if (kind === 'path') {
    const path = value.path;
    if (
      !isNonEmptyStringArray(path)
    ) {
      throw new TypeError('dialog initialFocus path is invalid.');
    }
    return Object.freeze({ kind: 'path', path: Object.freeze([...path]) });
  }
  if (kind === 'element') {
    if (
      typeof value.elementId !== 'string' ||
      value.elementId.trim() === ''
    ) {
      throw new TypeError('dialog initialFocus element is invalid.');
    }
    return Object.freeze({ kind: 'element', elementId: value.elementId });
  }
  if (
    typeof value.elementId !== 'string' ||
    value.elementId.trim() === '' ||
    typeof value.targetId !== 'string' ||
    value.targetId.trim() === ''
  ) {
    throw new TypeError('dialog initialFocus element target is invalid.');
  }
  return Object.freeze({
    kind: 'elementTarget',
    elementId: value.elementId,
    targetId: value.targetId,
  });
}

function isNonEmptyStringArray(value: unknown): value is readonly string[] {
  return Array.isArray(value) &&
    value.length > 0 &&
    value.every((segment) => typeof segment === 'string' && segment.trim() !== '');
}

function prepareDialogDismissal(
  value: DialogComponentOptions['dismissal'],
): DialogDismissal | undefined {
  if (value === undefined) return undefined;
  if (!isNonArrayObject(value)) throw new TypeError('dialog dismissal must be an object.');
  const escape = value.escape;
  const outsidePress = value.outsidePress;
  if (
    typeof escape !== 'boolean' || typeof outsidePress !== 'boolean' || (!escape && !outsidePress)
  ) {
    throw new TypeError('dialog dismissal must enable escape, outsidePress, or both.');
  }
  return escape
    ? Object.freeze({ escape: true as const, outsidePress })
    : Object.freeze({ escape: false as const, outsidePress: true as const });
}
