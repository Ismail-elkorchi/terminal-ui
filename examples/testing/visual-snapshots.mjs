import { createVisualSnapshot } from '@ismail-elkorchi/terminal-ui/testing';
import { renderWidgetFrame } from '@ismail-elkorchi/terminal-ui/tui';
import { progressBar, stack, statusBar } from '@ismail-elkorchi/terminal-ui/widgets';

const frame = renderWidgetFrame(stack([
  statusBar({ id: 'title', text: 'Snapshot example' }),
  progressBar({ id: 'progress', label: 'Progress', value: 3, max: 5 })
]), { columns: 36, rows: 5 });

const snapshot = createVisualSnapshot({ frame });

console.log(JSON.stringify({
  schemaVersion: snapshot.schemaVersion,
  plainTextFrame: snapshot.plainTextFrame,
  frameBytes: snapshot.frameJson.length
}));
