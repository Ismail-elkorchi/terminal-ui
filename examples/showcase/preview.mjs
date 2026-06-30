import { createShowcaseSnapshot, initialShowcaseState } from './app.mjs';

const previous = initialShowcaseState();
const current = {
  ...previous,
  selectedRoute: 'diagram',
  selectedNavigation: 'diagram',
  selectedInspector: 'route',
  commandQuery: 'map',
  commandValue: '/map',
  commandCursor: 4,
  progress: 88,
  spinnerFrame: 4
};

const snapshot = createShowcaseSnapshot(current, previous);
const frame = JSON.parse(snapshot.frameJson);
const accessibility = JSON.parse(snapshot.accessibilityJson);
const diff = JSON.parse(snapshot.diffJson);
const hitTargets = JSON.parse(snapshot.hitTargetJson);
const focus = JSON.parse(snapshot.focusTargetJson);

console.log('Northstar Control visual preview');
console.log(`schema: ${snapshot.schemaVersion}`);
console.log(`frame: ${String(frame.width)}x${String(frame.height)} cells=${String(frame.cells.length)}`);
console.log(`diff operations: ${String(diff.operations.length)} fullRewrite=${String(diff.fullRewrite)}`);
console.log(`hit targets: ${String(hitTargets.length)}`);
console.log(`focus: ${(focus.focusPath ?? []).join(' > ')}`);
console.log(`accessibility root: ${accessibility.root.role} ${accessibility.root.label}`);
console.log('');
console.log(snapshot.plainTextFrame);
