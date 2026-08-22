import type {
  NumberInputAction,
  NumberInputAnalysis,
  NumberInputPresentation
} from '../ui-model/number-input.ts';
import { editTextBuffer } from '../text/index.ts';
import type { TextEditBuffer, TextEditOperation } from '../text/index.ts';
import { applyTextPointerAction } from './text-editing.ts';

export type { NumberInputAnalysis, NumberInputPresentation } from '../ui-model/number-input.ts';

export interface NumberInputGrammar {
  readonly notation?: 'integer' | 'decimal' | 'scientific';
  readonly decimalSeparator?: '.' | ',';
  readonly allowSign?: boolean;
}

export interface NumberInputBehaviorOptions {
  readonly min?: number;
  readonly max?: number;
  readonly step?: number;
  readonly grammar?: NumberInputGrammar;
  readonly clampOnCommit?: boolean;
}

export interface NumberInputConfiguration {
  readonly min?: number;
  readonly max?: number;
  readonly step: number;
  readonly grammar: {
    readonly notation: 'integer' | 'decimal' | 'scientific';
    readonly decimalSeparator: '.' | ',';
    readonly allowSign: boolean;
  };
  readonly clampOnCommit: boolean;
}

export interface NumberInputState {
  readonly input: TextEditBuffer;
  readonly committed?: number;
  readonly configuration: NumberInputConfiguration;
}

export const defaultNumberInputConfiguration: NumberInputConfiguration = Object.freeze({
  step: 1,
  grammar: Object.freeze({ notation: 'decimal', decimalSeparator: '.', allowSign: true }),
  clampOnCommit: false
});

export function createNumberInputConfiguration(
  options: NumberInputBehaviorOptions = {}
): NumberInputConfiguration {
  const grammar = {
    notation: options.grammar?.notation ?? 'decimal',
    decimalSeparator: options.grammar?.decimalSeparator ?? '.',
    allowSign: options.grammar?.allowSign ?? true
  } as const;
  const step = options.step ?? 1;
  assertFiniteBound(options.min, 'min');
  assertFiniteBound(options.max, 'max');
  if (options.min !== undefined && options.max !== undefined && options.min > options.max) {
    throw new RangeError('number input min must be less than or equal to max.');
  }
  if (!Number.isFinite(step) || step <= 0) {
    throw new RangeError('number input step must be finite and greater than zero.');
  }
  assertGrammarValue(options.min, grammar, 'min');
  assertGrammarValue(options.max, grammar, 'max');
  if (grammar.notation === 'integer' && !Number.isInteger(step)) {
    throw new RangeError('integer number input step must be an integer.');
  }
  return Object.freeze({
    ...(options.min === undefined ? {} : { min: options.min }),
    ...(options.max === undefined ? {} : { max: options.max }),
    step,
    grammar: Object.freeze(grammar),
    clampOnCommit: options.clampOnCommit === true
  });
}

export function createNumberInputState(
  value?: number,
  options: NumberInputBehaviorOptions = {}
): NumberInputState {
  const configuration = createNumberInputConfiguration(options);
  if (value === undefined) return { input: { text: '', cursor: 0 }, configuration };
  assertInitialValue(value, configuration);
  return stateForValue(value, true, configuration);
}

export function numberInputReducer(
  state: NumberInputState,
  action: NumberInputAction
): NumberInputState {
  switch (action.kind) {
    case 'edit': {
      const input = editTextBuffer(state.input, singleLineOperation(action.operation));
      return input === state.input ? state : { ...state, input };
    }
    case 'pointer': {
      const input = applyTextPointerAction(state.input, action.action);
      return input === state.input ? state : { ...state, input };
    }
    case 'step':
      return steppedState(state, action.direction);
    case 'commit':
      return committedState(state);
    case 'revert':
      return revertedState(state);
  }
}

export function numberInputAnalysis(
  text: string,
  configuration: NumberInputConfiguration = defaultNumberInputConfiguration
): NumberInputAnalysis {
  const grammar = configuration.grammar;
  if (text.length === 0) return { validity: 'empty' };
  if (isIncompleteNumber(text, grammar)) return { validity: 'incomplete' };
  if (!numberPattern(grammar).test(text)) return { validity: 'invalid' };
  const normalized = grammar.decimalSeparator === ',' ? text.replace(',', '.') : text;
  const parsedValue = Number(normalized);
  if (!Number.isFinite(parsedValue)) return { validity: 'invalid' };
  if (
    (configuration.min !== undefined && parsedValue < configuration.min)
    || (configuration.max !== undefined && parsedValue > configuration.max)
  ) {
    return { validity: 'outOfRange', parsedValue };
  }
  return { validity: 'valid', parsedValue };
}

export function numberInputPresentation(state: NumberInputState): NumberInputPresentation {
  const analysis = numberInputAnalysis(state.input.text, state.configuration);
  return {
    value: state.input.text,
    cursor: state.input.cursor,
    ...(state.input.selection === undefined ? {} : { selection: state.input.selection }),
    ...(state.committed === undefined ? {} : { committedValue: state.committed }),
    ...(state.configuration.min === undefined ? {} : { min: state.configuration.min }),
    ...(state.configuration.max === undefined ? {} : { max: state.configuration.max }),
    step: state.configuration.step,
    ...analysis
  };
}

