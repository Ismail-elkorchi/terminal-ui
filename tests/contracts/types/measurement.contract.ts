import { measureElement, measuredColumn, text } from '@ismail-elkorchi/terminal-ui';
import { acceptMeasurements, createMeasuredCollection, createMeasurementState, measurementRequests, measuredWindow, updateMeasurementState } from '@ismail-elkorchi/terminal-ui/collection';
import type { MeasurementUpdate } from '@ismail-elkorchi/terminal-ui/collection';

const initial = createMeasurementState({
  collection: createMeasuredCollection([{ id: 'a', rows: 1, value: text({ content: 'Example' }) }]),
  geometry: { columns: 20, rows: 10, revision: 1 }, viewportRows: 10,
});
const updates: MeasurementUpdate<ReturnType<typeof text>>[] = measurementRequests(initial, 2).map(request => ({
  request, rows: measureElement(request.value, request.geometry).preferredHeight,
}));
const accepted = acceptMeasurements(initial, updates);
updateMeasurementState(accepted, { collection: accepted.collection, geometry: { columns: 30, rows: 10, revision: 2 }, viewportRows: 10 });
measuredColumn(measuredWindow(accepted.collection, accepted), entry => entry.item.value, { measurementRows: accepted.geometry.rows });
// @ts-expect-error measurement constraints declare rows independently of viewportRows.
createMeasurementState({ collection: initial.collection, geometry: { columns: 20, revision: 1 }, viewportRows: 10 });
// @ts-expect-error component measurement accepts public elements, not arbitrary renderer nodes.
measureElement({ kind: 'text', props: {} }, { columns: 20, rows: 10 });
// @ts-expect-error measurement batches keep the source value type.
acceptMeasurements(initial, [{ request: { itemId: 'a', value: 5, geometry: initial.geometry, estimatedRows: 1 }, rows: 2 }]);
