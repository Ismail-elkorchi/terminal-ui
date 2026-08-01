import type {
  ElementAccessibility,
  ElementMeta
} from '../element/metadata.ts';
import { isNonArrayObject } from '../foundation/validation.ts';
import type { AccessibilityOptions, AccessibleNode } from '../accessibility/index.ts';

export type SemanticExtensionMeta<TPart extends string = string> =
Omit<ElementMeta<TPart>, 'accessibility'> & {
  readonly accessibility?: AccessibleNode | (AccessibilityOptions & { readonly decorative?: false });
};

export type DecorativeExtensionMeta<TPart extends string = string> =
Omit<ElementMeta<TPart>, 'accessibility' | 'focus'> & {
  readonly accessibility: AccessibilityOptions & { readonly decorative: true };
  readonly focus?: never;
};

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
  if (typeof value['name'] !== 'string' || !/^[A-Za-z][A-Za-z0-9_-]*$/u.test(value['name'])) {
    throw new TypeError(
      `${options.name} name must start with an ASCII letter and contain only ASCII letters, digits, "_", or "-".`
    );
  }
  if (!Array.isArray(value['parts'])
    || value['parts'].some((part) => typeof part !== 'string' || part.trim() === '' || part === 'root')
    || new Set(value['parts']).size !== value['parts'].length) {
    throw new TypeError(`${options.name} parts must contain unique, non-empty names other than "root".`);
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

function isDecorativeAccessibility(value: ElementAccessibility | undefined): boolean {
  return isNonArrayObject(value) && value['decorative'] === true && !('role' in value);
}
