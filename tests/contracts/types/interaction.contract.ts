import {
  ignoreMessage,
  placeAnchoredSurface,
  pointerVisualState,
  type AnchoredSurfacePlacement,
  type PointerInteractionState
} from '@ismail-elkorchi/terminal-ui/interaction';

const placement: AnchoredSurfacePlacement = 'auto';
const bounds = placeAnchoredSurface({
  viewport: { row: 0, column: 0, width: 80, height: 24 },
  anchor: { kind: 'cursor', row: 2, column: 4 },
  size: { width: 10, height: 3 },
  placement
});
const ignored = ignoreMessage();
const pointerState: PointerInteractionState = { hoveredTargetId: 'save:control' };
const pointerStyle = pointerVisualState(pointerState, 'save:control');

// @ts-expect-error placement vocabulary is closed
const invalidPlacement: AnchoredSurfacePlacement = 'center';

void bounds;
void ignored;
void pointerStyle;
void invalidPlacement;
