import type { MeasuredCollection } from './measured-collection.ts';
import { readMeasuredCollection, replaceMeasuredItemIdentity } from './measured-collection.ts';
import { measuredAnchorAt, measuredWindow } from './measured-window-operations.ts';

/** Geometry dependencies that affect height. Change revision for theme or text-width policy changes. @beta */
export interface MeasurementGeometry {
  readonly columns: number;
  readonly revision: unknown;
}

/** Controlled measurements over the existing persistent collection. Values must be immutable. @beta */
export interface MeasurementState<TValue> {
  readonly collection: MeasuredCollection<TValue>;
  readonly geometry: MeasurementGeometry;
  readonly viewportRows: number;
  readonly offsetRow: number;
  readonly followTail: boolean;
}

/** A visible item's immutable content revision and geometry, retained until layout is accepted. @beta */
export interface MeasurementRequest<TValue> {
  readonly itemId: string;
  readonly value: TValue;
  readonly geometry: MeasurementGeometry;
  readonly estimatedRows: number;
}

/** Carry this through an ordinary message from accepted layout or prepared measurement work. @beta */
export interface MeasurementUpdate<TValue> {
  readonly request: MeasurementRequest<TValue>;
  readonly rows: number;
}

/** @beta */
export interface MeasurementOptions<TValue> {
  readonly collection: MeasuredCollection<TValue>;
  readonly geometry: MeasurementGeometry;
  readonly viewportRows: number;
  readonly offsetRow?: number;
  readonly followTail?: boolean;
}

const receipts = new WeakMap<object, MeasurementGeometry>();
const requests = new WeakMap<object, { readonly item: object; readonly geometry: MeasurementGeometry }>();

/** Initial item heights are estimates until an accepted measurement supplies the same geometry. @beta */
export function createMeasurementState<TValue>(options: MeasurementOptions<TValue>): MeasurementState<TValue> {
  const geometry = ownedGeometry(options.geometry);
  const viewportRows = rows(options.viewportRows, 'viewportRows');
  const followTail = options.followTail ?? false;
  const offsetRow = measuredWindow(options.collection, {
    viewportRows,
    offsetRow: followTail ? options.collection.totalRows : options.offsetRow ?? 0,
  }).offsetRow;
  return Object.freeze({ collection: options.collection, geometry, viewportRows, offsetRow, followTail });
}

/** Reconcile membership/content/geometry without scanning history. Existing heights become estimates on invalidation. @beta */
export function updateMeasurementState<TValue>(
  state: MeasurementState<TValue>,
  options: MeasurementOptions<TValue>,
): MeasurementState<TValue> {
  const viewportRows = rows(options.viewportRows, 'viewportRows');
  const geometry = viewportRows === state.viewportRows && sameGeometry(state.geometry, options.geometry)
    ? state.geometry : ownedGeometry(options.geometry);
  const followTail = options.followTail ?? state.followTail;
  const anchor = options.offsetRow === undefined && !followTail
    ? measuredAnchorAt(state.collection, { offsetRow: state.offsetRow }) : undefined;
  const offsetRow = measuredWindow(options.collection, {
    viewportRows,
    offsetRow: followTail ? options.collection.totalRows : options.offsetRow ?? state.offsetRow,
    ...(anchor === undefined ? {} : { anchor }),
  }).offsetRow;
  if (state.collection === options.collection && geometry === state.geometry && viewportRows === state.viewportRows
    && offsetRow === state.offsetRow && followTail === state.followTail) return state;
  return Object.freeze({ collection: options.collection, geometry, viewportRows, offsetRow, followTail });
}

/** Only visible rows plus bounded overscan are examined. Already accepted items produce no request. @beta */
export function measurementRequests<TValue>(
  state: MeasurementState<TValue>,
  overscanRows = 0,
): readonly MeasurementRequest<TValue>[] {
  rows(overscanRows, 'overscanRows');
  if (state.viewportRows === 0 || state.geometry.columns === 0) return Object.freeze([]);
  const reader = readMeasuredCollection(state.collection);
  const start = Math.max(0, state.offsetRow - overscanRows);
  const end = Math.min(reader.totalRows, state.offsetRow + state.viewportRows + overscanRows);
  const result: MeasurementRequest<TValue>[] = [];
  for (const { item } of reader.positionsInRows(start, end)) {
    if (receipts.get(item) === state.geometry) continue;
    const request = Object.freeze({
      itemId: item.id, value: item.value, geometry: state.geometry, estimatedRows: item.rows,
    });
    requests.set(request, { item, geometry: state.geometry });
    result.push(request);
  }
  return Object.freeze(result);
}

/** Accept one batch atomically; stale content/geometry and duplicate replies cannot change state. @beta */
export function acceptMeasurements<TValue>(
  state: MeasurementState<TValue>,
  updates: readonly MeasurementUpdate<TValue>[],
): MeasurementState<TValue> {
  let collection = state.collection;
  // Validate before adopting any receipt so an invalid batch has no partially accepted work.
  for (const update of updates) {
    if (!Number.isSafeInteger(update.rows) || update.rows < 1) throw new RangeError('Measured rows must be a positive safe integer.');
  }
  for (const { request, rows: measuredRows } of updates) {
    const supplied = requests.get(request);
    const item = readMeasuredCollection(collection).itemById(request.itemId);
    if (supplied?.geometry !== state.geometry || supplied.item !== item) continue;
    collection = replaceMeasuredItemIdentity(collection, { ...item, rows: measuredRows });
    const accepted = readMeasuredCollection(collection).itemById(request.itemId);
    if (accepted !== undefined) receipts.set(accepted, state.geometry);
  }
  return collection === state.collection ? state : updateMeasurementState(state, {
    collection, geometry: state.geometry, viewportRows: state.viewportRows,
  });
}

function sameGeometry(left: MeasurementGeometry, right: MeasurementGeometry): boolean {
  return left.columns === right.columns && Object.is(left.revision, right.revision);
}

function ownedGeometry(value: MeasurementGeometry): MeasurementGeometry {
  return Object.freeze({ columns: rows(value.columns, 'columns'), revision: value.revision });
}

function rows(value: number, name: string): number {
  if (!Number.isSafeInteger(value) || value < 0) throw new RangeError(`${name} must be a non-negative safe integer.`);
  return value;
}
