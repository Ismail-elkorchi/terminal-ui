import { button, rangeSlider, text, textInput } from '@ismail-elkorchi/terminal-ui/components';

button({ id: 'save', label: 'Save' });
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
