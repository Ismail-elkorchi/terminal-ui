import { defineComponent } from '../../component/index.ts';
import type { Element } from '../../element/index.ts';
import type { CanvasOptions, ImageOptions } from '../options/drawing.ts';
import { isNonArrayObject } from '../../foundation/validation.ts';
import { decodeMeasurement, createLocalCanvas2D, span } from '../../renderer/index.ts';
import type { CanvasPainter, Measurement, TerminalStyle } from '../../renderer/index.ts';
import { sanitizeTerminalText } from '../../text/index.ts';
import type { CanvasStylePart } from '../style-parts.ts';
import type { ImageStylePart } from '../style-parts.ts';
import { isRasterImage } from '../../graphics/index.ts';
import type { ImageFit, RasterImage } from '../../graphics/index.ts';
import { inlineSegmentText, normalizeInlineContent } from '../../visual/inline-content.ts';
import type { InlineContent } from '../../visual/inline-content.ts';

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
  accessibleRole: 'image',
  metadata: ['styles', 'layer'],
  parts: ['content'],
  createModel(value) {
    const model = createCanvasModel(value);
    if (
      value.decorative !== undefined && value.decorative
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
      ...(model.label === undefined ? {} : { label: model.label }),
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
  createModel(value) {
    if (value.decorative !== true) {
      throw new TypeError('decorative canvas requires decorative: true.');
    }
    return createCanvasModel(value);
  },
  measure: ({ model }) => model.measurement,
  render: paintCanvas,
});

export function canvas(options: CanvasOptions): Element {
  if (!isNonArrayObject(options)) throw new TypeError('canvas options must be an object.');
  return options.decorative === true ? decorativeCanvas(options) : semanticCanvas(options);
}

interface ImageModel {
  readonly image: RasterImage;
  readonly measurement: Measurement;
  readonly fit: ImageFit;
  readonly fallback: InlineContent;
  readonly label?: string;
}

interface SemanticImageModel extends ImageModel {
  readonly label: string;
}

type ImageOwnOptions = Pick<ImageOptions, 'image' | 'measurement' | 'fit' | 'fallback' | 'label' | 'decorative'>;

const semanticImage = defineComponent<
  ImageOwnOptions,
  SemanticImageModel,
  never,
  ImageStylePart,
  readonly [],
  'optional',
  readonly ['styles', 'layer']
>({
  name: 'terminal-ui/components/image',
  identity: 'optional',
  structure: 'leaf',
  semantics: 'semantic',
  accessibleRole: 'image',
  metadata: ['styles', 'layer'],
  parts: ['fallback'],
  createModel(value) {
    const model = createImageModel(value);
    if (value.decorative === true) throw new TypeError('Semantic image decorative must be false or absent.');
    if (model.label === undefined) throw new TypeError('Semantic image requires a non-empty label.');
    return Object.freeze({ ...model, label: model.label });
  },
  measure: ({ model }) => model.measurement,
  render: renderImage,
  accessibility({ id, model }) {
    return { id, role: 'image', label: model.label, scope: { kind: 'document' } };
  },
});

const decorativeImage = defineComponent<
  Pick<ImageOwnOptions, 'image' | 'measurement' | 'fit' | 'fallback' | 'decorative'>,
  ImageModel,
  ImageStylePart,
  'optional',
  readonly ['styles', 'layer']
>({
  name: 'terminal-ui/components/decorative-image',
  identity: 'optional',
  structure: 'leaf',
  semantics: 'decorative',
  metadata: ['styles', 'layer'],
  parts: ['fallback'],
  createModel(value) {
    if (value.decorative !== true) throw new TypeError('Decorative image requires decorative: true.');
    return createImageModel(value);
  },
  measure: ({ model }) => model.measurement,
  render: renderImage,
});

export function image(options: ImageOptions): Element {
  if (!isNonArrayObject(options)) throw new TypeError('image options must be an object.');
  return options.decorative === true ? decorativeImage(options) : semanticImage(options);
}

function createImageModel(value: Readonly<ImageOwnOptions>): ImageModel {
  if (!isRasterImage(value.image)) throw new TypeError('image resource must be created by rasterImage().');
  const measurement = decodeMeasurement(value.measurement, 'image');
  const fit = decodeImageFit(value.fit);
  const label = value.label;
  if (label !== undefined && typeof label !== 'string') throw new TypeError('image label must be a string.');
  const normalizedLabel = label === undefined ? undefined : sanitizeTerminalText(label).text.trim();
  if (label !== undefined && normalizedLabel?.length === 0) throw new TypeError('image label must be non-empty.');
  const fallback = value.fallback === undefined
    ? normalizedLabel === undefined
      ? Object.freeze([])
      : Object.freeze([{ kind: 'text' as const, text: normalizedLabel }])
    : normalizeInlineContent(typeof value.fallback === 'string'
      ? [{ kind: 'text', text: value.fallback }]
      : value.fallback);
  return Object.freeze({
    image: value.image,
    measurement,
    fit,
    fallback,
    ...(normalizedLabel === undefined ? {} : { label: normalizedLabel }),
  });
}

function decodeImageFit(value: unknown): ImageFit {
  if (value === undefined) return 'contain';
  if (value === 'contain' || value === 'cover' || value === 'fill') return value;
  throw new TypeError("image fit must be 'contain', 'cover', or 'fill'.");
}

function renderImage(
  input: import('../../component/index.ts').ComponentRenderInput<ImageModel, ImageStylePart>,
): void {
  if (input.bounds.width <= 0 || input.bounds.height <= 0) return;
  if (input.model.fallback.length > 0) {
    input.target.write(0, 0, input.model.fallback.map((segment, index) => {
      const linkStyle: TerminalStyle | undefined = segment.link === undefined
        ? undefined
        : { fg: { kind: 'theme', token: 'link.foreground' }, underline: true };
      const style = input.style({ part: 'fallback', base: { ...linkStyle, ...segment.style } });
      return span(inlineSegmentText(segment, input.theme.tokens.symbols.mode), {
        ...(style === undefined ? {} : { style }),
        ...(segment.link === undefined ? {} : { link: segment.link }),
        source: input.frameSource({
          partName: 'fallback',
          itemIndex: index,
          description: 'image fallback',
        }),
      });
    }));
  }
  input.target.placeGraphic({
    id: 'content',
    image: input.model.image,
    bounds: { row: 0, column: 0, width: input.bounds.width, height: input.bounds.height },
    fit: input.model.fit,
  });
}

function createCanvasModel(
  value: Readonly<Pick<CanvasOwnOptions, 'painter' | 'measurement' | 'label'>>,
): CanvasModel {
  const painter = value.painter;
  if (!isCanvasPainter(painter)) throw new TypeError('canvas painter must be a function.');
  const measurement = value.measurement;
  const ownedMeasurement = decodeMeasurement(measurement, 'canvas');
  const label = value.label;
  if (label !== undefined && typeof label !== 'string') {
    throw new TypeError('canvas label must be a string.');
  }
  const normalizedLabel = label === undefined ? undefined : sanitizeTerminalText(label).text.trim();
  if (label !== undefined && normalizedLabel?.length === 0) {
    throw new TypeError('canvas label must be non-empty.');
  }
  return {
    painter,
    measurement: ownedMeasurement,
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
    frameSource: input.frameSource,
  });
}
