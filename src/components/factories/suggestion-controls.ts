import {
  clipRenderSpans,
  componentScrollbarHitTargets,
  defineComponent,
  ignoreMessage,
  paintComponentScrollbar,
  layoutComponentScrollbar,
  decodeComponentScrollbarOptions,
  decodeComponentScrollPolicy,
  decodeComponentScrollState,
  span,
} from '../../component/index.ts';
import { isIgnoredMessage } from '../../interaction/message.ts';
import { collectionInteractionHas, collectionInteractionPosition } from '../../interaction/collection-interaction.ts';
import type {
  ComponentMessage,
  ComponentInput,
  ComponentRenderInput,
  Element,
  HitTarget,
} from '../../component/index.ts';
import { listbox } from './listbox.ts';
import { allowsComponentAction } from '../internal/action-capability.ts';
import {
  inspectTextSelection,
  inspectTextValue,
  inspectValidation,
} from '../internal/inspection.ts';
import { portal, surface } from '../../layout/index.ts';
import {
  assertOptionalCallback,
  assertOptionalEnum,
  assertRequiredCallback,
  isNonArrayObject,
} from '../../foundation/validation.ts';
import {
  pointerVisualState,
} from '../../interaction/pointer-interaction.ts';
import type { ScrollPolicy, ScrollState } from '../../interaction/scroll.ts';
import type { ScrollbarOptions } from '../../interaction/scrollbar.ts';
import {
  clipTextCells,
  createTerminalTextIndex,
  editTextBuffer,
  measureTextCells,
  sanitizeTerminalText,
  segmentGraphemes,
} from '../../text/index.ts';
import type { TextSelection } from '../../text/index.ts';
import type { AnchoredSurfacePlacement } from '../../interaction/anchored-surface.ts';
import {
  popupActiveDescendantId,
  popupAllowsDismissal,
  popupRelationship,
  standardPopupDismissal,
} from '../../interaction/popup.ts';
import type {
  CommandCompletion,
  CommandInputView,
  CommandInputSubmitEvent,
  CommandInputTransition,
} from '../../behavior/command-input.ts';
import type { ListboxViewEntry, ListboxView } from '../../behavior/listbox.ts';
import { createListboxView } from '../../behavior/listbox-view.ts';
import { createListboxCollection } from '../../behavior/listbox-operations.ts';
import { isCollectionSnapshot } from '../../collection/snapshot.ts';
import type { CommandInputValidation } from '../command-input.ts';
import type { TerminalStyle } from '../../visual/render-content.ts';
import type {
  SearchPickerAcceptEvent,
  SearchPickerView,
  SearchPickerTransition,
} from '../../behavior/search-picker.ts';
import { searchPickerWindow } from '../../behavior/search-picker-operations.ts';
import { assertSearchPickerIndex } from '../../behavior/search-picker-index.ts';
import {
  matchCompiledCollectionQuery,
  compileCollectionQuery,
  indexQueryCandidate,
} from '../../text/query.ts';
import type { CompiledCollectionQuery, QueryMatchRange } from '../../text/query.ts';
import type { CommandInputStylePart, SearchPickerStylePart } from '../style-parts.ts';
import type {
  CommandInputOptions,
  ScrollableSearchPickerOptions,
  SearchPickerOptions,
  UnscrolledSearchPickerOptions,
} from '../options/patterns.ts';
import { textEditingTriggers } from '../internal/text-key-bindings.ts';
import { textPointerTarget } from '../internal/text-pointer-target.ts';
import {
  layoutSingleLineTextWindow,
} from '../internal/single-line-text-window.ts';
import type { TextContextMenuEvent } from '../../interaction/text-pointer.ts';

interface CommandInputModel {
  readonly value: string;
  readonly cursor: number;
  readonly selection?: TextSelection;
  readonly submissionIndex?: number;
  readonly suggestions: ListboxView<CommandCompletion>;
  readonly activeSuggestionId?: string;
  readonly prompt: string;
  readonly placeholder: string;
  readonly completionPreview: string;
  readonly validation?: CommandInputValidation;
  readonly footer: string;
  readonly query: CompiledCollectionQuery;
  readonly display: 'compact' | 'expanded' | 'popup';
  readonly placement?: AnchoredSurfacePlacement;
  readonly maxVisibleSuggestions: number;
}

type CommandInputComponentOptions = Omit<
  CommandInputOptions<ComponentMessage, ComponentMessage>,
  'id' | 'disabled' | 'readOnly' | 'onTransition' | 'onSubmit' | 'onContextMenu' | 'styles' | 'meta'
>;

const commandSlots = {
  suggestions: { cardinality: 'optional', owner: 'implementation', messages: 'bubble' },
} as const;

type CommandInputFactory = <
  const TTransitionMessage extends ComponentMessage = never,
  const TSubmitMessage extends ComponentMessage = never,
>(
  options: CommandInputOptions<TTransitionMessage, TSubmitMessage>,
) => Element<TTransitionMessage | TSubmitMessage>;

type CommandInputComponentAction =
  | { readonly kind: 'transition'; readonly transition: CommandInputTransition }
  | { readonly kind: 'submit'; readonly event: CommandInputSubmitEvent }
  | { readonly kind: 'contextMenu'; readonly event: TextContextMenuEvent };

const instantiateCommandInput = defineComponent<
  CommandInputComponentOptions,
  CommandInputModel,
  CommandInputComponentAction,
  CommandInputStylePart,
  readonly ['disabled', 'readOnly'],
  'required',
  readonly ['focus', 'layer', 'styles'],
  typeof commandSlots,
  readonly ['focused', 'hovered', 'pressed', 'active', 'selected', 'disabled', 'readOnly']
