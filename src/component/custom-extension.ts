import type {
  ElementAccessibility,
  ElementMeta
} from '../element/metadata.ts';
import { isNonArrayObject } from '../foundation/validation.ts';
import type { AccessibilityOptions, AccessibleNode } from '../accessibility/index.ts';
import type { Measurement } from '../renderer/contracts.ts';

export type SemanticExtensionMeta = Omit<ElementMeta, 'accessibility'> & {
  readonly accessibility?: AccessibleNode | (AccessibilityOptions & { readonly decorative?: false });
};

export type DecorativeExtensionMeta = Omit<ElementMeta, 'accessibility' | 'focus'> & {
  readonly accessibility: AccessibilityOptions & { readonly decorative: true };
  readonly focus?: never;
};

export const CUSTOM_ZERO_MEASUREMENT: Measurement = Object.freeze({
  minWidth: 0,
  minHeight: 0,
  preferredWidth: 0,
  preferredHeight: 0
});

export function assertCustomExtensionRenderer(
  value: unknown,
  options: {
    readonly name: string;
    readonly requiredHooks: readonly string[];
    readonly optionalHooks: readonly string[];
    readonly accessibility: ElementAccessibility | undefined;
  }
): void {
  if (!isNonArrayObject(value)) {
    throw new TypeError(`${options.name} must be an object.`);
  }
  for (const hook of options.requiredHooks) {
    if (typeof value[hook] !== 'function') {
      throw new TypeError(`${options.name} requires a ${hook} function.`);
    }
  }
  const decorative = isDecorativeAccessibility(options.accessibility);
  if (decorative && 'accessibility' in value) {
    throw new TypeError(`${options.name} marked decorative must omit the accessibility hook.`);
  }
  for (const hook of options.optionalHooks) {
    if (value[hook] !== undefined && typeof value[hook] !== 'function') {
      throw new TypeError(`${options.name} field "${hook}" must be a function.`);
    }
  }
  if (!decorative && 'accessibility' in value && typeof value['accessibility'] !== 'function') {
    throw new TypeError(`${options.name} field "accessibility" must be a function.`);
  }
  if (!decorative && typeof value['accessibility'] !== 'function') {
    throw new TypeError(`${options.name} must provide accessibility or be marked decorative.`);
  }
}

export function customExtensionCanFocus(
  renderer: { readonly focusTargets?: unknown },
  options: {
    readonly onInput?: unknown;
    readonly onPaste?: unknown;
    readonly keys?: object;
  }
): boolean {
  return renderer.focusTargets !== undefined
    || options.onInput !== undefined
    || options.onPaste !== undefined
    || (options.keys !== undefined && Object.keys(options.keys).length > 0);
}

function isDecorativeAccessibility(value: ElementAccessibility | undefined): boolean {
  return isNonArrayObject(value) && value['decorative'] === true && !('role' in value);
}
