import { createScrollState, scrollReducer } from '@ismail-elkorchi/terminal-ui/behavior';
import { button, inspectElement, text } from '@ismail-elkorchi/terminal-ui/components';
import { column, surface } from '@ismail-elkorchi/terminal-ui/layout';
import { defaultTheme, resolveThemeColor } from '@ismail-elkorchi/terminal-ui/theme';

const action = { kind: 'save' };
const element = surface(column([
  text('Ready'),
  button({ id: 'save', label: 'Save', onPress: () => action })
]), { id: 'surface', appearance: 'raised' });
const state = scrollReducer(createScrollState({ contentRows: 10, viewportRows: 3 }), {
  kind: 'scrollLines',
  rows: 2
});
const accent = resolveThemeColor(defaultTheme, 'accent.primary');
const inspection = inspectElement(element);

invariant(
  inspection.kind === 'surface' &&
    inspection.category === 'layout' &&
    inspection.children.length === 1,
  'layout composition failed'
);
invariant(state.offsetRow === 2, 'behavior reducer failed');
invariant(accent !== undefined, 'theme token resolution failed');

console.log(JSON.stringify({ scenario: 'theme-usage', ok: true }));

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}
