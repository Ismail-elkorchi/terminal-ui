/** Complete built-in component catalog. Prefer a focused category entrypoint when practical. */
export * from './foundations.ts';
export * from './forms.ts';
export * from './collections.ts';
export * from './overlays.ts';
export * from './feedback.ts';
export * from './patterns.ts';
export * from './visualizations.ts';

export type * from '../ui-model/contracts.ts';
export type {
  InlineContent,
  InlineContentSegment,
  InlineSymbolSegment,
  InlineTextSegment,
} from '../visual/inline-content.ts';
export type {
  Element,
  ElementChildren,
  ElementChildrenMessage,
  ElementMessage,
  ElementValue,
} from '../element/index.ts';
export { inspectElement } from '../element/inspection.ts';
export type {
  ComponentCapabilityInspection,
  ComponentInspectionRecord,
  ComponentInspectionValue,
  ComponentSemanticInspection,
  ElementFactoryCategory,
  ElementFactoryIdentity,
  ElementFocusCapability,
  ElementInputInspection,
  ElementInspection,
  ElementMetaInspection,
} from '../element/inspection.ts';
export type * from '../ui-model/style-parts.ts';
