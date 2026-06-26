import { toAccessibleSnapshot } from '../accessibility/index.ts';
import { isChoiceDisabled } from './choices.ts';
import { createProgress } from './progress.ts';
import type { AccessibleNode, AccessibleRole, AccessibleSnapshot, AccessibleValue } from '../accessibility/index.ts';
import type { PromptChoice, PromptDefinition, PromptKind } from './types.ts';

export interface PromptSnapshotState {
  readonly buffer: { readonly text: string };
  readonly choices: readonly PromptChoice<unknown>[];
  readonly focusedChoiceIndex: number;
  readonly selectedChoiceIndexes: ReadonlySet<number>;
  readonly confirmValue?: boolean;
}

export function createPromptSnapshot<TValue>(
  prompt: PromptDefinition<TValue>,
  value?: AccessibleValue,
  state?: PromptSnapshotState
): AccessibleSnapshot {
  if (prompt.kind === 'progress') return createProgressPromptSnapshot(prompt);
  const snapshotValue = value ?? promptSnapshotValue(prompt);
  return toAccessibleSnapshot({
    source: 'prompt',
    root: {
      id: prompt.accessibility?.id ?? prompt.id ?? `prompt-${prompt.kind}`,
      role: promptRole(prompt.kind),
      label: prompt.label,
      value: snapshotValue,
      ...confirmCheckedState(prompt, snapshotValue),
      focused: true,
      ...(state === undefined || state.choices.length === 0 ? {} : { children: choiceSnapshotNodes(prompt, state) })
    }
  });
}

function createProgressPromptSnapshot<TValue>(prompt: PromptDefinition<TValue>): AccessibleSnapshot {
  const snapshot = createProgress({
    id: prompt.accessibility?.id ?? prompt.id ?? 'prompt-progress',
    label: prompt.label,
    ...(prompt.progress ?? {})
  }).snapshot();
  return toAccessibleSnapshot({
    source: snapshot.source,
    root: { ...snapshot.root, focused: true }
  });
}

export function promptValueForSnapshot<TValue>(
  prompt: PromptDefinition<TValue>,
  state: PromptSnapshotState,
  submittedValue?: TValue
): AccessibleValue {
  if (prompt.kind === 'password') return null;
  if (prompt.kind === 'confirm') {
    const value = typeof submittedValue === 'boolean' ? submittedValue : state.confirmValue;
    return value ?? null;
  }
  if (prompt.kind === 'select' || prompt.kind === 'autocomplete') {
    const submittedChoice = state.choices.find((choice) => Object.is(choice.value, submittedValue));
    return submittedChoice?.label ?? state.choices[state.focusedChoiceIndex]?.label ?? null;
  }
  if (prompt.kind === 'multiselect') {
    const labels = [...state.selectedChoiceIndexes]
      .sort((left, right) => left - right)
      .map((index) => state.choices[index]?.label)
      .filter((label): label is string => label !== undefined);
    return labels.length === 0 ? null : labels.join(', ');
  }
  const value = snapshotSubmittedValue(submittedValue, state.buffer.text);
  return accessibleValueFromUnknown(value);
}

function snapshotSubmittedValue<TValue>(submittedValue: TValue | undefined, fallback: string): TValue | string {
  if (submittedValue === undefined) return fallback;
  return submittedValue;
}

function accessibleValueFromUnknown(value: unknown): AccessibleValue {
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' || value === null) {
    return value;
  }
  if (value === undefined || typeof value === 'function' || typeof value === 'symbol') return null;
  return JSON.stringify(value);
}

function choiceSnapshotNodes<TValue>(
  prompt: PromptDefinition<TValue>,
  state: PromptSnapshotState
): readonly AccessibleNode[] {
  return state.choices.map((choice, index) => ({
    id: choice.id ?? `${prompt.id ?? prompt.kind}:choice:${String(index)}`,
    role: 'option',
    label: choice.label,
    ...(choice.description === undefined ? {} : { description: choice.description }),
    selected: prompt.kind === 'select' && index === state.focusedChoiceIndex,
    focused: index === state.focusedChoiceIndex,
    disabled: isChoiceDisabled(choice),
    ...(prompt.kind === 'multiselect' ? { checked: state.selectedChoiceIndexes.has(index) } : {})
  }));
}

function promptRole(kind: PromptKind): AccessibleRole {
  switch (kind) {
    case 'confirm':
      return 'checkbox';
    case 'select':
    case 'multiselect':
    case 'autocomplete':
      return 'listbox';
    case 'progress':
      return 'progressbar';
    case 'editor':
    case 'input':
    case 'password':
      return 'textbox';
  }
}

function confirmCheckedState<TValue>(
  prompt: PromptDefinition<TValue>,
  value: AccessibleValue
): { readonly checked?: boolean } {
  return prompt.kind === 'confirm' && typeof value === 'boolean' ? { checked: value } : {};
}

function promptSnapshotValue<TValue>(prompt: PromptDefinition<TValue>): AccessibleValue {
  if (prompt.defaultValue === undefined || prompt.kind === 'password') return null;
  if (prompt.kind === 'confirm' && typeof prompt.defaultValue === 'boolean') return prompt.defaultValue;
  return typeof prompt.defaultValue === 'object'
    ? JSON.stringify(prompt.defaultValue)
    : String(prompt.defaultValue);
}
