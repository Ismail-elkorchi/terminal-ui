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
    role: 'document',
    label: 'Contract',
    children: [{
      id: 'link',
      role: 'link',
      label: 'Next page'
    }, {
      id: 'items',
      role: 'list',
      children: [{
        id: 'first',
        role: 'listitem',
        label: 'First item'
      }]
    }, {
      id: 'details',
      role: 'tabpanel',
      label: 'Details'
    }]
  }
});
const validation = validateAccessibleSnapshot(snapshot);

// @ts-expect-error accessibility sources are a closed vocabulary
const invalidSource: AccessibleSnapshotSource = 'terminal';

void validation;
void invalidSource;
void harnessSource;
