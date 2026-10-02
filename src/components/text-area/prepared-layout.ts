import type { ComponentInput, ComponentLayoutCommitInput, ComponentMeasureInput } from '../../component/contracts.ts';
import type { Measurement } from '../../renderer/contracts.ts';
import type { TextDocument } from '../../text/document.ts';
import type { RowOffsetMap, TextWidthProfile } from '../../text/types.ts';
import { defineTextWidthProfile, textWidthProfileKey } from '../../text/width-profile.ts';
import type { TerminalTheme } from '../../theme/theme.ts';
import type { TextAreaGeometry, TextAreaLayoutDependencies } from './geometry-contracts.ts';
import type { PreparedTextAreaLayout, TextAreaLayoutRequest } from './contracts.ts';

interface PreparationModel extends TextAreaLayoutDependencies {
  readonly preparedLayout?: PreparedTextAreaLayout | null;
  readonly observeLayoutRequest: boolean;
}
interface Dimensions {
  readonly width: number;
  readonly height: number;
  readonly theme: TerminalTheme;
  readonly widthProfile: TextWidthProfile;
}
export interface PreparedLayoutData {
  readonly dependencies: TextAreaLayoutDependencies;
  readonly geometry: TextAreaGeometry;
  readonly measurements: ReadonlyMap<number, Measurement>;
  readonly rowOffsetMap?: RowOffsetMap;
}
interface RequestData {
  readonly dependencies: TextAreaLayoutDependencies;
  readonly measurements: ReadonlyMap<number, Measurement>;
}
interface MeasurementTrace {
  readonly widths: Set<number>;
}
const preparedLayouts = new WeakMap<PreparedTextAreaLayout, PreparedLayoutData>();
const requests = new WeakMap<TextAreaLayoutRequest, RequestData>();
const measuredWidths = new WeakMap<object, WeakMap<TerminalTheme, Map<string, MeasurementTrace>>>();
const committedRequests = new WeakMap<object, TextAreaLayoutRequest>();
const pendingMeasurement: Measurement = Object.freeze({ minWidth: 0, minHeight: 1, preferredWidth: 0, preferredHeight: 1 });

export function retainPreparedTextAreaLayout(
  dimensions: Dimensions,
  model: TextAreaLayoutDependencies,
  geometry: TextAreaGeometry,
  measurements: ReadonlyMap<number, Measurement>,
  rowOffsetMap?: RowOffsetMap,
): PreparedTextAreaLayout {
  const result = Object.freeze({ ...dimensions, document: model.document, wrap: model.wrap }) as PreparedTextAreaLayout;
  preparedLayouts.set(result, { dependencies: adoptDependencies(model), geometry,
    measurements: new Map([...measurements].map(([width, value]) => [width, Object.freeze({ ...value })])),
    ...(rowOffsetMap === undefined ? {} : { rowOffsetMap }) });
  return result;
}

export function assertPreparedTextAreaLayout(value: PreparedTextAreaLayout): void {
  if (!preparedLayouts.has(value)) throw new TypeError('textArea preparedLayout must be created by prepareTextAreaLayout.');
}

export function preparedTextAreaModelText(value: PreparedTextAreaLayout, document: TextDocument,
  rawPlaceholder: string, rawError: string): { readonly placeholder: string; readonly error: string } | undefined {
  assertPreparedTextAreaLayout(value);
  const dependencies = preparedLayouts.get(value)?.dependencies;
  return dependencies?.document === document && dependencies.rawPlaceholder === rawPlaceholder && dependencies.rawError === rawError
    ? { placeholder: dependencies.placeholder, error: dependencies.error } : undefined;
}

export function assertPreparedTextAreaDocument(value: PreparedTextAreaLayout, document: TextDocument): void {
  assertPreparedTextAreaLayout(value);
  if (value.document !== document) throw new TypeError('textArea preparedLayout does not match the current document. Prepare and admit the current layout before rendering.');
}

/** Only explicit pending mode may use a cheap estimate; a wrong-width measurement is never substituted. */
export function measurePreparedTextArea(input: ComponentMeasureInput<PreparationModel>): Measurement {
  traceFor(input.model, input.theme, input.widthProfile).widths.add(input.constraints.width);
  const data = compatiblePrepared(input.model, input.theme, input.widthProfile);
  const exact = data?.measurements.get(input.constraints.width);
  if (exact !== undefined) return exact;
  if (!input.model.observeLayoutRequest) throw mismatch();
  return pendingMeasurement;
}

/** Missing admitted geometry keeps controlled preparation pending, without synchronous layout work. */
export function preparedTextAreaGeometry(input: ComponentInput<PreparationModel>): PreparedLayoutData | undefined {
  const data = compatiblePrepared(input.model, input.theme, input.widthProfile);
  const value = input.model.preparedLayout;
  const widths = traceFor(input.model, input.theme, input.widthProfile).widths;
  if (data !== undefined && value?.width === input.bounds.width && value.height === input.bounds.height
    && [...widths].every((width) => data.measurements.has(width))) return data;
  if (!input.model.observeLayoutRequest) throw mismatch();
  return undefined;
}

