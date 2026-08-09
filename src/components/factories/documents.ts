import {
  clipRenderSpans,
  componentScrollbarHitTargets,
  defineComponent,
  ignoreMessage,
  paintComponentScrollbar,
  prepareComponentScrollbar,
  prepareComponentScrollbarOptions,
  prepareComponentScrollPolicy,
  prepareComponentScrollState,
  span,
} from '../../component/index.ts';
import type {
  ComponentMessage,
  ComponentInput,
  ComponentRenderInput,
  Element,
  HitTarget,
} from '../../component/index.ts';
import { list } from './list.ts';
import { portal, surface } from '../../layout/index.ts';
import { isNonArrayObject } from '../../foundation/validation.ts';
import type { PointerInteractionState } from '../../interaction/pointer-interaction.ts';
import { pointerVisualState } from '../../interaction/pointer-interaction.ts';
import type { ScrollPolicy, ScrollState } from '../../interaction/scroll.ts';
import type { ScrollbarOptions } from '../../interaction/scrollbar.ts';
import {
  clipTextCells,
  createTerminalTextIndex,
  measureTextCells,
  sanitizeTerminalText,
  segmentGraphemes,
} from '../../text/index.ts';
import type { TextSelection } from '../../text/index.ts';
import type { AnchoredSurfacePlacement } from '../../interaction/anchored-surface.ts';
import type { CommandInputAction } from '../../ui-model/command-input.ts';
import type { SuggestionItem } from '../../ui-model/contracts.ts';
import type { CommandInputValidation } from '../../ui-model/documents.ts';
import type { TerminalStyle } from '../../visual/render.ts';
import type { SearchPickerAction } from '../../ui-model/search-picker.ts';
import { searchPickerWindow } from '../../behavior/search-picker.ts';
import {
  assertSearchPickerIndex,
  querySearchPickerIndex,
} from '../../ui-model/search-picker-index.ts';
import type { CommandInputStylePart, SearchPickerStylePart } from '../../ui-model/style-parts.ts';
import type { CommandInputOptions, SearchPickerOptions } from '../options/documents.ts';
import { textEditingTriggers } from '../internal/text-key-bindings.ts';

interface CommandInputModel {
  readonly value: string;
  readonly cursor: number;
  readonly selection?: TextSelection;
  readonly historyIndex?: number;
  readonly suggestions: readonly SuggestionItem[];
  readonly selectedSuggestionIndex?: number;
  readonly prompt: string;
  readonly placeholder: string;
  readonly completionPreview: string;
  readonly validation?: CommandInputValidation;
  readonly footer: string;
  readonly matchQuery: string;
  readonly display: 'compact' | 'expanded' | 'popup';
  readonly placement?: AnchoredSurfacePlacement;
  readonly maxVisibleSuggestions: number;
  readonly pointerState?: PointerInteractionState;
}

interface DynamicCommandInputOptions {
  readonly presentation: unknown;
  readonly prompt?: unknown;
  readonly placeholder?: unknown;
  readonly completionPreview?: unknown;
  readonly validation?: unknown;
  readonly footer?: unknown;
  readonly matchQuery?: unknown;
  readonly display?: unknown;
  readonly placement?: unknown;
  readonly maxVisibleSuggestions?: unknown;
  readonly pointerState?: unknown;
}

const commandSlots = {
  suggestions: { cardinality: 'optional', owner: 'implementation', messages: 'bubble' },
} as const;

type CommandInputFactory = <const TMessage extends ComponentMessage = never>(
  options: CommandInputOptions<TMessage>,
) => Element<TMessage>;

export const commandInput: CommandInputFactory = defineComponent<
  DynamicCommandInputOptions,
  CommandInputModel,
  CommandInputAction,
  CommandInputStylePart,
  readonly ['disabled', 'readOnly'],
  'required',
  readonly ['focus', 'layer', 'styles'],
  typeof commandSlots
