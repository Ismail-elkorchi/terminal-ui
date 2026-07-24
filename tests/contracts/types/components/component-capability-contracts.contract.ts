import {
  button,
  commandInput,
  rangeSlider,
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

void menuActionTone;
void (undefined as unknown as RemovedComponentTone);
