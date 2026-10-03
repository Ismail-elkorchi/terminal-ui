import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import {
  button, column, defineTui, dialog, field, form, listbox, overlay,
  passwordInput, progressBar, runTui, statusBar, text, textInput,
} from '@ismail-elkorchi/terminal-ui';
import type { ListboxControlTransition, TextInputTransition, TuiUpdateResult } from '@ismail-elkorchi/terminal-ui';
import { createListboxCollection, createListboxView, listboxReducer, textInputReducer } from '@ismail-elkorchi/terminal-ui/behavior';
import type { UnscrolledListboxState } from '@ismail-elkorchi/terminal-ui/behavior';
import type { TextEditBuffer } from '@ismail-elkorchi/terminal-ui/text';

export interface AccessibleTaskState {
  readonly title: TextEditBuffer;
  readonly password: TextEditBuffer;
  readonly priority: UnscrolledListboxState;
  readonly error?: string;
  readonly confirming: boolean;
  readonly progress: number;
  readonly complete: boolean;
}

export type AccessibleTaskMessage =
  | { readonly kind: 'title' | 'password'; readonly transition: TextInputTransition }
  | { readonly kind: 'priority'; readonly transition: ListboxControlTransition }
  | { readonly kind: 'submit' | 'cancel' | 'confirm' | 'quit' | 'interrupt' }
  | { readonly kind: 'progress'; readonly value: number };

const priorities = ['Normal', 'Urgent', 'Low'] as const;
const priorityCollection = createListboxCollection(priorities, (value) => ({ id: value, label: value }));
const priorityView = createListboxView(priorityCollection);

/** A local-only task rehearsal; no credential or task is sent anywhere. */
export function createAccessibleTaskApp() {
  return defineTui<AccessibleTaskState, AccessibleTaskMessage>({
    id: 'accessible-task',
    transcript: true,
    nonTty: { mode: 'last_frame' },
    init: () => ({
      state: {
        title: { text: '', cursor: 0 },
        password: { text: '', cursor: 0 },
        priority: { activeId: 'Normal', selection: { mode: 'single', selectedId: 'Normal' } },
        confirming: false, progress: 0, complete: false,
      },
      focus: { kind: 'element', elementId: 'task-title' },
    }),
    inputBindings: [{
      id: 'quit', label: 'Quit', phase: 'beforeFocus',
      triggers: [{ kind: 'key', key: 'q', modifiers: { ctrl: true } }],
      message: { kind: 'quit' },
    }, {
      id: 'interrupt', label: 'Cancel application', phase: 'beforeFocus',
      triggers: [{ kind: 'key', key: 'c', modifiers: { ctrl: true } }],
      message: { kind: 'interrupt' },
    }],
    update,
    view: taskView,
  });
}

function update(state: AccessibleTaskState, message: AccessibleTaskMessage): TuiUpdateResult<AccessibleTaskState, AccessibleTaskMessage> {
  switch (message.kind) {
    case 'title': {
      const next = { ...state, title: textInputReducer(state.title, message.transition) };
      delete next.error;
      return { state: next };
    }
    case 'password':
      return { state: { ...state, password: textInputReducer(state.password, message.transition) } };
    case 'priority':
      return { state: { ...state, priority: listboxReducer(state.priority, message.transition, { collection: priorityCollection, view: priorityView }) } };
    case 'submit':
      return state.title.text.trim() === ''
        ? { state: { ...state, error: 'Enter a task title' }, focus: { kind: 'element', elementId: 'task-title' } }
        : { state: { ...state, confirming: true } };
    case 'cancel':
      return { state: { ...state, confirming: false } };
    case 'confirm':
      return {
        state: { ...state, confirming: false, progress: 0 },
        effects: [{
          id: 'task-progress', concurrency: 'replace',
          async run(context) {
            await context.clock.sleep(250, context.signal);
            context.signal.throwIfAborted();
            return { kind: 'message', message: { kind: 'progress', value: 50 } };
          },
        }],
      };
    case 'progress':
      return {
        state: { ...state, progress: message.value, complete: message.value === 100 },
        ...(message.value === 100 ? {} : { effects: [{
          id: 'task-complete', concurrency: 'replace' as const,
          async run(context) {
            await context.clock.sleep(250, context.signal);
            context.signal.throwIfAborted();
            return { kind: 'message' as const, message: { kind: 'progress' as const, value: 100 } };
          },
        }] }),
      };
    case 'quit':
      return { state, exit: { reason: 'quit' } };
    case 'interrupt':
      return { state, exit: { reason: 'cancelled' } };
  }
}

function taskView(state: AccessibleTaskState) {
  const content = form({
    id: 'task-form', title: 'Create a local task',
    slots: { content: [
      text({ id: 'task-help', content: 'Tab/Shift+Tab: focus. Enter: submit. Ctrl+L: repeat context. Ctrl+Q: quit; Ctrl+C: cancel. Use a made-up password.' }),
      field({ id: 'title-field', label: 'Task title', description: 'Required; Enter reviews the task', control: textInput({
        id: 'task-title', state: state.title, required: true,
        ...(state.error === undefined ? {} : { error: state.error }),
        onTransition: (transition): AccessibleTaskMessage => ({ kind: 'title', transition }),
        onSubmit: (): AccessibleTaskMessage => ({ kind: 'submit' }),
      }) }),
      field({ id: 'password-field', label: 'Practice password', description: 'Masked locally; never transmitted', control: passwordInput({
        id: 'task-password', state: state.password,
        onTransition: (transition): AccessibleTaskMessage => ({ kind: 'password', transition }),
      }) }),
      listbox({
        id: 'task-priority', collection: priorityCollection, view: priorityView, state: state.priority,
        meta: { accessibleName: 'Priority' },
        onTransition: (transition): AccessibleTaskMessage => ({ kind: 'priority', transition }),
      }),
      button({ id: 'task-review', label: 'Review task', onPress: (): AccessibleTaskMessage => ({ kind: 'submit' }) }),
      progressBar({ id: 'task-progress', label: 'Task rehearsal', mode: { kind: 'determinate', value: state.progress, max: 100 } }),
      statusBar({ id: 'task-status', leading: [{ id: 'task-state', kind: 'text', text: state.complete ? 'Task complete. Ctrl+Q quits.' : 'Ready for a local task rehearsal' }] }),
    ] },
  });
  if (!state.confirming) return overlay([content], { id: 'task-root' });
  return overlay([content, dialog({
    id: 'task-confirm', title: 'Confirm task', modal: true,
    focusPolicy: { initialFocus: { kind: 'element', elementId: 'task-cancel' }, returnFocus: 'restore' },
    dismissal: { dismissOnEscape: true, dismissOnOutsidePress: false },
    onDismiss: (): AccessibleTaskMessage => ({ kind: 'cancel' }),
    slots: {
      content: text({ id: 'task-summary', content: `${state.title.text}; priority ${state.priority.selection.mode === 'single' ? state.priority.selection.selectedId ?? 'Normal' : 'Normal'}` }),
      actions: column([
        button({ id: 'task-cancel', label: 'Cancel', onPress: (): AccessibleTaskMessage => ({ kind: 'cancel' }) }),
        button({ id: 'task-confirm-button', label: 'Run rehearsal', onPress: (): AccessibleTaskMessage => ({ kind: 'confirm' }) }),
      ]),
    },
    maxWidth: 64, maxHeight: 10,
  })], { id: 'task-root' });
}

if (process.argv[1] !== undefined && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const exit = await runTui(createAccessibleTaskApp(), { outputMode: 'accessible' });
  if (exit.status !== 'completed') process.exitCode = 1;
}
