import {
  assertComponentOptions,
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
import { isIgnoredMessage } from '../../interaction/message.ts';
import type {
  ComponentMessage,
  ComponentInput,
  ComponentRenderInput,
  Element,
  HitTarget,
} from '../../component/index.ts';
import { listbox } from './list.ts';
import { portal, surface } from '../../layout/index.ts';
import { assertOptionalEnum, isNonArrayObject } from '../../foundation/validation.ts';
import {
  pointerVisualState,
  preparePointerInteractionState,
  type PointerInteractionState,
} from '../../interaction/pointer-interaction.ts';
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
import type {
  CommandInputPresentation,
  CommandInputSubmitEvent,
  CommandInputTransition,
} from '../../ui-model/command-input.ts';
import type { SuggestionItem } from '../../ui-model/contracts.ts';
import type { CommandInputValidation } from '../../ui-model/documents.ts';
import type { TerminalStyle } from '../../visual/render.ts';
import type {
  SearchPickerAcceptEvent,
  SearchPickerPresentation,
  SearchPickerTransition,
} from '../../ui-model/search-picker.ts';
import { searchPickerWindow } from '../../behavior/search-picker.ts';
import { assertSearchPickerIndex } from '../../ui-model/search-picker-index.ts';
import { normalizeCollectionQuery } from '../../ui-model/query.ts';
import type { CommandInputStylePart, SearchPickerStylePart } from '../../ui-model/style-parts.ts';
import type {
  CommandInputOptions,
  ScrollableSearchPickerOptions,
  SearchPickerOptions,
  UnscrolledSearchPickerOptions,
} from '../options/documents.ts';
import { textEditingTriggers } from '../internal/text-key-bindings.ts';

interface CommandInputModel {
  readonly value: string;
  readonly cursor: number;
  readonly selection?: TextSelection;
  readonly historyIndex?: number;
  readonly suggestions: readonly SuggestionItem[];
  readonly activeSuggestionId?: string;
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

type CommandInputComponentOptions = Omit<
  CommandInputOptions<ComponentMessage, ComponentMessage, ComponentMessage>,
  'id' | 'disabled' | 'readOnly' | 'onTransition' | 'onSubmit' | 'onPointerAction' | 'meta'
>;

const commandSlots = {
  suggestions: { cardinality: 'optional', owner: 'implementation', messages: 'bubble' },
} as const;

type CommandInputFactory = <
  const TTransitionMessage extends ComponentMessage = never,
  const TSubmitMessage extends ComponentMessage = never,
  const TPointerMessage extends ComponentMessage = never,
>(
  options: CommandInputOptions<TTransitionMessage, TSubmitMessage, TPointerMessage>,
) => Element<TTransitionMessage | TSubmitMessage | TPointerMessage>;

type CommandInputComponentAction =
  | { readonly kind: 'transition'; readonly transition: CommandInputTransition }
  | { readonly kind: 'submit'; readonly event: CommandInputSubmitEvent }
  | { readonly kind: 'pointerLifecycle'; readonly action: import('../../interaction/pointer-interaction.ts').PointerInteractionAction };

const instantiateCommandInput = defineComponent<
  CommandInputComponentOptions,
  CommandInputModel,
  CommandInputComponentAction,
  CommandInputStylePart,
  readonly ['disabled', 'readOnly'],
  'required',
  readonly ['focus', 'layer', 'styles'],
  typeof commandSlots
>({
  name: 'terminal-ui/components/command-input',
  optionFields: {
    presentation: true,
    prompt: true,
    placeholder: true,
    completionPreview: true,
    validation: true,
    footer: true,
    matchQuery: true,
    display: true,
    placement: true,
    maxVisibleSuggestions: true,
    pointerState: true,
  } as const,
  identity: 'required',
  structure: 'composite',
  semantics: 'semantic',
  accessibleRole: 'combobox',
  slots: commandSlots,
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
    const selected = input.model.activeSuggestionId;
    const suggestions = listbox({
      id: `${input.id ?? 'command-input'}:suggestions:list`,
      items: input.model.suggestions,
      projectItem: (item: SuggestionItem) => ({
        id: item.id,
        label: item.label ?? item.value,
        ...(item.description === undefined ? {} : { description: item.description }),
        disabled: item.disabled === true,
      }),
      presentation: {
        ...(selected === undefined ? {} : { activeId: selected }),
        selection: { mode: 'none' },
      },
      onTransition: (action) =>
        action.kind === 'setActive' && action.id !== undefined
          ? input.emit(commandTransition({ kind: 'setActiveSuggestion', id: action.id }))
          : ignoreMessage(),
      onActivate: () => input.readOnly
        ? ignoreMessage()
        : input.emit(commandTransition({ kind: 'acceptSuggestion' })),
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
          onOutsidePress: () => input.emit(commandTransition({ kind: 'dismissSuggestions' })),
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
        children: suggestions.map((suggestion) => ({
          id: `${input.id}:suggestion:${suggestion.id}`,
          role: 'option' as const,
          label: suggestion.label ?? suggestion.value,
          value: suggestion.value,
          current: suggestion.id === input.model.activeSuggestionId,
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
      ...(suggestions.length === 0 || input.model.activeSuggestionId === undefined
        ? {}
        : { activeDescendant: `${input.id}:suggestion:${input.model.activeSuggestionId}` }),
      disabled: input.disabled,
      readOnly: input.readOnly,
      ...(input.focused ? { focused: true } : {}),
      ...(children.length === 0 ? {} : { children }),
    };
  },
  keys: ({ model, readOnly }) => {
    const active = activeSuggestion(model);
    const submitted = active?.disabled === true ? model.value : active?.value ?? model.value;
    return {
      triggers: textEditingTriggers(readOnly, false).map((binding) => ({
        trigger: binding.trigger,
        onKey: (event: Parameters<typeof binding.onKey>[0]) => {
          const action = binding.onKey(event);
          return isIgnoredMessage(action)
            ? action
            : commandTransition(action);
        },
      })),
      ...(readOnly ? {} : {
        backspace: () => ({
          kind: 'transition' as const,
          transition: { kind: 'edit' as const, operation: { kind: 'deleteBackward' as const } },
        }),
        delete: () => commandTransition({ kind: 'edit', operation: { kind: 'deleteForward' } }),
      }),
      arrowLeft: () => commandTransition({ kind: 'edit', operation: { kind: 'moveLeft' } }),
      arrowRight: () => commandTransition({ kind: 'edit', operation: { kind: 'moveRight' } }),
      home: () => commandTransition({ kind: 'edit', operation: { kind: 'moveHome' } }),
      end: () => commandTransition({ kind: 'edit', operation: { kind: 'moveEnd' } }),
      arrowUp: () =>
        model.suggestions.length === 0
          ? readOnly ? ignoreMessage() : commandTransition({ kind: 'historyPrevious' })
          : commandTransition({ kind: 'moveSuggestion', delta: -1 }),
      arrowDown: () =>
        model.suggestions.length === 0
          ? readOnly ? ignoreMessage() : commandTransition({ kind: 'historyNext' })
          : commandTransition({ kind: 'moveSuggestion', delta: 1 }),
      ...(readOnly || model.suggestions.length === 0
        ? {}
        : { tab: () => commandTransition({ kind: 'acceptSuggestion' }) }),
      ...(readOnly ? {} : { enter: () => ({ kind: 'submit' as const, event: { kind: 'submit' as const, value: submitted } }) }),
    };
  },
  onInput: ({ text, readOnly }) =>
    readOnly ? ignoreMessage() : commandTransition({ kind: 'edit', operation: { kind: 'insert', text } }),
  onPaste: ({ text, readOnly }) =>
    readOnly ? ignoreMessage() : commandTransition({ kind: 'edit', operation: { kind: 'insert', text } }),
  pointer: {
    state: ({ model }) => model.pointerState,
    onAction: (action) => ({ kind: 'pointerLifecycle', action }),
  },
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

export const commandInput: CommandInputFactory = (options) => {
  assertComponentOptions(options, 'commandInput', {
    fields: [
      'id', 'presentation', 'prompt', 'placeholder', 'completionPreview', 'validation',
      'footer', 'matchQuery', 'display', 'placement', 'maxVisibleSuggestions',
      'pointerState', 'disabled', 'readOnly', 'meta', 'onTransition', 'onSubmit',
      'onPointerAction',
    ],
    callbacks: options.disabled === true
      ? { onTransition: 'forbidden', onSubmit: 'forbidden', onPointerAction: 'forbidden' }
      : { onTransition: 'required', onSubmit: 'optional', onPointerAction: 'optional' },
    ...(options.disabled === true ? { forbiddenFields: ['pointerState', 'readOnly'] } : {}),
  });
  const shared = {
    id: options.id,
    presentation: options.presentation,
    ...(options.prompt === undefined ? {} : { prompt: options.prompt }),
    ...(options.placeholder === undefined ? {} : { placeholder: options.placeholder }),
    ...(options.completionPreview === undefined ? {} : { completionPreview: options.completionPreview }),
    ...(options.validation === undefined ? {} : { validation: options.validation }),
    ...(options.footer === undefined ? {} : { footer: options.footer }),
    ...(options.matchQuery === undefined ? {} : { matchQuery: options.matchQuery }),
    ...(options.display === undefined ? {} : { display: options.display }),
    ...(options.placement === undefined ? {} : { placement: options.placement }),
    ...(options.maxVisibleSuggestions === undefined ? {} : { maxVisibleSuggestions: options.maxVisibleSuggestions }),
    ...(options.pointerState === undefined ? {} : { pointerState: options.pointerState }),
    ...(options.readOnly === undefined ? {} : { readOnly: options.readOnly }),
    ...(options.meta === undefined ? {} : { meta: options.meta }),
  };
  if (options.disabled === true) return instantiateCommandInput({ ...shared, disabled: true });
  return instantiateCommandInput({
    ...shared,
    onAction: (action) => {
      if (action.kind === 'transition') return options.onTransition(action.transition);
      if (action.kind === 'submit') return options.onSubmit?.(action.event) ?? ignoreMessage();
      return options.onPointerAction?.(action.action) ?? ignoreMessage();
    },
  });
};

function commandTransition(transition: CommandInputTransition): CommandInputComponentAction {
  return { kind: 'transition', transition };
}

function prepareCommandInput(value: Readonly<CommandInputComponentOptions>): CommandInputModel {
  const presentation = prepareCommandPresentation(value.presentation);
  const display = value.display;
  assertOptionalEnum(display, ['compact', 'expanded', 'popup'], 'commandInput display');
  const maxVisibleSuggestions =
    positiveInteger(value.maxVisibleSuggestions, 'commandInput maxVisibleSuggestions') ?? 8;
  const validation = prepareValidation(value.validation);
  const pointerState = preparePointerInteractionState(value.pointerState, 'commandInput pointerState');
  const placement = preparePlacement(value.placement, 'commandInput placement');
  return {
    ...presentation,
    prompt: clean(value.prompt, 'commandInput prompt') ?? '> ',
    placeholder: clean(value.placeholder, 'commandInput placeholder') ?? '',
    completionPreview: clean(value.completionPreview, 'commandInput completionPreview') ?? '',
    ...(validation === undefined ? {} : { validation }),
    footer: clean(value.footer, 'commandInput footer') ?? '',
    matchQuery: clean(value.matchQuery, 'commandInput matchQuery') ?? presentation.value,
    display: display ?? 'compact',
    ...(placement === undefined ? {} : { placement }),
    maxVisibleSuggestions,
    ...(pointerState === undefined ? {} : { pointerState }),
  };
}

function prepareCommandPresentation(
  value: CommandInputPresentation,
): Pick<
  CommandInputModel,
  'value' | 'cursor' | 'selection' | 'historyIndex' | 'suggestions' | 'activeSuggestionId'
> {
  const text = clean(value.value, 'commandInput value') ?? '';
  const cursor = nonNegativeInteger(value.cursor, 'commandInput cursor');
  if (cursor > text.length) throw new RangeError('commandInput cursor is outside the value.');
  const suggestions = Object.freeze(value.suggestions.map(prepareSuggestion));
  const ids = suggestions.map((suggestion) => suggestion.id);
  if (new Set(ids).size !== ids.length) throw new TypeError('commandInput suggestion ids must be unique.');
  const activeSuggestionId = value.activeSuggestionId === undefined
    ? undefined
    : nonEmpty(value.activeSuggestionId, 'commandInput activeSuggestionId');
  if (activeSuggestionId !== undefined &&
    !suggestions.some((suggestion) => suggestion.id === activeSuggestionId && suggestion.disabled !== true)) {
    throw new RangeError('commandInput activeSuggestionId must reference an enabled suggestion.');
  }
  const selection = prepareTextSelection(value.selection, text.length, 'commandInput selection');
  const historyIndex = optionalNonNegativeInteger(
    value.historyIndex,
    'commandInput historyIndex',
  );
  return {
    value: text,
    cursor,
    ...(selection === undefined ? {} : { selection }),
    ...(historyIndex === undefined ? {} : { historyIndex }),
    suggestions,
    ...(activeSuggestionId === undefined ? {} : { activeSuggestionId }),
  };
}

function prepareSuggestion(value: SuggestionItem): SuggestionItem {
  const suggestionValue = clean(value.value, 'commandInput suggestion value');
  if (suggestionValue === undefined) {
    throw new TypeError('commandInput suggestion value must be a string.');
  }
  return Object.freeze({
    id: nonEmpty(value.id, 'commandInput suggestion id'),
    label: clean(value.label, 'commandInput suggestion label') ?? suggestionValue,
    value: suggestionValue,
    ...(value.description === undefined
      ? {}
      : { description: clean(value.description, 'commandInput suggestion description') ?? '' }),
    ...(optionalBoolean(value.disabled, 'commandInput suggestion disabled') === true
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
  const selected = suggestion.id === input.model.activeSuggestionId;
  const pointer = pointerVisualState(
    input.model.pointerState,
    `${input.id ?? 'command-input'}:suggestion:${suggestion.id}`,
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
): readonly HitTarget<CommandInputComponentAction>[] {
  const visual = commandInputVisual(input.model, input.bounds.width, input.widthProfile);
  const textTarget: HitTarget<CommandInputComponentAction> = {
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
      return commandTransition({ kind: 'pointer', action: { kind: 'placeCaret', offset } });
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
    ): readonly HitTarget<CommandInputComponentAction>[] =>
      suggestion.disabled === true ? [] : [{
        id: `${input.id ?? 'command-input'}:suggestion:${suggestion.id}`,
        bounds: { row: row + index, column: 0, width: input.bounds.width, height: 1 },
        cursor: 'pointer',
        focus: { kind: 'target', targetId: 'self' },
        message: () => commandTransition({ kind: 'setActiveSuggestion', id: suggestion.id }),
      }]
    ),
  ];
}

function activeSuggestion(model: CommandInputModel): SuggestionItem | undefined {
  return model.activeSuggestionId === undefined
    ? undefined
    : model.suggestions.find((suggestion) => suggestion.id === model.activeSuggestionId);
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
  | { readonly kind: 'transition'; readonly transition: SearchPickerTransition }
  | { readonly kind: 'accept'; readonly event: SearchPickerAcceptEvent }
  | { readonly kind: 'pointerLifecycle'; readonly action: import('../../interaction/pointer-interaction.ts').PointerInteractionAction };

interface SearchPickerModel {
  readonly title: string;
  readonly query: Required<import('../../ui-model/query.ts').CollectionQuery>;
  readonly rows: readonly PreparedSearchEntry[];
  readonly activeIndex?: number;
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

type SearchPickerComponentOptions = Omit<
  SearchPickerOptions<unknown, ComponentMessage, ComponentMessage, ComponentMessage>,
  'id' | 'disabled' | 'readOnly' | 'busy' | 'inert' | 'onTransition' | 'onAccept' | 'onPointerAction' | 'meta'
>;

type SearchPickerElement<
  TTransitionMessage extends ComponentMessage,
  TAcceptMessage extends ComponentMessage,
  TPointerMessage extends ComponentMessage,
> = Element<TTransitionMessage | TAcceptMessage | TPointerMessage>;

/* eslint-disable @typescript-eslint/unified-signatures -- separate overloads preserve contextual transition types */
interface SearchPickerFactory {
  <
    TValue,
    const TTransitionMessage extends ComponentMessage = never,
    const TAcceptMessage extends ComponentMessage = never,
    const TPointerMessage extends ComponentMessage = never,
  >(
    options: ScrollableSearchPickerOptions<
      TValue,
      TTransitionMessage,
      TAcceptMessage,
      TPointerMessage
    >,
  ): SearchPickerElement<TTransitionMessage, TAcceptMessage, TPointerMessage>;
  <
    TValue,
    const TTransitionMessage extends ComponentMessage = never,
    const TAcceptMessage extends ComponentMessage = never,
    const TPointerMessage extends ComponentMessage = never,
  >(
    options: UnscrolledSearchPickerOptions<
      TValue,
      TTransitionMessage,
      TAcceptMessage,
      TPointerMessage
    >,
  ): SearchPickerElement<TTransitionMessage, TAcceptMessage, TPointerMessage>;
}
/* eslint-enable @typescript-eslint/unified-signatures */

const createSearchPicker: SearchPickerFactory = <
  TValue,
  const TTransitionMessage extends ComponentMessage = never,
  const TAcceptMessage extends ComponentMessage = never,
  const TPointerMessage extends ComponentMessage = never,
>(
  options: SearchPickerOptions<TValue, TTransitionMessage, TAcceptMessage, TPointerMessage>,
) => {
  assertComponentOptions(options, 'searchPicker', {
    fields: [
      'id', 'title', 'searchPickerIndex', 'presentation', 'maxVisible',
      'helpText', 'emptyText', 'scrollbar', 'scrollPolicy', 'pointerState', 'disabled',
      'readOnly', 'busy', 'inert', 'meta', 'onTransition', 'onAccept', 'onPointerAction',
    ],
    callbacks: options.disabled === true || options.inert === true
      ? { onTransition: 'forbidden', onAccept: 'forbidden', onPointerAction: 'forbidden' }
      : { onTransition: 'required', onAccept: 'optional', onPointerAction: 'optional' },
    ...(options.disabled === true
      ? { forbiddenFields: ['pointerState', 'readOnly', 'busy', 'inert'] }
      : options.inert === true
        ? { forbiddenFields: ['readOnly'] }
      : {}),
  });
  if (options.disabled === true || options.inert === true) {
    return instantiateSearchPicker(withoutSearchPickerCallbacks(options));
  }
  const { onTransition, onAccept, onPointerAction, ...componentOptions } = options;
  return instantiateSearchPicker({
    ...componentOptions,
    onAction: (action) => {
      if (action.kind === 'transition') {
        if (action.transition.kind === 'scroll') {
          return !isScrollableSearchPicker(options)
            ? ignoreMessage()
            : options.onTransition(action.transition);
        }
        return onTransition(action.transition);
      }
      if (action.kind === 'accept') return onAccept?.(action.event) ?? ignoreMessage();
      return onPointerAction?.(action.action) ?? ignoreMessage();
    },
  });
};

type SearchPickerWithoutCallbacks<TOptions> = TOptions extends unknown
  ? Omit<TOptions, 'onTransition' | 'onAccept' | 'onPointerAction'>
  : never;

function withoutSearchPickerCallbacks<TOptions extends {
  readonly onTransition?: unknown;
  readonly onAccept?: unknown;
  readonly onPointerAction?: unknown;
}>(options: TOptions): SearchPickerWithoutCallbacks<TOptions> {
  return Object.fromEntries(Object.entries(options).filter(([field]) =>
    field !== 'onTransition' && field !== 'onAccept' && field !== 'onPointerAction'
  )) as SearchPickerWithoutCallbacks<TOptions>;
}

const instantiateSearchPicker = defineComponent<
  SearchPickerComponentOptions,
  SearchPickerModel,
  SearchPickerInternalAction,
  SearchPickerStylePart,
  readonly ['disabled', 'readOnly', 'busy', 'inert'],
  'required',
  readonly ['focus', 'layer', 'styles']
>({
  name: 'terminal-ui/components/search-picker',
  optionFields: {
    title: true,
    searchPickerIndex: true,
    maxVisible: true,
    helpText: true,
    emptyText: true,
    pointerState: true,
    presentation: true,
    scrollbar: true,
    scrollPolicy: true,
  } as const,
  identity: 'required',
  structure: 'leaf',
  semantics: 'semantic',
  accessibleRole: 'combobox',
  states: ['disabled', 'readOnly', 'busy', 'inert'],
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
        measureTextCells(input.model.query.text, { widthProfile: input.widthProfile }).cells + 2,
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
      value: input.model.query.text,
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
          current: index === input.model.activeIndex && !row.disabled,
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
  keys: ({ model, readOnly, busy }) => {
    if (busy) return {};
    const active = model.activeIndex === undefined
      ? undefined
      : model.rows[model.activeIndex];
    return {
      ...(readOnly ? {} : {
        backspace: () => searchPickerTransition({ kind: 'deleteQueryBackward' }),
      }),
      arrowUp: () => searchPickerTransition({ kind: 'moveActive', delta: -1 }),
      arrowDown: () => searchPickerTransition({ kind: 'moveActive', delta: 1 }),
      ...(active === undefined || active.disabled || readOnly
        ? {}
        : { enter: () => ({ kind: 'accept' as const, event: { kind: 'accept' as const, id: active.id } }) }),
    };
  },
  onInput: ({ text, readOnly }) => readOnly
    ? ignoreMessage()
    : searchPickerTransition({ kind: 'insertQuery', text }),
  onPaste: ({ text, readOnly }) => readOnly
    ? ignoreMessage()
    : searchPickerTransition({ kind: 'insertQuery', text }),
  pointer: {
    state: ({ model }) => model.pointerState,
    onAction: (action) => ({ kind: 'pointerLifecycle', action }),
  },
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
        message: () => ({ kind: 'accept' as const, event: { kind: 'accept' as const, id: row.id } }),
      }]
    );
    return [
      ...entryTargets,
      ...componentScrollbarHitTargets<SearchPickerInternalAction>({
        id: input.id ?? 'search-picker',
        plan,
        ...(input.model.scrollPolicy === undefined ? {} : { policy: input.model.scrollPolicy }),
        onScroll: (event) => searchPickerTransition({ kind: 'scroll', event }),
      }),
    ];
  },
});

export const searchPicker = createSearchPicker;

function isScrollableSearchPicker<
  TValue,
  TTransitionMessage extends ComponentMessage,
  TAcceptMessage extends ComponentMessage,
  TPointerMessage extends ComponentMessage,
>(options: SearchPickerOptions<TValue, TTransitionMessage, TAcceptMessage, TPointerMessage>): options is ScrollableSearchPickerOptions<TValue, TTransitionMessage, TAcceptMessage, TPointerMessage> {
  return options.presentation.scroll !== undefined;
}

function prepareSearchPicker(value: Readonly<SearchPickerComponentOptions>): SearchPickerModel {
  const index = value.searchPickerIndex;
  assertSearchPickerIndex(index);
  const presentation = prepareSearchPickerPresentation(value.presentation);
  const query = presentation.query;
  const scroll = presentation.scroll;
  const limit = positiveInteger(value.maxVisible, 'searchPicker maxVisible') ?? 8;
  const window = searchPickerWindow({
    searchPickerIndex: index,
    query,
    ...(presentation.activeId === undefined ? {} : { activeId: presentation.activeId }),
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
  const scrollbar = prepareComponentScrollbarOptions(value.scrollbar, 'searchPicker scrollbar');
  const scrollPolicy = prepareComponentScrollPolicy(
    value.scrollPolicy,
    'searchPicker scrollPolicy',
  );
  if (scroll === undefined && (scrollbar !== undefined || scrollPolicy !== undefined)) {
    throw new TypeError('searchPicker scrollbar and scrollPolicy require scroll state.');
  }
  const pointerState = preparePointerInteractionState(value.pointerState, 'searchPicker pointerState');
  return {
    title: clean(value.title, 'searchPicker title') ?? '',
    query,
    rows,
    ...(window.activeIndex === undefined ? {} : { activeIndex: window.activeIndex }),
    totalCount: window.totalCount,
    sourceCount: index.size,
    startIndex: window.startIndex,
    helpText: clean(value.helpText, 'searchPicker helpText') ?? '',
    emptyText: clean(value.emptyText, 'searchPicker emptyText') ?? 'No matches',
    ...(scroll === undefined ? {} : { scroll }),
    ...(scrollbar === undefined ? {} : { scrollbar }),
    ...(scrollPolicy === undefined ? {} : { scrollPolicy }),
    ...(pointerState === undefined ? {} : { pointerState }),
  };
}

function prepareSearchPickerPresentation(
  value: SearchPickerPresentation,
): SearchPickerPresentation & { readonly query: Required<import('../../ui-model/query.ts').CollectionQuery> } {
  if (!isNonArrayObject(value)) {
    throw new TypeError('searchPicker presentation must be an object.');
  }
  const query = normalizeCollectionQuery(value.query);
  const activeId = value.activeId === undefined
    ? undefined
    : nonEmpty(value.activeId, 'searchPicker activeId');
  const scroll = prepareComponentScrollState(value.scroll, 'searchPicker scroll');
  return {
    query,
    ...(activeId === undefined ? {} : { activeId }),
    ...(scroll === undefined ? {} : { scroll }),
  };
}

function searchPickerPlan(input: ComponentInput<SearchPickerModel>) {
  const contentRows = input.model.totalCount + 2 + searchPickerTrailingRowCount(input.model);
  const scroll = input.model.scroll ??
    {
      offsetRow: input.model.startIndex,
      offsetColumn: 0,
      followTail: false,
    };
  return prepareComponentScrollbar({
    bounds: input.bounds,
    scroll,
    contentRows,
    contentColumns: input.bounds.width,
    ...(input.model.scrollbar === undefined ? {} : { options: input.model.scrollbar }),
    defaultAxis: 'vertical',
  });
}

function searchPickerTransition(transition: SearchPickerTransition): SearchPickerInternalAction {
  return { kind: 'transition', transition };
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
        span(input.model.query.text, {
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
    const active = index === input.model.activeIndex;
    const state = row.disabled ? 'disabled' as const : active ? 'active' as const : undefined;
    const style = input.style({
      part: 'entry',
      base: { fg: { kind: 'theme', token: 'text.default' } },
      ...(state === undefined ? {} : { state }),
    });
    const prefix = active ? input.theme.tokens.symbols.pointer : ' ';
    const group = row.group === undefined ? '' : `[${row.group}] `;
    const matchIndex = input.model.query.text === ''
      ? -1
      : row.label.toLocaleLowerCase().indexOf(input.model.query.text.toLocaleLowerCase());
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
        span(row.label.slice(matchIndex, matchIndex + input.model.query.text.length), {
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
        span(row.label.slice(matchIndex + input.model.query.text.length), {
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
  return model.query.text.length === 0
    ? `${String(model.totalCount)} options`
    : `${String(model.totalCount)}/${String(model.sourceCount)} ${
      model.totalCount === 1 ? 'match' : 'matches'
    }`;
}

function selectedSearchPickerPreview(model: SearchPickerModel): string | undefined {
  return model.activeIndex === undefined ? undefined : model.rows[model.activeIndex]?.preview;
}

function searchPickerTrailingRowCount(model: SearchPickerModel): number {
  const preview = selectedSearchPickerPreview(model);
  return Number(preview !== undefined && preview.length > 0) + Number(model.helpText.length > 0);
}

function searchPickerVisibleEntryCount(model: SearchPickerModel, height: number): number {
  return Math.max(0, height - 2 - searchPickerTrailingRowCount(model));
}

function prepareValidation(value: CommandInputValidation | undefined): CommandInputValidation | undefined {
  if (value === undefined) return undefined;
  const message = clean(value.message, 'commandInput validation message') ?? '';
  if (message.length === 0) return undefined;
  const level = value.level;
  assertOptionalEnum(level, ['info', 'warning', 'error'], 'commandInput validation level');
  return { message, ...(level === undefined ? {} : { level }) };
}
function prepareTextSelection(
  value: TextSelection | undefined,
  textLength: number,
  owner: string,
): TextSelection | undefined {
  if (value === undefined) return undefined;
  const startOffset = nonNegativeInteger(value.startOffset, `${owner}.startOffset`);
  const endOffsetExclusive = nonNegativeInteger(
    value.endOffsetExclusive,
    `${owner}.endOffsetExclusive`,
  );
  if (startOffset > endOffsetExclusive || endOffsetExclusive > textLength) {
    throw new RangeError(`${owner} must be ordered and within the value.`);
  }
  return { startOffset, endOffsetExclusive };
}
function preparePlacement(
  value: AnchoredSurfacePlacement | undefined,
  owner: string,
): AnchoredSurfacePlacement | undefined {
  assertOptionalEnum(value, ['above', 'below', 'left', 'right', 'auto', 'cursor'], owner);
  return value;
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
