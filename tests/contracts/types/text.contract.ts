import {
  createTerminalTextIndex,
  measureTextCells,
  sanitizeTerminalText,
  type TextSelection
} from '@ismail-elkorchi/terminal-ui/text';

const metrics = measureTextCells('A界');
const index = createTerminalTextIndex('A界');
const sanitized = sanitizeTerminalText('\u001B[31mtext');
const selection: TextSelection = { start: 0, end: 1 };

// @ts-expect-error text selections use numeric offsets
const invalidSelection: TextSelection = { start: '0', end: 1 };

void metrics;
void index;
void sanitized;
void selection;
void invalidSelection;
