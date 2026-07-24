import {
  button,
  commandInput,
  rangeSlider,
  structuredBlock,
  text,
  textInput,
  type MenuActionTone,
  type ValidationLevel
} from '@ismail-elkorchi/terminal-ui/components';

const validationLevel: ValidationLevel = 'warning';
const menuActionTone: MenuActionTone = 'destructive';
button({ id: 'save', label: 'Save', tone: 'primary' });
commandInput({
  id: 'command',
  presentation: { value: '', cursor: 0, suggestions: [] },
  validation: { message: 'Choose a command', level: validationLevel }
});
textInput({
  id: 'query',
  presentation: { value: 'term', cursor: 0 },
  meta: {
    styles: {
      parts: { value: { bold: true }, cursor: { underline: true } },
      states: { focused: { bold: true } }
    }
  }
});
textInput({
  id: 'removed-result-style-state',
  presentation: { value: '', cursor: 0 },
  meta: {
    styles: {
      // @ts-expect-error generic style states describe interaction, not validation outcomes
      states: { error: { bold: true } }
    }
  }
});
structuredBlock({
  id: 'completed-record',
  title: 'Build',
  result: 'success',
  meta: { styles: { parts: { result: { bold: true } } } }
});
structuredBlock({ id: 'warning-record', title: 'Build output', level: 'warning' });
structuredBlock({
  id: 'removed-record-status',
  title: 'Build',
  // @ts-expect-error records expose lifecycle result and informational level separately
  status: 'failed'
});
structuredBlock({
  id: 'removed-record-status-style',
  title: 'Build',
  meta: {
    styles: {
      // @ts-expect-error record style slots follow result and level
      parts: { status: { bold: true } }
    }
  }
});

// @ts-expect-error interactive components require authored identity
button({ label: 'Save' });
button({ id: 'disabled-button', label: 'Save', disabled: true });
// @ts-expect-error pointer press is controlled through pointer interaction
button({ id: 'legacy-button-state', label: 'Save', state: 'pressed' });
// @ts-expect-error buttons accept action-related tones, not validation levels
button({ id: 'invalid-button-tone', label: 'Save', tone: 'warning' });
commandInput({
  id: 'removed-validation-tone',
  presentation: { value: '', cursor: 0, suggestions: [] },
  // @ts-expect-error command validation uses a validation level, not a generic tone
  validation: { message: 'Choose a command', tone: 'warning' }
});
// @ts-expect-error range sliders retain the shared disabled control contract
rangeSlider({ id: 'invalid-range-state', state: 'disabled' });
// @ts-expect-error range-slider interaction data is grouped under state
rangeSlider({ id: 'removed-range-presentation', presentation: { value: { start: 1, end: 2 }, activeHandle: 'start' } });
// @ts-expect-error passive text cannot own local input bindings
text('Passive', { keys: { enter: () => ({ kind: 'invalid' }) } });
// @ts-expect-error text roles describe structure, not result styling
text('Failed', { textRole: 'danger' });
textInput({
  id: 'invalid-style',
  presentation: { value: '', cursor: 0 },
  meta: {
    styles: {
      // @ts-expect-error text inputs do not expose table anatomy
      parts: { headerCell: { bold: true } }
    }
  }
});

type RemovedComponentTone =
  // @ts-expect-error component families expose their own tone contracts
  import('@ismail-elkorchi/terminal-ui/components').ComponentTone;
type RemovedComponentStatus =
  // @ts-expect-error status-bar and process contracts are independent
  import('@ismail-elkorchi/terminal-ui/components').ComponentStatus;
type RemovedRecordStatus =
  // @ts-expect-error records expose a result rather than a cross-category status
  import('@ismail-elkorchi/terminal-ui/components').RecordStatus;

void menuActionTone;
void (undefined as unknown as RemovedComponentTone);
void (undefined as unknown as RemovedComponentStatus);
void (undefined as unknown as RemovedRecordStatus);
