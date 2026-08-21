export type ElementFocusCapability = 'none' | 'item' | 'scope';
export type ElementFactoryCategory = 'component' | 'layout';

export interface ElementFactoryIdentity {
  readonly category: ElementFactoryCategory;
  readonly name: string;
}

interface ComponentCapabilityInspectionBase {
  readonly identity: 'required' | 'optional';
  readonly structure: 'leaf' | 'composite' | 'composed';
  readonly states: readonly ('disabled' | 'busy' | 'readOnly' | 'inert')[];
  readonly actions: readonly ('keyboard' | 'input' | 'paste' | 'pointer' | 'focus')[];
  readonly styleParts: readonly string[];
  readonly visualStates: readonly Exclude<import('./metadata.ts').ElementVisualState, 'default'>[];
}

export type ComponentCapabilityInspection =
  | (ComponentCapabilityInspectionBase & {
      readonly semantics: 'semantic';
      readonly accessibleRole: import('../accessibility/types.ts').AccessibleRole;
    })
  | (ComponentCapabilityInspectionBase & {
      readonly semantics: 'decorative';
      readonly accessibleRole?: never;
    });

export interface ComponentDefinitionInspection extends ComponentCapabilityInspectionBase {
  readonly semantics: 'semantic' | 'decorative';
  readonly accessibleRole?: import('../accessibility/types.ts').AccessibleRole;
}

export type ComponentInspectionValue =
  | null
  | string
  | number
  | boolean
  | readonly ComponentInspectionValue[]
  | ComponentInspectionRecord;

export interface ComponentInspectionRecord {
  readonly [field: string]: ComponentInspectionValue;
}

export interface ComponentSemanticInspection {
  readonly value?: ComponentInspectionValue;
  readonly active?: ComponentInspectionValue;
  readonly selection?: ComponentInspectionValue;
  readonly validation?: {
    readonly required?: boolean;
    readonly invalid: boolean;
    readonly message?: string;
  };
  readonly collection?: {
    readonly startIndex?: number;
    readonly totalCount?: number;
    readonly visibleCount?: number;
  };
  readonly redacted?: true;
  readonly details?: ComponentInspectionRecord;
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
  readonly configuredStyleParts: readonly string[];
  readonly configuredStyleStates: readonly string[];
  readonly layered: boolean;
}

export interface ElementInspection {
  readonly factory: ElementFactoryIdentity;
  readonly component?: ComponentCapabilityInspection;
  readonly semantic?: ComponentSemanticInspection;
  readonly id?: string;
  readonly inputs: ElementInputInspection;
  readonly meta: ElementMetaInspection;
  readonly children: readonly ElementInspection[];
}

export { inspectRegisteredElement as inspectElement } from './registry.ts';
