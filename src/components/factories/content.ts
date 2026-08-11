import {
  defineComponent,
  line,
  measureRenderSpans,
  span,
  wrapRenderSpans,
} from '../../component/index.ts';
import type { ComponentMessage, SemanticLeafComponentFactory } from '../../component/index.ts';
import type { Element } from '../../element/index.ts';
import type { DisclosureOptions, RichTextOptions, TextOptions } from '../options/content.ts';
import { measureTextCells, sanitizeTerminalText } from '../../text/index.ts';
import type { ElementTextRole } from '../../element/metadata.ts';
import type { TerminalStyle } from '../../visual/render.ts';
import type { TextStylePart } from '../../ui-model/style-parts.ts';
import {
  inlineContentAccessibleText,
  inlineSegmentText,
  normalizeInlineContent,
} from '../../visual/inline-content.ts';
import type { InlineContent } from '../../visual/inline-content.ts';
import type { RenderSpan } from '../../visual/render.ts';
import type { ElementMessage } from '../../element/index.ts';

interface PreparedText {
  readonly content: string;
  readonly textRole: ElementTextRole;
}

export const text: SemanticLeafComponentFactory<
  Pick<TextOptions, 'content' | 'textRole'>,
  never,
  TextStylePart,
  readonly [],
  'optional',
  readonly ['styles', 'layer']
> = defineComponent<
  Pick<TextOptions, 'content' | 'textRole'>,
  PreparedText,
  never,
  TextStylePart,
  readonly [],
  'optional',
  readonly ['styles', 'layer']
>({
  name: 'terminal-ui/components/text',
  identity: 'optional',
  structure: 'leaf',
  semantics: 'semantic',
  metadata: ['styles', 'layer'],
  parts: ['content', 'link'],
  prepare(value) {
    const content = value.content;
    const textRole = value.textRole;
    if (typeof content !== 'string') throw new TypeError('text content must be a string.');
    if (textRole !== undefined && !isTextRole(textRole)) {
      throw new TypeError('text textRole is invalid.');
    }
    return {
      content: sanitizeTerminalText(content).text,
      textRole: textRole ?? 'body',
    };
  },
  measure({ model, widthProfile }) {
    const lines = model.content.split('\n');
    return {
      minWidth: 0,
      minHeight: 0,
      preferredWidth: lines.reduce(
        (width, line) => Math.max(width, measureTextCells(line, { widthProfile }).cells),
        0,
      ),
      preferredHeight: lines.length,
    };
  },
  render({ model, target, style, source }) {
    const contentStyle = style({
      part: 'root',
      base: textRoleStyle(model.textRole),
    });
    target.writeBlock(0, 0, {
      lines: model.content.split('\n').map((line) => ({
        spans: [{
          text: line,
          ...(contentStyle === undefined ? {} : { style: contentStyle }),
          source: source({
            cellRole: 'text',
            partName: `role.${model.textRole}`,
            partType: 'text',
            description: `role.${model.textRole}`,
          }),
        }],
      })),
    });
  },
  accessibility({ id, model }) {
    return { id, role: 'text', label: id, value: model.content };
  },
});

function isTextRole(value: unknown): value is ElementTextRole {
  return value === 'title' ||
    value === 'heading' ||
    value === 'body' ||
    value === 'caption' ||
    value === 'metadata' ||
    value === 'metric' ||
    value === 'badge';
}

function textRoleStyle(role: ElementTextRole): TerminalStyle {
  switch (role) {
    case 'title':
      return { fg: { kind: 'theme', token: 'surface.title' }, bold: true };
    case 'heading':
      return { fg: { kind: 'theme', token: 'text.strong' }, bold: true };
    case 'caption':
    case 'metadata':
      return { fg: { kind: 'theme', token: 'text.muted' }, dim: true };
    case 'metric':
      return { fg: { kind: 'theme', token: 'accent.primary' }, bold: true };
    case 'badge':
      return {
        fg: { kind: 'theme', token: 'badge.foreground' },
        bg: { kind: 'theme', token: 'badge.background' },
        bold: true,
      };
    case 'body':
      return { fg: { kind: 'theme', token: 'text.default' } };
  }
}

interface PreparedRichText {
  readonly segments: InlineContent;
  readonly wrap: boolean;
}

export const richText: SemanticLeafComponentFactory<
  Pick<RichTextOptions, 'segments' | 'wrap'>,
  never,
  TextStylePart,
  readonly [],
  'optional',
  readonly ['styles', 'layer']
> = defineComponent<
  Pick<RichTextOptions, 'segments' | 'wrap'>,
  PreparedRichText,
  never,
  TextStylePart,
  readonly [],
  'optional',
  readonly ['styles', 'layer']
