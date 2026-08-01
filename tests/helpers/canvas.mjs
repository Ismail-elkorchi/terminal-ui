import { canvas } from '../../dist/components/index.js';

const defaultMeasurement = Object.freeze({
  minWidth: 0,
  minHeight: 0,
  preferredWidth: 1,
  preferredHeight: 1
});

export function testCanvas(options) {
  return canvas({
    label: options.id ?? 'Test canvas',
    measurement: defaultMeasurement,
    ...options
  });
}