>({
  name: 'terminal-ui/components/command-input',
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
  visualStates: ['focused', 'hovered', 'pressed', 'active', 'selected', 'disabled', 'readOnly'],
  createModel: createCommandInputModel,
  inspection: ({ model }) => ({
    value: inspectTextValue(model.value),
    ...(model.selection === undefined ? {} : { selection: inspectTextSelection(model.selection) }),
    details: { caretOffset: model.cursor },
    ...(model.activeSuggestionId === undefined ? {} : { active: model.activeSuggestionId }),
    validation: inspectValidation(false, model.validation?.message),
    collection: {
      startIndex: model.suggestions.startIndex,
      totalCount: model.suggestions.totalCount,
      visibleCount: model.suggestions.entries.length,
    },
  }),
  implementationSlots(input) {
    if (input.model.display !== 'popup' || input.model.suggestions.entries.length === 0) {
      return { suggestions: undefined };
    }
    const selected = input.model.activeSuggestionId;
    const suggestions = listbox({
      id: `${input.id ?? 'command-input'}:suggestions:list`,
      collection: input.model.suggestions.source,
      state: {
        ...(selected === undefined ? {} : { activeId: selected }),
        selection: { mode: 'none' },
      },
      onTransition: (transition) =>
        transition.kind === 'setActive' && transition.id !== undefined
          ? input.emit(commandTransition({ kind: 'setActiveSuggestion', id: transition.id }))
          : ignoreMessage(),
      onActivate: () => !allowsComponentAction(input, 'commitSelection')
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
          onOutsidePress: () => input.emit(commandTransition({
            kind: 'dismissSuggestions',
            reason: 'outsidePress'
          })),
          meta: { layer: { zIndex: 20, underlay: 'clear' } },
        },
      ),
    };
  },
  measure(input) {
    const value = input.model.value.length === 0 ? input.model.placeholder : input.model.value;
    const expandedRows = input.model.display === 'expanded'
      ? Math.min(input.model.suggestions.entries.length, input.model.maxVisibleSuggestions)
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
    const relationship = popupRelationship(input.id);
    const suggestions = input.model.display === 'compact' ? [] : input.model.suggestions.entries;
    const children = [
      ...(input.model.validation === undefined ? [] : [{
        id: `${input.id}:validation`,
        role: 'status' as const,
        label: input.model.validation.level ?? 'error',
        value: input.model.validation.message,
      }]),
      ...(suggestions.length === 0 ? [] : [{
        id: relationship.popupId,
        role: 'listbox' as const,
        label: 'Suggestions',
        window: {
          startIndex: input.model.suggestions.startIndex,
          endIndexExclusive: input.model.suggestions.startIndex + suggestions.length,
          totalCount: input.model.suggestions.totalCount,
          omittedBefore: input.model.suggestions.startIndex,
          omittedAfter: Math.max(
            0,
            input.model.suggestions.totalCount - input.model.suggestions.startIndex - suggestions.length,
          ),
        },
        children: suggestions.map((suggestion) => ({
          id: `${relationship.popupId}:item:${suggestion.id}`,
          role: 'option' as const,
          label: suggestion.option.label,
          value: suggestion.value.text,
          current: suggestion.id === input.model.activeSuggestionId,
          disabled: suggestion.option.disabled,
          position: {
            positionInSet: suggestion.itemIndex + 1,
            setSize: input.model.suggestions.totalCount,
          },
        })),
      }]),
    ];
    return {
      id: input.id,
      role: 'combobox',
      ...(input.model.prompt === '' ? {} : { label: input.model.prompt }),
      value: input.model.value,
      textPosition: {
        caretOffset: input.model.cursor,
        ...(input.model.selection === undefined ? {} : { selection: input.model.selection }),
      },
      expanded: suggestions.length > 0,
      ...(suggestions.length === 0 ? {} : { controls: relationship.popupId }),
      ...(suggestions.length === 0 || input.model.activeSuggestionId === undefined
        ? {}
        : { activeDescendant: popupActiveDescendantId(relationship, input.model.activeSuggestionId) }),
      disabled: input.disabled,
      readOnly: input.readOnly,
      ...(input.focused ? { focused: true } : {}),
      ...(children.length === 0 ? {} : { children }),
    };
  },
  keys: ({ model, readOnly }) => {
    const availability = { readOnly };
    const canEdit = allowsComponentAction(availability, 'edit');
    const canCommitSelection = allowsComponentAction(availability, 'commitSelection');
    const canActivate = allowsComponentAction(availability, 'activate');
    const canChangeStructure = allowsComponentAction(availability, 'changeStructure');
    const active = activeSuggestion(model);
    const submitted = active === undefined || active.option.disabled
      ? model.value
      : editTextBuffer(
          { text: model.value, cursor: model.cursor, ...(model.selection === undefined ? {} : { selection: model.selection }) },
          { kind: 'replaceRange', range: active.value.range, text: active.value.text }
        ).text;
    return {
      triggers: [
        ...textEditingTriggers(!canEdit, false).map((binding) => ({
          trigger: binding.trigger,
          onKey: (event: Parameters<typeof binding.onKey>[0]) => {
            const action = binding.onKey(event);
            return isIgnoredMessage(action)
              ? action
              : commandTransition(action);
          },
        })),
        ...(canChangeStructure ? commandInputHistoryTriggers() : [])
      ],
      arrowUp: () =>
        model.suggestions.entries.length === 0
          ? canEdit ? commandTransition({ kind: 'historyPrevious' }) : ignoreMessage()
          : commandTransition({ kind: 'moveSuggestion', delta: -1 }),
      arrowDown: () =>
        model.suggestions.entries.length === 0
          ? canEdit ? commandTransition({ kind: 'historyNext' }) : ignoreMessage()
          : commandTransition({ kind: 'moveSuggestion', delta: 1 }),
      ...(!canCommitSelection || model.suggestions.entries.length === 0
        ? {}
        : { tab: () => commandTransition({ kind: 'acceptSuggestion' }) }),
      ...(model.suggestions.entries.length === 0 || !popupAllowsDismissal(standardPopupDismissal, 'escape')
        ? {}
        : { escape: () => commandTransition({ kind: 'dismissSuggestions', reason: 'escape' }) }),
      ...(canActivate ? { enter: () => ({ kind: 'submit' as const, event: { kind: 'submit' as const, value: submitted } }) } : {}),
    };
  },
  onInput: ({ text, readOnly }) =>
    allowsComponentAction({ readOnly }, 'edit')
      ? commandTransition({ kind: 'edit', operation: { kind: 'insert', text } })
      : ignoreMessage(),
  onPaste: ({ text, readOnly }) =>
    allowsComponentAction({ readOnly }, 'edit')
      ? commandTransition({ kind: 'edit', operation: { kind: 'insert', text } })
      : ignoreMessage(),
  onFocus: (event, { model }) => event.kind === 'focusLeave'
    && model.suggestions.entries.length > 0
    && popupAllowsDismissal(standardPopupDismissal, 'focusLoss')
    ? commandTransition({ kind: 'dismissSuggestions', reason: 'focusLoss' })
    : ignoreMessage(),
  focusTargets: (input) => {
    const visual = commandInputVisual(input.model, input.bounds.width, input.widthProfile);
    const cursorStyle = input.style({
      part: 'cursor',
      states: ['focused'],
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
          Math.min(
            Math.max(0, input.bounds.width - 1),
            visual.promptCells + visual.window.cursorColumn,
          ),
        ),
        ...(cursorStyle === undefined ? {} : { style: cursorStyle }),
        source: input.frameSource({ cellRole: 'cursor', partName: 'cursor', partType: 'cursor' }),
      },
    }];
  },
  hitTargets: commandInputHitTargets,
});

