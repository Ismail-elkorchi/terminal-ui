import { clipRenderSpans, span } from '../../component/index.ts';
import type { ComponentMeasureInput, ComponentRenderInput } from '../../component/index.ts';
import type { Measurement } from '../../renderer/index.ts';
import { measureTextCells, sanitizeTerminalText } from '../../text/index.ts';
import type { RenderSpan, TerminalStyle } from '../../visual/render-content.ts';

export function styled<TModel extends object, TPart extends string>(
  input: ComponentMeasureInput<TModel> | ComponentRenderInput<TModel, TPart>,
  text: string,
  part: TPart,
  decorated: boolean,
  base?: TerminalStyle,
): RenderSpan {
  if (!decorated || !('style' in input)) return span(text);
  const style = input.style({ part, ...(base === undefined ? {} : { base }) });
  return span(text, {
    ...(style === undefined ? {} : { style }),
    source: input.frameSource({
      partName: part,
      partType: part,
      description: part,
      cellRole: part === 'marker' || part === 'track' || part === 'handle' ? 'decoration' : 'text',
    }),
  });
}

export function controlSpan<TModel extends object, TPart extends string>(
  input: ComponentMeasureInput<TModel> | ComponentRenderInput<TModel, TPart>,
  text: string,
  part: TPart,
  description: string,
  decorated: boolean,
  base?: TerminalStyle,
  cellRole: import('../../visual/frame-source.ts').FrameCellRole = 'text',
  stateOrStates?: Exclude<import('../../element/metadata.ts').ElementVisualState, 'default'> |
    readonly Exclude<import('../../element/metadata.ts').ElementVisualState, 'default'>[],
): RenderSpan {
  if (!decorated || !('style' in input)) return span(text);
  const states = stateOrStates === undefined
    ? []
    : typeof stateOrStates === 'string' ? [stateOrStates] : stateOrStates;
  const state = states.at(-1);
  const style = input.style({
    part,
    ...(base === undefined ? {} : { base }),
    ...(states.length === 0 ? {} : { states }),
  });
  return span(text, {
    ...(style === undefined ? {} : { style }),
    source: input.frameSource({
      partName: part,
      partType: part,
      description,
      cellRole,
      ...(state === undefined ? {} : { interactionState: state }),
    }),
  });
}

export function errorLines<TModel extends object, TPart extends string>(
  input: ComponentMeasureInput<TModel> | ComponentRenderInput<TModel, TPart>,
  error: string,
  part: TPart,
  decorated: boolean,
): readonly (readonly RenderSpan[])[] {
  return error === '' ? [] : [[
    styled(input, error, part, decorated, {
      fg: { kind: 'theme', token: 'status.error' },
      bold: true,
    }),
  ]];
}

export function measureLines<TModel extends object>(
  lines: readonly (readonly RenderSpan[])[],
  input: ComponentMeasureInput<TModel>,
): Measurement {
  return {
    minWidth: 0,
    minHeight: 0,
    preferredWidth: lines.reduce(
      (maximum, current) =>
        Math.max(
          maximum,
          current.reduce(
            (total, currentSpan) =>
              total +
              measureTextCells(currentSpan.text, { widthProfile: input.widthProfile }).cells,
            0,
          ),
        ),
      0,
    ),
    preferredHeight: lines.length,
  };
}

export function paintLines<TModel extends object, TPart extends string>(
  input: ComponentRenderInput<TModel, TPart>,
  lines: readonly (readonly RenderSpan[])[],
): void {
  lines.slice(0, input.bounds.height).forEach((current, row) => {
    input.target.write(
      row,
      0,
      clipRenderSpans(current, input.bounds.width, { widthProfile: input.widthProfile }),
    );
  });
}

export function cleanString(value: unknown, owner: string): string {
  if (typeof value !== 'string') throw new TypeError(`${owner} must be a string.`);
  return sanitizeTerminalText(value).text;
}
export function optionalString(value: unknown, owner: string): string | undefined {
  return value === undefined ? undefined : cleanString(value, owner);
}
export function optionalBoolean(value: unknown, owner: string): boolean | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'boolean') throw new TypeError(`${owner} must be a boolean.`);
  return value;
}
export function optionalFinite(value: unknown, owner: string): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new TypeError(`${owner} must be finite.`);
  }
  return value;
}
export function positiveInteger(value: unknown, owner: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1) {
    throw new RangeError(`${owner} must be a positive safe integer.`);
  }
  return value;
}
export function nonNegativeInteger(value: unknown, owner: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${owner} must be a non-negative safe integer.`);
  }
  return value;
}
export function assertUnique(values: readonly { readonly id: string }[], owner: string): void {
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value.id)) throw new TypeError(`${owner} contains duplicate id "${value.id}".`);
    seen.add(value.id);
  }
}
