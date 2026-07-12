import type { NumberInputAction, NumberInputPresentation, NumberInputValidity } from '../ui-model/number-input.ts';
import { editTextBuffer } from '../text/index.ts';
import type { TextEditBuffer, TextEditOperation } from '../text/index.ts';

export type { NumberInputPresentation } from '../ui-model/number-input.ts';

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

export interface NumberInputState {
  readonly input: TextEditBuffer;
  readonly committed?: number;
}

export interface NumberInputAnalysis {
  readonly validity: NumberInputValidity;
  readonly value?: number;
}

export function createNumberInputState(value?: number): NumberInputState {
  if (value === undefined || !Number.isFinite(value)) return { input: { text: '', cursor: 0 } };
  const text = formatNumberInputValue(value);
  return { input: { text, cursor: text.length }, committed: value };
}

export function numberInputReducer(
  state: NumberInputState,
  action: NumberInputAction,
  options: NumberInputBehaviorOptions = {}
): NumberInputState {
  switch (action.kind) {
    case 'edit':
      return { ...state, input: editTextBuffer(state.input, singleLineOperation(action.operation)) };
    case 'step':
      return steppedState(state, action.direction, options);
    case 'commit':
      return committedState(state, options);
    case 'revert':
      return revertedState(state);
  }
}

export function numberInputAnalysis(
  text: string,
  options: NumberInputBehaviorOptions = {}
): NumberInputAnalysis {
  assertNumberInputRange(options);
  const grammar = normalizedGrammar(options.grammar);
  if (text.length === 0) return { validity: 'empty' };
  if (isIncompleteNumber(text, grammar)) return { validity: 'incomplete' };
  if (!numberPattern(grammar).test(text)) return { validity: 'invalid' };
  const normalized = grammar.decimalSeparator === ',' ? text.replace(',', '.') : text;
  const value = Number(normalized);
  if (!Number.isFinite(value)) return { validity: 'invalid' };
  if ((options.min !== undefined && value < options.min) || (options.max !== undefined && value > options.max)) {
    return { validity: 'outOfRange', value };
  }
  return { validity: 'valid', value };
}

export function numberInputPresentation(
  state: NumberInputState,
  options: NumberInputBehaviorOptions = {}
): NumberInputPresentation {
  const analysis = numberInputAnalysis(state.input.text, options);
  return {
    value: state.input.text,
    cursor: state.input.cursor,
    ...(state.input.selection === undefined ? {} : { selection: state.input.selection }),
    ...(state.committed === undefined ? {} : { committedValue: state.committed }),
    ...(analysis.value === undefined ? {} : { parsedValue: analysis.value }),
    validity: analysis.validity,
    ...(options.min === undefined ? {} : { min: options.min }),
    ...(options.max === undefined ? {} : { max: options.max }),
    ...(options.step === undefined ? {} : { step: options.step })
  };
}

function committedState(state: NumberInputState, options: NumberInputBehaviorOptions): NumberInputState {
  const analysis = numberInputAnalysis(state.input.text, options);
  if (analysis.validity === 'valid' && analysis.value !== undefined) {
    return { ...state, committed: analysis.value };
  }
  if (analysis.validity !== 'outOfRange' || analysis.value === undefined || options.clampOnCommit !== true) {
    return state;
  }
  return stateForValue(clampToRange(analysis.value, options), true);
}

function steppedState(
  state: NumberInputState,
  direction: 'decrement' | 'increment',
  options: NumberInputBehaviorOptions
): NumberInputState {
  const analysis = numberInputAnalysis(state.input.text, options);
  const base = analysis.value ?? state.committed ?? options.min ?? 0;
  const rawStep = options.step ?? 1;
  const step = Number.isFinite(rawStep) && rawStep > 0 ? rawStep : 1;
  const value = clampToRange(base + (direction === 'increment' ? step : -step), options);
  return stateForValue(value, true);
}

function revertedState(state: NumberInputState): NumberInputState {
  return state.committed === undefined ? { input: { text: '', cursor: 0 } } : stateForValue(state.committed, true);
}

function stateForValue(value: number, committed: boolean): NumberInputState {
  const text = formatNumberInputValue(value);
  return {
    input: { text, cursor: text.length },
    ...(committed ? { committed: value } : {})
  };
}

function clampToRange(value: number, options: NumberInputBehaviorOptions): number {
  return Math.max(options.min ?? Number.NEGATIVE_INFINITY, Math.min(options.max ?? Number.POSITIVE_INFINITY, value));
}

function singleLineOperation(operation: TextEditOperation): TextEditOperation {
  if (operation.kind !== 'insert' && operation.kind !== 'replaceSelection') return operation;
  return { ...operation, text: operation.text.replace(/\r\n?|\n/gu, '') };
}

function normalizedGrammar(grammar: NumberInputGrammar | undefined): Required<NumberInputGrammar> {
  return {
    notation: grammar?.notation ?? 'decimal',
    decimalSeparator: grammar?.decimalSeparator ?? '.',
    allowSign: grammar?.allowSign ?? true
  };
}

function numberPattern(grammar: Required<NumberInputGrammar>): RegExp {
  const sign = grammar.allowSign ? '[+-]?' : '';
  if (grammar.notation === 'integer') return new RegExp(`^${sign}\\d+$`, 'u');
  const separator = grammar.decimalSeparator === '.' ? '\\.' : ',';
  const decimal = `(?:\\d+(?:${separator}\\d*)?|${separator}\\d+)`;
  if (grammar.notation === 'decimal') return new RegExp(`^${sign}${decimal}$`, 'u');
  return new RegExp(`^${sign}${decimal}(?:[eE][+-]?\\d+)?$`, 'u');
}

function isIncompleteNumber(text: string, grammar: Required<NumberInputGrammar>): boolean {
  const sign = grammar.allowSign ? '[+-]?' : '';
  if (grammar.notation === 'integer') return new RegExp(`^${sign}$`, 'u').test(text);
  const separator = grammar.decimalSeparator === '.' ? '\\.' : ',';
  if (new RegExp(`^${sign}${separator}?$`, 'u').test(text)) return true;
  if (grammar.notation !== 'scientific') return false;
  return new RegExp(`^${sign}(?:\\d+(?:${separator}\\d*)?|${separator}\\d+)[eE][+-]?$`, 'u').test(text);
}

function formatNumberInputValue(value: number): string {
  return String(value);
}

function assertNumberInputRange(options: NumberInputBehaviorOptions): void {
  if (options.min !== undefined && !Number.isFinite(options.min)) {
    throw new RangeError('number input min must be finite when provided.');
  }
  if (options.max !== undefined && !Number.isFinite(options.max)) {
    throw new RangeError('number input max must be finite when provided.');
  }
  if (options.min !== undefined && options.max !== undefined && options.min > options.max) {
    throw new RangeError('number input min must be less than or equal to max.');
  }
}