export const commandInput: CommandInputFactory = (options) => {
  const shared = {
    id: options.id,
    view: options.view,
    ...(options.prompt === undefined ? {} : { prompt: options.prompt }),
    ...(options.placeholder === undefined ? {} : { placeholder: options.placeholder }),
    ...(options.completionPreview === undefined ? {} : { completionPreview: options.completionPreview }),
    ...(options.validation === undefined ? {} : { validation: options.validation }),
    ...(options.footer === undefined ? {} : { footer: options.footer }),
    ...(options.query === undefined ? {} : { query: options.query }),
    ...(options.display === undefined ? {} : { display: options.display }),
    ...(options.placement === undefined ? {} : { placement: options.placement }),
    ...(options.maxVisibleSuggestions === undefined ? {} : { maxVisibleSuggestions: options.maxVisibleSuggestions }),
    ...(options.readOnly === undefined ? {} : { readOnly: options.readOnly }),
    ...(options.styles === undefined ? {} : { styles: options.styles }),
    ...(options.meta === undefined ? {} : { meta: options.meta }),
  };
  if (options.disabled === true) return instantiateCommandInput({ ...shared, disabled: true });
  assertRequiredCallback(options.onTransition, 'commandInput onTransition');
  assertOptionalCallback(options.onSubmit, 'commandInput onSubmit');
  return instantiateCommandInput({
    ...shared,
    onAction: (action) => {
      if (action.kind === 'transition') return options.onTransition(action.transition);
      if (action.kind === 'contextMenu') return options.onContextMenu?.(action.event) ?? ignoreMessage();
      return options.onSubmit?.(action.event) ?? ignoreMessage();
    },
  });
};

function commandTransition(transition: CommandInputTransition): CommandInputComponentAction {
  return { kind: 'transition', transition };
}

function createCommandInputModel(value: Readonly<CommandInputComponentOptions>): CommandInputModel {
  const view = decodeCommandInputView(value.view);
  const display = value.display;
  assertOptionalEnum(display, ['compact', 'expanded', 'popup'], 'commandInput display');
  const maxVisibleSuggestions =
    positiveInteger(value.maxVisibleSuggestions, 'commandInput maxVisibleSuggestions') ?? 8;
  const validation = decodeValidation(value.validation);
  const placement = decodePlacement(value.placement, 'commandInput placement');
  return {
    ...view,
    prompt: clean(value.prompt, 'commandInput prompt') ?? '> ',
    placeholder: clean(value.placeholder, 'commandInput placeholder') ?? '',
    completionPreview: clean(value.completionPreview, 'commandInput completionPreview') ?? '',
    ...(validation === undefined ? {} : { validation }),
    footer: clean(value.footer, 'commandInput footer') ?? '',
    query: compileCollectionQuery(value.query ?? { text: view.value, mode: 'contains' }),
    display: display ?? 'compact',
    ...(placement === undefined ? {} : { placement }),
    maxVisibleSuggestions,
  };
}

function decodeCommandInputView(
  value: CommandInputView,
): Pick<
  CommandInputModel,
  'value' | 'cursor' | 'selection' | 'submissionIndex' | 'suggestions' | 'activeSuggestionId'
> {
  if (!isNonArrayObject(value.input)) throw new TypeError('commandInput input must be an object.');
  const text = clean(value.input.text, 'commandInput input text') ?? '';
  const cursor = nonNegativeInteger(value.input.cursor, 'commandInput input cursor');
  if (cursor > text.length) throw new RangeError('commandInput cursor is outside the value.');
  if (!isCollectionSnapshot(value.suggestions)) {
    throw new TypeError('commandInput suggestions must be a retained listbox collection.');
  }
  if (typeof value.open !== 'boolean') throw new TypeError('commandInput open must be a boolean.');
  const suggestions = value.open
    ? createListboxView(value.suggestions)
    : emptyCommandInputSuggestions;
  const activeSuggestionId = value.activeSuggestionId === undefined
    ? undefined
    : nonEmpty(value.activeSuggestionId, 'commandInput activeSuggestionId');
  if (activeSuggestionId !== undefined &&
    !collectionInteractionHas(suggestions.interactionIndex, activeSuggestionId)) {
    throw new RangeError('commandInput activeSuggestionId must reference an enabled suggestion.');
  }
  if (!value.open && activeSuggestionId !== undefined) {
    throw new RangeError('commandInput activeSuggestionId requires an open popup.');
  }
  const selection = decodeTextSelection(value.input.selection, text.length, 'commandInput input selection');
  const submissionIndex = optionalNonNegativeInteger(
    value.submissionIndex,
    'commandInput submissionIndex',
  );
  return {
    value: text,
    cursor,
    ...(selection === undefined ? {} : { selection }),
    ...(submissionIndex === undefined ? {} : { submissionIndex }),
    suggestions,
    ...(activeSuggestionId === undefined ? {} : { activeSuggestionId }),
  };
}

