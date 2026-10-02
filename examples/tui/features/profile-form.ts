import { button, column, createTuiForm, text, textInput } from '@ismail-elkorchi/terminal-ui';
import type { TuiChildDefinition, TuiFormMessage, TuiFormState, TextInputTransition } from '@ismail-elkorchi/terminal-ui';
import { textInputReducer } from '@ismail-elkorchi/terminal-ui/behavior';
import type { TextEditBuffer } from '@ismail-elkorchi/terminal-ui/text';

interface Values { readonly name: string; }
interface ProfileState extends TuiFormState<Values, string> { readonly input: TextEditBuffer; }
type ProfileMessage =
  | { readonly kind: 'edit'; readonly transition: TextInputTransition }
  | { readonly kind: 'submit' }
  | { readonly kind: 'form'; readonly message: TuiFormMessage<Values, string> };

/** Local rehearsal; a parent composes this child and owns persistence of its domain output. */
export function profileFormDefinition(): TuiChildDefinition<ProfileState, ProfileMessage, string> {
  const form = createTuiForm<Values, string, ProfileMessage>({
    id: 'profile', validate: values => values.name.trim() === '' ? { name: 'Enter a name' } : {},
    validateAsync: async (values, context) => {
      await context.clock.sleep(10, context.signal);
      return values.name === 'reserved' ? { name: 'Choose another name' } : {};
    },
    submit: (values) => Promise.resolve(values.name),
    toMessage: message => ({ kind: 'form', message }),
  });
  return {
    init: () => ({ state: { ...form.init({ name: '' }), input: { text: '', cursor: 0 } } }),
    update(state, message) {
      if (message.kind === 'edit') {
        const input = textInputReducer(state.input, message.transition);
        const result = input.text === state.values.name ? { state } : form.change(state, { name: input.text });
        return { ...result, state: input === state.input && result.state === state ? state : { ...result.state, input } };
      }
      const result = message.kind === 'submit' ? form.submit(state) : form.update(state, message.message);
      const completed = message.kind === 'form' && message.message.kind === 'submission'
        && message.message.completion.kind === 'ready' && result.state.submission !== state.submission;
      const saved = result.state.submission.result;
      return { ...result, state: result.state === state ? state : { ...result.state, input: state.input },
        ...(completed && saved !== null ? { outputs: [saved] } : {}) };
    },
    view: state => column([
      textInput({ id: 'name', state: state.input, meta: { accessibleName: 'Profile name' },
        onTransition: transition => ({ kind: 'edit' as const, transition }) }),
      text({ content: state.errors.name ?? (state.validation.pending ? 'Checking name…' : '') }),
      button({ id: 'submit', label: 'Save profile', disabled: state.submitRequested || state.submission.pending, onPress: () => ({ kind: 'submit' as const }) }),
    ]),
  };
}
