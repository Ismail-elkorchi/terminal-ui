export type ElementFocusCapability = 'none' | 'item' | 'scope';
export type ElementFactoryCategory = 'component' | 'layout';

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
  readonly category: ElementFactoryCategory;
  readonly kind: string;
  readonly id?: string;
  readonly inputs: ElementInputInspection;
  readonly meta: ElementMetaInspection;
  readonly children: readonly ElementInspection[];
}
