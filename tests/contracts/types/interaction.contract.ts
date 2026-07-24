import {
  ignoreMessage,
  placeAnchoredSurface,
  pointerVisualState,
  resolveSelectedText,
  type AnchoredSurfacePlacement,
  type PointerInteractionAction,
  type PointerInteractionOptions,
  type PointerInteractionState
} from '@ismail-elkorchi/terminal-ui/interaction';

const placement: AnchoredSurfacePlacement = 'auto';
const bounds = placeAnchoredSurface({
  viewport: { row: 0, column: 0, width: 80, height: 24 },
  anchor: { kind: 'cursor', row: 2, column: 4 },
  size: { width: 10, height: 3 },
  placement
});
const selected = resolveSelectedText({
  sources: [{ id: 'document', text: 'terminal', selection: { startOffset: 0, endOffsetExclusive: 4 } }]
});
const ignored = ignoreMessage();
const pointerState: PointerInteractionState = { hoveredTargetId: 'save:control' };
const pointerAction: PointerInteractionAction = { kind: 'press', targetId: 'save:control' };
const pointerOptions: PointerInteractionOptions<PointerInteractionAction> = {
  state: pointerState,
  onAction: (action) => action
};
const pointerStyle = pointerVisualState(pointerState, 'save:control');

// @ts-expect-error placement vocabulary is closed
const invalidPlacement: AnchoredSurfacePlacement = 'center';
type RemovedPointerPresentationState =
  // @ts-expect-error pointer state is interaction data, not presentation data
  import('@ismail-elkorchi/terminal-ui/interaction').PointerPresentationState;

void bounds;
void selected;
void ignored;
void pointerAction;
void pointerOptions;
void pointerStyle;
void invalidPlacement;
void (undefined as unknown as RemovedPointerPresentationState);
