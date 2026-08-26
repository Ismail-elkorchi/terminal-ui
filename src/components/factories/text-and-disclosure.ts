import {
  defineComponent,
  ignoreMessage,
  line,
  measureRenderSpans,
  span,
  wrapRenderSpans,
} from '../../component/index.ts';
import type {
  ComponentInteractionInput,
  ComponentMessage,
  SemanticLeafComponentFactory,
} from '../../component/index.ts';
import type { Element } from '../../element/index.ts';
import type { DisclosureOptions, RichTextOptions, TextOptions } from '../options/content-and-collections.ts';
import { measureTextCells, sanitizeTerminalText } from '../../text/index.ts';
import type { TextWidthProfile } from '../../text/index.ts';
import type { ElementTextRole } from '../../element/metadata.ts';
import type { TerminalStyle } from '../../visual/render-content.ts';
import type { RichTextStylePart, TextStylePart } from '../style-parts.ts';
import {
  inlineContentAccessibleText,
  inlineSegmentText,
  normalizeInlineContent,
} from '../../visual/inline-content.ts';
import type { InlineContent } from '../../visual/inline-content.ts';
import type { RenderLine, RenderSpan } from '../../visual/render-content.ts';
import type { ElementMessage } from '../../element/index.ts';
import { isNonArrayObject } from '../../foundation/validation.ts';
import { assertRequiredCallback } from '../../foundation/validation.ts';
import type { ElementKeyEvent } from '../../element/metadata.ts';
import type { RoutedPointerEvent } from '../../input/index.ts';
import type { RichTextLinkActivateEvent } from '../options/content-and-collections.ts';
import type { Rect } from '../../geometry/types.ts';

interface TextModel {
  readonly content: string;
  readonly textRole: ElementTextRole;
  readonly headingLevel?: number;
}

export const text: SemanticLeafComponentFactory<
  Pick<TextOptions, 'content' | 'textRole' | 'headingLevel'>,
  never,
  TextStylePart,
  readonly [],
  'optional',
  readonly ['styles', 'layer']