>({
  name: 'terminal-ui/components/command-input',
  identity: 'required',
  structure: 'composite',
  semantics: 'semantic',
  slots: commandSlots,
  optionFields: {
    presentation: null,
    prompt: null,
    placeholder: null,
    completionPreview: null,
    validation: null,
    footer: null,
    matchQuery: null,
    display: null,
    placement: null,
    maxVisibleSuggestions: null,
    pointerState: null,
  },
  states: ['disabled', 'readOnly'],
  metadata: ['focus', 'layer', 'styles'],
  parts: [
    'value',
    'placeholder',
    'selection',
    'cursor',
    'prompt',
    'completion',
    'suggestion',
    'validation',
    'status',
    'footer',
  ],
  prepare: prepareCommandInput,
  implementationSlots(input) {
    if (input.model.display !== 'popup' || input.model.suggestions.length === 0) {
      return { suggestions: undefined };
    }
    const selected = input.model.selectedSuggestionIndex;
    const suggestions = list({
      id: `${input.id ?? 'command-input'}:suggestions:list`,
      items: input.model.suggestions,
      projectItem: (item: SuggestionItem, index: number) => ({
        id: String(index),
        label: item.label ?? item.value,
        ...(item.description === undefined ? {} : { description: item.description }),
        disabled: item.disabled === true,
      }),
      ...(selected === undefined ? {} : { selectedId: String(selected) }),
      onAction: (action) =>
        action.kind === 'select'
          ? input.emit({ kind: 'selectSuggestion', suggestionIndex: action.itemIndex })
        : action.kind === 'activate'
          ? input.readOnly
            ? ignoreMessage()
            : input.emit({ kind: 'acceptSuggestion' })
          : ignoreMessage(),
      meta: { focus: { disabled: true } },
    });
    return {
      suggestions: portal(
        surface(suggestions, {
          appearance: 'raised',
          border: { kind: 'single' },
          maxHeight: input.model.maxVisibleSuggestions + 2,
        }),
        {
          anchor: { kind: 'allocation' },
          placement: input.model.placement ?? 'below',
          margin: 0,
          onOutsidePress: () => input.emit({ kind: 'dismissSuggestions' }),
          meta: { layer: { zIndex: 20, underlay: 'clear' } },
        },
      ),
    };
  },
  measure(input) {
    const value = input.model.value.length === 0 ? input.model.placeholder : input.model.value;
    const expandedRows = input.model.display === 'expanded'
      ? Math.min(input.model.suggestions.length, input.model.maxVisibleSuggestions)
      : 0;
    return {
      minWidth: 1,
      minHeight: 1,
      preferredWidth:
        measureTextCells(`${input.model.prompt}${value}${input.model.completionPreview}`, {
          widthProfile: input.widthProfile,
        }).cells,
      preferredHeight: 1 + Number(input.model.validation !== undefined) + expandedRows +
        Number(input.model.display === 'expanded' && input.model.footer.length > 0),
    };
  },
  layout: ({ bounds }) => ({ suggestions: bounds }),
  renderBeforeChildren: paintCommandInput,
  accessibility(input) {
    const suggestions = input.model.display === 'compact' ? [] : input.model.suggestions;
    const children = [
      ...(input.model.validation === undefined ? [] : [{
        id: `${input.id}:validation`,
        role: 'status' as const,
        label: input.model.validation.level ?? 'error',
        value: input.model.validation.message,
      }]),
      ...(suggestions.length === 0 ? [] : [{
        id: `${input.id}:suggestions`,
        role: 'listbox' as const,
        label: 'Suggestions',
        children: suggestions.map((suggestion, index) => ({
          id: `${input.id}:suggestion:${String(index)}`,
          role: 'option' as const,
          label: suggestion.label ?? suggestion.value,
          value: suggestion.value,
          selected: index === input.model.selectedSuggestionIndex,
          disabled: suggestion.disabled === true,
        })),
      }]),
    ];
    return {
      id: input.id,
      role: 'combobox',
      label: input.model.prompt || input.id,
      value: input.model.value,
      expanded: suggestions.length > 0,
      ...(suggestions.length === 0 ? {} : { controls: `${input.id}:suggestions` }),
      disabled: input.disabled,
      readOnly: input.readOnly,
      ...(input.focused ? { focused: true } : {}),
      ...(children.length === 0 ? {} : { children }),
    };
  },
  keys: ({ model, readOnly }) => {
    const selected = selectedSuggestion(model);
    const submitted = selected?.disabled === true ? model.value : selected?.value ?? model.value;
    return {
      triggers: textEditingTriggers(readOnly, false),
      ...(readOnly ? {} : {
        backspace: () => ({
          kind: 'edit' as const,
          operation: { kind: 'deleteBackward' as const },
        }),
        delete: () => ({ kind: 'edit' as const, operation: { kind: 'deleteForward' as const } }),
      }),
      arrowLeft: () => ({ kind: 'edit' as const, operation: { kind: 'moveLeft' as const } }),
      arrowRight: () => ({ kind: 'edit' as const, operation: { kind: 'moveRight' as const } }),
      home: () => ({ kind: 'edit' as const, operation: { kind: 'moveHome' as const } }),
      end: () => ({ kind: 'edit' as const, operation: { kind: 'moveEnd' as const } }),
      arrowUp: () =>
        model.suggestions.length === 0
          ? readOnly ? ignoreMessage() : { kind: 'historyPrevious' as const }
          : { kind: 'moveSuggestion' as const, delta: -1 as const },
      arrowDown: () =>
        model.suggestions.length === 0
          ? readOnly ? ignoreMessage() : { kind: 'historyNext' as const }
          : { kind: 'moveSuggestion' as const, delta: 1 as const },
      ...(readOnly || model.suggestions.length === 0
        ? {}
        : { tab: () => ({ kind: 'acceptSuggestion' as const }) }),
      ...(readOnly ? {} : { enter: () => ({ kind: 'submit' as const, value: submitted }) }),
    };
  },
  onInput: ({ text, readOnly }) =>
    readOnly ? ignoreMessage() : ({ kind: 'edit', operation: { kind: 'insert', text } }),
  onPaste: ({ text, readOnly }) =>
    readOnly ? ignoreMessage() : ({ kind: 'edit', operation: { kind: 'insert', text } }),
  pointer: { state: ({ model }) => model.pointerState, onAction: () => ignoreMessage() },
  focusTargets: (input) => {
    const visual = commandInputVisual(input.model, input.bounds.width, input.widthProfile);
    const cursorStyle = input.style({
      part: 'cursor',
      state: 'focused',
      base: {
        fg: { kind: 'theme', token: 'input.cursor' },
        bold: true,
        inverse: true,
      },
    });
    return [{
      id: 'self',
      bounds: input.bounds,
      cursor: {
        row: commandInputRow(input.model, input.bounds.height),
        column: Math.max(
          0,
          Math.min(Math.max(0, input.bounds.width - 1), visual.promptCells + visual.cursorColumn),
        ),
        ...(cursorStyle === undefined ? {} : { style: cursorStyle }),
        source: input.source({ cellRole: 'cursor', partName: 'cursor', partType: 'cursor' }),
      },
    }];
  },
  hitTargets: commandInputHitTargets,
});

function prepareCommandInput(value: unknown): CommandInputModel {
  if (!isNonArrayObject(value)) throw new TypeError('commandInput options must be an object.');
  const presentation = prepareCommandPresentation(value['presentation']);
  const display = value['display'];
  if (
    display !== undefined && display !== 'compact' && display !== 'expanded' && display !== 'popup'
  ) throw new TypeError('commandInput display must be compact, expanded, or popup.');
  const maxVisibleSuggestions =
    positiveInteger(value['maxVisibleSuggestions'], 'commandInput maxVisibleSuggestions') ?? 8;
  const validation = prepareValidation(value['validation']);
  const pointerState = preparePointerState(value['pointerState'], 'commandInput');
  const placement = preparePlacement(value['placement'], 'commandInput placement');
  return {
    ...presentation,
    prompt: clean(value['prompt'], 'commandInput prompt') ?? '> ',
    placeholder: clean(value['placeholder'], 'commandInput placeholder') ?? '',
    completionPreview: clean(value['completionPreview'], 'commandInput completionPreview') ?? '',
    ...(validation === undefined ? {} : { validation }),
    footer: clean(value['footer'], 'commandInput footer') ?? '',
    matchQuery: clean(value['matchQuery'], 'commandInput matchQuery') ?? presentation.value,
    display: display ?? 'compact',
    ...(placement === undefined ? {} : { placement }),
    maxVisibleSuggestions,
    ...(pointerState === undefined ? {} : { pointerState }),
  };
}

function prepareCommandPresentation(
  value: unknown,
): Pick<
  CommandInputModel,
  'value' | 'cursor' | 'selection' | 'historyIndex' | 'suggestions' | 'selectedSuggestionIndex'
