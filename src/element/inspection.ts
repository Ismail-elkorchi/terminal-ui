export type ElementFocusCapability = 'none' | 'item' | 'scope';
export type ElementFactoryCategory = 'component' | 'layout';

export interface ElementFactoryIdentity {
  readonly category: ElementFactoryCategory;
  readonly name: string;
}

export interface ComponentCapabilityInspection {
  readonly identity: 'required' | 'optional';
  readonly structure: 'leaf' | 'composite' | 'composed';
  readonly semantics: 'semantic' | 'decorative';
  readonly states: readonly ('disabled' | 'busy' | 'readOnly' | 'inert')[];
  readonly actions: readonly ('keyboard' | 'input' | 'paste' | 'pointer')[];
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
  readonly component?: ComponentCapabilityInspection;
  readonly id?: string;
  readonly inputs: ElementInputInspection;
  readonly meta: ElementMetaInspection;
  readonly children: readonly ElementInspection[];
}

export { inspectRegisteredElement as inspectElement } from './registry.ts';