function committedState(state: NumberInputState): NumberInputState {
  const analysis = numberInputAnalysis(state.input.text, state.configuration);
  if (analysis.validity === 'valid') {
    return { ...state, committed: analysis.parsedValue };
  }
  if (analysis.validity !== 'outOfRange' || !state.configuration.clampOnCommit) return state;
  return stateForValue(clampToRange(analysis.parsedValue, state.configuration), true, state.configuration);
}

function steppedState(
  state: NumberInputState,
  direction: 'decrement' | 'increment'
): NumberInputState {
  const analysis = numberInputAnalysis(state.input.text, state.configuration);
  const base = analysis.validity === 'valid' || analysis.validity === 'outOfRange'
    ? analysis.parsedValue
    : state.committed ?? state.configuration.min ?? 0;
  const delta = direction === 'increment' ? state.configuration.step : -state.configuration.step;
  const value = clampToRange(base + delta, state.configuration);
  return stateForValue(value, true, state.configuration);
}

function revertedState(state: NumberInputState): NumberInputState {
  return state.committed === undefined
    ? { input: { text: '', cursor: 0 }, configuration: state.configuration }
    : stateForValue(state.committed, true, state.configuration);
}

function stateForValue(
  value: number,
  committed: boolean,
  configuration: NumberInputConfiguration
): NumberInputState {
  const text = formatNumberInputValue(value, configuration.grammar);
  return {
    input: { text, cursor: text.length },
    ...(committed ? { committed: value } : {}),
    configuration
  };
}

function clampToRange(value: number, configuration: NumberInputConfiguration): number {
  return Math.max(
    configuration.min ?? Number.NEGATIVE_INFINITY,
    Math.min(configuration.max ?? Number.POSITIVE_INFINITY, value)
  );
}

function singleLineOperation(operation: TextEditOperation): TextEditOperation {
  if (operation.kind !== 'insert' && operation.kind !== 'replaceSelection') return operation;
  return { ...operation, text: operation.text.replace(/\r\n?|\n/gu, '') };
}

function numberPattern(grammar: NumberInputConfiguration['grammar']): RegExp {
  const sign = grammar.allowSign ? '[+-]?' : '';
  if (grammar.notation === 'integer') return new RegExp(`^${sign}\\d+$`, 'u');
  const separator = grammar.decimalSeparator === '.' ? '\\.' : ',';
  const decimal = `(?:\\d+(?:${separator}\\d*)?|${separator}\\d+)`;
  if (grammar.notation === 'decimal') return new RegExp(`^${sign}${decimal}$`, 'u');
  return new RegExp(`^${sign}${decimal}(?:[eE][+-]?\\d+)?$`, 'u');
}

function isIncompleteNumber(text: string, grammar: NumberInputConfiguration['grammar']): boolean {
  const sign = grammar.allowSign ? '[+-]?' : '';
  if (grammar.notation === 'integer') return new RegExp(`^${sign}$`, 'u').test(text);
  const separator = grammar.decimalSeparator === '.' ? '\\.' : ',';
  if (new RegExp(`^${sign}${separator}?$`, 'u').test(text)) return true;
  if (grammar.notation !== 'scientific') return false;
  return new RegExp(`^${sign}(?:\\d+(?:${separator}\\d*)?|${separator}\\d+)[eE][+-]?$`, 'u').test(text);
}

function formatNumberInputValue(value: number, grammar: NumberInputConfiguration['grammar']): string {
  const text = grammar.notation === 'scientific' ? value.toExponential() : String(value);
  return grammar.decimalSeparator === ',' ? text.replace('.', ',') : text;
}

function assertFiniteBound(value: number | undefined, name: 'min' | 'max'): void {
  if (value !== undefined && !Number.isFinite(value)) {
    throw new RangeError(`number input ${name} must be finite when provided.`);
  }
}

function assertGrammarValue(
  value: number | undefined,
  grammar: NumberInputConfiguration['grammar'],
  name: 'min' | 'max'
): void {
  if (value === undefined) return;
  if (grammar.notation === 'integer' && !Number.isInteger(value)) {
    throw new RangeError(`integer number input ${name} must be an integer.`);
  }
  if (!grammar.allowSign && value < 0) {
    throw new RangeError(`unsigned number input ${name} cannot be negative.`);
  }
}

function assertInitialValue(value: number, configuration: NumberInputConfiguration): void {
  if (!Number.isFinite(value)) throw new RangeError('number input initial value must be finite.');
  assertGrammarValue(value, configuration.grammar, 'min');
  if (
    (configuration.min !== undefined && value < configuration.min)
    || (configuration.max !== undefined && value > configuration.max)
  ) {
    throw new RangeError('number input initial value must be contained by its range.');
  }
}