> {
  if (!isNonArrayObject(value)) throw new TypeError('commandInput presentation must be an object.');
  exact(value, [
    'value',
    'cursor',
    'suggestions',
    'selection',
    'selectedSuggestionIndex',
    'historyIndex',
  ], 'commandInput presentation');
  const text = clean(value['value'], 'commandInput value') ?? '';
  const cursor = nonNegativeInteger(value['cursor'], 'commandInput cursor');
  if (cursor > text.length) throw new RangeError('commandInput cursor is outside the value.');
  if (!Array.isArray(value['suggestions'])) {
    throw new TypeError('commandInput suggestions must be an array.');
  }
  const suggestions = Object.freeze(value['suggestions'].map(prepareSuggestion));
  const selectedSuggestionIndex = optionalNonNegativeInteger(
    value['selectedSuggestionIndex'],
    'commandInput selectedSuggestionIndex',
  );
  if (selectedSuggestionIndex !== undefined && selectedSuggestionIndex >= suggestions.length) {
    throw new RangeError('commandInput selectedSuggestionIndex is outside suggestions.');
  }
  const selection = prepareTextSelection(value['selection'], text.length, 'commandInput selection');
  const historyIndex = optionalNonNegativeInteger(
    value['historyIndex'],
    'commandInput historyIndex',
  );
  return {
    value: text,
    cursor,
    ...(selection === undefined ? {} : { selection }),
    ...(historyIndex === undefined ? {} : { historyIndex }),
    suggestions,
    ...(selectedSuggestionIndex === undefined ? {} : { selectedSuggestionIndex }),
  };
}

function prepareSuggestion(value: unknown, index: number): SuggestionItem {
  if (!isNonArrayObject(value)) {
    throw new TypeError(`commandInput suggestions[${String(index)}] must be an object.`);
  }
  exact(
    value,
    ['label', 'value', 'description', 'disabled'],
    `commandInput suggestions[${String(index)}]`,
  );
  const suggestionValue = clean(value['value'], 'commandInput suggestion value');
  if (suggestionValue === undefined) {
    throw new TypeError('commandInput suggestion value must be a string.');
  }
  return Object.freeze({
    label: clean(value['label'], 'commandInput suggestion label') ?? suggestionValue,
    value: suggestionValue,
    ...(value['description'] === undefined
      ? {}
      : { description: clean(value['description'], 'commandInput suggestion description') ?? '' }),
    ...(optionalBoolean(value['disabled'], 'commandInput suggestion disabled') === true
      ? { disabled: true }
      : {}),
  });
}

function paintCommandInput(
  input: ComponentRenderInput<CommandInputModel, CommandInputStylePart>,
): void {
  const rowOffset = commandInputRow(input.model, input.bounds.height);
  const fieldBase: TerminalStyle = {
    fg: { kind: 'theme', token: 'control.foreground' },
    bg: { kind: 'theme', token: 'control.background' },
  };
  const fieldStyle = input.style({
    part: 'value',
    base: fieldBase,
    ...(input.disabled
      ? { state: 'disabled' }
      : input.focus === 'self'
      ? { state: 'focused' }
      : {}),
  });
  for (let row = 0; row < input.bounds.height; row += 1) {
    input.target.write(row, 0, [span(' '.repeat(input.bounds.width), {
      ...(fieldStyle === undefined ? {} : { style: fieldStyle }),
      source: input.source({
        partName: row === rowOffset ? 'window' : 'padding',
        partType: row === rowOffset ? 'window' : 'padding',
        description: row === rowOffset ? 'window' : 'padding',
        cellRole: 'decoration',
      }),
    })]);
  }
  const visual = commandInputVisual(input.model, input.bounds.width, input.widthProfile);
  const promptStyle = input.style({
    part: 'prompt',
    base: { fg: { kind: 'theme', token: 'command.prompt' } },
  });
  const line = [
    span(input.model.prompt, {
      ...(promptStyle === undefined ? {} : { style: promptStyle }),
      source: input.source({
        partName: 'prompt',
        partType: 'prompt',
        description: 'prompt',
        cellRole: 'decoration',
      }),
    }),
  ];
  if (input.model.value.length === 0) {
    const placeholderStyle = input.style({
      part: 'placeholder',
      base: { fg: { kind: 'theme', token: 'input.placeholder' }, dim: true },
    });
    line.push(
      span(
        clipTextCells(input.model.placeholder, visual.contentWidth, {
          widthProfile: input.widthProfile,
        }).text,
        {
          ...(placeholderStyle === undefined ? {} : { style: placeholderStyle }),
          source: input.source({
            partName: 'placeholder',
            partType: 'placeholder',
            description: 'placeholder',
            cellRole: 'text',
          }),
        },
      ),
    );
  } else {
    line.push(...commandValueSpans(input, visual));
    const visibleCells =
      measureTextCells(visual.visibleText, { widthProfile: input.widthProfile }).cells +
      Number(visual.clippedBefore);
    const completionWidth = Math.max(0, visual.contentWidth - visibleCells);
    if (!visual.clippedAfter && completionWidth > 0 && input.model.completionPreview.length > 0) {
      const completionStyle = input.style({
        part: 'completion',
        base: { fg: { kind: 'theme', token: 'input.placeholder' }, dim: true },
      });
      line.push(
        span(
          clipTextCells(input.model.completionPreview, completionWidth, {
            widthProfile: input.widthProfile,
          }).text,
          {
            ...(completionStyle === undefined ? {} : { style: completionStyle }),
            source: input.source({
              partName: 'completion',
              partType: 'completion',
              description: 'completion',
              cellRole: 'text',
            }),
          },
        ),
      );
    }
  }
  input.target.write(rowOffset, 0, line);
  let row = rowOffset + 1;
  if (input.model.validation !== undefined && row < input.bounds.height) {
    const token = input.model.validation.level === 'info'
      ? 'status.info'
      : input.model.validation.level === 'warning'
      ? 'status.warning'
      : 'status.error';
    const style = input.style({ part: 'validation', base: { fg: { kind: 'theme', token } } });
    input.target.write(row, 0, [
      span(input.model.validation.message, {
        ...(style === undefined ? {} : { style }),
        source: input.source({
          partName: 'validation',
          partType: 'validation',
          description: 'validation',
          cellRole: 'text',
        }),
      }),
    ]);
    row += 1;
  }
  if (input.model.display === 'expanded') {
    const reserveFooter = input.model.footer.length > 0 ? 1 : 0;
    const available = Math.max(
      0,
      Math.min(input.model.maxVisibleSuggestions, input.bounds.height - row - reserveFooter),
    );
    input.model.suggestions.slice(0, available).forEach((suggestion, index) => {
      input.target.write(row + index, 0, commandSuggestionSpans(input, suggestion, index));
    });
    row += available;
    if (input.model.footer.length > 0 && row < input.bounds.height) {
      const style = input.style({
        part: 'footer',
        base: { fg: { kind: 'theme', token: 'text.muted' }, dim: true },
      });
      input.target.write(row, 0, [
        span(input.model.footer, {
          ...(style === undefined ? {} : { style }),
          source: input.source({
            partName: 'footer',
            partType: 'footer',
            description: 'footer',
            cellRole: 'text',
          }),
        }),
      ]);
    }
  }
}

interface CommandInputVisual {
  readonly promptCells: number;
  readonly contentWidth: number;
  readonly offsetCells: number;
  readonly cursorColumn: number;
  readonly startOffset: number;
  readonly endOffsetExclusive: number;
  readonly visibleText: string;
  readonly clippedBefore: boolean;
  readonly clippedAfter: boolean;
}

