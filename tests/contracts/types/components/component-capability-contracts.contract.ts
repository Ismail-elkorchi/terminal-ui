import {
  button,
  commandInput,
  contextMenu,
  label,
  prepareCommandSuggestions,
  text,
  textArea,
  textInput,
  type TextAreaOptions,
  type MenuActionTone,
  type ValidationLevel
} from '@ismail-elkorchi/terminal-ui/components';
import { prepareTextDocument, textCaretAt } from '@ismail-elkorchi/terminal-ui/text';

const validationLevel: ValidationLevel = 'warning';
const menuActionTone: MenuActionTone = 'destructive';
button({
  id: 'save',
  label: 'Save',
  tone: 'primary',
  onAction: () => ({ kind: 'save' as const })
});
label({ id: 'query-label', forId: 'query', text: 'Query' });
commandInput({
  id: 'command',
  presentation: { input: { text: '', cursor: 0 }, open: false, suggestions: prepareCommandSuggestions([]) },
  validation: { message: 'Choose a command', level: validationLevel },
  onTransition: (transition) => ({ kind: 'command' as const, transition }),
  onSubmit: (event) => ({ kind: 'submit' as const, value: event.value })
});
// @ts-expect-error disabled editable controls cannot also declare read-only state
commandInput({
  id: 'invalid-disabled-read-only-command',
  presentation: { input: { text: '', cursor: 0 }, open: false, suggestions: prepareCommandSuggestions([]) },
  disabled: true,
  readOnly: true
});
textInput<{ readonly kind: 'query'; readonly action: import('@ismail-elkorchi/terminal-ui/components').TextInputAction }>({
  id: 'query',
  presentation: { value: 'term', cursor: 0 },
  onAction: (action) => ({ kind: 'query' as const, action }),
  styles: {
      parts: { value: { bold: true }, cursor: { underline: true } },
      states: { focused: { root: { bold: true } } }
    }
});
contextMenu({
  id: 'invalid-read-only-menu',
  presentation: { kind: 'closed' },
  // @ts-expect-error command-only menus do not expose editable read-only semantics
  readOnly: true,
  onTransition: (transition) => transition
});
// @ts-expect-error interactive components require caller-supplied identity
button({ label: 'Save' });
// @ts-expect-error a control label must identify its target control
label({ id: 'missing-label-target', text: 'Query' });
// @ts-expect-error a control label needs its own stable relationship identity
label({ forId: 'query', text: 'Query' });
button({ id: 'disabled-button', label: 'Save', disabled: true });
textArea({
  id: 'disabled-editor',
  presentation: { document: prepareTextDocument('locked'), caret: textCaretAt(0) },
  disabled: true
});
const invalidDisabledEditor: TextAreaOptions = {
  id: 'invalid-disabled-editor-options',
  presentation: { document: prepareTextDocument('locked'), caret: textCaretAt(0) },
  disabled: true,
  // @ts-expect-error disabled editor options cannot expose unreachable handlers
  onAction: () => ({ kind: 'edit' })
};
void invalidDisabledEditor;
// @ts-expect-error disabled editors cannot expose unreachable handlers
textArea({
  id: 'invalid-disabled-editor',
  presentation: { document: prepareTextDocument('locked'), caret: textCaretAt(0) },
  disabled: true,
  onAction: () => ({ kind: 'edit' })
});
// @ts-expect-error passive text cannot own local input bindings
text({ content: 'Passive', keys: { enter: () => ({ kind: 'invalid' }) } });
textInput({
  id: 'invalid-style',
  presentation: { value: '', cursor: 0 },
  onAction: () => {
    throw new Error('type-only contract');
  },
  styles: {
      // @ts-expect-error text inputs do not expose table anatomy
      parts: { headerCell: { bold: true } }
    }
});
text({
  content: 'Passive',
  styles: {
    // @ts-expect-error passive text exposes no visual states
    states: {
      focused: { root: { bold: true } }
    }
  }
});
button({
  id: 'invalid-selected-button-style',
  label: 'Save',
  onAction: () => ({ kind: 'save' as const }),
  styles: {
    states: {
      // @ts-expect-error buttons do not expose collection selection styling
      selected: { root: { bold: true } }
    }
  }
});

void menuActionTone;
