import {
  toAccessibleSnapshot,
  validateAccessibleSnapshot,
  type AccessibleSnapshotInput,
  type AccessibleSnapshotSource
} from '@ismail-elkorchi/terminal-ui/accessibility';
import {
  createDiagnosticOccurrenceReporter,
  diagnostic,
  type TerminalDiagnostic
} from '@ismail-elkorchi/terminal-ui';

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
const occurrence = createDiagnosticOccurrenceReporter('accessibility-contract')
  .report(diagnostic('INPUT_TIMEOUT', 'Timed out.'));
const content: TerminalDiagnostic = occurrence.diagnostic;

const invalidDiagnosticInput: AccessibleSnapshotInput = {
  source,
  root: { id: 'root', role: 'document' },
  // @ts-expect-error occurrences are reporting metadata, not terminal diagnostics
  diagnostics: [occurrence]
};

// @ts-expect-error accessibility sources are a closed vocabulary
const invalidSource: AccessibleSnapshotSource = 'terminal';

void validation;
void invalidSource;
void harnessSource;
void content;
void invalidDiagnosticInput;