function commandInputVisual(
  model: CommandInputModel,
  width: number,
  widthProfile: import('../../text/index.ts').TextWidthProfile,
): CommandInputVisual {
  const promptCells = measureTextCells(model.prompt, { widthProfile }).cells;
  const contentWidth = Math.max(0, width - promptCells);
  const index = createTerminalTextIndex(model.value, { widthProfile });
  const cursorGrapheme = index.codeUnitOffsetToGraphemeIndex(model.cursor);
  const cursorCells = index.graphemeIndexToVisualColumn(cursorGrapheme);
  const offsetCells = Math.max(0, cursorCells - Math.max(0, contentWidth - 1));
  const clippedBefore = offsetCells > 0;
  const textBudget = Math.max(0, contentWidth - Number(clippedBefore));
  const startGrapheme = index.visualColumnToGraphemeIndex(offsetCells);
  const endGrapheme = index.visualColumnToGraphemeIndex(offsetCells + textBudget);
  const startOffset = index.graphemeIndexToCodeUnitOffset(startGrapheme);
  let endOffsetExclusive = index.graphemeIndexToCodeUnitOffset(endGrapheme);
  if (endOffsetExclusive < model.value.length) {
    const next = index.graphemeIndexToCodeUnitOffset(
      Math.min(index.graphemes.length, endGrapheme + 1),
    );
    const candidate = model.value.slice(startOffset, next);
    if (measureTextCells(candidate, { widthProfile }).cells <= textBudget) {
      endOffsetExclusive = next;
    }
  }
  return {
    promptCells,
    contentWidth,
    offsetCells,
    cursorColumn: Math.max(0, cursorCells - offsetCells + Number(clippedBefore)),
    startOffset,
    endOffsetExclusive,
    visibleText: model.value.slice(startOffset, endOffsetExclusive),
    clippedBefore,
    clippedAfter: endOffsetExclusive < model.value.length,
  };
}

function commandInputRow(model: CommandInputModel, height: number): number {
  if (model.display === 'expanded') return 0;
  const contentRows = 1 + Number(model.validation !== undefined);
  return Math.floor(Math.max(0, height - contentRows) / 2);
}

function commandValueSpans(
  input: ComponentRenderInput<CommandInputModel, CommandInputStylePart>,
  visual: CommandInputVisual,
): import('../../visual/render.ts').RenderSpan[] {
  const spans: import('../../visual/render.ts').RenderSpan[] = [];
  if (visual.clippedBefore) {
    spans.push(span('‹', {
      source: input.source({ partName: 'window', partType: 'window', cellRole: 'decoration' }),
    }));
  }
  const selection = input.model.selection;
  for (const grapheme of segmentGraphemes(input.model.value)) {
    if (
      grapheme.startOffset < visual.startOffset || grapheme.startOffset >= visual.endOffsetExclusive
    ) continue;
    const selected = selection !== undefined &&
      grapheme.startOffset < selection.endOffsetExclusive &&
      grapheme.endOffsetExclusive > selection.startOffset;
    const style = input.style({
      part: selected ? 'selection' : 'value',
      base: selected
        ? {
          fg: { kind: 'theme', token: 'selection.foreground' },
          bg: { kind: 'theme', token: 'selection.background' },
        }
        : {
          fg: { kind: 'theme', token: 'control.foreground' },
          bg: { kind: 'theme', token: 'control.background' },
        },
      ...(input.disabled
        ? { state: 'disabled' }
        : input.focus === 'self'
        ? { state: 'focused' }
        : {}),
    });
    spans.push(span(grapheme.text, {
      ...(style === undefined ? {} : { style }),
      source: input.source({
        partName: selected ? 'selection' : 'value',
        partType: selected ? 'selection' : 'value',
        description: selected ? 'selection' : 'value',
        cellRole: 'text',
      }),
    }));
  }
  if (input.model.historyIndex !== undefined) {
    const style = input.style({
      part: 'placeholder',
      base: { fg: { kind: 'theme', token: 'text.muted' }, dim: true },
    });
    spans.push(span(`  #${String(input.model.historyIndex + 1)}`, {
      ...(style === undefined ? {} : { style }),
      source: input.source({ partName: 'history', partType: 'history', cellRole: 'text' }),
    }));
  }
  return spans;
}

function commandSuggestionSpans(
  input: ComponentRenderInput<CommandInputModel, CommandInputStylePart>,
  suggestion: SuggestionItem,
  index: number,
): import('../../visual/render.ts').RenderSpan[] {
  const selected = index === input.model.selectedSuggestionIndex;
  const pointer = pointerVisualState(
    input.model.pointerState,
    `${input.id ?? 'command-input'}:suggestion:${String(index)}`,
  );
  const state = suggestion.disabled === true
    ? 'disabled' as const
    : pointer ?? (selected ? 'selected' as const : undefined);
  const rowStyle = input.style({
    part: 'suggestion',
    base: selected
      ? {
        fg: { kind: 'theme', token: 'selection.foreground' },
        bg: { kind: 'theme', token: 'selection.background' },
      }
      : { fg: { kind: 'theme', token: 'text.default' } },
    ...(state === undefined ? {} : { state }),
  });
  const label = suggestion.label ?? suggestion.value;
  const matches = input.model.matchQuery.trim().length > 0 &&
    label.toLocaleLowerCase().includes(input.model.matchQuery.trim().toLocaleLowerCase());
  const matchStyle = matches
    ? input.style({
      part: 'suggestion',
      base: { fg: { kind: 'theme', token: 'command.match' }, underline: true },
    })
    : rowStyle;
  const spans = [
    span(
      `${selected ? input.theme.tokens.symbols.pointer : input.theme.tokens.symbols.unselected} `,
      {
        ...(rowStyle === undefined ? {} : { style: rowStyle }),
        source: input.source({
          partName: `suggestion.${String(index)}.marker`,
          partType: 'marker',
          description: `suggestion.${String(index)}.marker`,
          cellRole: 'decoration',
          itemIndex: index,
          ...(state === undefined ? {} : { interactionState: state }),
        }),
      },
    ),
    span(label, {
      ...(matchStyle === undefined ? {} : { style: matchStyle }),
      source: input.source({
        partName: matches
          ? `suggestion.${String(index)}.match`
          : `suggestion.${String(index)}.label`,
        partType: matches ? 'match' : 'label',
        description: matches
          ? `suggestion.${String(index)}.match`
          : `suggestion.${String(index)}.label`,
        cellRole: 'text',
        itemIndex: index,
        ...(state === undefined ? {} : { interactionState: state }),
      }),
    }),
    ...(suggestion.description === undefined ? [] : [span(` · ${suggestion.description}`, {
      ...(rowStyle === undefined ? {} : { style: rowStyle }),
      source: input.source({
        partName: `suggestion.${String(index)}.description`,
        partType: 'description',
        description: `suggestion.${String(index)}.description`,
        cellRole: 'text',
        itemIndex: index,
        ...(state === undefined ? {} : { interactionState: state }),
      }),
    })]),
  ];
  const used = measureTextCells(spans.map((current) => current.text).join(''), {
    widthProfile: input.widthProfile,
  }).cells;
  if (used < input.bounds.width) {
    spans.push(span(' '.repeat(input.bounds.width - used), {
      ...(rowStyle === undefined ? {} : { style: rowStyle }),
      source: input.source({
        partName: `suggestion.${String(index)}.padding`,
        partType: 'spacing',
        description: `suggestion.${String(index)}.padding`,
        cellRole: 'decoration',
        itemIndex: index,
        ...(state === undefined ? {} : { interactionState: state }),
      }),
    }));
  }
  return spans;
}

