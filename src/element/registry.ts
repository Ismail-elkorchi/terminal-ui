import type { Element, ElementValue } from './types.ts';
import type { ElementInspection } from './inspection.ts';

const internals = new WeakMap<object, unknown>();
const inspections = new WeakMap<object, ElementInspection>();

export function registerElement<TMessage>(
  internal: unknown,
  inspection: ElementInspection
): Element<TMessage> {
  const element = Object.freeze({}) as Element<TMessage>;
  internals.set(element, internal);
  inspections.set(element, inspection);
  return element;
}

export function internalElementValue(element: ElementValue): unknown {
  const internal = isObject(element) ? internals.get(element) : undefined;
  if (internal === undefined) {
    throw new TypeError('Expected an Element created by a terminal-ui component or layout factory.');
  }
  return internal;
}

export function inspectRegisteredElement(element: ElementValue): ElementInspection {
  const inspection = isObject(element) ? inspections.get(element) : undefined;
  if (inspection === undefined) {
    throw new TypeError('Expected an Element created by a terminal-ui component or layout factory.');
  }
  return inspection;
}

function isObject(value: unknown): value is object {
  return typeof value === 'object' && value !== null;
}
