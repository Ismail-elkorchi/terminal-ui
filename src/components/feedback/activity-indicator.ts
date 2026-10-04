import { defineComponent } from '../../component/definition.ts';
import type { Element } from '../../element/types.ts';
import { sanitizeTerminalText } from '../../text/sanitize.ts';
import { measureRenderSpans, span } from '../../visual/render-content.ts';
import { processStatusMarker, processStatusStyle } from '../shared/indicator-helpers.ts';
import { isProcessStatus } from '../status.ts';
import type { ActivityIndicatorStylePart } from '../style-parts.ts';
import type {
  ActivityIndicatorOptions,
  RunningActivityIndicatorOptions,
  SettledActivityIndicatorOptions,
} from './options.ts';
import type { ProcessStatus } from './status-bar-contracts.ts';


interface ActivityIndicatorModel {
  readonly label: string;
  readonly status: ProcessStatus;
  readonly frames?: readonly string[];
  readonly frameIndex: number;
}

type ActivityIndicatorOwnOptions =
  | Pick<RunningActivityIndicatorOptions, 'label' | 'status' | 'frames' | 'frameIndex'>
  | Pick<SettledActivityIndicatorOptions, 'label' | 'status' | 'frames' | 'frameIndex'>;

type ActivityIndicatorFactory = (options: ActivityIndicatorOptions) => Element;

export const activityIndicator: ActivityIndicatorFactory = defineComponent<ActivityIndicatorOwnOptions>()({
  name: 'terminal-ui/components/activity-indicator',
  identity: 'optional',
  structure: 'leaf',
  semantics: 'semantic',
  accessibleRole: 'status',
  metadata: ['styles', 'layer'],
  parts: ['marker', 'label', 'value'],
  createModel(value) {
    const label = value.label;
    const status = value.status;
    const frames = value.frames;
    const frameIndex = value.frameIndex;
    if (typeof label !== 'string' || label.trim().length === 0) {
      throw new TypeError('activityIndicator requires a non-empty label.');
    }
    if (!isProcessStatus(status)) {
      throw new TypeError(
        'activityIndicator status must be idle, running, success, warning, or error.',
      );
    }
    if (status !== 'running' && (frames !== undefined || frameIndex !== undefined)) {
      throw new TypeError('activityIndicator frames are only valid while running.');
    }
    if (frames !== undefined && !isStringArray(frames)) {
      throw new TypeError('activityIndicator frames must be strings.');
    }
    if (
      frameIndex !== undefined && (typeof frameIndex !== 'number' || !Number.isFinite(frameIndex))
    ) {
      throw new TypeError('activityIndicator frameIndex must be finite.');
    }
    const ownedFrames = frames === undefined ? undefined : frames
      .map((frame) => sanitizeTerminalText(frame).text.replace(/\s*\n\s*/gu, ' '))
      .filter((frame) => frame.length > 0);
    return {
      label: sanitizeTerminalText(label).text,
      status,
      ...(ownedFrames === undefined || ownedFrames.length === 0
        ? {}
        : { frames: ownedFrames }),
      frameIndex: frameIndex === undefined ? 0 : Math.floor(frameIndex),
    };
  },
  measure(input) {
    const spans = activityIndicatorSpans(input);
    return {
      minWidth: 0,
      minHeight: 0,
      preferredWidth: measureRenderSpans(spans, { widthProfile: input.widthProfile, textPresentation: input.textPresentation }),
      preferredHeight: 1,
    };
  },
  render(input) {
    input.target.write(0, 0, activityIndicatorSpans(input, true));
  },
  accessibility({ id, model }) {
    return {
      id,
      role: 'status',
      value: `${model.label} (${model.status})`,
      live: 'polite',
    };
  },
});

function activityIndicatorSpans(
  input: {
    readonly model: ActivityIndicatorModel;
    readonly theme: import('../../theme/index.ts').TerminalTheme;
    readonly style?: (
      input: import('../../component/index.ts').ComponentStyleInput<ActivityIndicatorStylePart>,
    ) => import('../../visual/render-content.ts').TerminalStyle | undefined;
    readonly frameSource?: (
      input?: import('../../component/index.ts').ComponentFrameSourceInput,
    ) => import('../../visual/frame-source.ts').FrameCellSource;
  },
  decorated = false,
): readonly import('../../visual/render-content.ts').RenderSpan[] {
  const marker = activityMarker(input.model, input.theme);
  if (!decorated || input.style === undefined || input.frameSource === undefined) {
    return [
      span(marker),
      span(' '),
      span(input.model.label),
      ...(input.model.status === 'idle' || input.model.status === 'running'
        ? []
        : [span(' ('), span(input.model.status), span(')')]),
    ];
  }
  const markerStyle = input.style({ part: 'marker', base: processStatusStyle(input.model.status) });
  const labelStyle = input.style({
    part: 'label',
    base: { fg: { kind: 'theme', token: 'text.default' } },
  });
  const statusValueStyle = input.style({
    part: 'value',
    base: processStatusStyle(input.model.status),
  });
  const suffix = input.model.status === 'idle' || input.model.status === 'running' ? [] : [
    span(' (', { source: input.frameSource({ partName: 'status.open', cellRole: 'decoration' }) }),
    span(input.model.status, {
      ...(statusValueStyle === undefined ? {} : { style: statusValueStyle }),
      source: input.frameSource({ partName: 'status.value', cellRole: 'text' }),
    }),
    span(')', { source: input.frameSource({ partName: 'status.close', cellRole: 'decoration' }) }),
  ];
  return [
    span(marker, {
      ...(markerStyle === undefined ? {} : { style: markerStyle }),
      source: input.frameSource({ partName: 'status.marker', cellRole: 'decoration' }),
    }),
    span(' ', { source: input.frameSource({ partName: 'status.gap', cellRole: 'separator' }) }),
    span(input.model.label, {
      ...(labelStyle === undefined ? {} : { style: labelStyle }),
      source: input.frameSource({ partName: 'label', cellRole: 'text' }),
    }),
    ...suffix,
  ];
}

function isStringArray(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === 'string');
}

function activityMarker(
  model: ActivityIndicatorModel,
  theme: import('../../theme/index.ts').TerminalTheme,
): string {
  if (model.status !== 'running') return processStatusMarker(model.status, theme);
  const frames = model.frames ?? theme.tokens.symbols.spinnerFrames;
  const index = ((model.frameIndex % frames.length) + frames.length) % frames.length;
  return frames[index] ?? theme.tokens.symbols.statusInfo;
}
