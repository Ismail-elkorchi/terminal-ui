import {
  toAccessibleSnapshot,
  validateAccessibleSnapshot,
  type AccessibleSnapshotSource
} from '@ismail-elkorchi/terminal-ui/accessibility';

const source: AccessibleSnapshotSource = 'tui';
const snapshot = toAccessibleSnapshot({
  source,
  root: { id: 'root', role: 'application', label: 'Contract' }
});
const validation = validateAccessibleSnapshot(snapshot);

// @ts-expect-error accessibility sources are a closed vocabulary
const invalidSource: AccessibleSnapshotSource = 'terminal';

void validation;
void invalidSource;
