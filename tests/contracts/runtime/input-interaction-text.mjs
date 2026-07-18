import { createInputDecoder } from '@ismail-elkorchi/terminal-ui/input';
import { placeAnchoredSurface, resolveSelectedText } from '@ismail-elkorchi/terminal-ui/interaction';
import { measureTextCells, sanitizeTerminalText } from '@ismail-elkorchi/terminal-ui/text';

const decoded = createInputDecoder().decode({ data: '\r' });
const placed = placeAnchoredSurface({
  viewport: { row: 0, column: 0, width: 20, height: 10 },
  anchor: { kind: 'cursor', row: 1, column: 2 },
  size: { width: 5, height: 2 }
});
const selected = resolveSelectedText({
  sources: [{ id: 'source', text: 'terminal', selection: { start: 0, end: 4 } }]
});
const width = measureTextCells('A界').cells;
const sanitized = sanitizeTerminalText('\u001B[31mtext');

invariant(decoded.events[0]?.kind === 'key' && decoded.events[0].key === 'enter', 'input decoding failed');
invariant(placed.width === 5 && placed.height === 2, 'anchored placement failed');
invariant(selected.ok && selected.text === 'term', 'selection projection failed');
invariant(width === 3, 'terminal width measurement failed');
invariant(!sanitized.text.includes('\u001B'), 'terminal sanitization failed');

console.log(JSON.stringify({ scenario: 'input-interaction-text', ok: true }));

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}