>({
  name: 'terminal-ui/components/rich-text',
  identity: 'optional',
  structure: 'leaf',
  semantics: 'semantic',
  metadata: ['styles', 'layer'],
  parts: ['content', 'link'],
  prepare(value) {
    const segments = value.segments;
    const wrap = value.wrap;
    if (wrap !== undefined && typeof wrap !== 'boolean') {
      throw new TypeError('richText wrap must be a boolean.');
    }
    return { segments: normalizeInlineContent(segments), wrap: wrap === true };
  },
  measure(input) {
    const spans = richTextMeasureSpans(input.model, input.theme);
    if (input.model.wrap && input.constraints.width > 0) {
      const lines = wrapRenderSpans(spans, input.constraints.width, {
        widthProfile: input.widthProfile,
      });
      return {
        minWidth: 0,
        minHeight: 0,
        preferredWidth: Math.min(
          input.constraints.width,
          Math.max(
            0,
            ...lines.map((current) =>
              measureRenderSpans(current.spans, {
                widthProfile: input.widthProfile,
              })
            ),
          ),
        ),
        preferredHeight: lines.length,
      };
    }
    return {
      minWidth: 0,
      minHeight: 0,
      preferredWidth: measureRenderSpans(spans, { widthProfile: input.widthProfile }),
      preferredHeight: 1,
    };
  },
  render(input) {
    if (input.bounds.width === 0 || input.bounds.height === 0) return;
    const spans = richTextSpans(input);
    const lines = input.model.wrap
      ? wrapRenderSpans(spans, input.bounds.width, { widthProfile: input.widthProfile })
      : [line(spans)];
    input.target.writeBlock(0, 0, { lines: lines.slice(0, input.bounds.height) });
  },
  accessibility({ id, model }) {
    return { id, role: 'text', label: id, value: inlineContentAccessibleText(model.segments) };
  },
});

function richTextSpans(input: {
  readonly model: PreparedRichText;
  readonly theme: import('../../theme/index.ts').TerminalTheme;
  readonly style: (
    input: { readonly part: TextStylePart; readonly base?: TerminalStyle },
  ) => TerminalStyle | undefined;
  readonly source: (
    input?: import('../../component/index.ts').ComponentSourceInput,
  ) => import('../../visual/source.ts').FrameCellSource;
}): readonly RenderSpan[] {
  return input.model.segments.map((segment, index) => {
    const linkBase: TerminalStyle | undefined = segment.link === undefined
      ? undefined
      : { fg: { kind: 'theme', token: 'link.foreground' }, underline: true };
    const style = input.style({
      part: segment.link === undefined ? 'content' : 'link',
      base: {
        ...linkBase,
        ...segment.style,
      },
    });
    return span(inlineSegmentText(segment, input.theme.tokens.symbols.mode), {
      ...(style === undefined ? {} : { style }),
      ...(segment.link === undefined ? {} : { link: segment.link }),
      source: input.source({
        cellRole: 'text',
        partName: 'segment',
        itemIndex: index,
        description: `segment.${String(index)}`,
      }),
    });
  });
}

function richTextMeasureSpans(
  model: PreparedRichText,
  theme: import('../../theme/index.ts').TerminalTheme,
): readonly RenderSpan[] {
  return model.segments.map((segment) =>
    span(
      inlineSegmentText(segment, theme.tokens.symbols.mode),
    )
  );
}

interface DisclosureModel {
  readonly label: string;
  readonly summary?: InlineContent;
  readonly expanded: boolean;
}

const disclosureSlots = {
  content: { cardinality: 'one', owner: 'caller', messages: 'bubble' },
} as const;

type DisclosureFactory = <
  TChild extends Element<ComponentMessage>,
  TMessage extends ComponentMessage = never,
>(
  options: DisclosureOptions<TMessage, TChild>,
) => Element<TMessage | ElementMessage<TChild>>;

export const disclosure: DisclosureFactory = defineComponent<
  { readonly label: string; readonly summary?: InlineContent; readonly expanded: boolean },
  DisclosureModel,
  import('../../ui-model/disclosure.ts').DisclosureAction,
  import('../../ui-model/style-parts.ts').DisclosureStylePart,
  readonly ['disabled'],
  'required',
  readonly ['focus', 'layer', 'styles'],
  typeof disclosureSlots
