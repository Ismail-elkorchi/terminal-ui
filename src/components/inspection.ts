import type { Element } from '../element/index.ts';
import { inspectElement as inspectPublicElement } from '../element/inspection.ts';
import type { ElementInspection } from '../element/inspection.ts';

/** Returns an immutable, renderer-independent description of a caller-supplied element tree. */
export function inspectElement(element: Element<unknown>): ElementInspection {
  return inspectPublicElement(element);
}

export type {
  ElementFactoryCategory,
  ElementFactoryIdentity,
  ComponentCapabilityInspection,
  ElementFocusCapability,
  ElementInputInspection,
  ElementInspection,
  ElementMetaInspection
} from '../element/inspection.ts';
