import { defineComponent, ignoreMessage } from '../../component/index.ts';
import type { Element, ElementMessage } from '../../element/index.ts';
import type { ElementStyles } from '../../element/metadata.ts';
import { isNonArrayObject } from '../../foundation/validation.ts';
import type { LayoutFlowOptions } from '../../geometry/types.ts';
import { column, portal, prepareLayoutFlowOptions, surface } from '../../layout/index.ts';
import type { InitialFocusSelector } from '../../interaction/focus.ts';
import type { MessageResolution } from '../../interaction/message.ts';
import type { DialogOptions } from '../options/dialog.ts';
import type { DialogAction, DialogDismissal, DialogFocusPolicy } from '../../ui-model/dialog.ts';
import type { DialogStylePart, SurfaceStylePart } from '../../ui-model/style-parts.ts';
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

const dialogSlots = {
  content: { cardinality: 'one', owner: 'caller', messages: 'bubble' },
  actions: { cardinality: 'optional', owner: 'caller', messages: 'bubble' },
} as const;

const instantiateDialog = defineComponent<
  Omit<DialogOptions<unknown>, 'id' | 'slots' | 'meta' | 'onAction'>,
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
  slots: dialogSlots,
  metadata: ['focus', 'layer', 'styles'],
  parts: ['background', 'border', 'title', 'actionSeparator'],
  optionFields: {
    title: null,
    border: null,
    width: null,
    height: null,
    modal: null,
    focusPolicy: null,
    dismissal: null,
    gap: null,
    padding: null,
    margin: null,
    minWidth: null,
    minHeight: null,
    maxWidth: null,
    maxHeight: null,
    align: null,
    justify: null,
    overflow: null,
  },
  prepare(value) {
    if (!isNonArrayObject(value)) throw new TypeError('dialog options must be an object.');
    const modal = value['modal'];
    if (typeof modal !== 'boolean') throw new TypeError('dialog modal must be a boolean.');
    const title = prepareDialogTitle(value['title']);
    const border = prepareDialogBorder(value['border']) ?? { kind: 'single' as const };
    const width = prepareDialogDimension(value['width'], 'width');
    const height = prepareDialogDimension(value['height'], 'height');
    const focusPolicy = prepareDialogFocusPolicy(value['focusPolicy'], modal);
    const dismissal = prepareDialogDismissal(value['dismissal']);
    const layout = prepareLayoutFlowOptions(value, 'dialog');
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
      label: borderTitleAccessibleText(title),
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
          styles: {
            ...(styles?.root === undefined ? {} : { root: styles.root }),
            ...(styles?.parts?.actionSeparator === undefined
              ? styles?.parts?.border === undefined ? {} : { parts: { line: styles.parts.border } }
              : { parts: { line: styles.parts.actionSeparator } }),
          },
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
      ...(styles === undefined ? {} : { meta: { styles: dialogSurfaceStyles(styles) } }),
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
      label: model.label || id,
      ...(model.modal
        ? { scope: { kind: 'modal' as const, trapsFocus: true, obscuresBackground: true } }
        : {}),
      children,
    };
  },
});

export function dialog<
  const TContent extends Element<unknown>,
  const TActions extends Element<unknown> | undefined = undefined,
  const TMessage extends NonNullable<unknown> | null = never,
>(
  options: Omit<DialogOptions<TMessage>, 'slots'> & {
    readonly slots: { readonly content: TContent; readonly actions?: TActions };
  },
): Element<ElementMessage<TContent> | ElementMessage<NonNullable<TActions>> | TMessage> {
  const actionMapper = (action: DialogAction): MessageResolution<TMessage> =>
    options.onAction === undefined ? ignoreMessage() : options.onAction(action);
  return instantiateDialog({
    ...options,
    slots: options.slots,
    onAction: actionMapper,
  });
}

function prepareDialogTitle(value: unknown): BorderTitle | undefined {
  if (value === undefined) return undefined;
  if (!isBorderTitle(value)) throw new TypeError('dialog title is invalid.');
  try {
    return normalizeBorderTitle(value);
  } catch (cause) {
    throw new TypeError('dialog title is invalid.', { cause });
  }
}

function isBorderTitle(value: unknown): value is BorderTitle {
  if (typeof value === 'string') return true;
  if (Array.isArray(value)) return isBorderTitleContent(value);
  if (!isNonArrayObject(value)) return false;
  const unsupported = Object.keys(value).find((field) =>
    field !== 'start' && field !== 'center' && field !== 'end'
  );
  return unsupported === undefined &&
    ['start', 'center', 'end'].every((field) =>
      value[field] === undefined || isBorderTitleContent(value[field])
    );
}

function isBorderTitleContent(value: unknown): boolean {
  return typeof value === 'string' ||
    Array.isArray(value) && value.every((segment) =>
        isNonArrayObject(segment) &&
        (segment['kind'] === 'text' && typeof segment['text'] === 'string' ||
          segment['kind'] === 'symbol' &&
            typeof segment['unicode'] === 'string' &&
            typeof segment['ascii'] === 'string' &&
            typeof segment['accessibleText'] === 'string')
      );
}

