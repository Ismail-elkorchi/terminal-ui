import type { Element } from '../element/index.ts';
import { inspectElementInternal } from '../render-node/element.ts';

export type ElementFocusCapability = 'none' | 'item' | 'scope';

export interface ElementInputInspection {
  readonly keyboard: boolean;
  readonly text: boolean;
  readonly paste: boolean;
  readonly focus: ElementFocusCapability;
}

export interface ElementMetaInspection {
  readonly accessibility: boolean;
  readonly styled: boolean;
  readonly styleParts: readonly string[];
  readonly styleStates: readonly string[];
  readonly layered: boolean;
}

export interface ElementInspection {
  readonly schemaVersion: 'terminal-ui.element.v1';
  readonly component: string;
  readonly id?: string;
  readonly inputs: ElementInputInspection;
  readonly meta: ElementMetaInspection;
  readonly children: readonly ElementInspection[];
}

/** Returns an immutable, renderer-independent description of an authored element tree. */
export function inspectElement(element: Element<unknown>): ElementInspection {
  return inspectElementInternal(element);
}
