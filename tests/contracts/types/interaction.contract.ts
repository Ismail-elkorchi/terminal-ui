import {
  ignoreMessage,
  placeAnchoredSurface,
  resolveSelectedText,
  type AnchoredSurfacePlacement
} from '@ismail-elkorchi/terminal-ui/interaction';

const placement: AnchoredSurfacePlacement = 'auto';
const bounds = placeAnchoredSurface({
  viewport: { row: 0, column: 0, width: 80, height: 24 },
  anchor: { kind: 'cursor', row: 2, column: 4 },
  size: { width: 10, height: 3 },
  placement
});
const selected = resolveSelectedText({
  sources: [{ id: 'document', text: 'terminal', selection: { start: 0, end: 4 } }]
});
const ignored = ignoreMessage();

// @ts-expect-error placement vocabulary is closed
const invalidPlacement: AnchoredSurfacePlacement = 'center';

void bounds;
void selected;
void ignored;
void invalidPlacement;