function commandInputHitTargets(
  input: ComponentInput<CommandInputModel>,
): readonly HitTarget<CommandInputAction>[] {
  const visual = commandInputVisual(input.model, input.bounds.width, input.widthProfile);
  const textTarget: HitTarget<CommandInputAction> = {
    id: `${input.id ?? 'command-input'}:text`,
    bounds: input.bounds,
    accepts: ['pointerDown'],
    cursor: 'text',
    focus: { kind: 'target', targetId: 'self' },
    message: (event) => {
      const localColumn = event.localColumn ?? 1;
      const column = visual.offsetCells + Math.max(0, localColumn - 1 - visual.promptCells);
      const textIndex = createTerminalTextIndex(input.model.value, {
        widthProfile: input.widthProfile,
      });
      const offset = textIndex.graphemeIndexToCodeUnitOffset(
        textIndex.visualColumnToGraphemeIndex(column),
      );
      return { kind: 'pointer', action: { kind: 'placeCaret', offset } };
    },
  };
  if (input.model.display !== 'expanded') return [textTarget];
  const row = commandInputRow(input.model, input.bounds.height) + 1 +
    Number(input.model.validation !== undefined);
  const reserveFooter = input.model.footer.length > 0 ? 1 : 0;
  const available = Math.max(
    0,
    Math.min(input.model.maxVisibleSuggestions, input.bounds.height - row - reserveFooter),
  );
  return [
    textTarget,
    ...input.model.suggestions.slice(0, available).flatMap((
      suggestion,
      index,
    ): readonly HitTarget<CommandInputAction>[] =>
      suggestion.disabled === true ? [] : [{
        id: `${input.id ?? 'command-input'}:suggestion:${String(index)}`,
        bounds: { row: row + index, column: 0, width: input.bounds.width, height: 1 },
        cursor: 'pointer',
        focus: { kind: 'target', targetId: 'self' },
        message: () => ({ kind: 'selectSuggestion', suggestionIndex: index }),
      }]
    ),
  ];
}

function selectedSuggestion(model: CommandInputModel): SuggestionItem | undefined {
  return model.selectedSuggestionIndex === undefined
    ? undefined
    : model.suggestions[model.selectedSuggestionIndex];
}

interface PreparedSearchEntry {
  readonly id: string;
  readonly itemIndex: number;
  readonly label: string;
  readonly description?: string;
  readonly preview?: string;
  readonly group?: string;
  readonly disabled: boolean;
}

type SearchPickerInternalAction =
  | Exclude<SearchPickerAction<never>, { readonly kind: 'activate' }>
  | { readonly kind: 'activateById'; readonly id: string };

interface SearchPickerModel {
  readonly title: string;
  readonly query: string;
  readonly rows: readonly PreparedSearchEntry[];
  readonly selectedIndex?: number;
  readonly totalCount: number;
  readonly sourceCount: number;
  readonly startIndex: number;
  readonly helpText: string;
  readonly emptyText: string;
  readonly scroll?: ScrollState;
  readonly scrollbar?: ScrollbarOptions;
  readonly scrollPolicy?: ScrollPolicy;
  readonly pointerState?: PointerInteractionState;
}

interface DynamicSearchPickerOptions {
  readonly title?: unknown;
  readonly query?: unknown;
  readonly searchPickerIndex: unknown;
  readonly selectedId?: unknown;
  readonly maxVisible?: unknown;
  readonly helpText?: unknown;
  readonly emptyText?: unknown;
  readonly scroll?: unknown;
  readonly scrollbar?: unknown;
  readonly scrollPolicy?: unknown;
  readonly pointerState?: unknown;
}

type SearchPickerFactory = <TValue, const TMessage extends ComponentMessage = never>(
  options: SearchPickerOptions<TValue, TMessage>,
) => Element<TMessage>;

const instantiateSearchPicker = defineComponent<
  DynamicSearchPickerOptions,
  SearchPickerModel,
  SearchPickerInternalAction,
  SearchPickerStylePart,
  readonly ['disabled'],
  'required',
  readonly ['focus', 'layer', 'styles']
