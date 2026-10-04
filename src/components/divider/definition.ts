import { defineComponent } from '../../component/definition.ts';
import type { Element } from '../../element/types.ts';
import { assertOptionalEnum } from '../../foundation/validation.ts';
import { oneCellGlyph } from '../../text/cell-geometry.ts';
import { clipRenderSpans, measureRenderSpans } from '../../visual/render-content.ts';
import { measureTextCells } from '../../text/measure.ts';
import { sanitizeTerminalText } from '../../text/sanitize.ts';
import type { TerminalTheme } from '../../theme/theme.ts';
import type { DividerStylePart } from '../style-parts.ts';
import type { DividerLineKind, DividerOrientation } from './contracts.ts';
import type { DividerOptions } from './options.ts';


interface DividerModel {
  readonly orientation: DividerOrientation;
  readonly line: DividerLineKind;
  readonly label: string;
  readonly labelAlign: 'start' | 'center' | 'end';
}

const dividerDefinitionBase = {
  identity: 'optional' as const,
  structure: 'leaf' as const,
  metadata: ['styles', 'layer'] as const,
  parts: ['line', 'label'] as const,
  createModel: createDividerModel,
  measure: measureDivider,
  reuse: { paint: (model: object) => [model] as const },
  render: renderDivider,
};

const labelledDivider = defineComponent<Omit<DividerOptions, 'id' | 'styles' | 'meta'>>()({
  ...dividerDefinitionBase,
  name: 'terminal-ui/components/divider',
  semantics: 'semantic',
  accessibleRole: 'separator',
  accessibility: ({ id, model }) => ({
    id,
    role: 'separator',
    label: model.label,
    orientation: model.orientation,
  }),
});

const decorativeDivider = defineComponent<Omit<DividerOptions, 'id' | 'styles' | 'meta'>>()({
  ...dividerDefinitionBase,
  name: 'terminal-ui/components/divider-decoration',
  semantics: 'decorative',
});

export function divider(options: DividerOptions): Element {
  return options.label === undefined || sanitizeTerminalText(options.label).text.trim().length === 0
    ? decorativeDivider(options)
    : labelledDivider(options);
}

function createDividerModel(value: Readonly<Omit<DividerOptions, 'id' | 'styles' | 'meta'>>): DividerModel {
    const orientation = value.orientation;
    const line = value.line;
    const label = value.label;
    const labelAlign = value.labelAlign;
    assertOptionalEnum(orientation, ['horizontal', 'vertical'], 'divider orientation');
    if (line !== undefined && !isDividerLineKind(line)) {
      throw new TypeError('divider line is invalid.');
    }
    if (label !== undefined && typeof label !== 'string') {
      throw new TypeError('divider label must be a string.');
    }
    assertOptionalEnum(labelAlign, ['start', 'center', 'end'], 'divider labelAlign');
    return {
      orientation: orientation ?? 'horizontal',
      line: line ?? 'single',
      label: label === undefined ? '' : sanitizeTerminalText(label).text,
      labelAlign: labelAlign ?? 'start',
    };
}

function measureDivider({ model, widthProfile }: {
  readonly model: DividerModel;
  readonly widthProfile: import('../../text/index.ts').TextWidthProfile;
}) {
    const labelCells = measureTextCells(model.label, { widthProfile }).cells;
    return model.orientation === 'vertical'
      ? { minWidth: 1, minHeight: 1, preferredWidth: 1, preferredHeight: Math.max(1, labelCells) }
      : {
        minWidth: 1,
        minHeight: 1,
        preferredWidth: Math.max(1, labelCells + (labelCells === 0 ? 0 : 2)),
        preferredHeight: 1,
      };
}

function renderDivider({ model, bounds, target, theme, style, frameSource, widthProfile, textPresentation }:
  import('../../component/index.ts').ComponentRenderInput<DividerModel, DividerStylePart>
): undefined {
    if (bounds.width <= 0 || bounds.height <= 0) return;
    const glyphs = dividerGlyphs(model.line, theme);
    const lineStyle = style({
      part: 'line',
      base: { fg: { kind: 'theme', token: 'surface.border' } },
    });
    if (model.orientation === 'vertical') {
      const glyph = oneCellGlyph(glyphs.vertical, '|', { widthProfile });
      for (let row = 0; row < bounds.height; row += 1) {
        target.write(row, 0, [{
          text: glyph,
          ...(lineStyle === undefined ? {} : { style: lineStyle }),
          source: frameSource({ cellRole: 'separator', partName: 'line', partType: 'separator' }),
        }]);
      }
      return;
    }
    const glyph = oneCellGlyph(glyphs.horizontal, '-', { widthProfile });
    const labelStyle = style({ part: 'label', ...(lineStyle === undefined ? {} : { base: lineStyle }) });
    const label = model.label.length === 0 ? [] : clipRenderSpans([{
      text: ` ${model.label} `,
      ...(labelStyle === undefined ? {} : { style: labelStyle }),
      source: frameSource({ cellRole: 'text', partName: 'label', partType: 'text' }),
    }], bounds.width, { widthProfile, textPresentation });
    const labelWidth = measureRenderSpans(label, { widthProfile });
    const remaining = Math.max(0, bounds.width - labelWidth);
    const before = model.labelAlign === 'end'
      ? remaining
      : model.labelAlign === 'center'
      ? Math.floor(remaining / 2)
      : 0;
    const after = remaining - before;
    target.write(
      0,
      0,
      [
        {
          textOrder: 'visual' as const,
          text: glyph.repeat(before),
          ...(lineStyle === undefined ? {} : { style: lineStyle }),
          source: frameSource({
            cellRole: 'separator',
            partName: label.length === 0 ? 'line' : 'separator.before',
            partType: 'separator',
          }),
        },
        ...label,
        {
          textOrder: 'visual' as const,
          text: glyph.repeat(after),
          ...(lineStyle === undefined ? {} : { style: lineStyle }),
          source: frameSource({
            cellRole: 'separator',
            partName: label.length === 0 ? 'line' : 'separator.after',
            partType: 'separator',
          }),
        },
      ].filter((span) => span.text.length > 0),
    );
}

function isDividerLineKind(value: unknown): value is DividerLineKind {
  return value === 'single' ||
    value === 'double' ||
    value === 'heavy' ||
    value === 'dashed' ||
    value === 'dotted' ||
    value === 'ascii' ||
    value === 'empty';
}

function dividerGlyphs(
  line: DividerLineKind,
  theme: TerminalTheme,
): { readonly horizontal: string; readonly vertical: string } {
  switch (line) {
    case 'single':
      return theme.tokens.symbols.borderSingle;
    case 'double':
      return { horizontal: '═', vertical: '║' };
    case 'heavy':
      return { horizontal: '━', vertical: '┃' };
    case 'dashed':
      return { horizontal: '┄', vertical: '┆' };
    case 'dotted':
      return { horizontal: '┈', vertical: '┊' };
    case 'ascii':
      return { horizontal: '-', vertical: '|' };
    case 'empty':
      return { horizontal: ' ', vertical: ' ' };
  }
}