>({
  name: 'terminal-ui/components/disclosure',
  identity: 'required',
  structure: 'composite',
  semantics: 'semantic',
  slots: disclosureSlots,
  states: ['disabled'],
  metadata: ['focus', 'layer', 'styles'],
  parts: ['marker', 'label', 'summary'],
  prepare(value) {
    const label = value.label;
    const summary = value.summary;
    const expanded = value.expanded;
    if (typeof label !== 'string') throw new TypeError('disclosure label must be a string.');
    if (typeof expanded !== 'boolean') {
      throw new TypeError('disclosure expanded must be a boolean.');
    }
    return {
      label: sanitizeTerminalText(label).text,
      ...(summary === undefined ? {} : { summary: normalizeInlineContent(summary) }),
      expanded,
    };
  },
  measure(input) {
    const header = disclosureMeasureHeader(input.model, input.theme);
    const content = input.model.expanded ? input.slots.measure('content') : undefined;
    return {
      minWidth: 0,
      minHeight: 0,
      preferredWidth: Math.max(
        measureRenderSpans(header, { widthProfile: input.widthProfile }),
        content?.preferredWidth ?? 0,
      ),
      preferredHeight: 1 + (content?.preferredHeight ?? 0),
    };
  },
  layout({ bounds, model }) {
    return {
      content: model.expanded
        ? {
          row: Math.min(1, bounds.height),
          column: 0,
          width: bounds.width,
          height: Math.max(0, bounds.height - 1),
        }
        : { row: Math.min(1, bounds.height), column: 0, width: 0, height: 0 },
    };
  },
  renderBeforeChildren(input) {
    if (input.bounds.width === 0 || input.bounds.height === 0) return;
    input.target.write(0, 0, disclosureHeader(input));
  },
  keys() {
    return {
      enter: () => ({ kind: 'toggle' }),
      space: () => ({ kind: 'toggle' }),
    };
  },
  focusTargets({ bounds }) {
    return [{
      id: 'toggle',
      bounds: { row: 0, column: 0, width: bounds.width, height: Math.min(1, bounds.height) },
      disabled: false,
    }];
  },
  hitTargets({ id, bounds }) {
    return [{
      id: `${id ?? 'disclosure'}:toggle`,
      bounds: { row: 0, column: 0, width: bounds.width, height: Math.min(1, bounds.height) },
      accepts: ['click'],
      cursor: 'pointer',
      focus: { kind: 'target', targetId: 'toggle' },
      message: () => ({ kind: 'toggle' }),
    }];
  },
  accessibility({ id, model, focusedTargetId, slots, disabled }) {
    const toggleId = `${id}:toggle`;
    const summary = model.summary === undefined
      ? undefined
      : inlineContentAccessibleText(model.summary);
    return {
      id,
      role: 'group',
      label: model.label,
      children: [
        {
          id: toggleId,
          role: 'button',
          label: model.label,
          expanded: model.expanded,
          disabled,
          ...(model.expanded ? { controls: `${id}:content` } : {}),
          ...(summary === undefined || summary.length === 0 ? {} : { description: summary }),
          ...(focusedTargetId === 'toggle' ? { focused: true } : {}),
        },
        ...(model.expanded
          ? [{
            id: `${id}:content`,
            role: 'group' as const,
            label: `${model.label} content`,
            children: slots.content,
          }]
          : []),
      ],
    };
  },
});

function disclosureMeasureHeader(
  model: DisclosureModel,
  theme: import('../../theme/index.ts').TerminalTheme,
): readonly RenderSpan[] {
  const marker = model.expanded ? theme.tokens.symbols.expanded : theme.tokens.symbols.collapsed;
  return [
    span(marker),
    span(` ${model.label}`),
    ...(model.summary === undefined || model.summary.length === 0 ? [] : [
      span(' '),
      ...model.summary.map((segment) =>
        span(inlineSegmentText(segment, theme.tokens.symbols.mode))
      ),
    ]),
  ];
}

function disclosureHeader(input: {
  readonly model: DisclosureModel;
  readonly theme: import('../../theme/index.ts').TerminalTheme;
  readonly style: (
    input: {
      readonly part: import('../../ui-model/style-parts.ts').DisclosureStylePart;
      readonly base?: TerminalStyle;
    },
  ) => TerminalStyle | undefined;
  readonly source: (
    input?: import('../../component/index.ts').ComponentSourceInput,
  ) => import('../../visual/source.ts').FrameCellSource;
}): readonly RenderSpan[] {
  const marker = input.model.expanded
    ? input.theme.tokens.symbols.expanded
    : input.theme.tokens.symbols.collapsed;
  const segments: RenderSpan[] = [
    span(marker, disclosureSpanOptions(input, 'marker', 'decoration')),
    span(` ${input.model.label}`, disclosureSpanOptions(input, 'label', 'text')),
  ];
  if (input.model.summary !== undefined && input.model.summary.length > 0) {
    segments.push(span(' '));
    input.model.summary.forEach((segment, index) => {
      const style = input.style({
        part: 'summary',
        ...(segment.style === undefined ? {} : { base: segment.style }),
      });
      segments.push(span(inlineSegmentText(segment, input.theme.tokens.symbols.mode), {
        ...(style === undefined ? {} : { style }),
        ...(segment.link === undefined ? {} : { link: segment.link }),
        source: input.source({ cellRole: 'text', partName: 'summary', itemIndex: index }),
      }));
    });
  }
  return segments;
}

function disclosureSpanOptions(
  input: Parameters<typeof disclosureHeader>[0],
  part: 'marker' | 'label',
  cellRole: 'decoration' | 'text',
): Omit<RenderSpan, 'text'> {
  const style = input.style({ part });
  return {
    ...(style === undefined ? {} : { style }),
    source: input.source({ cellRole, partName: part }),
  };
}
