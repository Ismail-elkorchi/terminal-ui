export { ComponentExecutionError, defineComponent } from './definition.ts';
export type {
  ComponentAccessibilityInput,
  ComponentCapturedMessageInput,
  ComponentCompositionInput,
  ComponentDefinition,
  ComponentDefinitionName,
  ComponentExecutionPhase,
  ComponentIdentity,
  ComponentInput,
  ComponentInteractionInput,
  ComponentLayoutInput,
  ComponentMeasureConstraints,
  ComponentMeasureInput,
  ComponentMessage,
  ComponentPointerActions,
  ComponentPreparationContext,
  ComponentRenderInput,
  ComponentSlotCardinality,
  ComponentSlotDefinition,
  ComponentSlotLayout,
  ComponentSlotMessagePolicy,
  ComponentSlotOwner,
  ComponentSlotShape,
  ComponentSlotsDefinition,
  ComponentCallerSlotValues,
  ComponentImplementationSlotValues,
  ComponentSourceInput,
  ComponentMetadataCapability,
  ComponentMetadataOptions,
  ComponentStateCapability,
  ComponentStyleInput,
  ComponentTextActionInput,
  DecorativeLeafComponentFactory,
  DecorativeLeafComponentDefinition,
  SemanticCompositeComponentFactory,
  SemanticCompositeComponentDefinition,
  SemanticComposedComponentDefinition,
  SemanticLeafComponentFactory,
  SemanticLeafComponentDefinition
} from './definition.ts';
export type {
  Element,
  ElementChildren,
  ElementChildrenMessage,
  ElementMessage
} from '../element/index.ts';
export { ignoreMessage } from '../interaction/message.ts';
export { mapComponentStyles } from './styles.ts';
export type { ComponentStylePartMapping } from './styles.ts';
export { assertComponentOptions } from './options.ts';
export type {
  CompleteComponentOptionFields,
  ComponentCallbackRequirement,
  ComponentOptionKey,
  ComponentOptionsSchema,
} from './options.ts';
export type { IgnoredMessage, MessageResolution } from '../interaction/message.ts';
export {
  adjacentItemId,
  collectionInteractionReducer,
  defaultNavigationPolicy,
  formatKeyboardBinding,
  normalizeCollectionInteraction,
  popupReducer,
} from '../interaction/index.ts';
export type {
  CollectionInteractionAction,
  CollectionInteractionOptions,
  CollectionInteractionState,
  KeyboardBinding,
  NavigationPolicy,
  PopupState,
  PopupTransition,
  SelectionPolicy,
  SelectionState,
} from '../interaction/index.ts';
export {
  matchCollectionQuery,
  normalizeCollectionQuery,
  queryCandidates,
} from '../ui-model/query.ts';
export type {
  CollectionQuery,
  QueryCandidate,
  QueryMatch,
  QueryMatchRange,
} from '../ui-model/query.ts';
export {
  clipRenderLine,
  clipRenderSpans,
  line,
  measureRenderSpans,
  padRenderLine,
  span,
  wrapRenderSpans
} from '../visual/render.ts';
export type { RenderBlock, RenderLine, RenderSpan, TerminalStyle } from '../visual/render.ts';
export type { HitTarget } from '../renderer/contracts.ts';
export { normalizeTerminalStyle as prepareTerminalStyle } from '../visual/terminal-style.ts';
export {
  componentScrollbarHitTargets,
  paintComponentScrollbar,
  prepareComponentScrollbar,
  prepareComponentScrollbarOptions,
  prepareComponentScrollPolicy,
  prepareComponentScrollState
} from './scrollbar.ts';
export type {
  ComponentScrollbarLayout,
  ComponentScrollbarPlan,
  ComponentScrollbarThumb,
  ComponentScrollbarTrack
} from './scrollbar.ts';