const emptyCommandInputSuggestions = createListboxView(
  createListboxCollection<never>([], () => {
    throw new Error('Empty command suggestions cannot contain an item.');
  }),
);

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
      ? { states: ['disabled'] as const }
      : input.focus === 'self'
      ? { states: ['focused'] as const }
      : {}),
  });
  for (let row = 0; row < input.bounds.height; row += 1) {
    input.target.write(row, 0, [span(' '.repeat(input.bounds.width), {
      ...(fieldStyle === undefined ? {} : { style: fieldStyle }),
      source: input.frameSource({
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
      source: input.frameSource({
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
      base: { fg: { kind: 'theme', token: 'input.placeholder' } },
    });
    line.push(
      span(
        clipTextCells(input.model.placeholder, visual.contentWidth, {
          widthProfile: input.widthProfile,
        }).text,
        {
          ...(placeholderStyle === undefined ? {} : { style: placeholderStyle }),
          source: input.frameSource({
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
      measureTextCells(visual.window.visibleText, { widthProfile: input.widthProfile }).cells +
      Number(visual.window.clippedBefore);
    const completionWidth = Math.max(0, visual.contentWidth - visibleCells);
    if (
      !visual.window.clippedAfter
      && completionWidth > 0
      && input.model.completionPreview.length > 0
    ) {
      const completionStyle = input.style({
        part: 'completion',
        base: { fg: { kind: 'theme', token: 'input.placeholder' } },
      });
      line.push(
        span(
          clipTextCells(input.model.completionPreview, completionWidth, {
            widthProfile: input.widthProfile,
          }).text,
          {
            ...(completionStyle === undefined ? {} : { style: completionStyle }),
            source: input.frameSource({
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
        source: input.frameSource({
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
    input.model.suggestions.entries.slice(0, available).forEach((suggestion, index) => {
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
          source: input.frameSource({
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
  readonly window: import('../internal/single-line-text-window.ts').SingleLineTextWindow;
}

function searchPickerInputVisual(
  model: SearchPickerModel,
  width: number,
  widthProfile: import('../../text/index.ts').TextWidthProfile,
): import('../internal/single-line-text-window.ts').SingleLineTextWindow {
  return layoutSingleLineTextWindow(
    model.input.text,
    model.input.cursor,
    Math.max(0, width - 2),
    widthProfile,
  );
}

function commandInputVisual(
  model: CommandInputModel,
  width: number,
  widthProfile: import('../../text/index.ts').TextWidthProfile,
): CommandInputVisual {
  const promptCells = measureTextCells(model.prompt, { widthProfile }).cells;
  const contentWidth = Math.max(0, width - promptCells);
  return {
    promptCells,
    contentWidth,
    window: layoutSingleLineTextWindow(model.value, model.cursor, contentWidth, widthProfile),
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
): import('../../visual/render-content.ts').RenderSpan[] {
  const spans: import('../../visual/render-content.ts').RenderSpan[] = [];
  if (visual.window.clippedBefore) {
    spans.push(span('‹', {
      source: input.frameSource({ partName: 'window', partType: 'window', cellRole: 'decoration' }),
    }));
  }
  const selection = input.model.selection;
  for (const grapheme of segmentGraphemes(input.model.value)) {
    if (
      grapheme.startOffset < visual.window.startOffset
      || grapheme.startOffset >= visual.window.endOffsetExclusive
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
        ? { states: ['disabled'] as const }
        : input.focus === 'self'
        ? { states: ['focused'] as const }
        : {}),
    });
    spans.push(span(grapheme.text, {
      ...(style === undefined ? {} : { style }),
      source: input.frameSource({
        partName: selected ? 'selection' : 'value',
        partType: selected ? 'selection' : 'value',
        description: selected ? 'selection' : 'value',
        cellRole: 'text',
      }),
    }));
  }
  if (input.model.submissionIndex !== undefined) {
    const style = input.style({
      part: 'placeholder',
      base: { fg: { kind: 'theme', token: 'text.muted' }, dim: true },
    });
    spans.push(span(`  #${String(input.model.submissionIndex + 1)}`, {
      ...(style === undefined ? {} : { style }),
      source: input.frameSource({ partName: 'history', partType: 'history', cellRole: 'text' }),
    }));
  }
  return spans;
}

function commandSuggestionSpans(
  input: ComponentRenderInput<CommandInputModel, CommandInputStylePart>,
  suggestion: ListboxViewEntry<CommandCompletion>,
  index: number,
): import('../../visual/render-content.ts').RenderSpan[] {
  const selected = suggestion.id === input.model.activeSuggestionId;
  const pointer = pointerVisualState(
    input.pointerState,
    `${input.id ?? 'command-input'}:suggestion:${suggestion.id}`,
  );
  const state = suggestion.option.disabled
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
    ...(state === undefined ? {} : { states: [state] }),
  });
  const label = suggestion.option.label;
  const matches = matchCompiledCollectionQuery(
    indexQueryCandidate({ id: suggestion.id, primary: label }),
    input.model.query,
  )?.ranges.filter((range) => range.field === 'primary') ?? [];
  const matchStyle = matches.length > 0
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
        source: input.frameSource({
          partName: `suggestion.${String(index)}.marker`,
          partType: 'marker',
          description: `suggestion.${String(index)}.marker`,
          cellRole: 'decoration',
          itemIndex: index,
          ...(state === undefined ? {} : { interactionState: state }),
        }),
      },
    ),
    ...queryLabelSpans(label, matches, rowStyle, matchStyle, (matched) => input.frameSource({
      partName: matched
        ? `suggestion.${String(index)}.match`
        : `suggestion.${String(index)}.label`,
      partType: matched ? 'match' : 'label',
      description: matched
        ? `suggestion.${String(index)}.match`
        : `suggestion.${String(index)}.label`,
      cellRole: 'text',
      itemIndex: index,
      ...(state === undefined ? {} : { interactionState: state }),
    })),
    ...(suggestion.option.description === undefined ? [] : [span(` · ${suggestion.option.description}`, {
      ...(rowStyle === undefined ? {} : { style: rowStyle }),
      source: input.frameSource({
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
      source: input.frameSource({
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

function queryLabelSpans(
  label: string,
  ranges: readonly QueryMatchRange[],
  baseStyle: TerminalStyle | undefined,
  matchStyle: TerminalStyle | undefined,
  source: (matched: boolean) => import('../../visual/frame-source.ts').FrameCellSource,
): import('../../visual/render-content.ts').RenderSpan[] {
  if (ranges.length === 0) {
    return [span(label, {
      ...(baseStyle === undefined ? {} : { style: baseStyle }),
      source: source(false),
    })];
  }
  const spans: import('../../visual/render-content.ts').RenderSpan[] = [];
  let cursor = 0;
  for (const range of ranges) {
    if (range.start > cursor) {
      spans.push(span(label.slice(cursor, range.start), {
        ...(baseStyle === undefined ? {} : { style: baseStyle }),
        source: source(false),
      }));
    }
    if (range.end > range.start) {
      spans.push(span(label.slice(range.start, range.end), {
        ...(matchStyle === undefined ? {} : { style: matchStyle }),
        source: source(true),
      }));
    }
    cursor = Math.max(cursor, range.end);
  }
  if (cursor < label.length) {
    spans.push(span(label.slice(cursor), {
      ...(baseStyle === undefined ? {} : { style: baseStyle }),
      source: source(false),
    }));
  }
  return spans;
}

function commandInputHitTargets(
  input: ComponentInput<CommandInputModel>,
): readonly HitTarget<CommandInputComponentAction>[] {
  const visual = commandInputVisual(input.model, input.bounds.width, input.widthProfile);
  const textIndex = createTerminalTextIndex(input.model.value, {
    widthProfile: input.widthProfile,
  });
  const textTarget = textPointerTarget<CommandInputComponentAction>({
    id: `${input.id ?? 'command-input'}:text`,
    bounds: input.bounds,
    ...(input.model.selection === undefined ? {} : { selection: input.model.selection }),
    focusTargetId: 'self',
    offsetAt(event, origin) {
      const localColumn = origin === 'press'
        ? event.pressLocalColumn ?? event.localColumn ?? 1
        : event.localColumn ?? 1;
      const column = visual.window.offsetCells + Math.max(
        0,
        localColumn - 1 - visual.promptCells - Number(visual.window.clippedBefore),
      );
      return textIndex.graphemeIndexToCodeUnitOffset(
        textIndex.visualColumnToGraphemeIndex(column),
      );
    },
    wordSelectionAt: (offset) => textIndex.wordSelectionAt(offset),
    onPointer: (transition) => commandTransition({ kind: 'pointer', transition }),
    onContextMenu: (event) => ({ kind: 'contextMenu', event }),
  });
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
    ...input.model.suggestions.entries.slice(0, available).flatMap((
      suggestion,
      index,
    ): readonly HitTarget<CommandInputComponentAction>[] =>
      suggestion.option.disabled ? [] : [{
        id: `${input.id ?? 'command-input'}:suggestion:${suggestion.id}`,
        bounds: { row: row + index, column: 0, width: input.bounds.width, height: 1 },
        cursor: 'pointer',
        focus: { kind: 'target', targetId: 'self' },
        message: () => commandTransition({ kind: 'setActiveSuggestion', id: suggestion.id }),
      }]
    ),
  ];
}

function activeSuggestion(model: CommandInputModel): ListboxViewEntry<CommandCompletion> | undefined {
  if (model.activeSuggestionId === undefined) return undefined;
  const position = collectionInteractionPosition(model.suggestions.interactionIndex, model.activeSuggestionId);
  return position === undefined ? undefined : model.suggestions.selectable[position];
}

function commandInputHistoryTriggers() {
  return [
    {
      trigger: { kind: 'key' as const, key: 'z' as const, modifiers: { ctrl: true } },
      onKey: () => commandTransition({ kind: 'undo' })
    },
    {
      trigger: { kind: 'key' as const, key: 'y' as const, modifiers: { ctrl: true } },
      onKey: () => commandTransition({ kind: 'redo' })
    },
    {
      trigger: {
        kind: 'key' as const,
        key: 'z' as const,
        modifiers: { ctrl: true, shift: true }
      },
      onKey: () => commandTransition({ kind: 'redo' })
    }
  ];
}

interface SearchEntryModel {
  readonly id: string;
  readonly itemIndex: number;
  readonly label: string;
  readonly description?: string;
  readonly preview?: string;
  readonly group?: string;
  readonly disabled: boolean;
  readonly matches: readonly QueryMatchRange[];
}

type SearchPickerComponentAction =
  | { readonly kind: 'transition'; readonly transition: SearchPickerTransition }
  | { readonly kind: 'accept'; readonly event: SearchPickerAcceptEvent }
  | { readonly kind: 'contextMenu'; readonly event: TextContextMenuEvent };

interface SearchPickerModel {
  readonly title: string;
  readonly input: import('../../text/index.ts').TextEditBuffer;
  readonly query: CompiledCollectionQuery;
  readonly rows: readonly SearchEntryModel[];
  readonly activeIndex?: number;
  readonly activeId?: string;
  readonly activeDisabled: boolean;
  readonly totalCount: number;
  readonly sourceCount: number;
  readonly startIndex: number;
  readonly helpText: string;
  readonly emptyText: string;
  readonly scroll?: ScrollState;
  readonly scrollbar?: ScrollbarOptions;
  readonly scrollPolicy?: ScrollPolicy;
}

type SearchPickerComponentOptions = Omit<
  SearchPickerOptions<unknown, ComponentMessage, ComponentMessage>,
  'id' | 'disabled' | 'readOnly' | 'busy' | 'inert' | 'onTransition' | 'onAccept' | 'onContextMenu' | 'styles' | 'meta'
>;

/* eslint-disable @typescript-eslint/unified-signatures -- separate overloads preserve contextual transition types */
interface SearchPickerFactory {
  <
    TValue,
    const TTransitionMessage extends ComponentMessage = never,
    const TAcceptMessage extends ComponentMessage = never,
  >(
    options: ScrollableSearchPickerOptions<
      TValue,
      TTransitionMessage,
      TAcceptMessage
    >,
  ): Element<TTransitionMessage | TAcceptMessage>;
  <
    TValue,
    const TTransitionMessage extends ComponentMessage = never,
    const TAcceptMessage extends ComponentMessage = never,
  >(
    options: UnscrolledSearchPickerOptions<
      TValue,
      TTransitionMessage,
      TAcceptMessage
    >,
  ): Element<TTransitionMessage | TAcceptMessage>;
}
/* eslint-enable @typescript-eslint/unified-signatures */

const createSearchPicker: SearchPickerFactory = <
  TValue,
  const TTransitionMessage extends ComponentMessage = never,
  const TAcceptMessage extends ComponentMessage = never,
>(
  options: SearchPickerOptions<TValue, TTransitionMessage, TAcceptMessage>,
) => {
  if (options.disabled === true || options.inert === true) {
    return instantiateSearchPicker(withoutSearchPickerCallbacks(options));
  }
  assertRequiredCallback(options.onTransition, 'searchPicker onTransition');
  assertOptionalCallback(options.onAccept, 'searchPicker onAccept');
  const { onTransition, onAccept, onContextMenu, ...componentOptions } = options;
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
      if (action.kind === 'contextMenu') {
        return onContextMenu?.(action.event) ?? ignoreMessage();
      }
      return onAccept?.(action.event) ?? ignoreMessage();
    },
  });
};

type SearchPickerWithoutCallbacks<TOptions> = TOptions extends unknown
  ? Omit<TOptions, 'onTransition' | 'onAccept' | 'onContextMenu'>
  : never;

function withoutSearchPickerCallbacks<TOptions extends {
  readonly onTransition?: unknown;
  readonly onAccept?: unknown;
  readonly onContextMenu?: unknown;
}>(options: TOptions): SearchPickerWithoutCallbacks<TOptions> {
  return Object.fromEntries(Object.entries(options).filter(([field]) =>
    field !== 'onTransition' && field !== 'onAccept' && field !== 'onContextMenu'
  )) as SearchPickerWithoutCallbacks<TOptions>;
}

const instantiateSearchPicker = defineComponent<
  SearchPickerComponentOptions,
  SearchPickerModel,
  SearchPickerComponentAction,
  SearchPickerStylePart,
  readonly ['disabled', 'readOnly', 'busy', 'inert'],
  'required',
  readonly ['focus', 'layer', 'styles'],
  readonly ['focused', 'hovered', 'pressed', 'active', 'selected', 'disabled', 'busy', 'readOnly']
>({
  name: 'terminal-ui/components/search-picker',
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
    'scrollbarTrack', 'scrollbarThumb',
  ],
  visualStates: ['focused', 'hovered', 'pressed', 'active', 'selected', 'disabled', 'busy', 'readOnly'],
  createModel: createSearchPickerModel,
  inspection: ({ model }) => {
    return {
      value: inspectTextValue(model.input.text),
      ...(model.input.selection === undefined
        ? {}
        : { selection: inspectTextSelection(model.input.selection) }),
      details: { caretOffset: model.input.cursor },
      ...(model.activeId === undefined ? {} : { active: model.activeId }),
      collection: {
        startIndex: model.startIndex,
        totalCount: model.totalCount,
        visibleCount: model.rows.length,
      },
    };
  },
  measure(input) {
    return {
      minWidth: 1,
      minHeight: 1,
      preferredWidth: Math.max(
        16,
        measureTextCells(input.model.title, { widthProfile: input.widthProfile }).cells,
        measureTextCells(input.model.input.text, { widthProfile: input.widthProfile }).cells + 2,
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
      ...(input.model.title === '' ? {} : { label: input.model.title }),
      value: input.model.input.text,
      textPosition: {
        caretOffset: input.model.input.cursor,
        ...(input.model.input.selection === undefined
          ? {}
          : { selection: input.model.input.selection }),
      },
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
    const availability = { busy, readOnly };
    if (!allowsComponentAction(availability, 'navigate')) return {};
    const canEdit = allowsComponentAction(availability, 'edit');
    const canActivate = allowsComponentAction(availability, 'activate');
    const activeId = model.activeId;
    return {
      triggers: [
        ...textEditingTriggers(!canEdit, false).map((binding) => ({
          trigger: binding.trigger,
          onKey: (event: Parameters<typeof binding.onKey>[0]) => {
            const action = binding.onKey(event);
            return isIgnoredMessage(action) ? action : searchPickerTransition(action);
          },
        })),
        ...(canEdit ? [{
          trigger: { kind: 'key' as const, key: 'z' as const, modifiers: { ctrl: true } },
          onKey: () => searchPickerTransition({ kind: 'undo' as const }),
        }, {
          trigger: { kind: 'key' as const, key: 'y' as const, modifiers: { ctrl: true } },
          onKey: () => searchPickerTransition({ kind: 'redo' as const }),
        }] : []),
      ],
      arrowUp: () => searchPickerTransition({ kind: 'moveActive', delta: -1 }),
      arrowDown: () => searchPickerTransition({ kind: 'moveActive', delta: 1 }),
      ...(activeId === undefined || model.activeDisabled || !canActivate
        ? {}
        : { enter: () => ({ kind: 'accept' as const, event: { kind: 'accept' as const, id: activeId } }) }),
    };
  },
  onInput: ({ text, readOnly }) => allowsComponentAction({ readOnly }, 'edit')
    ? searchPickerTransition({ kind: 'edit', operation: { kind: 'insert', text } })
    : ignoreMessage(),
  onPaste: ({ text, readOnly }) => allowsComponentAction({ readOnly }, 'edit')
    ? searchPickerTransition({ kind: 'edit', operation: { kind: 'insert', text } })
    : ignoreMessage(),
  focusTargets(input) {
    const visual = searchPickerInputVisual(input.model, input.bounds.width, input.widthProfile);
    return [{
      id: 'self',
      bounds: input.bounds,
      cursor: {
        row: 1,
        column: Math.max(0, Math.min(Math.max(0, input.bounds.width - 1), 2 + visual.cursorColumn)),
      },
    }];
  },
  hitTargets(input) {
    if (input.busy) return [];
    const plan = searchPickerPlan(input);
    const visual = searchPickerInputVisual(input.model, plan.contentBounds.width, input.widthProfile);
    const index = createTerminalTextIndex(input.model.input.text, { widthProfile: input.widthProfile });
    const queryTarget = textPointerTarget<SearchPickerComponentAction>({
      id: `${input.id ?? 'search-picker'}:query`,
      bounds: {
        row: plan.contentBounds.row + 1,
        column: plan.contentBounds.column,
        width: plan.contentBounds.width,
        height: Math.min(1, plan.contentBounds.height),
      },
      ...(input.model.input.selection === undefined ? {} : { selection: input.model.input.selection }),
      focusTargetId: 'self',
      offsetAt(event, origin) {
        const local = origin === 'press'
          ? event.pressLocalColumn ?? event.localColumn ?? 1
          : event.localColumn ?? 1;
        const column = visual.offsetCells + Math.max(
          0,
          local - 3 - Number(visual.clippedBefore),
        );
        return index.graphemeIndexToCodeUnitOffset(index.visualColumnToGraphemeIndex(column));
      },
      wordSelectionAt: (offset) => index.wordSelectionAt(offset),
      onPointer: (transition) => searchPickerTransition({ kind: 'pointer', transition }),
      onContextMenu: (event) => ({ kind: 'contextMenu', event }),
    });
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
        message: () => allowsComponentAction(input, 'activate')
          ? ({ kind: 'accept' as const, event: { kind: 'accept' as const, id: row.id } })
          : searchPickerTransition({ kind: 'setActive', id: row.id }),
      }]
    );
    return [
      queryTarget,
      ...entryTargets,
      ...componentScrollbarHitTargets<SearchPickerComponentAction>({
        id: input.id ?? 'search-picker',
        plan,
        ...(input.model.scrollPolicy === undefined ? {} : { policy: input.model.scrollPolicy }),
        onScroll: (request) => searchPickerTransition({ kind: 'scroll', request }),
      }),
    ];
  },
});

export const searchPicker = createSearchPicker;

function isScrollableSearchPicker<
  TValue,
  TTransitionMessage extends ComponentMessage,
  TAcceptMessage extends ComponentMessage,
>(options: SearchPickerOptions<TValue, TTransitionMessage, TAcceptMessage>): options is ScrollableSearchPickerOptions<TValue, TTransitionMessage, TAcceptMessage> {
  return options.view.scroll !== undefined;
}

function createSearchPickerModel(value: Readonly<SearchPickerComponentOptions>): SearchPickerModel {
  const index = value.searchPickerIndex;
  assertSearchPickerIndex(index);
  const view = decodeSearchPickerView(value.view);
  const query = view.query;
  const scroll = view.scroll;
  const limit = positiveInteger(value.maxVisible, 'searchPicker maxVisible') ?? 8;
  const window = searchPickerWindow({
    searchPickerIndex: index,
    query,
    ...(view.activeId === undefined ? {} : { activeId: view.activeId }),
    ...(scroll === undefined ? {} : { scroll }),
    limit,
  });
  const rows = Object.freeze(
    window.entries.map((entry, position): SearchEntryModel => {
      const matches = matchCompiledCollectionQuery(indexQueryCandidate({
        id: entry.id,
        primary: entry.label,
        secondary: [entry.description, ...(entry.keywords ?? [])]
          .filter((item): item is string => item !== undefined),
      }), query)?.ranges.filter((range) => range.field === 'primary') ?? [];
      return Object.freeze({
        id: entry.id,
        itemIndex: window.startIndex + position,
        label: entry.label,
        ...(entry.description === undefined ? {} : { description: entry.description }),
        ...(entry.preview === undefined ? {} : { preview: entry.preview }),
        ...(entry.group === undefined ? {} : { group: entry.group }),
        disabled: entry.disabled === true,
        matches: Object.freeze(matches),
      });
    }),
  );
  const scrollbar = decodeComponentScrollbarOptions(value.scrollbar, 'searchPicker scrollbar');
  const scrollPolicy = decodeComponentScrollPolicy(
    value.scrollPolicy,
    'searchPicker scrollPolicy',
  );
  if (scroll === undefined && (scrollbar !== undefined || scrollPolicy !== undefined)) {
    throw new TypeError('searchPicker scrollbar and scrollPolicy require scroll state.');
  }
  return {
    title: clean(value.title, 'searchPicker title') ?? '',
    input: view.input,
    query,
    rows,
    ...(window.activeIndex === undefined ? {} : { activeIndex: window.activeIndex }),
    ...(window.activeEntry === undefined ? {} : { activeId: window.activeEntry.id }),
    activeDisabled: window.activeEntry?.disabled === true,
    totalCount: window.totalCount,
    sourceCount: index.size,
    startIndex: window.startIndex,
    helpText: clean(value.helpText, 'searchPicker helpText') ?? '',
    emptyText: clean(value.emptyText, 'searchPicker emptyText') ?? 'No matches',
    ...(scroll === undefined ? {} : { scroll }),
    ...(scrollbar === undefined ? {} : { scrollbar }),
    ...(scrollPolicy === undefined ? {} : { scrollPolicy }),
  };
}

function decodeSearchPickerView(
  value: SearchPickerView,
): {
  readonly input: import('../../text/index.ts').TextEditBuffer;
  readonly query: CompiledCollectionQuery;
  readonly activeId?: string;
  readonly scroll?: ScrollState;
} {
  if (!isNonArrayObject(value)) {
    throw new TypeError('searchPicker view must be an object.');
  }
  if (!isNonArrayObject(value.input)) {
    throw new TypeError('searchPicker view input must be an object.');
  }
  const text = clean(value.input.text, 'searchPicker input text') ?? '';
  const cursor = nonNegativeInteger(value.input.cursor, 'searchPicker input cursor');
  if (cursor > text.length) throw new RangeError('searchPicker input cursor is outside the text.');
  const selection = decodeTextSelection(
    value.input.selection,
    text.length,
    'searchPicker input selection',
  );
  const input = Object.freeze({
    text,
    cursor,
    ...(selection === undefined ? {} : { selection }),
  });
  const query = compileCollectionQuery({ text, ...value.query });
  const activeId = value.activeId === undefined
    ? undefined
    : nonEmpty(value.activeId, 'searchPicker activeId');
  const scroll = decodeComponentScrollState(value.scroll, 'searchPicker scroll');
  return {
    input,
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
  return layoutComponentScrollbar({
    bounds: input.bounds,
    scroll,
    contentRows,
    contentColumns: input.bounds.width,
    ...(input.model.scrollbar === undefined ? {} : { options: input.model.scrollbar }),
    defaultAxis: 'vertical',
  });
}

function searchPickerTransition(transition: SearchPickerTransition): SearchPickerComponentAction {
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
          source: input.frameSource({ partName: 'title', cellRole: 'text', description: 'title' }),
        }),
        span(`  ${searchPickerSummary(input.model)}`, {
          ...(summaryStyle === undefined ? {} : { style: summaryStyle }),
          source: input.frameSource({
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
    ...(input.focus === 'self' ? { states: ['focused'] as const } : {}),
  });
  const markerStyle = input.style({
    part: 'placeholder',
    base: { fg: { kind: 'theme', token: 'command.prompt' } },
  });
  const visual = searchPickerInputVisual(input.model, plan.contentBounds.width, input.widthProfile);
  input.target.write(
    1,
    0,
    clipRenderSpans(
      [
        span(`${input.theme.tokens.symbols.pointer} `, {
          ...(markerStyle === undefined ? {} : { style: markerStyle }),
          source: input.frameSource({
            partName: 'query.marker',
            cellRole: 'decoration',
            description: 'query.marker',
          }),
        }),
        ...searchPickerQuerySpans(input, visual, inputStyle),
      ],
      plan.contentBounds.width,
      { widthProfile: input.widthProfile },
    ),
  );
  if (input.model.rows.length === 0) {
    const style = input.style({ part: 'empty' });
    input.target.write(2, 0, [span(input.model.emptyText, {
      ...(style === undefined ? {} : { style }),
      source: input.frameSource({ partName: 'empty', cellRole: 'text', description: 'empty' }),
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
      ...(state === undefined ? {} : { states: [state] }),
    });
    const prefix = active ? input.theme.tokens.symbols.pointer : ' ';
    const group = row.group === undefined ? '' : `[${row.group}] `;
    const matchStyle: TerminalStyle | undefined = row.matches.length === 0
      ? style
      : { ...(style ?? {}), fg: { kind: 'theme', token: 'command.match' }, bold: true };
    const labelSpans = queryLabelSpans(row.label, row.matches, style, matchStyle, (matched) =>
      input.frameSource({
        partName: `entry.${row.id}.${matched ? 'match' : 'label'}`,
        cellRole: 'text',
        itemId: row.id,
        itemIndex: row.itemIndex,
        ...(state === undefined ? {} : { interactionState: state }),
        description: `entry.${row.id}.${matched ? 'match' : 'label'}`,
      }));
    const spans = [
      span(`${prefix} `, {
        ...(style === undefined ? {} : { style }),
        source: input.frameSource({
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
        source: input.frameSource({
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
        source: input.frameSource({
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
        source: input.frameSource({
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
        source: input.frameSource({ partName: 'preview', cellRole: 'text' }),
      }),
    ]);
    trailingRow += 1;
  }
  if (input.model.helpText.length > 0 && trailingRow < plan.contentBounds.height) {
    const style = input.style({ part: 'help' });
    input.target.write(trailingRow, 0, [
      span(input.model.helpText, {
        ...(style === undefined ? {} : { style }),
        source: input.frameSource({ partName: 'help', cellRole: 'text' }),
      }),
    ]);
  }
  paintComponentScrollbar({
    target: input.target,
    plan,
    theme: input.theme,
    style: (part, state, base) => input.style({ part, base, ...(state === undefined ? {} : { states: [state] }) }),
    frameSource: (sourceInput) => input.frameSource(sourceInput),
  });
}

function searchPickerQuerySpans(
  input: ComponentRenderInput<SearchPickerModel, SearchPickerStylePart>,
  visual: import('../internal/single-line-text-window.ts').SingleLineTextWindow,
  inputStyle: TerminalStyle | undefined,
): import('../../visual/render-content.ts').RenderSpan[] {
  const output: import('../../visual/render-content.ts').RenderSpan[] = [];
  if (visual.clippedBefore) {
    output.push(span('‹', {
      source: input.frameSource({ partName: 'query.window', cellRole: 'decoration', description: 'query.window' }),
    }));
  }
  for (const grapheme of segmentGraphemes(input.model.input.text)) {
    if (grapheme.startOffset < visual.startOffset || grapheme.startOffset >= visual.endOffsetExclusive) continue;
    const selected = input.model.input.selection !== undefined
      && grapheme.startOffset < input.model.input.selection.endOffsetExclusive
      && grapheme.endOffsetExclusive > input.model.input.selection.startOffset;
    const style = selected
      ? input.style({
          part: 'selection',
          states: ['selected'],
          base: {
            fg: { kind: 'theme', token: 'selection.foreground' },
            bg: { kind: 'theme', token: 'selection.background' },
          },
        })
      : inputStyle;
    output.push(span(grapheme.text, {
      ...(style === undefined ? {} : { style }),
      source: input.frameSource({
        partName: selected ? 'query.selection' : 'query',
        partType: selected ? 'selection' : 'value',
        cellRole: 'text',
        description: selected ? 'query.selection' : 'query',
      }),
    }));
  }
  return output;
}

function searchPickerSummary(model: SearchPickerModel): string {
  return model.input.text.length === 0
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

function decodeValidation(value: CommandInputValidation | undefined): CommandInputValidation | undefined {
  if (value === undefined) return undefined;
  const message = clean(value.message, 'commandInput validation message') ?? '';
  if (message.length === 0) return undefined;
  const level = value.level;
  assertOptionalEnum(level, ['info', 'warning', 'error'], 'commandInput validation level');
  return { message, ...(level === undefined ? {} : { level }) };
}
function decodeTextSelection(
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
function decodePlacement(
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