>({
  name: 'terminal-ui/components/search-picker',
  identity: 'required',
  structure: 'leaf',
  semantics: 'semantic',
  optionFields: {
    title: null,
    query: null,
    searchPickerIndex: null,
    selectedId: null,
    maxVisible: null,
    helpText: null,
    emptyText: null,
    scroll: null,
    scrollbar: null,
    scrollPolicy: null,
    pointerState: null,
  },
  states: ['disabled'],
  metadata: ['focus', 'layer', 'styles'],
  parts: [
    'value',
    'placeholder',
    'selection',
    'title',
    'entry',
    'group',
    'description',
    'shortcut',
    'help',
    'status',
    'empty',
    'scrollbar',
  ],
  prepare: prepareSearchPicker,
  measure(input) {
    return {
      minWidth: 1,
      minHeight: 1,
      preferredWidth: Math.max(
        16,
        measureTextCells(input.model.title, { widthProfile: input.widthProfile }).cells,
        measureTextCells(input.model.query, { widthProfile: input.widthProfile }).cells + 2,
        ...input.model.rows.map((row) =>
          measureTextCells(row.label, { widthProfile: input.widthProfile }).cells + 2
        ),
      ),
      preferredHeight: Math.max(
        2,
        input.model.rows.length + 2 + searchPickerTrailingRowCount(input.model),
      ),
    };
  },
  render: paintSearchPicker,
  accessibility(input) {
    return {
      id: input.id,
      role: 'combobox',
      label: input.model.title || input.id,
      value: input.model.query,
      disabled: input.disabled,
      expanded: true,
      ...(input.focused ? { focused: true } : {}),
      children: [{
        id: `${input.id}:results`,
        role: 'listbox',
        label: 'Results',
        window: {
          startIndex: input.model.startIndex,
          endIndexExclusive: input.model.startIndex + input.model.rows.length,
          totalCount: input.model.totalCount,
          omittedBefore: input.model.startIndex,
          omittedAfter: Math.max(
            0,
            input.model.totalCount - input.model.startIndex - input.model.rows.length,
          ),
        },
        children: input.model.rows.map((row, index) => ({
          id: `${input.id}:entry:${row.id}`,
          role: 'option' as const,
          label: row.label,
          ...(row.description === undefined ? {} : { description: row.description }),
          ...(row.preview === undefined ? {} : { value: row.preview }),
          selected: index === input.model.selectedIndex && !row.disabled,
          disabled: row.disabled,
          position: {
            positionInSet: row.itemIndex + 1,
            setSize: input.model.totalCount,
            ...(row.group === undefined ? {} : { group: row.group }),
          },
        })),
      }, {
        id: `${input.id}:status`,
        role: 'status',
        label: searchPickerSummary(input.model),
        live: 'polite',
      }],
    };
  },
  keys: ({ model }) => {
    const selected = model.selectedIndex === undefined
      ? undefined
      : model.rows[model.selectedIndex];
    return {
      backspace: () => ({ kind: 'deleteQueryBackward' }),
      arrowUp: () => ({ kind: 'moveSelection', delta: -1 }),
      arrowDown: () => ({ kind: 'moveSelection', delta: 1 }),
      ...(selected === undefined || selected.disabled
        ? {}
        : { enter: () => ({ kind: 'activateById' as const, id: selected.id }) }),
    };
  },
  onInput: ({ text }) => ({ kind: 'insertQuery', text }),
  onPaste: ({ text }) => ({ kind: 'insertQuery', text }),
  pointer: { state: ({ model }) => model.pointerState, onAction: () => ignoreMessage() },
  focusTargets: ({ bounds }) => [{ id: 'self', bounds, cursor: { row: 1, column: 2 } }],
  hitTargets(input) {
    const plan = searchPickerPlan(input);
    const entryTargets = input.model.rows.slice(
      0,
      searchPickerVisibleEntryCount(input.model, plan.contentBounds.height),
    ).flatMap((row, index) =>
      row.disabled ? [] : [{
        id: `${input.id ?? 'search-picker'}:${row.id}`,
        bounds: {
          row: plan.contentBounds.row + index + 2,
          column: plan.contentBounds.column,
          width: plan.contentBounds.width,
          height: 1,
        },
        cursor: 'pointer' as const,
        focus: { kind: 'target' as const, targetId: 'self' },
        message: () => ({ kind: 'activateById' as const, id: row.id }),
      }]
    );
    return [
      ...entryTargets,
      ...componentScrollbarHitTargets<SearchPickerInternalAction>({
        id: input.id ?? 'search-picker',
        plan,
        ...(input.model.scrollPolicy === undefined ? {} : { policy: input.model.scrollPolicy }),
        onScroll: (event) => ({ kind: 'scroll', event }),
      }),
    ];
  },
});

export const searchPicker: SearchPickerFactory = (options) => {
  if (options.disabled === true) return instantiateSearchPicker(options);
  return instantiateSearchPicker({
    ...options,
    onAction: (action) => mapSearchPickerAction(action, options),
  });
};

function prepareSearchPicker(value: unknown): SearchPickerModel {
  if (!isNonArrayObject(value)) throw new TypeError('searchPicker options must be an object.');
  const index = value['searchPickerIndex'];
  assertSearchPickerIndex(index);
  const query = clean(value['query'], 'searchPicker query') ?? '';
  const selectedId = value['selectedId'] === undefined
    ? undefined
    : nonEmpty(value['selectedId'], 'searchPicker selectedId');
  const scroll = prepareComponentScrollState(value['scroll'], 'searchPicker scroll');
  const limit = positiveInteger(value['maxVisible'], 'searchPicker maxVisible') ??
    Math.max(1, scroll?.viewportRows ?? 8);
  const window = searchPickerWindow({
    searchPickerIndex: index,
    query,
    ...(selectedId === undefined ? {} : { selectedId }),
    ...(scroll === undefined ? {} : { scroll }),
    limit,
  });
  const rows = Object.freeze(
    window.entries.map((entry, position): PreparedSearchEntry =>
      Object.freeze({
        id: entry.id,
        itemIndex: window.startIndex + position,
        label: entry.label,
        ...(entry.description === undefined ? {} : { description: entry.description }),
        ...(entry.preview === undefined ? {} : { preview: entry.preview }),
        ...(entry.group === undefined ? {} : { group: entry.group }),
        disabled: entry.disabled === true,
      })
    ),
  );
  const scrollbar = prepareComponentScrollbarOptions(value['scrollbar'], 'searchPicker scrollbar');
  const scrollPolicy = prepareComponentScrollPolicy(
    value['scrollPolicy'],
    'searchPicker scrollPolicy',
  );
  if (scroll === undefined && (scrollbar !== undefined || scrollPolicy !== undefined)) {
    throw new TypeError('searchPicker scrollbar and scrollPolicy require scroll state.');
  }
  const pointerState = preparePointerState(value['pointerState'], 'searchPicker');
  return {
    title: clean(value['title'], 'searchPicker title') ?? '',
    query,
    rows,
    ...(window.selectedIndex === undefined ? {} : { selectedIndex: window.selectedIndex }),
    totalCount: window.totalCount,
    sourceCount: index.size,
    startIndex: window.startIndex,
    helpText: clean(value['helpText'], 'searchPicker helpText') ?? '',
    emptyText: clean(value['emptyText'], 'searchPicker emptyText') ?? 'No matches',
    ...(scroll === undefined ? {} : { scroll }),
    ...(scrollbar === undefined ? {} : { scrollbar }),
    ...(scrollPolicy === undefined ? {} : { scrollPolicy }),
    ...(pointerState === undefined ? {} : { pointerState }),
  };
}

function searchPickerPlan(input: ComponentInput<SearchPickerModel>) {
  const contentRows = input.model.totalCount + 2 + searchPickerTrailingRowCount(input.model);
  const scroll = input.model.scroll ??
    {
      offsetRow: input.model.startIndex,
      offsetColumn: 0,
      contentRows,
      contentColumns: input.bounds.width,
      viewportRows: input.bounds.height,
      viewportColumns: input.bounds.width,
      followTail: false,
    };
  return prepareComponentScrollbar({
    bounds: input.bounds,
    scroll: {
      ...scroll,
      contentRows,
      viewportRows: input.bounds.height,
      viewportColumns: input.bounds.width,
    },
    ...(input.model.scrollbar === undefined ? {} : { options: input.model.scrollbar }),
    defaultAxis: 'vertical',
  });
}

