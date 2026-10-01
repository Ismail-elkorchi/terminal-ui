import { createTuiControls, type TuiControlMessage, type TuiControlReducers, type TuiControls, type TuiControlTransitionMessage } from '../../../../src/tui/index.ts';

interface State { readonly count: number; readonly text: string; }
const controls = createTuiControls<State>()({
  count: (count, transition: { readonly delta: number }) => count + transition.delta,
  text: (text, transition: 'clear' | 'keep') => transition === 'clear' ? '' : text,
});
const message: TuiControlMessage<typeof controls> = controls.onTransition('count')({ delta: 1 });
controls.update({ count: 0, text: '' }, message);
controls.bind('text', { count: 0, text: '' }).onTransition('clear');
// @ts-expect-error unknown state field cannot be controlled
createTuiControls<State>()({ count: (count, _message: number) => count, missing: (_state: number) => 0 });
// @ts-expect-error reducer must return its own field's state type
createTuiControls<State>()({ count: (_count, _message: number) => 'wrong' });
// @ts-expect-error transition belongs to another control
controls.onTransition('text')({ delta: 1 });
// @ts-expect-error unknown binding cannot be rendered
controls.bind('missing', { count: 0, text: '' });
// @ts-expect-error message control and transition must agree
controls.update({ count: 0, text: '' }, { kind: 'control', control: 'text', transition: { delta: 1 } });

declare const hidden: unique symbol;
interface KeyedState { readonly [hidden]: number; readonly 0: number; readonly visible: number; }
const stringKeys = createTuiControls<KeyedState>()({ visible: (value, delta: number) => value + delta });
// @ts-expect-error control identities must be strings, not symbols
createTuiControls<KeyedState>()({ [hidden]: (value: number, delta: number) => value + delta });
// @ts-expect-error numeric state keys are not control identities
createTuiControls<KeyedState>()({ 0: (value: number, delta: number) => value + delta });
// @ts-expect-error symbol keys cannot be used to create transition messages
stringKeys.onTransition(hidden);
// @ts-expect-error numeric keys cannot be used to create transition messages
stringKeys.onTransition(0);

const counterReducers = { count: (value: number, delta: number) => value + delta } satisfies TuiControlReducers<State>;
export const namedControls: TuiControls<State, typeof counterReducers> = createTuiControls<State>()(counterReducers);
export const namedControlMessage: TuiControlTransitionMessage<State, typeof counterReducers> = namedControls.onTransition('count')(1);
