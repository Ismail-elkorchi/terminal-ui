import { textInput, type TerminalStyle as RootTerminalStyle } from '@ismail-elkorchi/terminal-ui';
import { defineComponent, ignoreMessage } from '@ismail-elkorchi/terminal-ui/component';
import { overlay } from '@ismail-elkorchi/terminal-ui/layout';
import {
  createFrameBuffer, mergeTerminalStyles, renderElementFrame, renderFramePlain, sameTerminalStyle, span,
  type TerminalColor, type TerminalStyle,
} from '@ismail-elkorchi/terminal-ui/renderer';
import { defaultTheme, resolveTerminalStyle, terminalStyleHasBackground } from '@ismail-elkorchi/terminal-ui/theme';

const transparent: TerminalStyle = { bg: null, underline: true };
const rootTransparent: RootTerminalStyle = transparent;
const colors: readonly TerminalColor[] = [
  { kind: 'ansi', value: 1 }, { kind: 'ansi', value: 2 }, { kind: 'ansi', value: 4 },
];
const backing = defineComponent()({
  name: 'packed-consumer/background-backing', identity: 'optional', structure: 'leaf', semantics: 'decorative',
  measure: () => ({ minWidth: 12, minHeight: 1, preferredWidth: 12, preferredHeight: 1 }),
  render: ({ target }) => { target.write(0, 0, colors.map(bg => span('....', { style: { bg } }))); },
});

// @ts-expect-error null clears a background; it is not a terminal color
const invalidColor: TerminalColor = null;
// @ts-expect-error foregrounds do not have background inheritance semantics
const invalidForeground: TerminalStyle = { fg: null };
// @ts-expect-error background inheritance is explicitly null, not a string
const invalidKeyword: TerminalStyle = { bg: 'transparent' };
void invalidColor; void invalidForeground; void invalidKeyword;

export function verifyBackgroundInheritance(): void {
  const clear = mergeTerminalStyles({ bg: { kind: 'ansi', value: 5 } }, rootTransparent);
  if (clear?.bg !== null || sameTerminalStyle(clear, { underline: true })) {
    throw new Error('Packed style merge erased the explicit background inheritance policy.');
  }
  if (resolveTerminalStyle(clear, defaultTheme)?.bg !== null || terminalStyleHasBackground(clear, defaultTheme)) {
    throw new Error('Packed theme resolution treated null as a palette color.');
  }
  const buffer = createFrameBuffer(1, 1);
  buffer.write(1, 1, [span('X', { style: transparent })]);
  if (buffer.snapshot().cells[0]?.style?.bg !== undefined) {
    throw new Error('Packed frame buffer materialized null without a destination background.');
  }
  const frame = renderElementFrame(overlay([
    backing({}),
    textInput({ id: 'transparent-input', meta: { accessibleName: 'Transparent input',
      layer: { zIndex: 10, underlay: 'inheritBackground' } },
      state: { text: 'ABCDEFGH', cursor: 8 }, onTransition: () => ignoreMessage(),
      styles: { parts: { border: { bg: null }, value: { bg: null }, placeholder: { bg: null } } },
    }),
  ]), { columns: 12, rows: 1 });
  if (!renderFramePlain(frame).includes('ABCDEFGH')) throw new Error('Packed native input did not paint.');
  for (let column = 1; column <= 12; column++) {
    const cell = frame.cells.find(candidate => candidate.row === 1 && candidate.column === column);
    if (!sameTerminalStyle({ bg: colors[Math.floor((column - 1) / 4)] as TerminalColor },
      cell?.style?.bg === undefined ? {} : { bg: cell.style.bg })) {
      throw new Error(`Packed native input lost destination background at column ${String(column)}.`);
    }
  }
}
