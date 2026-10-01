import { isNonArrayObject } from '../foundation/validation.ts';
import { decodeLayoutCellCount } from './decode-options.ts';

export interface ViewportDimensions {
  readonly columns: number;
  readonly rows: number;
}

export interface BreakpointRange {
  readonly minColumns?: number;
  readonly maxColumns?: number;
  readonly minRows?: number;
  readonly maxRows?: number;
}

export type ResponsiveBreakpointMap = Readonly<Record<string, BreakpointRange>>;

export type ResponsiveVariants<TBreakpoints extends ResponsiveBreakpointMap, TResult> =
  & { readonly [K in keyof TBreakpoints]: () => TResult }
  & { readonly default?: () => TResult };

const admittedBreakpoints = new WeakSet<object>();

export function defineBreakpoints<TBreakpoints extends ResponsiveBreakpointMap>(
  breakpoints: TBreakpoints
): Readonly<Record<keyof TBreakpoints, BreakpointRange>> {
  if (!isNonArrayObject(breakpoints)) {
    throw new TypeError('Responsive breakpoints must be an object.');
  }
  if (admittedBreakpoints.has(breakpoints)) return breakpoints;
  const entries = Object.entries(breakpoints).map(([name, range]) => [name, adoptRange(name, range)] as const);
  if (entries.length === 0) throw new RangeError('defineBreakpoints requires at least one breakpoint.');
  for (const [name] of entries) {
    if (name === 'default') throw new RangeError('Breakpoint name "default" is reserved for responsive fallback variants.');
  }
  for (let leftIndex = 0; leftIndex < entries.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < entries.length; rightIndex += 1) {
      const [leftName, leftRange] = entries[leftIndex] ?? [];
      const [rightName, rightRange] = entries[rightIndex] ?? [];
      if (
        leftName !== undefined
        && rightName !== undefined
        && leftRange !== undefined
        && rightRange !== undefined
        && rangesOverlap(leftRange, rightRange)
      ) {
        throw new RangeError(`Responsive breakpoints overlap: ${leftName}, ${rightName}.`);
      }
    }
  }
  const admitted = Object.freeze(Object.fromEntries(entries)) as Readonly<Record<keyof TBreakpoints, BreakpointRange>>;
  admittedBreakpoints.add(admitted);
  return admitted;
}

export function viewportVariant<TBreakpoints extends ResponsiveBreakpointMap>(
  viewport: ViewportDimensions,
  breakpoints: TBreakpoints,
  options: { readonly allowDefault?: boolean } = {}
): keyof TBreakpoints | 'default' {
  decodeLayoutCellCount(viewport.columns, 'Responsive viewport columns');
  decodeLayoutCellCount(viewport.rows, 'Responsive viewport rows');
  const admitted: ResponsiveBreakpointMap = defineBreakpoints(breakpoints);
  const matches = Object.entries(admitted)
    .filter((entry): entry is [keyof TBreakpoints & string, BreakpointRange] => matchesRange(viewport, entry[1]))
    .map(([name]) => name);
  if (matches.length === 1) return matches[0] as keyof TBreakpoints;
  if (matches.length === 0 && options.allowDefault === true) return 'default';
  if (matches.length === 0) {
    throw new RangeError(`No responsive breakpoint matches ${String(viewport.columns)}x${String(viewport.rows)}.`);
  }
  throw new RangeError(`Responsive breakpoints overlap for ${String(viewport.columns)}x${String(viewport.rows)}: ${matches.join(', ')}.`);
}

export function responsive<TBreakpoints extends ResponsiveBreakpointMap, TResult>(
  viewport: ViewportDimensions,
  breakpoints: TBreakpoints,
  variants: ResponsiveVariants<TBreakpoints, TResult>
): TResult {
  const key = viewportVariant(viewport, breakpoints, { allowDefault: typeof variants.default === 'function' });
  const variant = key === 'default' ? variants.default : variants[key];
  if (typeof variant !== 'function') {
    throw new RangeError(`Responsive variant "${String(key)}" is missing.`);
  }
  return variant();
}

function matchesRange(viewport: ViewportDimensions, range: BreakpointRange): boolean {
  return greaterOrEqual(viewport.columns, range.minColumns)
    && lessOrEqual(viewport.columns, range.maxColumns)
    && greaterOrEqual(viewport.rows, range.minRows)
    && lessOrEqual(viewport.rows, range.maxRows);
}

function adoptRange(name: string, range: unknown): BreakpointRange {
  if (!isNonArrayObject(range)) {
    throw new TypeError(`Breakpoint "${name}" must be an object.`);
  }
  const minColumns = range['minColumns'] === undefined ? undefined : decodeLayoutCellCount(range['minColumns'], `Breakpoint "${name}" minColumns`);
  const maxColumns = range['maxColumns'] === undefined ? undefined : decodeLayoutCellCount(range['maxColumns'], `Breakpoint "${name}" maxColumns`);
  const minRows = range['minRows'] === undefined ? undefined : decodeLayoutCellCount(range['minRows'], `Breakpoint "${name}" minRows`);
  const maxRows = range['maxRows'] === undefined ? undefined : decodeLayoutCellCount(range['maxRows'], `Breakpoint "${name}" maxRows`);
  if (minColumns === undefined && maxColumns === undefined && minRows === undefined && maxRows === undefined) {
    throw new RangeError(`Breakpoint "${name}" must define at least one boundary.`);
  }
  if (minColumns !== undefined && maxColumns !== undefined && minColumns > maxColumns) {
    throw new RangeError(`Breakpoint "${name}" has minColumns greater than maxColumns.`);
  }
  if (minRows !== undefined && maxRows !== undefined && minRows > maxRows) {
    throw new RangeError(`Breakpoint "${name}" has minRows greater than maxRows.`);
  }
  return Object.freeze({
    ...(minColumns === undefined ? {} : { minColumns }),
    ...(maxColumns === undefined ? {} : { maxColumns }),
    ...(minRows === undefined ? {} : { minRows }),
    ...(maxRows === undefined ? {} : { maxRows }),
  });
}

function rangesOverlap(left: BreakpointRange, right: BreakpointRange): boolean {
  return intervalsOverlap(left.minColumns, left.maxColumns, right.minColumns, right.maxColumns)
    && intervalsOverlap(left.minRows, left.maxRows, right.minRows, right.maxRows);
}

function intervalsOverlap(
  leftMin: number | undefined,
  leftMax: number | undefined,
  rightMin: number | undefined,
  rightMax: number | undefined
): boolean {
  const aMin = leftMin ?? Number.NEGATIVE_INFINITY;
  const aMax = leftMax ?? Number.POSITIVE_INFINITY;
  const bMin = rightMin ?? Number.NEGATIVE_INFINITY;
  const bMax = rightMax ?? Number.POSITIVE_INFINITY;
  return aMin <= bMax && bMin <= aMax;
}

function greaterOrEqual(value: number, boundary: number | undefined): boolean {
  return boundary === undefined || value >= boundary;
}

function lessOrEqual(value: number, boundary: number | undefined): boolean {
  return boundary === undefined || value <= boundary;
}
