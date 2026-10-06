import { textInput, type TerminalStyle as RootTerminalStyle } from '@ismail-elkorchi/terminal-ui';
import { ignoreMessage } from '@ismail-elkorchi/terminal-ui/component';
import {
  createFrameBuffer, mergeTerminalStyles, span, type TerminalColor, type TerminalStyle,
} from '@ismail-elkorchi/terminal-ui/renderer';
import { defaultTheme, resolveTerminalStyle } from '@ismail-elkorchi/terminal-ui/theme';

const transparent: TerminalStyle = { bg: null };
const rootStyle: RootTerminalStyle = transparent;
const merged: TerminalStyle | undefined = mergeTerminalStyles({ bg: { kind: 'default' } }, transparent);
const resolved: TerminalStyle | undefined = resolveTerminalStyle(transparent, defaultTheme);
const native = textInput({
  id: 'transparent', state: { text: 'Native', cursor: 6 }, onTransition: () => ignoreMessage(),
  meta: { layer: { zIndex: 1, underlay: 'inheritBackground' } },
  styles: {
    root: { fg: { kind: 'ansi', value: 7 } },
    parts: { border: { bg: null }, value: { bg: null }, placeholder: { bg: null } },
    states: { focused: { parts: { border: { bg: { kind: 'ansi', value: 4 } } } },
      selected: { parts: { selection: { bg: { kind: 'ansi', value: 3 } } } } },
  },
});
const buffer = createFrameBuffer(2, 1);
buffer.write(1, 1, [span('T', { style: rootStyle })]);
buffer.writeCell({ row: 1, column: 2, width: 1, text: 'U', style: transparent });
buffer.snapshot({ canvasStyle: transparent, cursor: { row: 1, column: 1, style: transparent } });

// @ts-expect-error foreground does not accept a background clearing policy
const badForeground: TerminalStyle = { fg: null };
// @ts-expect-error null is a style background policy rather than a TerminalColor
const badColor: TerminalColor = null;
// @ts-expect-error background clearing uses null rather than a color kind
const badKind: TerminalStyle = { bg: { kind: 'transparent' } };

void merged;
void resolved;
void native;
void badForeground;
void badColor;
void badKind;
