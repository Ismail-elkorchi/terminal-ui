import {
  defaultTheme,
  defineTheme,
  resolveThemeColor,
  themeColor,
  type TerminalThemeDefinition
} from '@ismail-elkorchi/terminal-ui/theme';

const definition: TerminalThemeDefinition = { name: 'consumer' };
const theme = defineTheme(definition);
const foreground = resolveThemeColor(theme, 'text.default');
const accent = themeColor('accent.primary');
// @ts-expect-error theme references accept only core tokens or the custom.* namespace
themeColor('application.accent');

void defaultTheme;
void foreground;
void accent;
