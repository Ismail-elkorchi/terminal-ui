import type { ComponentMeasureInput, ComponentRenderInput } from '../../component/contracts.ts';
import {
  assertOptionalCallback,
  assertOptionalEnum,
  assertRequiredPropertyCallback,
  isNonArrayObject,
} from '../../foundation/validation.ts';
import type {
  AnchoredSurfaceAnchor,
  AnchoredSurfacePlacement,
} from '../../interaction/anchored-surface.ts';
import { formatKeyboardBinding } from '../../interaction/key-binding.ts';
import { sanitizeTerminalText } from '../../text/sanitize.ts';
import type { InlineContent } from '../../visual/inline-content.ts';
import {
  inlineContentAccessibleText,
  inlineSegmentText,
  normalizeInlineContent,
} from '../../visual/inline-content.ts';
import type { RenderSpan, TerminalStyle } from '../../visual/render-content.ts';
import { span } from '../../visual/render-content.ts';
import type { MenuStylePart } from '../style-parts.ts';
import type { MenuModel, MenuRow } from './contracts.ts';

export const popupSlot = {
  popup: { cardinality: 'optional', owner: 'implementation', messages: 'bubble' },
} as const;

export function assertMenuCallbacks<TOptions extends {
    readonly onTransition?: unknown;
    readonly onActivate?: unknown;
  }>(
  options: TOptions,
  component: string,
): asserts options is TOptions & { readonly onTransition: NonNullable<TOptions['onTransition']> } {
  assertRequiredPropertyCallback(options, 'onTransition', `${component} onTransition`);
  assertOptionalCallback(options.onActivate, `${component} onActivate`);
}

export function menuSpan<TModel extends object>(
  input: ComponentRenderInput<TModel, MenuStylePart>,
  text: string,
  part: MenuStylePart,
  partName: string,
  itemId?: string,
  base?: TerminalStyle,
  stateOrStates?: Exclude<import('../../element/metadata.ts').ElementVisualState, 'default'> |
    readonly Exclude<import('../../element/metadata.ts').ElementVisualState, 'default'>[],
): RenderSpan {
  const states = stateOrStates === undefined
    ? []
    : typeof stateOrStates === 'string' ? [stateOrStates] : stateOrStates;
  const state = states.at(-1);
  const value = input.style({
    part,
    ...(base === undefined ? {} : { base }),
    ...(states.length === 0 ? {} : { states }),
  });
  return span(text, {
    ...(part === 'marker' || part === 'separator' || part === 'control' ? { textOrder: 'visual' as const } : {}),
    ...(value === undefined ? {} : { style: value }),
    source: input.frameSource({
      cellRole: part === 'marker' || part === 'separator' || part === 'control'
        ? 'decoration'
        : 'text',
      partName,
      partType: part,
      description: partName,
      ...(itemId === undefined ? {} : { itemId }),
      ...(state === undefined ? {} : { interactionState: state }),
    }),
  });
}

export function inlineSpans(
  input: ComponentRenderInput<MenuModel, MenuStylePart>,
  content: InlineContent,
  part: 'leading' | 'trailing',
  itemId: string,
  base: TerminalStyle,
  states: readonly Exclude<import('../../element/metadata.ts').ElementVisualState, 'default'>[],
): readonly RenderSpan[] {
  return content.map((segment, index) =>
    menuSpan(
      input,
      inlineSegmentText(segment, input.theme.tokens.symbols.mode),
      part,
      `item.${itemId}.${part}.${String(index)}`,
      itemId,
      { ...base, ...segment.style },
      states,
    )
  );
}

export function menuRowText(item: MenuRow, theme: ComponentMeasureInput<MenuModel>['theme']): string {
  return `${'  '.repeat(item.depth)}${theme.tokens.symbols.pointer} ${
    item.leading === undefined ? '' : `${inlineContentAccessibleText(item.leading)} `
  }${item.label}${item.description === undefined ? '' : `  ${item.description}`}${
    item.shortcut === undefined ? '' : `  ${formatKeyboardBinding(item.shortcut)}`
  }${item.trailing === undefined ? '' : ` ${inlineContentAccessibleText(item.trailing)}`}`;
}

export function decodeInlineContent(value: InlineContent, subject: string): InlineContent {
  try {
    return normalizeInlineContent(value);
  } catch (cause) {
    throw new TypeError(`${subject} must be inline content.`, { cause });
  }
}

export function checkedValue(value: unknown, subject: string, index: number): boolean {
  if (typeof value !== 'boolean') {
    throw new TypeError(`${subject}[${String(index)}].checked must be boolean.`);
  }
  return value;
}

export function requiredText(value: unknown, subject: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new TypeError(`${subject} must be a non-empty string.`);
  }
  return value;
}

export function optionalBoolean(value: unknown, subject: string): boolean | undefined {
  if (value === undefined || typeof value === 'boolean') return value;
  throw new TypeError(`${subject} must be boolean.`);
}

export function optionalText(value: unknown, subject: string): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string') throw new TypeError(`${subject} must be a string.`);
  return value;
}

export function clean(value: string): string {
  return sanitizeTerminalText(value).text.replace(/\s*\n\s*/gu, ' ');
}

export function positiveInteger(value: unknown, fallback: number, subject: string): number {
  if (value === undefined) return fallback;
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0) {
    throw new RangeError(`${subject} must be a positive safe integer.`);
  }
  return value;
}

export function decodePlacement(value: AnchoredSurfacePlacement | undefined): AnchoredSurfacePlacement {
  if (value === undefined) return 'auto';
  assertOptionalEnum(
    value,
    ['above', 'below', 'left', 'right', 'auto', 'cursor'],
    'menu placement',
  );
  return value;
}

export function decodeAnchor(
  value: AnchoredSurfaceAnchor,
): AnchoredSurfaceAnchor {
  if (!isNonArrayObject(value)) throw new TypeError('menu anchor must be an object.');
  if (
    value.kind === 'cursor' && typeof value.row === 'number' &&
    Number.isFinite(value.row) && typeof value.column === 'number' &&
    Number.isFinite(value.column)
  ) return { kind: 'cursor', row: value.row, column: value.column };
  if (
    value.kind === 'target' && isNonArrayObject(value.bounds)
  ) {
    const bounds = value.bounds;
    if (
      typeof bounds.row === 'number' && Number.isFinite(bounds.row) &&
      typeof bounds.column === 'number' && Number.isFinite(bounds.column) &&
      typeof bounds.width === 'number' && Number.isFinite(bounds.width) &&
      bounds.width >= 0 && typeof bounds.height === 'number' &&
      Number.isFinite(bounds.height) && bounds.height >= 0
    ) {
      return {
        kind: 'target',
        bounds: {
          row: bounds.row,
          column: bounds.column,
          width: bounds.width,
          height: bounds.height,
        },
      };
    }
  }
  throw new TypeError('menu anchor is invalid.');
}