> = defineComponent<
  Pick<TextOptions, 'content' | 'textRole' | 'headingLevel'>,
  TextModel,
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
  accessibleRole: ({ model }) =>
    model.textRole === 'heading' || model.textRole === 'title' ? 'heading' : 'text',
  metadata: ['styles', 'layer'],
  parts: ['content'],
  createModel(value) {
    const content = value.content;
    const textRole = value.textRole;
    const headingLevel = value.headingLevel;
    if (typeof content !== 'string') throw new TypeError('text content must be a string.');
    if (textRole !== undefined && !isTextRole(textRole)) {
      throw new TypeError('text textRole is invalid.');
    }
    if (headingLevel !== undefined
      && (!Number.isSafeInteger(headingLevel) || headingLevel < 1 || headingLevel > 6)) {
      throw new RangeError('text headingLevel must be an integer from 1 through 6.');
    }
    if (headingLevel !== undefined && textRole !== 'heading' && textRole !== 'title') {
      throw new TypeError('text headingLevel requires a heading or title textRole.');
    }
    return {
      content: sanitizeTerminalText(content).text,
      textRole: textRole ?? 'body',
      ...(headingLevel === undefined ? {} : { headingLevel }),
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
  render({ model, target, style, frameSource }) {
    const contentStyle = style({
      part: 'content',
      base: textRoleStyle(model.textRole),
    });
    target.writeBlock(0, 0, {
      lines: model.content.split('\n').map((line) => ({
        spans: [{
          text: line,
          ...(contentStyle === undefined ? {} : { style: contentStyle }),
          source: frameSource({
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
    const heading = model.textRole === 'heading' || model.textRole === 'title';
    return {
      id,
      role: heading ? 'heading' : 'text',
      value: model.content,
      ...(heading ? { label: model.content, position: { level: model.headingLevel ?? (model.textRole === 'title' ? 1 : 2) } } : {}),
    };
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

interface RichTextModel {
  readonly segments: InlineContent;
  readonly links: readonly RichTextLinkModel[];
  readonly linkIndexBySegment: readonly (number | undefined)[];
  readonly wrap?: { readonly preserveWords: boolean };
  readonly interactive: boolean;
}

interface RichTextLinkModel {
  readonly link: import('../../visual/render-content.ts').TerminalLink;
  readonly label: string;
  readonly segmentIndexes: readonly number[];
}

interface RichTextComponentAction {
  readonly kind: 'activate';
  readonly event: RichTextLinkActivateEvent;
}

const instantiateRichText = defineComponent<
  Pick<RichTextOptions, 'segments' | 'wrap'> & { readonly interactive: boolean },
  RichTextModel,
  RichTextComponentAction,
  RichTextStylePart,
  readonly [],
  'optional',
  readonly ['focus', 'styles', 'layer'],
  readonly ['focused', 'hovered', 'pressed']
>({
  name: 'terminal-ui/components/rich-text',
  identity: 'optional',
  structure: 'leaf',
  semantics: 'semantic',
  accessibleRole: 'text',
  metadata: ['focus', 'styles', 'layer'],
  parts: ['content', 'link'],
  visualStates: ['focused', 'hovered', 'pressed'],
  createModel(value) {
    const segments = value.segments;
    const wrap = value.wrap;
    if (typeof value.interactive !== 'boolean') throw new TypeError('richText interactive state must be boolean.');
    if (wrap !== undefined && typeof wrap !== 'boolean' && !isNonArrayObject(wrap)) {
      throw new TypeError('richText wrap must be a boolean or options object.');
    }
    const preserveWords = typeof wrap === 'object' ? wrap['preserveWords'] : undefined;
    if (preserveWords !== undefined && typeof preserveWords !== 'boolean') {
      throw new TypeError('richText wrap preserveWords must be a boolean.');
    }
    const normalizedSegments = normalizeInlineContent(segments);
    const linkData = createRichTextLinks(normalizedSegments);
    if (value.interactive && linkData.links.length === 0) {
      throw new TypeError('interactive richText requires at least one linked segment.');
    }
    return {
      segments: normalizedSegments,
      links: linkData.links,
      linkIndexBySegment: linkData.linkIndexBySegment,
      interactive: value.interactive,
      ...(wrap === true || typeof wrap === 'object'
        ? { wrap: Object.freeze({ preserveWords: preserveWords === true }) }
        : {}),
    };
  },
  measure(input) {
    const spans = richTextMeasureSpans(input.model, input.theme);
    if (input.model.wrap !== undefined && input.constraints.width > 0) {
      const lines = wrapRenderSpans(spans, input.constraints.width, {
        widthProfile: input.widthProfile,
        preserveWords: input.model.wrap.preserveWords,
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
    const lines = splitRichTextLines(spans);
    return {
      minWidth: 0,
      minHeight: 0,
      preferredWidth: Math.max(0, ...lines.map((current) =>
        measureRenderSpans(current.spans, { widthProfile: input.widthProfile })
      )),
      preferredHeight: lines.length,
    };
  },
  render(input) {
    if (input.bounds.width === 0 || input.bounds.height === 0) return;
    const spans = richTextSpans(input);
    const lines = richTextLines(input.model, spans, input.bounds.width, input.widthProfile);
    input.target.writeBlock(0, 0, { lines: lines.slice(0, input.bounds.height) });
  },
  keys: ({ model, focusedTargetId }) => {
    if (!model.interactive || focusedTargetId === undefined) return {};
    const linkIndex = richTextTargetLinkIndex(focusedTargetId, model);
    if (linkIndex === undefined) return {};
    return {
      enter: (event) => ({
        kind: 'activate',
        event: richTextKeyboardActivation(model, linkIndex, event),
      }),
    };
  },
  focusTargets(input) {
    if (!input.model.interactive) return [];
    return richTextLinkGeometry(input).map(({ linkIndex, bounds }) => ({
      id: richTextTargetId(linkIndex),
      bounds,
    }));
  },
  hitTargets(input) {
    if (!input.model.interactive) return [];
    return richTextLinkGeometry(input).flatMap(({ linkIndex, fragments }) =>
      fragments.map((bounds, fragmentIndex) => ({
        id: `${input.id ?? 'rich-text'}:link:${String(linkIndex)}:${String(fragmentIndex)}`,
        bounds,
        accepts: ['click', 'contextMenu', 'pointerDown'] as const,
        cursor: 'pointer' as const,
        focus: { kind: 'target' as const, targetId: richTextTargetId(linkIndex) },
        message: (event: RoutedPointerEvent) =>
          event.kind === 'pointerDown' && event.button !== 'middle'
            ? ignoreMessage()
            : ({
                kind: 'activate' as const,
                event: richTextPointerActivation(input.model, linkIndex, event),
              }),
      }))
    );
  },
  accessibility({ id, model, focusedTargetId }) {
    const children = model.links.map((link, index) => ({
      id: `${id}:link:${String(index)}`,
      role: 'link' as const,
      label: link.label,
      value: link.link.href,
      ...(focusedTargetId === richTextTargetId(index) ? { focused: true } : {}),
    }));
    return {
      id,
      role: 'text',
      value: inlineContentAccessibleText(model.segments),
      ...(children.length === 0 ? {} : { children }),
    };
  },
});

export function richText(
  options: Omit<RichTextOptions, 'onLinkActivate'> & { readonly onLinkActivate?: never }
): Element;
export function richText<const TMessage extends ComponentMessage>(
  options: Omit<RichTextOptions<TMessage>, 'onLinkActivate'> & {
    readonly onLinkActivate: NonNullable<RichTextOptions<TMessage>['onLinkActivate']>
  }
): Element<TMessage>;
export function richText(
  options: RichTextOptions<ComponentMessage>
): Element<ComponentMessage> {
  const model = {
    ...(options.id === undefined ? {} : { id: options.id }),
    segments: options.segments,
    interactive: options.onLinkActivate !== undefined,
    ...(options.wrap === undefined ? {} : { wrap: options.wrap }),
    ...(options.styles === undefined ? {} : { styles: options.styles }),
    ...(options.meta === undefined ? {} : { meta: options.meta })
  };
  if (options.onLinkActivate === undefined) {
    return instantiateRichText({ ...model, onAction: () => ignoreMessage() });
  }
  if (options.id === undefined) throw new TypeError('interactive richText requires an id.');
  const onLinkActivate = options.onLinkActivate;
  assertRequiredCallback(onLinkActivate, 'richText onLinkActivate');
  return instantiateRichText({
    ...model,
    onAction: (action) => onLinkActivate(action.event)
  });
}

function richTextKeyboardActivation(
  model: RichTextModel,
  linkIndex: number,
  event: ElementKeyEvent,
): RichTextLinkActivateEvent {
  if (event.input.kind !== 'key') throw new TypeError('richText keyboard activation requires a key event.');
  const link = richTextLink(model, linkIndex);
  return Object.freeze({
    kind: 'activate',
    link,
    trigger: Object.freeze({ kind: 'keyboard', modifiers: event.input.modifiers })
  });
}

function richTextPointerActivation(
  model: RichTextModel,
  linkIndex: number,
  event: RoutedPointerEvent,
): RichTextLinkActivateEvent {
  const link = richTextLink(model, linkIndex);
  return Object.freeze({
    kind: 'activate',
    link,
    trigger: Object.freeze({ kind: 'pointer', button: event.button, modifiers: event.modifiers })
  });
}

interface RichTextLinkGeometry {
  readonly linkIndex: number;
  readonly bounds: Rect;
  readonly fragments: readonly Rect[];
}

function richTextLinkGeometry(
  input: ComponentInteractionInput<RichTextModel, RichTextStylePart>,
): readonly RichTextLinkGeometry[] {
  if (input.bounds.width <= 0 || input.bounds.height <= 0) return [];
  const lines = richTextLines(
    input.model,
    richTextSpans(input),
    input.bounds.width,
    input.widthProfile,
  );
  const fragmentsByLink = new Map<number, Rect[]>();
  for (let row = 0; row < Math.min(lines.length, input.bounds.height); row += 1) {
    const currentLine = lines[row];
    if (currentLine === undefined) continue;
    let column = 0;
    for (const currentSpan of currentLine.spans) {
      const width = measureRenderSpans([currentSpan], { widthProfile: input.widthProfile });
      const segmentIndex = currentSpan.source?.itemIndex;
      const linkIndex = segmentIndex === undefined
        ? undefined
        : input.model.linkIndexBySegment[segmentIndex];
      const visibleWidth = Math.max(0, Math.min(width, input.bounds.width - column));
      if (linkIndex !== undefined && visibleWidth > 0) {
        const fragments = fragmentsByLink.get(linkIndex) ?? [];
        fragments.push({ row, column, width: visibleWidth, height: 1 });
        fragmentsByLink.set(linkIndex, fragments);
      }
      column += width;
      if (column >= input.bounds.width) break;
    }
  }
  return Object.freeze([...fragmentsByLink.entries()]
    .toSorted(([left], [right]) => left - right)
    .map(([linkIndex, fragments]) => ({
      linkIndex,
      bounds: unionRichTextFragments(fragments),
      fragments: Object.freeze(fragments),
    })));
}

function unionRichTextFragments(fragments: readonly Rect[]): Rect {
  const first = fragments[0];
  if (first === undefined) return { row: 0, column: 0, width: 0, height: 0 };
  let top = first.row;
  let left = first.column;
  let bottom = first.row + first.height;
  let right = first.column + first.width;
  for (const fragment of fragments.slice(1)) {
    top = Math.min(top, fragment.row);
    left = Math.min(left, fragment.column);
    bottom = Math.max(bottom, fragment.row + fragment.height);
    right = Math.max(right, fragment.column + fragment.width);
  }
  return { row: top, column: left, width: right - left, height: bottom - top };
}

function richTextLines(
  model: RichTextModel,
  spans: readonly RenderSpan[],
  width: number,
  widthProfile: TextWidthProfile,
): readonly RenderLine[] {
  return model.wrap === undefined
    ? splitRichTextLines(spans)
    : wrapRenderSpans(spans, width, {
        widthProfile,
        preserveWords: model.wrap.preserveWords,
      });
}

function splitRichTextLines(spans: readonly RenderSpan[]): readonly RenderLine[] {
  const lines: RenderLine[] = [];
  let current: RenderSpan[] = [];
  for (const currentSpan of spans) {
    const parts = currentSpan.text.split('\n');
    for (let index = 0; index < parts.length; index += 1) {
      const text = parts[index] ?? '';
      if (text.length > 0) current.push(span(text, richTextSpanOptions(currentSpan)));
      if (index < parts.length - 1) {
        lines.push(line(current));
        current = [];
      }
    }
  }
  lines.push(line(current));
  return Object.freeze(lines);
}

function richTextSpanOptions(value: RenderSpan): Omit<RenderSpan, 'text'> {
  return {
    ...(value.style === undefined ? {} : { style: value.style }),
    ...(value.link === undefined ? {} : { link: value.link }),
    ...(value.source === undefined ? {} : { source: value.source }),
  };
}

function richTextTargetId(linkIndex: number): string {
  return `link:${String(linkIndex)}`;
}

function richTextTargetLinkIndex(
  targetId: string,
  model: RichTextModel,
): number | undefined {
  if (!targetId.startsWith('link:')) return undefined;
  const value = targetId.slice('link:'.length);
  if (!/^(?:0|[1-9][0-9]*)$/u.test(value)) return undefined;
  const linkIndex = Number(value);
  return model.links[linkIndex] === undefined ? undefined : linkIndex;
}

function richTextLink(model: RichTextModel, linkIndex: number) {
  const link = model.links[linkIndex]?.link;
  if (link === undefined) throw new TypeError('richText activation target is not a logical link.');
  return link;
}

function richTextLinkLabel(segment: InlineContent[number]): string {
  return segment.kind === 'text' ? segment.text : segment.accessibleText;
}

function createRichTextLinks(segments: InlineContent): {
  readonly links: readonly RichTextLinkModel[];
  readonly linkIndexBySegment: readonly (number | undefined)[];
} {
  const links: {
    link: import('../../visual/render-content.ts').TerminalLink;
    label: string;
    segmentIndexes: number[];
  }[] = [];
  const explicit = new Map<string, number>();
  const linkIndexBySegment: (number | undefined)[] = Array.from({ length: segments.length });
  let previousAnonymousLink: import('../../visual/render-content.ts').TerminalLink | undefined;
  let previousAnonymousIndex: number | undefined;
  for (let segmentIndex = 0; segmentIndex < segments.length; segmentIndex += 1) {
    const segment = segments[segmentIndex];
    const link = segment?.link;
    if (segment === undefined || link === undefined) {
      previousAnonymousLink = undefined;
      previousAnonymousIndex = undefined;
      continue;
    }
    let linkIndex: number;
    if (link.id !== undefined) {
      const retained = explicit.get(link.id);
      if (retained !== undefined) {
        const existing = links[retained];
        if (existing?.link.href !== link.href) {
          throw new TypeError(`richText link id "${link.id}" cannot identify different destinations.`);
        }
        linkIndex = retained;
      } else {
        linkIndex = links.length;
        explicit.set(link.id, linkIndex);
        links.push({ link, label: '', segmentIndexes: [] });
      }
      previousAnonymousLink = undefined;
      previousAnonymousIndex = undefined;
    } else if (previousAnonymousLink === link && previousAnonymousIndex !== undefined) {
      linkIndex = previousAnonymousIndex;
    } else {
      linkIndex = links.length;
      links.push({ link, label: '', segmentIndexes: [] });
      previousAnonymousLink = link;
      previousAnonymousIndex = linkIndex;
    }
    const linkModel = links[linkIndex];
    if (linkModel === undefined) continue;
    linkModel.label += richTextLinkLabel(segment);
    linkModel.segmentIndexes.push(segmentIndex);
    linkIndexBySegment[segmentIndex] = linkIndex;
  }
  const owned = links.map((link, index): RichTextLinkModel => {
    if (link.label.trim().length === 0) {
      throw new TypeError(`richText logical link ${String(index)} requires a non-empty accessible label.`);
    }
    return Object.freeze({
      link: link.link,
      label: link.label,
      segmentIndexes: Object.freeze(link.segmentIndexes),
    });
  });
  return Object.freeze({
    links: Object.freeze(owned),
    linkIndexBySegment: Object.freeze(linkIndexBySegment),
  });
}

function richTextSpans(input: {
  readonly id?: string;
  readonly model: RichTextModel;
  readonly theme: import('../../theme/index.ts').TerminalTheme;
  readonly style: (
    input: { readonly part: RichTextStylePart; readonly base?: TerminalStyle },
  ) => TerminalStyle | undefined;
  readonly frameSource: (
    input?: import('../../component/index.ts').ComponentFrameSourceInput,
  ) => import('../../visual/frame-source.ts').FrameCellSource;
  readonly focusedTargetId?: string;
  readonly pointerState?: import('../../interaction/pointer-interaction.ts').PointerInteractionState;
}): readonly RenderSpan[] {
  return input.model.segments.map((segment, index) => {
    const linkIndex = input.model.linkIndexBySegment[index];
    const linkBase: TerminalStyle | undefined = segment.link === undefined
      ? undefined
      : { fg: { kind: 'theme', token: 'link.foreground' }, underline: true };
    const style = input.style({
      part: segment.link === undefined ? 'content' : 'link',
      base: {
        ...linkBase,
        ...segment.style,
      },
      ...(segment.link === undefined
        ? {}
        : { states: richTextLinkVisualStates(input, linkIndex) }),
    });
    return span(inlineSegmentText(segment, input.theme.tokens.symbols.mode), {
      ...(style === undefined ? {} : { style }),
      ...(segment.link === undefined ? {} : { link: segment.link }),
      source: input.frameSource({
        cellRole: 'text',
        partName: 'segment',
        itemIndex: index,
        description: `segment.${String(index)}`,
      }),
    });
  });
}

function richTextLinkVisualStates(
  input: Pick<
    Parameters<typeof richTextSpans>[0],
    'id' | 'focusedTargetId' | 'pointerState'
  >,
  linkIndex: number | undefined,
): readonly ('focused' | 'hovered' | 'pressed')[] {
  if (linkIndex === undefined) return Object.freeze([]);
  const states: ('focused' | 'hovered' | 'pressed')[] = [];
  if (input.focusedTargetId === richTextTargetId(linkIndex)) states.push('focused');
  const prefix = `${input.id ?? 'rich-text'}:link:${String(linkIndex)}:`;
  if (input.pointerState?.pressedTargetId?.startsWith(prefix) === true) states.push('pressed');
  else if (input.pointerState?.hoveredTargetId?.startsWith(prefix) === true) states.push('hovered');
  return states;
}

function richTextMeasureSpans(
  model: RichTextModel,
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

const instantiateDisclosure = defineComponent<
  { readonly label: string; readonly summary?: InlineContent; readonly expanded: boolean },
  DisclosureModel,
  import('../../components/disclosure.ts').DisclosureTransition,
  import('../../components/style-parts.ts').DisclosureStylePart,
  readonly ['disabled'],
  'required',
  readonly ['focus', 'layer', 'styles'],
  typeof disclosureSlots,
  readonly ['focused', 'hovered', 'pressed', 'disabled']
>({
  name: 'terminal-ui/components/disclosure',
  identity: 'required',
  structure: 'composite',
  semantics: 'semantic',
  accessibleRole: 'group',
  slots: disclosureSlots,
  states: ['disabled'],
  metadata: ['focus', 'layer', 'styles'],
  parts: ['marker', 'label', 'summary'],
  visualStates: ['focused', 'hovered', 'pressed', 'disabled'],
  createModel(value) {
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

export const disclosure: DisclosureFactory = (options) => {
  if (options.disabled === true) return instantiateDisclosure(options);
  const { onTransition, ...input } = options;
  assertRequiredCallback(onTransition, 'disclosure onTransition');
  return instantiateDisclosure({
    ...input,
    onAction: onTransition,
  });
};

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
      readonly part: import('../../components/style-parts.ts').DisclosureStylePart;
      readonly base?: TerminalStyle;
    },
  ) => TerminalStyle | undefined;
  readonly frameSource: (
    input?: import('../../component/index.ts').ComponentFrameSourceInput,
  ) => import('../../visual/frame-source.ts').FrameCellSource;
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
        source: input.frameSource({ cellRole: 'text', partName: 'summary', itemIndex: index }),
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
    source: input.frameSource({ cellRole, partName: part }),
  };
}
