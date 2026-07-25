import {
  toAccessibleSnapshot,
  validateAccessibleSnapshot,
  type AccessibleSnapshotSource
} from '@ismail-elkorchi/terminal-ui/accessibility';

const source: AccessibleSnapshotSource = 'tui';
const harnessSource: AccessibleSnapshotSource = 'test_harness';
const snapshot = toAccessibleSnapshot({
  source,
  root: {
    id: 'root',
    role: 'listbox',
    label: 'Contract',
    window: { startIndex: 0, endIndexExclusive: 1, totalCount: 1 },
    children: [{
      id: 'item',
      role: 'option',
      position: { positionInSet: 1, setSize: 1 }
    }]
  }
});
const validation = validateAccessibleSnapshot(snapshot);

// @ts-expect-error accessibility sources are a closed vocabulary
const invalidSource: AccessibleSnapshotSource = 'terminal';

void validation;
void invalidSource;
void harnessSource;