function mapSearchPickerAction<TValue, TMessage extends ComponentMessage>(
  action: SearchPickerInternalAction,
  options: SearchPickerOptions<TValue, TMessage> & { readonly disabled?: false },
): import('../../interaction/index.ts').MessageResolution<TMessage> {
  if (action.kind !== 'activateById') return options.onAction(action);
  const entry = querySearchPickerIndex(options.searchPickerIndex, options.query ?? '').entries.find(
    (candidate) => candidate.id === action.id,
  );
  return entry === undefined ? ignoreMessage() : options.onAction({ kind: 'activate', entry });
}
function paintSearchPicker(
  input: ComponentRenderInput<SearchPickerModel, SearchPickerStylePart>,
): void {
  const plan = searchPickerPlan(input);
  const selectedPreview = selectedSearchPickerPreview(input.model);
  const title = input.model.title.length === 0 ? 'Options' : input.model.title;
  const titleStyle = input.style({ part: 'title' });
  const summaryStyle = input.style({
    part: 'help',
    base: { fg: { kind: 'theme', token: 'text.muted' }, dim: true },
  });
  input.target.write(
    0,
    0,
    clipRenderSpans(
      [
        span(title, {
          ...(titleStyle === undefined ? {} : { style: titleStyle }),
          source: input.source({ partName: 'title', cellRole: 'text', description: 'title' }),
        }),
        span(`  ${searchPickerSummary(input.model)}`, {
          ...(summaryStyle === undefined ? {} : { style: summaryStyle }),
          source: input.source({
            partName: 'result.summary',
            cellRole: 'text',
            description: 'result.summary',
          }),
        }),
      ],
      plan.contentBounds.width,
      { widthProfile: input.widthProfile },
    ),
  );
  const inputStyle = input.style({
    part: 'value',
    ...(input.focus === 'self' ? { state: 'focused' } : {}),
  });
  const markerStyle = input.style({
    part: 'placeholder',
    base: { fg: { kind: 'theme', token: 'command.prompt' } },
  });
  input.target.write(
    1,
    0,
    clipRenderSpans(
      [
        span(`${input.theme.tokens.symbols.pointer} `, {
          ...(markerStyle === undefined ? {} : { style: markerStyle }),
          source: input.source({
            partName: 'query.marker',
            cellRole: 'decoration',
            description: 'query.marker',
          }),
        }),
        span(input.model.query, {
          ...(inputStyle === undefined ? {} : { style: inputStyle }),
          source: input.source({ partName: 'query', cellRole: 'text', description: 'query' }),
        }),
      ],
      plan.contentBounds.width,
      { widthProfile: input.widthProfile },
    ),
  );
  if (input.model.rows.length === 0) {
    const style = input.style({ part: 'empty' });
    input.target.write(2, 0, [span(input.model.emptyText, {
      ...(style === undefined ? {} : { style }),
      source: input.source({ partName: 'empty', cellRole: 'text', description: 'empty' }),
    })]);
  }
  const visibleRows = input.model.rows.slice(
    0,
    searchPickerVisibleEntryCount(input.model, plan.contentBounds.height),
  );
  visibleRows.forEach((row, index) => {
    const selected = index === input.model.selectedIndex;
    const state = row.disabled ? 'disabled' as const : selected ? 'selected' as const : undefined;
    const style = input.style({
      part: 'entry',
      base: { fg: { kind: 'theme', token: 'text.default' } },
      ...(state === undefined ? {} : { state }),
    });
    const prefix = selected ? input.theme.tokens.symbols.selected : ' ';
    const group = row.group === undefined ? '' : `[${row.group}] `;
    const matchIndex = input.model.query === ''
      ? -1
      : row.label.toLocaleLowerCase().indexOf(input.model.query.toLocaleLowerCase());
    const labelSpans = matchIndex < 0
      ? [span(row.label, {
        ...(style === undefined ? {} : { style }),
        source: input.source({
          partName: `entry.${row.id}.label`,
          cellRole: 'text',
          itemId: row.id,
          itemIndex: row.itemIndex,
          ...(state === undefined ? {} : { interactionState: state }),
          description: `entry.${row.id}.label`,
        }),
      })]
      : [
        span(row.label.slice(0, matchIndex), {
          ...(style === undefined ? {} : { style }),
          source: input.source({
            partName: `entry.${row.id}.label`,
            cellRole: 'text',
            itemId: row.id,
            itemIndex: row.itemIndex,
            ...(state === undefined ? {} : { interactionState: state }),
            description: `entry.${row.id}.label`,
          }),
        }),
        span(row.label.slice(matchIndex, matchIndex + input.model.query.length), {
          style: { ...(style ?? {}), fg: { kind: 'theme', token: 'command.match' }, bold: true },
          source: input.source({
            partName: `entry.${row.id}.match`,
            cellRole: 'text',
            itemId: row.id,
            itemIndex: row.itemIndex,
            ...(state === undefined ? {} : { interactionState: state }),
            description: `entry.${row.id}.match`,
          }),
        }),
        span(row.label.slice(matchIndex + input.model.query.length), {
          ...(style === undefined ? {} : { style }),
          source: input.source({
            partName: `entry.${row.id}.label`,
            cellRole: 'text',
            itemId: row.id,
            itemIndex: row.itemIndex,
            ...(state === undefined ? {} : { interactionState: state }),
            description: `entry.${row.id}.label`,
          }),
        }),
      ];
    const spans = [
      span(`${prefix} `, {
        ...(style === undefined ? {} : { style }),
        source: input.source({
          partName: `entry.${row.id}.marker`,
          cellRole: 'decoration',
          itemId: row.id,
          itemIndex: row.itemIndex,
          ...(state === undefined ? {} : { interactionState: state }),
          description: `entry.${row.id}.marker`,
        }),
      }),
      ...(group === '' ? [] : [span(group, {
        ...(style === undefined ? {} : { style }),
        source: input.source({
          partName: `entry.${row.id}.group`,
          cellRole: 'text',
          itemId: row.id,
          itemIndex: row.itemIndex,
          ...(state === undefined ? {} : { interactionState: state }),
          description: `entry.${row.id}.group`,
        }),
      })]),
      ...labelSpans,
      ...(row.description === undefined ? [] : [span(` · ${row.description}`, {
        ...(style === undefined ? {} : { style }),
        source: input.source({
          partName: `entry.${row.id}.description`,
          cellRole: 'text',
          itemId: row.id,
          itemIndex: row.itemIndex,
          ...(state === undefined ? {} : { interactionState: state }),
          description: `entry.${row.id}.description`,
        }),
      })]),
    ];
    const used = measureTextCells(spans.map((current) => current.text).join(''), {
      widthProfile: input.widthProfile,
    }).cells;
    if (used < plan.contentBounds.width) {
      spans.push(span(' '.repeat(plan.contentBounds.width - used), {
        ...(style === undefined ? {} : { style }),
        source: input.source({
          partName: `entry.${row.id}.padding`,
          partType: 'spacing',
          cellRole: 'decoration',
          itemId: row.id,
          itemIndex: row.itemIndex,
          ...(state === undefined ? {} : { interactionState: state }),
          description: `entry.${row.id}.padding`,
        }),
      }));
    }
    input.target.write(
      index + 2,
      0,
      clipRenderSpans(spans, plan.contentBounds.width, { widthProfile: input.widthProfile }),
    );
  });
  let trailingRow = visibleRows.length + 2;
  if (
    selectedPreview !== undefined && selectedPreview.length > 0 &&
    trailingRow < plan.contentBounds.height
  ) {
    const style = input.style({ part: 'status' });
    input.target.write(trailingRow, 0, [
      span(selectedPreview, {
        ...(style === undefined ? {} : { style }),
        source: input.source({ partName: 'preview', cellRole: 'text' }),
      }),
    ]);
    trailingRow += 1;
  }
  if (input.model.helpText.length > 0 && trailingRow < plan.contentBounds.height) {
    const style = input.style({ part: 'help' });
    input.target.write(trailingRow, 0, [
      span(input.model.helpText, {
        ...(style === undefined ? {} : { style }),
        source: input.source({ partName: 'help', cellRole: 'text' }),
      }),
    ]);
  }
  paintComponentScrollbar({
    target: input.target,
    plan,
    theme: input.theme,
    source: (sourceInput) => input.source(sourceInput),
  });
}

