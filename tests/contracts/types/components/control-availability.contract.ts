import {
  barChart,
  button,
  checkbox,
  link,
  menu,
  textInput,
  type ButtonOptions,
  type CheckboxOptions,
  type Element,
} from '@ismail-elkorchi/terminal-ui/components';

type MessageOf<TElement> = TElement extends Element<infer TMessage> ? TMessage : never;
type Equal<TLeft, TRight> =
  (<T>() => T extends TLeft ? 1 : 2) extends
  (<T>() => T extends TRight ? 1 : 2) ? true : false;
type Assert<TValue extends true> = TValue;

const disabled = Boolean(Date.now());
const inert = Boolean(Date.now() % 2);

const save = button({ id: 'save', label: 'Save', disabled, onPress: () => ({ kind: 'save' } as const) });
const checked = checkbox({
  id: 'accept', label: 'Accept', checked: false, disabled,
  onTransition: (transition) => ({ kind: 'check' as const, transition }),
});
const documentation = link({
  id: 'documentation', label: 'Docs', href: 'https://example.test',
  disabled, inert,
  onActivate: (event) => ({ kind: 'open' as const, href: event.href }),
});
const commands = menu({
  id: 'commands', view: { activePath: [], items: [] }, disabled, inert,
  onTransition: (transition) => ({ kind: 'menu' as const, transition }),
});
const bars = barChart({
  id: 'bars', label: 'Bars', items: [{ id: 'first', label: 'First', value: 1 }],
  state: { selection: { mode: 'single' } }, disabled, inert,
  onTransition: (transition) => ({ kind: 'chart' as const, transition }),
});
const input = textInput({
  id: 'input', state: { text: '', cursor: 0 }, disabled, readOnly: true,
  onTransition: (transition) => ({ kind: 'input' as const, transition }),
});

export type _Save = Assert<Equal<MessageOf<typeof save>, { readonly kind: 'save' }>>;
export type _Check = Assert<Equal<
  MessageOf<typeof checked>,
  { readonly kind: 'check'; readonly transition: import('@ismail-elkorchi/terminal-ui/components').CheckboxTransition }
>>;
export type _Open = Assert<Equal<MessageOf<typeof documentation>, { readonly kind: 'open'; readonly href: string }>>;
export type _Menu = Assert<Equal<
  MessageOf<typeof commands>,
  { readonly kind: 'menu'; readonly transition: import('@ismail-elkorchi/terminal-ui/components').MenuTransition }
>>;
export type _Chart = Assert<Equal<
  MessageOf<typeof bars>,
  { readonly kind: 'chart'; readonly transition: import('@ismail-elkorchi/terminal-ui/components').BarChartTransition }
>>;
export type _Input = Assert<Equal<
  MessageOf<typeof input>,
  { readonly kind: 'input'; readonly transition: import('@ismail-elkorchi/terminal-ui/components').TextInputTransition }
>>;

button({ id: 'static-disabled', label: 'Disabled', disabled: true });
checkbox({ id: 'static-checked', label: 'Disabled', checked: false, disabled: true });
menu({ id: 'static-inert', view: { activePath: [], items: [] }, inert: true });
menu({
  id: 'static-inert-with-activation', view: { activePath: [], items: [] }, inert: true,
  onActivate: (event) => ({ kind: 'activate' as const, id: event.id }),
});
barChart({ id: 'static-bars', label: 'Bars', items: [], state: { selection: { mode: 'single' } }, disabled: true });
barChart({
  id: 'static-bars-with-activation', label: 'Bars', items: [],
  state: { selection: { mode: 'single' } }, inert: true,
  onActivate: (event) => ({ kind: 'activate' as const, id: event.id }),
});
textInput({ id: 'static-input', state: { text: '', cursor: 0 }, disabled: true });
textInput({
  id: 'static-input-with-submit', state: { text: '', cursor: 0 }, disabled: true,
  onSubmit: (event) => ({ kind: 'submit' as const, value: event.value }),
});
const retained: ButtonOptions<{ readonly kind: 'save' }> = {
  id: 'retained', label: 'Retained', disabled: true,
  onPress: () => ({ kind: 'save' }),
};
const retainedCheckbox: CheckboxOptions<{ readonly kind: 'check' }> = {
  id: 'retained-check', label: 'Retained', checked: false, disabled: true,
  onTransition: () => ({ kind: 'check' }),
};
void retained;
void retainedCheckbox;

// @ts-expect-error a boolean may become enabled, so its handler is required
button({ id: 'missing-press', label: 'Missing', disabled });
// @ts-expect-error a boolean may become enabled, so its handler is required
checkbox({ id: 'missing-transition', label: 'Missing', checked: false, disabled });
// @ts-expect-error both booleans may become available, so its handler is required
menu({ id: 'missing-menu', view: { activePath: [], items: [] }, disabled, inert });
// @ts-expect-error an inert boolean may become available, so its handler is required
barChart({ id: 'missing-bars', label: 'Bars', items: [], state: { selection: { mode: 'single' } }, inert });
// @ts-expect-error a boolean may become enabled, so its handler is required
textInput({ id: 'missing-input', state: { text: '', cursor: 0 }, disabled });
// @ts-expect-error unsupported capabilities remain rejected
button({ id: 'unsupported-inert', label: 'Unsupported', inert, onPress: () => ({ kind: 'save' }) });
// @ts-expect-error retained handlers must be functions
button({ id: 'invalid-handler', label: 'Invalid', disabled: true, onPress: 'save' });
// @ts-expect-error retained secondary handlers must also be typed functions
textInput({ id: 'invalid-submit', state: { text: '', cursor: 0 }, disabled: true, onSubmit: 'submit' });
