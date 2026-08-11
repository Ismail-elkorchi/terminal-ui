import { defineComponent } from '../../component/index.ts';
import type { Element } from '../../element/index.ts';
import type { CanvasOptions } from '../options/drawing.ts';
import { isNonArrayObject } from '../../foundation/validation.ts';
import { assertValidMeasurement, createLocalCanvas2D } from '../../renderer/index.ts';
import type { CanvasPainter, Measurement } from '../../renderer/index.ts';
import { sanitizeTerminalText } from '../../text/index.ts';
import type { CanvasStylePart } from '../../ui-model/style-parts.ts';
import { assertKnownOptions } from '../internal/options.ts';

interface CanvasModel {
  readonly painter: CanvasPainter;
  readonly measurement: Measurement;
  readonly label?: string;
}

type CanvasOwnOptions = Pick<CanvasOptions, 'painter' | 'measurement' | 'label' | 'decorative'>;

const semanticCanvas = defineComponent<
  CanvasOwnOptions,
  CanvasModel,
  never,
  CanvasStylePart,
  readonly [],
  'optional',
  readonly ['styles', 'layer']
>({
  name: 'terminal-ui/components/canvas',
  identity: 'optional',
  structure: 'leaf',
  semantics: 'semantic',
  metadata: ['styles', 'layer'],
  parts: ['content'],
  prepare(value) {
    assertKnownOptions(value, ['painter', 'measurement', 'label', 'decorative'], 'canvas');
    const model = prepareCanvas(value);
    if (
      value.decorative !== undefined && value.decorative !== false
    ) {
      throw new TypeError('semantic canvas decorative must be false or absent.');
    }
    if (model.label === undefined) {
      throw new TypeError('semantic canvas requires a non-empty label.');
    }
    return model;
  },
  measure: ({ model }) => model.measurement,
  render: paintCanvas,
  accessibility({ id, model, focused }) {
    return {
      id,
      role: 'image',
      label: model.label ?? id,
      scope: { kind: 'document' },
      ...(focused ? { focused: true } : {}),
    };
  },
});

const decorativeCanvas = defineComponent<
  Pick<CanvasOwnOptions, 'painter' | 'measurement' | 'decorative'>,
  CanvasModel,
  CanvasStylePart,
  'optional',
  readonly ['styles', 'layer']
>({
  name: 'terminal-ui/components/decorative-canvas',
  identity: 'optional',
  structure: 'leaf',
  semantics: 'decorative',
  metadata: ['styles', 'layer'],
  parts: ['content'],
  prepare(value) {
    if (value.decorative !== true) {
      throw new TypeError('decorative canvas requires decorative: true.');
    }
    assertKnownOptions(value, ['painter', 'measurement', 'decorative'], 'decorative canvas');
    return prepareCanvas(value);
  },
  measure: ({ model }) => model.measurement,
  render: paintCanvas,
});

export function canvas(options: CanvasOptions): Element {
  if (!isNonArrayObject(options)) throw new TypeError('canvas options must be an object.');
  return options.decorative === true ? decorativeCanvas(options) : semanticCanvas(options);
}

function prepareCanvas(value: Readonly<Record<string, unknown>>): CanvasModel {
  const painter = value['painter'];
  if (!isCanvasPainter(painter)) throw new TypeError('canvas painter must be a function.');
  const measurement = value['measurement'];
  assertValidMeasurement(measurement, 'canvas');
  const label = value['label'];
  if (label !== undefined && typeof label !== 'string') {
    throw new TypeError('canvas label must be a string.');
  }
  const normalizedLabel = label === undefined ? undefined : sanitizeTerminalText(label).text.trim();
  if (label !== undefined && normalizedLabel?.length === 0) {
    throw new TypeError('canvas label must be non-empty.');
  }
  return {
    painter,
    measurement,
    ...(normalizedLabel === undefined ? {} : { label: normalizedLabel }),
  };
}

function isCanvasPainter(value: unknown): value is CanvasPainter {
  return typeof value === 'function';
}

function paintCanvas(
  input: import('../../component/index.ts').ComponentRenderInput<CanvasModel, CanvasStylePart>,
): void {
  input.model.painter({
    canvas: createLocalCanvas2D(input.target, input.bounds),
    bounds: input.bounds,
    theme: input.theme,
    style: input.style,
    source: input.source,
  });
}