/** Emit only after frame acceptance. A stable pending frame never resubmits the same work. */
export function committedTextAreaLayoutRequest(input: ComponentLayoutCommitInput<PreparationModel>): TextAreaLayoutRequest | undefined {
  if (input.model.preparedLayout === undefined || !input.model.observeLayoutRequest || preparedTextAreaGeometry(input) !== undefined) return undefined;
  const widths = [...traceFor(input.model, input.theme, input.widthProfile).widths].sort((a, b) => a - b);
  const request = Object.freeze({ document: input.model.document, layoutRevision: input.commitId,
    width: input.bounds.width, height: input.bounds.height, theme: input.theme,
    widthProfile: defineTextWidthProfile(input.widthProfile), measurementWidths: Object.freeze(widths) }) as TextAreaLayoutRequest;
  const compatible = compatiblePrepared(input.model, input.theme, input.widthProfile);
  // Retain only exact measurements requested by this accepted tree, plus its
  // actual allocation width. Copy values, never a previous request/capability.
  const needed = new Set([...widths, request.width]);
  const measurements = new Map<number, Measurement>();
  for (const width of needed) {
    const value = compatible?.measurements.get(width);
    if (value !== undefined) measurements.set(width, value);
  }
  const data: RequestData = { dependencies: adoptDependencies(input.model), measurements };
  const previous = committedRequests.get(input.model)
    ?? (input.previous === undefined ? undefined : committedRequests.get(input.previous.model));
  if (previous !== undefined && sameRequest(previous, request, data)) {
    committedRequests.set(input.model, previous);
    return undefined;
  }
  requests.set(request, data);
  committedRequests.set(input.model, request);
  return request;
}

export function readTextAreaLayoutRequest(request: TextAreaLayoutRequest): RequestData {
  const data = requests.get(request);
  if (data === undefined) throw new TypeError('textArea layout request must come from an accepted onLayoutRequest callback.');
  return data;
}

export function assertTextAreaRequestDependencies(request: TextAreaLayoutRequest, model: TextAreaLayoutDependencies): void {
  if (!sameDependencies(readTextAreaLayoutRequest(request).dependencies, model)) {
    throw new TypeError('textArea layout request does not match the current options. Wait for an accepted request for the current document and options.');
  }
}

function compatiblePrepared(model: PreparationModel, theme: TerminalTheme, profile: TextWidthProfile): PreparedLayoutData | undefined {
  const value = model.preparedLayout;
  if (value === undefined || value === null) return undefined;
  assertPreparedTextAreaLayout(value);
  const data = preparedLayouts.get(value);
  if (data !== undefined && value.theme === theme && textWidthProfileKey(value.widthProfile) === textWidthProfileKey(profile)
    && sameDependencies(data.dependencies, model)) return data;
  if (!model.observeLayoutRequest) throw mismatch();
  return undefined;
}

function traceFor(model: object, theme: TerminalTheme, profile: TextWidthProfile): MeasurementTrace {
  const byTheme = measuredWidths.get(model) ?? new WeakMap<TerminalTheme, Map<string, MeasurementTrace>>();
  measuredWidths.set(model, byTheme);
  const byProfile = byTheme.get(theme) ?? new Map<string, MeasurementTrace>();
  byTheme.set(theme, byProfile);
  const profileKey = textWidthProfileKey(profile);
  const existing = byProfile.get(profileKey);
  if (existing !== undefined) return existing;
  const trace = { widths: new Set<number>() };
  byProfile.set(profileKey, trace);
  return trace;
}

function sameRequest(previous: TextAreaLayoutRequest, next: TextAreaLayoutRequest, data: RequestData): boolean {
  const before = requests.get(previous);
  return before !== undefined && previous.width === next.width && previous.height === next.height
    && previous.theme === next.theme && textWidthProfileKey(previous.widthProfile) === textWidthProfileKey(next.widthProfile)
    && sameDependencies(before.dependencies, data.dependencies)
    && previous.measurementWidths.length === next.measurementWidths.length
    && previous.measurementWidths.every((width, index) => width === next.measurementWidths[index])
    // An admitted result can resolve measurements without changing bounds. That
    // is progress, and must not suppress the next geometry request.
    && before.measurements.size === data.measurements.size
    && [...data.measurements].every(([width, value]) => before.measurements.get(width) === value);
}

function adoptDependencies(model: TextAreaLayoutDependencies): TextAreaLayoutDependencies {
  return Object.freeze({ document: model.document, decorations: model.decorations,
    placeholder: model.placeholder, error: model.error, rawPlaceholder: model.rawPlaceholder, rawError: model.rawError,
    wrap: model.wrap,
    ...(model.lineNumbers === undefined ? {} : { lineNumbers: Object.freeze({ ...model.lineNumbers }) }),
    ...(model.scrollbar === undefined ? {} : { scrollbar: Object.freeze({ ...model.scrollbar }) }),
  });
}

function sameDependencies(before: TextAreaLayoutDependencies, model: TextAreaLayoutDependencies): boolean {
  return before.document === model.document && before.decorations === model.decorations
    && before.rawPlaceholder === model.rawPlaceholder && before.rawError === model.rawError
    && before.wrap === model.wrap
    && before.lineNumbers?.startNumber === model.lineNumbers?.startNumber
    && before.lineNumbers?.minWidth === model.lineNumbers?.minWidth
    && before.scrollbar?.visible === model.scrollbar?.visible && before.scrollbar?.axis === model.scrollbar?.axis
    && (before.scrollbar === undefined) === (model.scrollbar === undefined);
}

function mismatch(): TypeError {
  return new TypeError('textArea preparedLayout dependencies do not match this measurement or allocation. Prepare and admit the current layout before rendering.');
}
