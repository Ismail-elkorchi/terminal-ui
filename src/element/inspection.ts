export type ElementFocusCapability = 'none' | 'item' | 'scope';
export type ElementFactoryCategory = 'component' | 'layout';
export type ElementFactoryOrigin = 'builtin' | 'defined';

export interface ElementFactoryIdentity {
  readonly category: ElementFactoryCategory;
  readonly origin: ElementFactoryOrigin;
  readonly name: string;
}

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
  readonly factory: ElementFactoryIdentity;
  readonly id?: string;
  readonly inputs: ElementInputInspection;
  readonly meta: ElementMetaInspection;
  readonly children: readonly ElementInspection[];
}
