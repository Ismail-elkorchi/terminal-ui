import { diagnostic } from '../diagnostics.ts';
import type { TerminalDiagnostic } from '../diagnostics.ts';
import type { PromptChoice, PromptDefinition } from './types.ts';

export function isChoiceDisabled(choice: PromptChoice<unknown>): boolean {
  return choice.disabled !== undefined && choice.disabled !== false;
}

export function enabledChoiceAt(
  choices: readonly PromptChoice<unknown>[],
  index: number
): PromptChoice<unknown> | undefined {
  const choice = choices[index];
  return choice !== undefined && !isChoiceDisabled(choice) ? choice : undefined;
}

export function nextEnabledChoiceIndex(
  choices: readonly PromptChoice<unknown>[],
  current: number,
  direction: 1 | -1
): number | undefined {
  if (choices.length === 0) return undefined;
  for (let step = 1; step <= choices.length; step += 1) {
    const index = (current + direction * step + choices.length) % choices.length;
    const choice = choices[index];
    if (choice !== undefined && !isChoiceDisabled(choice)) return index;
  }
  return undefined;
}

export function firstEnabledChoiceIndex(choices: readonly PromptChoice<unknown>[]): number | undefined {
  const index = choices.findIndex((choice) => !isChoiceDisabled(choice));
  return index === -1 ? undefined : index;
}

export function lastEnabledChoiceIndex(choices: readonly PromptChoice<unknown>[]): number | undefined {
  for (let index = choices.length - 1; index >= 0; index -= 1) {
    const choice = choices[index];
    if (choice !== undefined && !isChoiceDisabled(choice)) return index;
  }
  return undefined;
}

export function findChoiceBySearch(
  choices: readonly PromptChoice<unknown>[],
  query: string,
  startIndex: number
): number | undefined {
  const normalized = query.trim().toLowerCase();
  if (normalized.length === 0 || choices.length === 0) return undefined;
  for (const matches of [choiceStartsWithQuery, choiceIncludesQuery]) {
    for (let step = 0; step < choices.length; step += 1) {
      const index = (startIndex + step) % choices.length;
      const choice = choices[index];
      if (choice !== undefined && !isChoiceDisabled(choice) && matches(choice, normalized)) return index;
    }
  }
  return undefined;
}

export function filterStaticChoices(
  choices: readonly PromptChoice<unknown>[],
  query: string
): readonly PromptChoice<unknown>[] {
  const normalized = query.trim().toLowerCase();
  if (normalized.length === 0) return choices;
  return choices.filter((choice) => choiceMatchesQuery(choice, normalized));
}

export async function resolvePromptChoices<TValue>(prompt: PromptDefinition<TValue>): Promise<ChoiceResolution> {
  const source = prompt.choices;
  if (source === undefined) return { ok: true, choices: [], diagnostics: [], hasMore: false };
  try {
    if (typeof source !== 'function') return { ok: true, choices: source, diagnostics: [], hasMore: false };
    const controller = new AbortController();
    const result = await source({
      query: '',
      offset: 0,
      limit: 50,
      signal: controller.signal
    });
    return {
      ok: true,
      choices: result.choices,
      diagnostics: result.diagnostics ?? [],
      hasMore: result.hasMore ?? false,
      ...(result.total === undefined ? {} : { total: result.total })
    };
  } catch (cause) {
    return {
      ok: false,
      diagnostics: [
        diagnostic('PROMPT_DATA_SOURCE_FAILED', 'Prompt choice data source failed.', {
          cause,
          target: prompt.id ?? prompt.kind
        })
      ]
    };
  }
}

export function initialSelectedChoiceIndexes<TValue>(
  prompt: PromptDefinition<TValue>,
  choices: readonly PromptChoice<unknown>[]
): Set<number> {
  const selected = new Set<number>();
  if (prompt.defaultValue === undefined) return selected;
  if (prompt.kind === 'multiselect' && Array.isArray(prompt.defaultValue)) {
    for (const [index, choice] of choices.entries()) {
      if (prompt.defaultValue.some((value) => Object.is(value, choice.value))) selected.add(index);
    }
    return selected;
  }
  const index = choices.findIndex((choice) => Object.is(choice.value, prompt.defaultValue));
  if (index !== -1) selected.add(index);
  return selected;
}

export type ChoiceResolution =
  | {
      readonly ok: true;
      readonly choices: readonly PromptChoice<unknown>[];
      readonly diagnostics: readonly TerminalDiagnostic[];
      readonly hasMore: boolean;
      readonly total?: number;
    }
  | {
      readonly ok: false;
      readonly diagnostics: readonly TerminalDiagnostic[];
    };

function choiceMatchesQuery(choice: PromptChoice<unknown>, normalizedQuery: string): boolean {
  return choiceIncludesQuery(choice, normalizedQuery);
}

function choiceStartsWithQuery(choice: PromptChoice<unknown>, normalizedQuery: string): boolean {
  return choice.label.toLowerCase().startsWith(normalizedQuery)
    || choice.keywords?.some((keyword) => keyword.toLowerCase().startsWith(normalizedQuery)) === true;
}

function choiceIncludesQuery(choice: PromptChoice<unknown>, normalizedQuery: string): boolean {
  return choice.label.toLowerCase().includes(normalizedQuery)
    || choice.description?.toLowerCase().includes(normalizedQuery) === true
    || choice.keywords?.some((keyword) => keyword.toLowerCase().includes(normalizedQuery)) === true;
}
