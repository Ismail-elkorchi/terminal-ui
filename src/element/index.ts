export type { ElementVisualState } from '../visual/frame-source.ts';
export type {
  ComponentCapabilityInspection,
  ComponentDefinitionInspection,
  ComponentInspectionRecord,
  ComponentInspectionValue,
  ComponentSemanticInspection,
  ElementFactoryCategory,
  ElementFactoryIdentity,
  ElementFocusCapability,
  ElementInputInspection,
  ElementInspection,
  ElementMetaInspection,
} from './inspection-contracts.ts';
export type {
  ElementAccessibility,
  ElementFocus,
  ElementFocusScope,
  ElementKeyBindings,
  ElementKeyEvent,
  ElementKeyHandler,
  ElementKeyTriggerBinding,
  ElementLayer,
  ElementMeta,
  ElementOptions,
  ElementOverflowPriority,
  ElementState,
  ElementStateStyles,
  ElementStyles,
  ElementTextRole,
  InteractiveElementOptions,
  LayerUnderlay,
  StructuralElementOptions,
  elementStateFields,
} from './metadata.ts';
export { inspectRegisteredElement as inspectElement } from './registry.ts';
export { decodeElementStyles, mergeElementStyles } from './styles.ts';
export type { ElementStyleContract } from './styles.ts';
export type {
  Element,
  ElementChildren,
  ElementChildrenMessage,
  ElementMessage,
  ElementMessageValue,
  ElementValue,
} from './types.ts';
