import { createInputDecoder } from '@ismail-elkorchi/terminal-ui/input';
import { placeAnchoredSurface, resolveSelectedText } from '@ismail-elkorchi/terminal-ui/interaction';
import {
  createTerminalTextIndex,
  editTextBuffer,
  measureTextCells,
  sanitizeTerminalText,
  selectedText,
  wordSelectionAt
} from '@ismail-elkorchi/terminal-ui/text';

const decoded = createInputDecoder().decode({ data: '\r' });
const placed = placeAnchoredSurface({
  viewport: { row: 0, column: 0, width: 20, height: 10 },
  anchor: { kind: 'cursor', row: 1, column: 2 },
  size: { width: 5, height: 2 }
});
const selected = resolveSelectedText({
  sources: [{ id: 'source', text: 'terminal', selection: { startOffset: 0, endOffsetExclusive: 4 } }]
});
const width = measureTextCells('A界').cells;
const sanitized = sanitizeTerminalText('\u001B[31mtext');
const wordCases = [
  ['hello,world', 6, 'world'],
  ['مرحبا،العالم', 7, 'العالم'],
  ['你好世界', 2, '世界'],
  ['e\u0301lan', 1, 'e\u0301lan']
];

invariant(decoded.events[0]?.kind === 'key' && decoded.events[0].key === 'enter', 'input decoding failed');
invariant(placed.width === 5 && placed.height === 2, 'anchored placement failed');
invariant(selected.ok && selected.text === 'term', 'selection resolution failed');
invariant(width === 3, 'terminal width measurement failed');
invariant(!sanitized.text.includes('\u001B'), 'terminal sanitization failed');
for (const [value, offset, expected] of wordCases) {
  const selection = wordSelectionAt(value, offset);
  invariant(
    selectedText(value, selection) === expected,
    `Unicode word selection failed for ${value}`
  );
  const index = createTerminalTextIndex(value);
  invariant(
    index.graphemeIndexToCodeUnitOffset(
      index.codeUnitOffsetToGraphemeIndex(selection.startOffset)
    ) === selection.startOffset,
    `word start split a grapheme for ${value}`
  );
  invariant(
    index.graphemeIndexToCodeUnitOffset(
      index.codeUnitOffsetToGraphemeIndex(selection.endOffsetExclusive)
    ) === selection.endOffsetExclusive,
    `word end split a grapheme for ${value}`
  );
}
const emojiSelection = wordSelectionAt('go👩‍💻now', 3);
invariant(
  emojiSelection.startOffset === emojiSelection.endOffsetExclusive,
  'emoji must remain outside word-like selection'
);
invariant(
  editTextBuffer(
    { text: 'مرحبا،العالم', cursor: 'مرحبا،'.length },
    { kind: 'moveWordRight' }
  ).cursor === 'مرحبا،العالم'.length,
  'Unicode word movement failed'
);

console.log(JSON.stringify({ scenario: 'input-interaction-text', ok: true }));

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}
