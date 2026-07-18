import { toAccessibleSnapshot, validateAccessibleSnapshot } from '@ismail-elkorchi/terminal-ui/accessibility';
import { text } from '@ismail-elkorchi/terminal-ui/components';
import { renderElementFrame, renderFramePlain } from '@ismail-elkorchi/terminal-ui/renderer';

const frame = renderElementFrame(text('Portable renderer'), { columns: 24, rows: 2 });
const plain = renderFramePlain(frame);
const snapshot = toAccessibleSnapshot({
  source: 'widget',
  root: { id: 'root', role: 'text', label: 'Portable renderer' }
});
const validation = validateAccessibleSnapshot(snapshot);

invariant(plain.includes('Portable renderer'), 'renderer projection failed');
invariant(validation.ok, 'accessibility validation failed');

console.log(JSON.stringify({ scenario: 'renderer-accessibility', ok: true }));

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}
