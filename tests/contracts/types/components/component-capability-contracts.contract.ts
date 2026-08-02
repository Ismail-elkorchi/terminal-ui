import {
  button,
  commandInput,
  label,
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
  onPress: () => ({ kind: 'save' as const })
});
label({ id: 'query-label', forId: 'query', text: 'Query' });
commandInput({
  id: 'command',
  presentation: { value: '', cursor: 0, suggestions: [] },
  validation: { message: 'Choose a command', level: validationLevel },
  onAction: (action) => ({ kind: 'command' as const, action }),
  onSubmit: (value) => ({ kind: 'submit' as const, value })
});
textInput({
  id: 'query',
  presentation: { value: 'term', cursor: 0 },
  onAction: (action) => ({ kind: 'query' as const, action }),
  meta: {
    styles: {
      parts: { value: { bold: true }, cursor: { underline: true } },
      states: { focused: { bold: true } }
    }
  }
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
textArea({
  id: 'invalid-disabled-editor',
  presentation: { document: prepareTextDocument('locked'), caret: textCaretAt(0) },
  disabled: true,
  // @ts-expect-error disabled editors cannot expose unreachable handlers
  onAction: () => ({ kind: 'edit' })
});
// @ts-expect-error passive text cannot own local input bindings
text('Passive', { keys: { enter: () => ({ kind: 'invalid' }) } });
textInput({
  id: 'invalid-style',
  presentation: { value: '', cursor: 0 },
  onAction: () => {
    throw new Error('type-only contract');
  },
  meta: {
    styles: {
      // @ts-expect-error text inputs do not expose table anatomy
      parts: { headerCell: { bold: true } }
    }
  }
});

void menuActionTone;
