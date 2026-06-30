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

export function defineBreakpoints<TBreakpoints extends ResponsiveBreakpointMap>(
  breakpoints: TBreakpoints
): TBreakpoints {
  const entries = Object.entries(breakpoints);
  if (entries.length === 0) throw new RangeError('defineBreakpoints requires at least one breakpoint.');
  for (const [name, range] of entries) {
    if (name === 'default') throw new RangeError('Breakpoint name "default" is reserved for responsive fallback variants.');
    assertRange(name, range);
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
  return Object.freeze({ ...breakpoints });
}

export function viewportVariant<TBreakpoints extends ResponsiveBreakpointMap>(
  viewport: ViewportDimensions,
  breakpoints: TBreakpoints,
  options: { readonly allowDefault?: boolean } = {}
): keyof TBreakpoints | 'default' {
  const matches = Object.entries(breakpoints)
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

function assertRange(name: string, range: BreakpointRange): void {
  const minColumns = normalizedBoundary(range.minColumns);
  const maxColumns = normalizedBoundary(range.maxColumns);
  const minRows = normalizedBoundary(range.minRows);
  const maxRows = normalizedBoundary(range.maxRows);
  if (minColumns === undefined && maxColumns === undefined && minRows === undefined && maxRows === undefined) {
    throw new RangeError(`Breakpoint "${name}" must define at least one boundary.`);
  }
  if (minColumns !== undefined && maxColumns !== undefined && minColumns > maxColumns) {
    throw new RangeError(`Breakpoint "${name}" has minColumns greater than maxColumns.`);
  }
  if (minRows !== undefined && maxRows !== undefined && minRows > maxRows) {
    throw new RangeError(`Breakpoint "${name}" has minRows greater than maxRows.`);
  }
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
  const aMin = normalizedBoundary(leftMin) ?? Number.NEGATIVE_INFINITY;
  const aMax = normalizedBoundary(leftMax) ?? Number.POSITIVE_INFINITY;
  const bMin = normalizedBoundary(rightMin) ?? Number.NEGATIVE_INFINITY;
  const bMax = normalizedBoundary(rightMax) ?? Number.POSITIVE_INFINITY;
  return aMin <= bMax && bMin <= aMax;
}

function greaterOrEqual(value: number, boundary: number | undefined): boolean {
  return boundary === undefined || Math.floor(value) >= boundary;
}

function lessOrEqual(value: number, boundary: number | undefined): boolean {
  return boundary === undefined || Math.floor(value) <= boundary;
}

function normalizedBoundary(value: number | undefined): number | undefined {
  return value === undefined || !Number.isFinite(value) ? undefined : Math.floor(value);
}
