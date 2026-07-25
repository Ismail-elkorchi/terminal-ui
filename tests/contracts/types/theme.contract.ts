import {
  defaultTheme,
  defineTheme,
  resolveThemeColor,
  type TerminalThemeDefinition
} from '@ismail-elkorchi/terminal-ui/theme';

const definition: TerminalThemeDefinition = { name: 'consumer' };
const theme = defineTheme(definition);
const foreground = resolveThemeColor(theme, 'text.default');

void defaultTheme;
void foreground;