function prepareDialogBorder(value: unknown): BorderOptions | undefined {
  if (value === undefined) return undefined;
  if (!isNonArrayObject(value)) throw new TypeError('dialog border must be an object.');
  const unsupported = Object.keys(value).find((field) =>
    field !== 'kind' && field !== 'titleAlign'
  );
  if (unsupported !== undefined) {
    throw new TypeError(`dialog border contains unknown field "${unsupported}".`);
  }
  const kind = value['kind'];
  if (
    kind !== 'none' &&
    kind !== 'single' &&
    kind !== 'double' &&
    kind !== 'rounded' &&
    kind !== 'heavy' &&
    kind !== 'ascii' &&
    kind !== 'dashed' &&
    kind !== 'dotted' &&
    kind !== 'empty'
  ) {
    throw new TypeError('dialog border.kind is invalid.');
  }
  const titleAlign = value['titleAlign'];
  if (
    titleAlign !== undefined &&
    titleAlign !== 'start' &&
    titleAlign !== 'center' &&
    titleAlign !== 'end'
  ) {
    throw new TypeError('dialog border.titleAlign is invalid.');
  }
  return Object.freeze({ kind, ...(titleAlign === undefined ? {} : { titleAlign }) });
}

function prepareDialogDimension(value: unknown, name: 'width' | 'height'): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`dialog ${name} must be a non-negative safe integer.`);
  }
  return value;
}

function prepareDialogFocusPolicy(value: unknown, modal: boolean): DialogFocusPolicy | undefined {
  if (!modal) {
    if (value !== undefined) throw new TypeError('Non-modal dialog cannot define focusPolicy.');
    return undefined;
  }
  if (!isNonArrayObject(value)) throw new TypeError('Modal dialog requires focusPolicy.');
  const unsupported = Object.keys(value).find((field) =>
    field !== 'initialFocus' && field !== 'returnFocus'
  );
  if (unsupported !== undefined) {
    throw new TypeError(`dialog focusPolicy contains unknown field "${unsupported}".`);
  }
  if (value['returnFocus'] !== 'restore' && value['returnFocus'] !== 'none') {
    throw new TypeError('dialog focusPolicy.returnFocus must be "restore" or "none".');
  }
  const initialFocus = value['initialFocus'] === undefined
    ? undefined
    : prepareInitialFocus(value['initialFocus']);
  return Object.freeze({
    ...(initialFocus === undefined ? {} : { initialFocus }),
    returnFocus: value['returnFocus'],
  });
}

function prepareInitialFocus(value: unknown): InitialFocusSelector {
  if (!isNonArrayObject(value)) throw new TypeError('dialog initialFocus must be an object.');
  if (value['kind'] === 'path') {
    const path = value['path'];
    if (
      Object.keys(value).some((field) => field !== 'kind' && field !== 'path') ||
      !isNonEmptyStringArray(path)
    ) {
      throw new TypeError('dialog initialFocus path is invalid.');
    }
    return Object.freeze({ kind: 'path', path: Object.freeze(path) });
  }
  if (value['kind'] === 'element') {
    if (
      Object.keys(value).some((field) => field !== 'kind' && field !== 'elementId') ||
      typeof value['elementId'] !== 'string' ||
      value['elementId'].trim() === ''
    ) {
      throw new TypeError('dialog initialFocus element is invalid.');
    }
    return Object.freeze({ kind: 'element', elementId: value['elementId'] });
  }
  if (value['kind'] === 'elementTarget') {
    if (
      Object.keys(value).some((field) =>
        field !== 'kind' && field !== 'elementId' && field !== 'targetId'
      ) ||
      typeof value['elementId'] !== 'string' ||
      value['elementId'].trim() === '' ||
      typeof value['targetId'] !== 'string' ||
      value['targetId'].trim() === ''
    ) {
      throw new TypeError('dialog initialFocus element target is invalid.');
    }
    return Object.freeze({
      kind: 'elementTarget',
      elementId: value['elementId'],
      targetId: value['targetId'],
    });
  }
  throw new TypeError('dialog initialFocus kind is invalid.');
}

function isNonEmptyStringArray(value: unknown): value is readonly string[] {
  return Array.isArray(value) &&
    value.length > 0 &&
    value.every((segment) => typeof segment === 'string' && segment.trim() !== '');
}

function prepareDialogDismissal(value: unknown): DialogDismissal | undefined {
  if (value === undefined) return undefined;
  if (!isNonArrayObject(value)) throw new TypeError('dialog dismissal must be an object.');
  const unsupported = Object.keys(value).find((field) =>
    field !== 'escape' && field !== 'outsidePress'
  );
  if (unsupported !== undefined) {
    throw new TypeError(`dialog dismissal contains unknown field "${unsupported}".`);
  }
  const escape = value['escape'];
  const outsidePress = value['outsidePress'];
  if (
    typeof escape !== 'boolean' || typeof outsidePress !== 'boolean' || (!escape && !outsidePress)
  ) {
    throw new TypeError('dialog dismissal must enable escape, outsidePress, or both.');
  }
  return escape
    ? Object.freeze({ escape: true as const, outsidePress })
    : Object.freeze({ escape: false as const, outsidePress: true as const });
}

function dialogSurfaceStyles(
  styles: ElementStyles<DialogStylePart>,
): ElementStyles<SurfaceStylePart> {
  return {
    ...(styles.root === undefined ? {} : { root: styles.root }),
    ...(styles.states === undefined ? {} : { states: styles.states }),
    ...(styles.parts === undefined ? {} : {
      parts: {
        ...(styles.parts.background === undefined ? {} : { background: styles.parts.background }),
        ...(styles.parts.border === undefined ? {} : { border: styles.parts.border }),
        ...(styles.parts.title === undefined ? {} : { title: styles.parts.title }),
      },
    }),
  };
}