function searchPickerSummary(model: SearchPickerModel): string {
  return model.query.length === 0
    ? `${String(model.totalCount)} options`
    : `${String(model.totalCount)}/${String(model.sourceCount)} ${
      model.totalCount === 1 ? 'match' : 'matches'
    }`;
}

function selectedSearchPickerPreview(model: SearchPickerModel): string | undefined {
  return model.selectedIndex === undefined ? undefined : model.rows[model.selectedIndex]?.preview;
}

function searchPickerTrailingRowCount(model: SearchPickerModel): number {
  const preview = selectedSearchPickerPreview(model);
  return Number(preview !== undefined && preview.length > 0) + Number(model.helpText.length > 0);
}

function searchPickerVisibleEntryCount(model: SearchPickerModel, height: number): number {
  return Math.max(0, height - 2 - searchPickerTrailingRowCount(model));
}

function prepareValidation(value: unknown): CommandInputValidation | undefined {
  if (value === undefined) return undefined;
  if (!isNonArrayObject(value)) throw new TypeError('commandInput validation must be an object.');
  exact(value, ['message', 'level'], 'commandInput validation');
  const message = clean(value['message'], 'commandInput validation message') ?? '';
  if (message.length === 0) return undefined;
  const level = value['level'];
  if (level !== undefined && level !== 'info' && level !== 'warning' && level !== 'error') {
    throw new TypeError('commandInput validation level must be info, warning, or error.');
  }
  return { message, ...(level === undefined ? {} : { level }) };
}
function prepareTextSelection(
  value: unknown,
  textLength: number,
  owner: string,
): TextSelection | undefined {
  if (value === undefined) return undefined;
  if (!isNonArrayObject(value)) throw new TypeError(`${owner} must be an object.`);
  exact(value, ['startOffset', 'endOffsetExclusive'], owner);
  const startOffset = nonNegativeInteger(value['startOffset'], `${owner}.startOffset`);
  const endOffsetExclusive = nonNegativeInteger(
    value['endOffsetExclusive'],
    `${owner}.endOffsetExclusive`,
  );
  if (startOffset > endOffsetExclusive || endOffsetExclusive > textLength) {
    throw new RangeError(`${owner} must be ordered and within the value.`);
  }
  return { startOffset, endOffsetExclusive };
}
function preparePlacement(value: unknown, owner: string): AnchoredSurfacePlacement | undefined {
  if (value === undefined) return undefined;
  if (
    value === 'above' || value === 'below' || value === 'left' || value === 'right' ||
    value === 'auto' || value === 'cursor'
  ) return value;
  throw new TypeError(`${owner} must be above, below, left, right, auto, or cursor.`);
}
function preparePointerState(value: unknown, owner: string): PointerInteractionState | undefined {
  if (value === undefined) return undefined;
  if (!isNonArrayObject(value)) throw new TypeError(`${owner} pointerState must be an object.`);
  exact(value, ['hoveredTargetId', 'pressedTargetId'], `${owner} pointerState`);
  const hoveredTargetId = value['hoveredTargetId'];
  const pressedTargetId = value['pressedTargetId'];
  if (hoveredTargetId !== undefined && typeof hoveredTargetId !== 'string') {
    throw new TypeError(`${owner} hoveredTargetId must be a string.`);
  }
  if (pressedTargetId !== undefined && typeof pressedTargetId !== 'string') {
    throw new TypeError(`${owner} pressedTargetId must be a string.`);
  }
  return {
    ...(hoveredTargetId === undefined ? {} : { hoveredTargetId }),
    ...(pressedTargetId === undefined ? {} : { pressedTargetId }),
  };
}
function clean(value: unknown, owner: string): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string') throw new TypeError(`${owner} must be a string.`);
  return sanitizeTerminalText(value).text.replace(/\s*\n\s*/gu, ' ');
}
function nonEmpty(value: unknown, owner: string): string {
  const result = clean(value, owner);
  if (result === undefined || result.trim() === '') {
    throw new TypeError(`${owner} must be non-empty.`);
  }
  return result;
}
function optionalBoolean(value: unknown, owner: string): boolean | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'boolean') throw new TypeError(`${owner} must be a boolean.`);
  return value;
}
function nonNegativeInteger(value: unknown, owner: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${owner} must be a non-negative safe integer.`);
  }
  return value;
}
function optionalNonNegativeInteger(value: unknown, owner: string): number | undefined {
  return value === undefined ? undefined : nonNegativeInteger(value, owner);
}
function positiveInteger(value: unknown, owner: string): number | undefined {
  if (value === undefined) return undefined;
  const result = nonNegativeInteger(value, owner);
  if (result < 1) throw new RangeError(`${owner} must be positive.`);
  return result;
}
function exact(
  value: Readonly<Record<string, unknown>>,
  fields: readonly string[],
  owner: string,
): void {
  const unsupported = Object.keys(value).find((field) => !fields.includes(field));
  if (unsupported !== undefined) {
    throw new TypeError(`${owner} contains unknown field "${unsupported}".`);
  }
}
