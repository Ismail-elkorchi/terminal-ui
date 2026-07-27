import type { Element } from '../element/index.ts';
import type { ElementInspection } from '../element/inspection.ts';
import { inspectElementInternal } from '../renderer/model/element.ts';

/** Returns an immutable, renderer-independent description of an caller-supplied element tree. */
export function inspectElement(element: Element<unknown>): ElementInspection {
  return inspectElementInternal(element);
}

export type {
  ElementFocusCapability,
  ElementInputInspection,
  ElementInspection,
  ElementMetaInspection
} from '../element/inspection.ts';
