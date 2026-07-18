import {
  defaultTheme,
  defineTheme,
  resolveThemeColor,
  type TerminalThemeDefinition
} from '@ismail-elkorchi/terminal-ui/theme';

const definition: TerminalThemeDefinition = { name: 'consumer' };
const theme = defineTheme(definition);
const foreground = resolveThemeColor(theme, 'text.default');

// @ts-expect-error themes require a token definition, not arbitrary color fields
const invalidDefinition: TerminalThemeDefinition = { foreground: 'green' };

void defaultTheme;
void foreground;
void invalidDefinition;
