import type {
  AutocompleteComboboxTransition,
  AutocompleteComboboxView,
  ComboboxCommitEvent,
  ComboboxState,
  ComboboxTransition,
  ScrollableComboboxState,
} from '../../behavior/combobox.ts';
import type { ListboxCollection, ListboxOption, ListboxTransition, ListboxView } from '../../behavior/listbox.ts';
import { readListboxSource } from '../../behavior/listbox-source.ts';
import { matchingListboxView } from '../../behavior/listbox-view.ts';
import { ownCollectionQueryRequest, type CollectionQuery } from '../../text/query.ts';
import type {
  ComponentAccessibilityInput,
  ComponentRenderInput,
} from '../../component/contracts.ts';
import { defineComponent } from '../../component/definition.ts';
import type { ComponentMessage } from '../../component/message.ts';
import { mapComponentStyles } from '../../component/styles.ts';
import type { Element } from '../../element/types.ts';
import {
  assertOptionalCallback,
  assertOptionalEnum,
  assertRequiredPropertyCallback,
  isNonArrayObject,
} from '../../foundation/validation.ts';
import type { AnchoredSurfacePlacement } from '../../interaction/anchored-surface.ts';
import { decodeSelectionState } from '../../interaction/collection-interaction.ts';
import { ignoreMessage, isIgnoredMessage } from '../../interaction/message.ts';
import { pointerVisualState } from '../../interaction/pointer-interaction.ts';
import {
  popupActiveDescendantId,
  popupAllowsDismissal,
  popupRelationship,
  standardPopupDismissal,
} from '../../interaction/popup.ts';
import type { ScrollState } from '../../interaction/scroll.ts';
import type { ScrollbarOptions } from '../../interaction/scrollbar.ts';
import type { TextContextMenuEvent } from '../../interaction/text-pointer.ts';
import { portal, surface } from '../../layout/factories/surfaces.ts';
import { measureTextCells } from '../../text/measure.ts';
import { sanitizeTerminalText } from '../../text/sanitize.ts';
import { createTerminalTextIndex } from '../../text/terminal-text-index.ts';
import type { TextWidthProfile } from '../../text/types.ts';
import type { RenderSpan, TerminalStyle } from '../../visual/render-content.ts';
import { clipRenderSpans } from '../../visual/render-content.ts';
import { listbox } from '../listbox/definition.ts';
import { allowsComponentAction } from '../shared/action-capability.ts';
import { inspectTextValue, inspectValidation } from '../shared/inspection.ts';
import type { SingleLineTextWindow } from '../shared/single-line-text-window.ts';
import { layoutSingleLineTextWindow } from '../shared/single-line-text-window.ts';
import { textEditingTriggers } from '../shared/text-key-bindings.ts';
import { textPointerTarget } from '../shared/text-pointer-target.ts';
import type { ComboboxStylePart } from '../style-parts.ts';
import type {
  ActiveAutocompleteComboboxOptions,
  ActiveComboboxOptions,
  AnyComboboxOptions,
  AutocompleteComboboxOptions,
  ComboboxOptions,
  ScrollableComboboxOptions,
  UnscrolledComboboxOptions,
} from './options.ts';


type ComboboxRenderState = ComboboxState | AutocompleteComboboxView;

interface ComboboxModel {
  readonly label: string;
  readonly labelVisibility: 'visible' | 'hidden';
  readonly collection: ListboxCollection<unknown>;
  readonly optionsView: ListboxView<unknown> | undefined;
  readonly query?: CollectionQuery;
  readonly state: ComboboxRenderState;
  readonly placeholder: string;
  readonly placement: AnchoredSurfacePlacement;
  readonly maxVisibleOptions: number;
  readonly scrollbar?: ScrollbarOptions;
  readonly required: boolean;
  readonly error?: string;
}

const comboboxSlots = {
  popup: { cardinality: 'optional', owner: 'implementation', messages: 'bubble' },
} as const;

/* eslint-disable @typescript-eslint/unified-signatures -- overloads preserve mode-specific transition inference */
interface ComboboxFactory {
  <TValue, const TMessage extends ComponentMessage = never>(
    options: AutocompleteComboboxOptions<TValue, TMessage>,
  ): Element<TMessage>;
  <TValue, const TMessage extends ComponentMessage = never>(
    options: ScrollableComboboxOptions<TValue, TMessage>,
  ): Element<TMessage>;
  <TValue, const TMessage extends ComponentMessage = never>(
    options: UnscrolledComboboxOptions<TValue, TMessage>,
  ): Element<TMessage>;
}
/* eslint-enable @typescript-eslint/unified-signatures */

type ComboboxComponentAction =
  | { readonly kind: 'transition'; readonly transition: AutocompleteComboboxTransition }
  | { readonly kind: 'commit'; readonly event: ComboboxCommitEvent }
  | { readonly kind: 'contextMenu'; readonly event: TextContextMenuEvent };

const instantiateCombobox = defineComponent<ComboboxModel, ComboboxComponentAction>()({
  name: 'terminal-ui/components/combobox',
  identity: 'required',
  structure: 'composite',
  semantics: 'semantic',
  accessibleRole: 'combobox',
  slots: comboboxSlots,
  states: ['disabled', 'busy', 'readOnly', 'inert'],
  metadata: ['focus', 'layer', 'styles'],
  parts: [
    'label',
    'marker',
    'option',
    'description',
    'value',
    'placeholder',
    'selection',
    'cursor',
    'error',
  ],
  visualStates: ['focused', 'hovered', 'pressed', 'active', 'selected', 'disabled', 'busy', 'readOnly'],
  inspection: ({ model }) => {
    const activeId = comboboxActiveId(model.state);
    const selectedId = comboboxSelectedId(model.state);
    return {
      value: model.state.kind === 'autocomplete'
        ? inspectTextValue(model.state.input.text)
        : null,
      ...(activeId === undefined || model.optionsView === undefined ? {} : { active: activeId }),
      selection: {
        mode: 'single',
        ...(selectedId === undefined ? {} : { selectedId }),
      },
      ...(model.state.kind === 'autocomplete'
        ? { details: {
          caretOffset: model.state.input.cursor,
          ...(model.state.input.selection === undefined
            ? {}
            : { textSelection: {
              startOffset: model.state.input.selection.startOffset,
              endOffsetExclusive: model.state.input.selection.endOffsetExclusive,
            } }),
        } }
        : {}),
      validation: inspectValidation(model.required, model.error),
      collection: {
        startIndex: model.optionsView?.startIndex ?? 0,
        totalCount: model.optionsView?.totalCount ?? 0,
        visibleCount: model.optionsView?.count ?? 0,
      },
    };
  },
  implementationSlots(input) {
    if (!input.model.state.open) return { popup: undefined };
    const id = input.id ?? 'combobox';
    const highlighted = comboboxActiveId(input.model.state);
    const selectedId = comboboxSelectedId(input.model.state);
    const common = {
      id: `${id}:popup:list`,
      ...(input.model.collection.kind === 'window'
        ? { collection: input.model.collection }
        : { collection: input.model.collection, ...(input.model.query === undefined ? {} : { query: input.model.query }) }),
      view: input.model.optionsView ?? null,
      ...(input.styles === undefined ? {} : { styles: comboboxPopupStyles(input.styles) }),
      meta: {
        focus: { disabled: true },
      },
    };
    const scroll = comboboxScroll(input.model.state);
    const popupList = scroll === undefined
      ? listbox<unknown, ComponentMessage>({
        ...common,
        state: {
          ...(highlighted === undefined ? {} : { activeId: highlighted }),
          selection: selectedId === undefined
            ? { mode: 'single' as const }
            : { mode: 'single' as const, selectedId },
        },
        onTransition: (transition) => input.emit(comboboxTransitionForListbox(transition)),
        onActivate: (event) => !allowsComponentAction(input, 'commitSelection')
          ? ignoreMessage()
          : input.emit({ kind: 'commit', event: { kind: 'commit', id: event.id } }),
      })
      : listbox<unknown, ComponentMessage>({
        ...common,
        state: {
          ...(highlighted === undefined ? {} : { activeId: highlighted }),
          selection: selectedId === undefined
            ? { mode: 'single' as const }
            : { mode: 'single' as const, selectedId },
          scroll,
        },
        ...(input.model.scrollbar === undefined ? {} : { scrollbar: input.model.scrollbar }),
        onTransition: (transition) => input.emit(comboboxTransitionForListbox(transition)),
        onActivate: (event) => !allowsComponentAction(input, 'commitSelection')
          ? ignoreMessage()
          : input.emit({ kind: 'commit', event: { kind: 'commit', id: event.id } }),
      });
    return {
      popup: portal(
        surface(popupList, {
          id: `${id}:popup:surface`,
          appearance: 'raised',
          border: { kind: 'single' },
          maxHeight: input.model.maxVisibleOptions + 2,
        }),
        {
          id: `${id}:popup`,
          anchor: { kind: 'allocation' },
          placement: input.model.placement,
          margin: 0,
          onOutsidePress: () => input.emit(comboboxComponentTransition({
            kind: 'dismiss',
            reason: 'outsidePress',
          })),
          meta: { layer: { zIndex: 20, underlay: 'clear' } },
        },
      ),
    };
  },
  measure(input) {
    const selected = selectedComboboxOption(input.model);
    const value = input.model.state.kind === 'autocomplete'
      ? input.model.state.input.text || input.model.placeholder
      : selected?.label ?? input.model.placeholder;
    return {
      minWidth: 1,
      minHeight: 1,
      preferredWidth:
        measureTextCells(`${comboboxLabelPrefix(input.model)}${value}  `, { widthProfile: input.widthProfile }).cells,
      preferredHeight: input.model.error === undefined ? 1 : 2,
    };
  },
  layout({ bounds }) {
    return { popup: bounds };
  },
  renderBeforeChildren(input) {
    renderCombobox(input);
  },
  keys({ id, model, busy, readOnly }) {
    const availability = { busy, readOnly };
    if (!allowsComponentAction(availability, 'navigate')) return {};
    const canEdit = allowsComponentAction(availability, 'edit');
    const canCommitSelection = allowsComponentAction(availability, 'commitSelection');
    const whenSelf =
      (action: import('../../interaction/index.ts').MessageResolution<ComboboxComponentAction>) =>
      (event: { readonly focusPath: readonly string[] }) =>
        event.focusPath.at(-1) === id ? action : ignoreMessage();
    const highlighted = model.state.open && model.optionsView !== undefined
      ? comboboxActiveId(model.state)
      : undefined;
    const triggers = model.state.kind !== 'autocomplete'
      ? undefined
      : [
          ...textEditingTriggers(!canEdit).map((binding) => ({
            trigger: binding.trigger,
            onKey: (event: Parameters<typeof binding.onKey>[0]) => {
              if (event.focusPath.at(-1) !== id) return ignoreMessage();
              const action = binding.onKey(event);
              return isIgnoredMessage(action)
                ? action
                : comboboxComponentTransition(action);
            },
          })),
          ...(canEdit ? [{
            trigger: { kind: 'key' as const, key: 'z' as const, modifiers: { ctrl: true } },
            onKey: () => comboboxComponentTransition({ kind: 'undo' as const }),
          }, {
            trigger: { kind: 'key' as const, key: 'y' as const, modifiers: { ctrl: true } },
            onKey: () => comboboxComponentTransition({ kind: 'redo' as const }),
          }] : []),
        ];
    return {
      ...(triggers === undefined ? {} : { triggers }),
      ...(model.optionsView === undefined ? {} : {
        arrowDown: whenSelf(comboboxComponentTransition({ kind: 'moveActive', delta: 1 })),
        arrowUp: whenSelf(comboboxComponentTransition({ kind: 'moveActive', delta: -1 })),
        pageDown: whenSelf(comboboxComponentTransition({ kind: 'pageActive', delta: 1 })),
        pageUp: whenSelf(comboboxComponentTransition({ kind: 'pageActive', delta: -1 })),
      }),
      ...(model.state.kind === 'select'
        ? {
            ...(model.optionsView === undefined ? {} : {
              home: whenSelf(comboboxComponentTransition({ kind: 'firstActive' })),
              end: whenSelf(comboboxComponentTransition({ kind: 'lastActive' })),
            }),
            space: whenSelf(comboboxComponentTransition({ kind: 'toggle' })),
          }
        : {}),
      enter: whenSelf(
        !model.state.open
          ? comboboxComponentTransition({ kind: 'open' })
        : highlighted === undefined
          ? ignoreMessage()
          : !canCommitSelection ? ignoreMessage() : {
            kind: 'commit',
            event: { kind: 'commit', id: highlighted },
          },
      ),
      escape: whenSelf(
        model.state.open && popupAllowsDismissal(standardPopupDismissal, 'escape')
          ? comboboxComponentTransition({ kind: 'dismiss', reason: 'escape' })
          : ignoreMessage(),
      ),
    };
  },
  onInput: ({ model, text, readOnly }) => model.state.kind === 'select'
    || !allowsComponentAction({ readOnly }, 'edit')
    ? ignoreMessage()
    : comboboxComponentTransition({ kind: 'edit', operation: { kind: 'insert', text } }),
  onPaste: ({ model, text, readOnly }) => model.state.kind === 'select'
    || !allowsComponentAction({ readOnly }, 'edit')
    ? ignoreMessage()
    : comboboxComponentTransition({ kind: 'edit', operation: { kind: 'insert', text } }),
  onFocus: (event, { model }) => event.kind === 'focusLeave'
    && model.state.open
    && popupAllowsDismissal(standardPopupDismissal, 'focusLoss')
    ? comboboxComponentTransition({ kind: 'dismiss', reason: 'focusLoss' })
    : ignoreMessage(),
  focusTargets(input) {
    const { bounds, model, widthProfile } = input;
    if (model.state.kind === 'select') return [{ id: 'self', bounds }];
    const visual = autocompleteComboboxInputVisual(
      model,
      model.state,
      bounds.width,
      widthProfile,
    );
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
      bounds,
      cursor: {
        row: 0,
        column: Math.min(
          Math.max(0, bounds.width - 1),
          visual.labelCells + visual.window.cursorColumn,
        ),
        ...(cursorStyle === undefined ? {} : { style: cursorStyle }),
        source: input.frameSource({ cellRole: 'cursor', partName: 'cursor', partType: 'cursor' }),
      },
    }];
  },
  hitTargets(input) {
    const { id, bounds, model, busy } = input;
    if (busy) return [];
    const targetBounds = { ...bounds, height: Math.min(1, bounds.height) };
    if (model.state.kind === 'select') {
      return [{
        id: popupRelationship(id ?? 'combobox').triggerId,
        bounds: targetBounds,
        accepts: ['click'],
        focus: { kind: 'target', targetId: 'self' },
        message: () => comboboxComponentTransition({ kind: 'toggle' }),
        cursor: 'pointer',
        ...(model.state.open ? { zIndex: 21 } : {}),
      }];
    }
    const index = createTerminalTextIndex(model.state.input.text, {
      widthProfile: input.widthProfile,
    });
    const visual = autocompleteComboboxInputVisual(
      model,
      model.state,
      input.bounds.width,
      input.widthProfile,
    );
    return [textPointerTarget<ComboboxComponentAction>({
      id: popupRelationship(id ?? 'combobox').triggerId,
      bounds: targetBounds,
      ...(model.state.input.selection === undefined
        ? {}
        : { selection: model.state.input.selection }),
      focusTargetId: 'self',
      offsetAt(event, origin) {
        const local = origin === 'press'
          ? event.pressLocalColumn ?? event.localColumn ?? 1
          : event.localColumn ?? 1;
        const column = visual.window.offsetCells + Math.max(
          0,
          local - 1 - visual.labelCells - Number(visual.window.clippedBefore),
        );
        return index.graphemeIndexToCodeUnitOffset(index.visualColumnToGraphemeIndex(column));
      },
      wordSelectionAt: (offset) => index.wordSelectionAt(offset),
      onPointer: (transition) => comboboxComponentTransition({ kind: 'pointer', transition }),
      onContextMenu: (event) => ({ kind: 'contextMenu', event }),
    })];
  },
  accessibility(input) {
    return comboboxAccessibility(input);
  },
});

export const combobox: ComboboxFactory = (options) => {
  return isAutocompleteComboboxOptions(options)
    ? createAutocompleteCombobox(options)
    : createSelectCombobox(options);
};

function isAutocompleteComboboxOptions<TValue, TMessage extends ComponentMessage>(
  options: AnyComboboxOptions<TValue, TMessage>,
): options is AutocompleteComboboxOptions<TValue, TMessage> {
  return 'view' in options;
}

function createSelectCombobox<TValue, TMessage extends ComponentMessage>(
  options: ComboboxOptions<TValue, TMessage>,
): Element<TMessage> {
  const model = createComboboxModel(options);
  const common = {
    ...model,
    id: options.id,
    ...(options.styles === undefined ? {} : { styles: options.styles }),
    ...(options.disabled === undefined ? {} : { disabled: options.disabled }),
    ...(options.inert === undefined ? {} : { inert: options.inert }),
    ...(options.meta === undefined ? {} : { meta: options.meta }),
  };
  assertOptionalCallback(options.onCommit, 'combobox onCommit');
  assertOptionalCallback(options.onContextMenu, 'combobox onContextMenu');
  if (options.disabled === true && options.onTransition === undefined) return instantiateCombobox({ ...common, disabled: true });
  const shared = {
    ...common,
    ...(options.busy === undefined ? {} : { busy: options.busy }),
  };
  if (options.inert === true && options.onTransition === undefined) return instantiateCombobox({ ...shared, inert: true });
  assertRequiredPropertyCallback(options, 'onTransition', 'combobox onTransition');
  assertOptionalCallback(options.onCommit, 'combobox onCommit');
  return instantiateCombobox({
    ...shared,
    ...(options.readOnly === undefined ? {} : { readOnly: options.readOnly }),
    onAction: (action) => {
      if (action.kind === 'transition') return emitComboboxTransition(options, action.transition);
      if (action.kind === 'contextMenu') return ignoreMessage();
      return options.onCommit?.(action.event) ?? ignoreMessage();
    },
  });
}

function createAutocompleteCombobox<TValue, TMessage extends ComponentMessage>(
  options: AutocompleteComboboxOptions<TValue, TMessage>,
): Element<TMessage> {
  const model = createComboboxModel(options);
  const common = {
    ...model,
    id: options.id,
    ...(options.styles === undefined ? {} : { styles: options.styles }),
    ...(options.disabled === undefined ? {} : { disabled: options.disabled }),
    ...(options.inert === undefined ? {} : { inert: options.inert }),
    ...(options.meta === undefined ? {} : { meta: options.meta }),
  };
  assertOptionalCallback(options.onCommit, 'combobox onCommit');
  assertOptionalCallback(options.onContextMenu, 'combobox onContextMenu');
  if (options.disabled === true && options.onTransition === undefined) return instantiateCombobox({ ...common, disabled: true });
  const shared = { ...common, ...(options.busy === undefined ? {} : { busy: options.busy }) };
  if (options.inert === true && options.onTransition === undefined) return instantiateCombobox({ ...shared, inert: true });
  assertRequiredPropertyCallback(options, 'onTransition', 'combobox onTransition');
  assertOptionalCallback(options.onCommit, 'combobox onCommit');
  return instantiateCombobox({
    ...shared,
    ...(options.readOnly === undefined ? {} : { readOnly: options.readOnly }),
    onAction: (action) => {
      if (action.kind === 'transition') {
        return emitAutocompleteComboboxTransition(options, action.transition);
      }
      if (action.kind === 'contextMenu') {
        return options.onContextMenu?.(action.event) ?? ignoreMessage();
      }
      return options.onCommit?.(action.event) ?? ignoreMessage();
    },
  });
}

function emitComboboxTransition<TValue, TMessage extends ComponentMessage>(
  options: ActiveComboboxOptions<TValue, TMessage>,
  transition: AutocompleteComboboxTransition,
): import('../../interaction/message.ts').MessageResolution<TMessage> {
  if (isAutocompleteOnlyTransition(transition)) return ignoreMessage();
  if (isScrollableComboboxOptions(options)) return options.onTransition(transition);
  return transition.kind === 'scroll'
    ? ignoreMessage()
    : options.onTransition(transition);
}

function emitAutocompleteComboboxTransition<TValue, TMessage extends ComponentMessage>(
  options: ActiveAutocompleteComboboxOptions<TValue, TMessage>,
  transition: AutocompleteComboboxTransition,
): import('../../interaction/message.ts').MessageResolution<TMessage> {
  if (isScrollableAutocompleteComboboxOptions(options)) return options.onTransition(transition);
  return transition.kind === 'scroll'
    ? ignoreMessage()
    : options.onTransition(transition);
}

function isScrollableAutocompleteComboboxOptions<
  TValue,
  TMessage extends ComponentMessage,
>(
  options: ActiveAutocompleteComboboxOptions<TValue, TMessage>,
): options is ActiveAutocompleteComboboxOptions<TValue, TMessage> & {
  readonly view: Extract<AutocompleteComboboxView, { readonly scroll: unknown }>;
  readonly onTransition: (
    transition: AutocompleteComboboxTransition,
  ) => import('../../interaction/message.ts').MessageResolution<TMessage>;
} {
  return options.view.scroll !== undefined;
}

function isScrollableComboboxOptions<TValue, TMessage extends ComponentMessage>(
  options: ActiveComboboxOptions<TValue, TMessage>,
): options is ActiveComboboxOptions<TValue, TMessage> & {
  readonly state: ScrollableComboboxState;
  readonly onTransition: (
    transition: ComboboxTransition,
  ) => import('../../interaction/message.ts').MessageResolution<TMessage>;
} {
  return options.state.scroll !== undefined;
}

function isAutocompleteOnlyTransition(
  transition: AutocompleteComboboxTransition,
): transition is Exclude<AutocompleteComboboxTransition, ComboboxTransition> {
  return transition.kind === 'edit'
    || transition.kind === 'undo'
    || transition.kind === 'redo'
    || transition.kind === 'pointer'
    || transition.kind === 'setText';
}

function selectedComboboxOption(model: ComboboxModel): ListboxOption | undefined {
  const id = comboboxSelectedId(model.state);
  return id === undefined ? undefined : readListboxSource(model.collection).itemById(id)?.option;
}

function comboboxLabelPrefix(model: ComboboxModel): string {
  if (model.labelVisibility === 'hidden') return '';
  return `${model.label}${model.required ? ' *' : ''}: `;
}

interface AutocompleteComboboxInputVisual {
  readonly labelCells: number;
  readonly contentWidth: number;
  readonly window: SingleLineTextWindow;
}

function autocompleteComboboxInputVisual(
  model: ComboboxModel,
  state: AutocompleteComboboxView,
  width: number,
  widthProfile: TextWidthProfile,
): AutocompleteComboboxInputVisual {
  const labelCells = measureTextCells(comboboxLabelPrefix(model), { widthProfile }).cells;
  const contentWidth = Math.max(0, width - labelCells - 2);
  return {
    labelCells,
    contentWidth,
    window: layoutSingleLineTextWindow(
      state.input.text,
      state.input.cursor,
      contentWidth,
      widthProfile,
    ),
  };
}

function renderCombobox(input: ComponentRenderInput<ComboboxModel, ComboboxStylePart>): void {
  const selected = selectedComboboxOption(input.model);
  const value = input.model.state.kind === 'autocomplete'
    ? input.model.state.input.text || input.model.placeholder
    : selected?.label ?? input.model.placeholder;
  const state = input.disabled
    ? 'disabled' as const
    : pointerVisualState(input.pointerState, `${input.id ?? 'combobox'}:trigger`) ??
      (input.focus === 'self' ? 'focused' as const : undefined);
  const labelPrefix = comboboxLabelPrefix(input.model);
  const labelCells = measureTextCells(labelPrefix, { widthProfile: input.widthProfile }).cells;
  const valueWidth = Math.max(0, input.bounds.width - labelCells - 2);
  const labelStyle = input.style({
    part: 'label',
    ...(state === undefined ? {} : { states: [state] }),
    base: { fg: { kind: 'theme', token: 'text.strong' }, bold: true },
  });
  const hasValue = input.model.state.kind === 'autocomplete'
    ? input.model.state.input.text.length > 0
    : selected !== undefined;
  const valuePart: ComboboxStylePart = input.model.state.kind === 'autocomplete'
    ? hasValue ? 'value' : 'placeholder'
    : hasValue ? 'option' : 'description';
  const valueStyle = input.style({
    part: valuePart,
    ...(state === undefined ? {} : { states: [state] }),
    base: !hasValue
      ? { fg: { kind: 'theme', token: 'input.placeholder' } }
      : { fg: { kind: 'theme', token: 'text.default' } },
  });
  const markerStyle = input.style({
    part: 'marker',
    ...(state === undefined ? {} : { states: [state] }),
    base: { fg: { kind: 'theme', token: 'control.foreground' } },
  });
  let valueSpans: readonly RenderSpan[];
  if (input.model.state.kind === 'select') {
    valueSpans = clipRenderSpans([comboboxSpan(
        input,
        value,
        valuePart,
        hasValue ? 'value.selected' : 'value.placeholder',
        valueStyle,
      )], valueWidth, { widthProfile: input.widthProfile });
  } else {
    const state = input.model.state;
    const visual = autocompleteComboboxInputVisual(
      input.model,
      state,
      input.bounds.width,
      input.widthProfile,
    );
    valueSpans = !hasValue
      ? clipRenderSpans([comboboxSpan(
        input,
        value,
        valuePart,
        'value.placeholder',
        valueStyle,
      )], visual.contentWidth, { widthProfile: input.widthProfile })
      : [
        ...(visual.window.clippedBefore
          ? [comboboxSpan(input, '‹', 'marker', 'value.window', markerStyle)]
          : []),
        ...comboboxSelectedValueSpans(
          input,
          state.input.text,
          state.input.selection,
          visual.window,
          valueStyle,
        ),
      ];
  }
  input.target.write(0, 0, [
    ...(labelPrefix.length === 0 ? [] : [
      comboboxSpan(input, labelPrefix.slice(0, -2), 'label', 'label', labelStyle),
      comboboxSpan(input, ': ', 'label', 'label.separator', labelStyle),
    ]),
    ...valueSpans,
    comboboxSpan(input, ' ', 'marker', 'value.separator', markerStyle),
    comboboxSpan(
      input,
      input.model.state.open
        ? input.theme.tokens.symbols.expanded
        : input.theme.tokens.symbols.collapsed,
      'marker',
      'value.disclosure',
      markerStyle,
    ),
  ]);
  if (input.model.error !== undefined && input.bounds.height > 1) {
    const errorStyle = input.style({
      part: 'error',
      base: { fg: { kind: 'theme', token: 'status.error' } },
    });
    input.target.write(1, 0, [
      comboboxSpan(input, input.model.error, 'error', 'validation.error', errorStyle),
    ]);
  }
}

function comboboxSelectedValueSpans(
  input: ComponentRenderInput<ComboboxModel, ComboboxStylePart>,
  value: string,
  selection: import('../../text/index.ts').TextSelection | undefined,
  window: SingleLineTextWindow,
  valueStyle: TerminalStyle | undefined,
): readonly RenderSpan[] {
  const selectedStyle = input.style({
    part: 'selection',
    states: ['selected'],
    base: {
      fg: { kind: 'theme', token: 'selection.foreground' },
      bg: { kind: 'theme', token: 'selection.background' },
    },
  });
  return [
    {
      start: window.startOffset,
      end: selection?.startOffset ?? window.endOffsetExclusive,
      selected: false,
    },
    ...(selection === undefined ? [] : [{
      start: selection.startOffset,
      end: selection.endOffsetExclusive,
      selected: true,
    }]),
    {
      start: selection?.endOffsetExclusive ?? window.endOffsetExclusive,
      end: window.endOffsetExclusive,
      selected: false,
    },
  ].flatMap((range) => {
    const start = Math.max(window.startOffset, range.start);
    const end = Math.min(window.endOffsetExclusive, range.end);
    return end <= start ? [] : [comboboxSpan(
    input,
    value.slice(start, end),
    range.selected ? 'selection' : 'value',
    range.selected ? 'value.selection' : 'value',
    range.selected ? selectedStyle : valueStyle,
    )];
  });
}

function comboboxSpan(
  input: ComponentRenderInput<ComboboxModel, ComboboxStylePart>,
  text: string,
  part: ComboboxStylePart,
  partName: string,
  style: TerminalStyle | undefined,
): RenderSpan {
  return {
    text,
    ...(style === undefined ? {} : { style }),
    source: input.frameSource({ partName, partType: part, cellRole: 'text', description: partName }),
  };
}

function comboboxAccessibility(
  input: ComponentAccessibilityInput<ComboboxModel, typeof comboboxSlots>,
): import('../../accessibility/index.ts').AccessibleNode {
  const selected = selectedComboboxOption(input.model);
  const description = [input.model.required ? 'Required.' : '', input.model.error ?? '']
    .filter((part) => part.length > 0)
    .join(' ');
  const open = input.model.state.open ? input.model.state : undefined;
  const options = comboboxVisibleEntries(input.model);
  const highlighted = open === undefined ? undefined : comboboxActiveId(open);
  const activeId = options.some(entry => entry.id === highlighted) ? highlighted : undefined;
  const startIndex = options[0]?.visibleIndex ?? input.model.optionsView?.startIndex ?? 0;
  const totalCount = input.model.optionsView?.totalCount ?? 0;
  const relationship = popupRelationship(input.id);
  return {
    id: input.id,
    role: 'combobox',
    label: input.model.label,
    required: input.model.required,
    invalid: input.model.error !== undefined,
    ...(input.model.error === undefined ? {} : { errorMessage: `${input.id}:error` }),
    expanded: input.model.state.open,
    ...(open === undefined ? {} : { controls: relationship.popupId }),
    ...(activeId === undefined
      ? {}
      : { activeDescendant: popupActiveDescendantId(relationship, activeId) }),
    ...(input.model.state.kind === 'autocomplete'
      ? {
        value: input.model.state.input.text,
        textPosition: {
          caretOffset: input.model.state.input.cursor,
          ...(input.model.state.input.selection === undefined
            ? {}
            : { selection: input.model.state.input.selection }),
        },
      }
      : selected === undefined ? {} : { value: selected.label }),
    ...(description.length === 0 ? {} : { description }),
    ...(input.focused ? { focused: true } : {}),
    ...(open === undefined ? {
      children: input.model.error === undefined
        ? []
        : [{ id: `${input.id}:error`, role: 'status' as const, label: input.model.error }],
    } : {
      children: [{
        id: relationship.popupId,
        role: 'listbox' as const,
        ...(input.model.label === '' ? {} : { label: `${input.model.label} options` }),
        window: {
          startIndex,
          endIndexExclusive: startIndex + options.length,
          totalCount,
          omittedBefore: startIndex,
          omittedAfter: Math.max(0, totalCount - startIndex - options.length),
        },
        children: options.map(({ option, visibleIndex }) => ({
          id: `${relationship.popupId}:item:${option.id}`,
          role: 'option' as const,
          label: option.label,
          selected: option.id === comboboxSelectedId(open),
          position: { positionInSet: visibleIndex + 1, setSize: totalCount },
          ...(option.description === undefined ? {} : { description: option.description }),
          ...(option.disabled ? { disabled: true } : {}),
        })),
      }, ...(input.model.error === undefined
        ? []
        : [{ id: `${input.id}:error`, role: 'status' as const, label: input.model.error }])],
    }),
  };
}

function comboboxVisibleEntries(model: ComboboxModel) {
  const view = model.optionsView;
  if (view === undefined) return [];
  const activeId = comboboxActiveId(model.state);
  const activeIndex = activeId === undefined ? undefined : view.entryById(activeId)?.visibleIndex;
  const requestedStart = comboboxScroll(model.state)?.offsetRow ?? (
    activeIndex === undefined ? view.startIndex : Math.max(view.startIndex, activeIndex - Math.floor(model.maxVisibleOptions / 2))
  );
  const start = Math.max(0, Math.min(Math.max(0, view.count - model.maxVisibleOptions), requestedStart - view.startIndex));
  return view.window(start, start + model.maxVisibleOptions);
}

function comboboxTransitionForListbox(transition: ListboxTransition): ComboboxComponentAction {
  switch (transition.kind) {
    case 'setActive':
      return comboboxComponentTransition({ kind: 'setActive', ...(transition.id === undefined ? {} : { id: transition.id }) });
    case 'moveActive':
      return comboboxComponentTransition({ kind: 'moveActive', delta: transition.delta });
    case 'pageActive':
      return comboboxComponentTransition({ kind: 'pageActive', delta: transition.delta });
    case 'firstActive':
      return comboboxComponentTransition({ kind: 'firstActive' });
    case 'lastActive':
      return comboboxComponentTransition({ kind: 'lastActive' });
    case 'commitActive':
      return comboboxComponentTransition({ kind: 'dismiss', reason: 'programmatic' });
    case 'select':
    case 'toggleSelection':
      return { kind: 'commit', event: { kind: 'commit', id: transition.id } };
    case 'selectRange':
      return { kind: 'commit', event: { kind: 'commit', id: transition.toId } };
    case 'clearSelection':
      return comboboxComponentTransition({ kind: 'dismiss', reason: 'programmatic' });
    case 'scroll':
      return comboboxComponentTransition(transition);
  }
}

function comboboxComponentTransition(transition: AutocompleteComboboxTransition): ComboboxComponentAction {
  return { kind: 'transition', transition };
}

function comboboxPopupStyles(
  styles: import('../../element/index.ts').ElementStyles<ComboboxStylePart>,
): import('../../element/index.ts').ElementStyles<
  import('../style-parts.ts').DataListStylePart
> {
  return mapComponentStyles(styles, {
    marker: 'marker',
    item: 'option',
    description: 'description',
  }) ?? {};
}

function createComboboxModel<TValue, TMessage extends ComponentMessage>(
  value: Readonly<AnyComboboxOptions<TValue, TMessage>>,
): ComboboxModel {
  const label = value.label;
  if (typeof label !== 'string') throw new TypeError('combobox label must be a string.');
  assertOptionalEnum(value.labelVisibility, ['visible', 'hidden'], 'combobox labelVisibility');
  const optionsView = matchingListboxView(value.collection, value.query, value.optionsView);
  const state = decodeComboboxState(
    'view' in value ? value.view : value.state,
    value.collection,
    optionsView,
  );
  if (value.disabled === true && state.open) {
    throw new TypeError('combobox cannot be open while disabled.');
  }
  const placeholder = value.placeholder;
  if (placeholder !== undefined && typeof placeholder !== 'string') {
    throw new TypeError('combobox placeholder must be a string.');
  }
  const placement = value.placement;
  assertOptionalEnum(
    placement,
    ['above', 'below', 'left', 'right', 'auto', 'cursor'],
    'combobox placement',
  );
  const maxVisibleOptions = value.maxVisibleOptions;
  if (
    maxVisibleOptions !== undefined &&
    (typeof maxVisibleOptions !== 'number' ||
      !Number.isSafeInteger(maxVisibleOptions) ||
      maxVisibleOptions < 1)
  ) {
    throw new RangeError('combobox maxVisibleOptions must be a positive safe integer.');
  }
  for (const field of ['required'] as const) {
    if (value[field] !== undefined && typeof value[field] !== 'boolean') {
      throw new TypeError(`combobox ${field} must be a boolean.`);
    }
  }
  const error = value.error;
  if (error !== undefined && typeof error !== 'string') {
    throw new TypeError('combobox error must be a string.');
  }
  const scrollbar = decodeScrollbar(value.scrollbar);
  if (comboboxScroll(state) === undefined && scrollbar !== undefined) {
    throw new TypeError('combobox scrollbar requires state scroll state.');
  }
  return {
    label: sanitizeTerminalText(label).text,
    labelVisibility: value.labelVisibility ?? 'visible',
    collection: value.collection,
    optionsView,
    ...(value.query === undefined ? {} : { query: ownCollectionQueryRequest(value.query) }),
    state,
    placeholder: sanitizeTerminalText(placeholder ?? 'Select…').text,
    placement: placement ?? 'auto',
    maxVisibleOptions: maxVisibleOptions ?? 8,
    ...(scrollbar === undefined ? {} : { scrollbar }),
    required: value.required === true,
    ...(error === undefined ? {} : { error: sanitizeTerminalText(error).text }),
  };
}

function decodeComboboxState(
  value: ComboboxRenderState,
  collection: ListboxCollection<unknown>,
  optionsView: ListboxView<unknown> | undefined,
): ComboboxRenderState {
  const candidate: unknown = value;
  if (!isNonArrayObject(candidate) || typeof candidate['open'] !== 'boolean' ||
    (candidate['kind'] !== 'select' && candidate['kind'] !== 'autocomplete')) {
    throw new TypeError('combobox state is invalid.');
  }
  return value.kind === 'autocomplete'
    ? decodeAutocompleteComboboxState(value, collection, optionsView)
    : decodeSelectComboboxState(value, collection, optionsView);
}

function decodeAutocompleteComboboxState(
  value: Extract<ComboboxRenderState, { readonly kind: 'autocomplete' }>,
  collection: ListboxCollection<unknown>,
  optionsView: ListboxView<unknown> | undefined,
): ComboboxRenderState {
  if (!isNonArrayObject(value.input) || typeof value.input.text !== 'string' ||
    typeof value.input.cursor !== 'number' || !Number.isSafeInteger(value.input.cursor) ||
    value.input.cursor < 0 || value.input.cursor > value.input.text.length) {
    throw new TypeError('autocomplete combobox input is invalid.');
  }
  const cleanInput = sanitizeTerminalText(value.input.text).text;
  if (cleanInput !== value.input.text) {
    throw new TypeError('autocomplete combobox input must contain sanitized terminal text.');
  }
  const selection = decodeSelectionState(value.selection, 'autocomplete combobox selection');
  if (selection.mode !== 'single') throw new TypeError('autocomplete combobox selection must use single mode.');
  const selectedId = decodeOptionalComboboxId(selection.selectedId, 'autocomplete combobox selectedId');
  const activeId = decodeOptionalComboboxId(value.activeId, 'autocomplete combobox activeId');
  assertComboboxOptionReference(activeId, collection, optionsView, true, 'autocomplete combobox activeId');
  const scroll = decodeScrollState(value.scroll, 'autocomplete combobox state scroll');
  return {
    kind: 'autocomplete',
    open: value.open,
    input: Object.freeze({
      text: value.input.text,
      cursor: value.input.cursor,
      ...(value.input.selection === undefined
        ? {}
        : { selection: decodeComboboxTextSelection(value.input.selection, value.input.text.length) }),
    }),
    ...(activeId === undefined ? {} : { activeId }),
    selection: Object.freeze({ mode: 'single' as const, ...(selectedId === undefined ? {} : { selectedId }) }),
    ...(scroll === undefined ? {} : { scroll }),
  };
}

function decodeSelectComboboxState(
  value: Extract<ComboboxRenderState, { readonly kind: 'select' }>,
  collection: ListboxCollection<unknown>,
  optionsView: ListboxView<unknown> | undefined,
): ComboboxRenderState {
  if (!isNonArrayObject(value.interaction)) {
    throw new TypeError('combobox interaction is invalid.');
  }
  const selection = decodeSelectionState(
    value.interaction.selection,
    'combobox interaction selection',
  );
  if (selection.mode !== 'single') {
    throw new TypeError('combobox interaction selection must use single mode.');
  }
  const selectedId = decodeOptionalComboboxId(selection.selectedId, 'combobox selectedId');
  assertComboboxOptionReference(selectedId, collection, optionsView, false, 'combobox selectedId');
  const activeId = decodeOptionalComboboxId(value.interaction.activeId, 'combobox activeId');
  assertComboboxOptionReference(activeId, collection, optionsView, true, 'combobox activeId');
  const scroll = decodeScrollState(value.scroll, 'combobox state scroll');
  return {
    kind: 'select',
    open: value.open,
    interaction: Object.freeze({
      ...(activeId === undefined ? {} : { activeId }),
      selection: Object.freeze({
        mode: 'single' as const,
        ...(selectedId === undefined ? {} : { selectedId }),
      }),
    }),
    ...(scroll === undefined ? {} : { scroll }),
  };
}

function decodeOptionalComboboxId(value: unknown, owner: string): string | undefined {
  return value === undefined ? undefined : nonEmptyId(value, owner);
}

function assertComboboxOptionReference(
  id: string | undefined,
  collection: ListboxCollection<unknown>,
  optionsView: ListboxView<unknown> | undefined,
  requireEnabled: boolean,
  owner: string,
): void {
  if (id === undefined) return;
  if (requireEnabled && optionsView === undefined) return;
  const option = requireEnabled
    ? optionsView?.entryById(id)?.option
    : readListboxSource(collection).itemById(id)?.option;
  if (option === undefined || (requireEnabled && option.disabled)) {
    throw new TypeError(`${owner} must reference ${requireEnabled ? 'an enabled option' : 'an option'}.`);
  }
}

function comboboxSelectedId(state: ComboboxRenderState): string | undefined {
  return state.kind === 'autocomplete'
    ? state.selection.selectedId
    : state.interaction.selection.mode === 'single'
      ? state.interaction.selection.selectedId
      : undefined;
}

function comboboxActiveId(state: ComboboxRenderState): string | undefined {
  return state.kind === 'autocomplete'
    ? state.activeId
    : state.interaction.activeId;
}

function comboboxScroll(state: ComboboxRenderState): ScrollState | undefined {
  return state.scroll;
}

function decodeComboboxTextSelection(
  value: unknown,
  textLength: number,
): import('../../text/index.ts').TextSelection {
  if (!isNonArrayObject(value)) throw new TypeError('autocomplete combobox input selection must be an object.');
  const startOffset = value['startOffset'];
  const endOffsetExclusive = value['endOffsetExclusive'];
  if (typeof startOffset !== 'number' || !Number.isSafeInteger(startOffset) || startOffset < 0 ||
    typeof endOffsetExclusive !== 'number' || !Number.isSafeInteger(endOffsetExclusive) ||
    endOffsetExclusive < startOffset || endOffsetExclusive > textLength) {
    throw new RangeError('autocomplete combobox input selection is outside the input text.');
  }
  return Object.freeze({ startOffset, endOffsetExclusive });
}

function nonEmptyId(value: unknown, owner: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new TypeError(`${owner} must be a non-empty string.`);
  }
  return value;
}

function decodeScrollState(value: ScrollState | undefined, label: string): ScrollState | undefined {
  if (value === undefined) return undefined;
  if (!isNonArrayObject(value)) throw new TypeError(`${label} must be an object.`);
  const required = ['offsetRow', 'offsetColumn'] as const;
  for (const field of required) {
    const member = value[field];
    if (typeof member !== 'number' || !Number.isSafeInteger(member) || member < 0) {
      throw new RangeError(`${label}.${field} must be a non-negative safe integer.`);
    }
  }
  if (typeof value.followTail !== 'boolean') {
    throw new TypeError(`${label}.followTail must be a boolean.`);
  }
  const offsetRow = value.offsetRow;
  const offsetColumn = value.offsetColumn;
  if (typeof offsetRow !== 'number' || typeof offsetColumn !== 'number') {
    throw new TypeError(`${label} is invalid.`);
  }
  return {
    offsetRow,
    offsetColumn,
    followTail: value.followTail,
  };
}

function decodeScrollbar(value: ScrollbarOptions | undefined): ScrollbarOptions | undefined {
  if (value === undefined) return undefined;
  if (!isNonArrayObject(value)) throw new TypeError('combobox scrollbar must be an object.');
  const visible = value['visible'];
  const axis = value['axis'];
  const visualState = value['visualState'];
  if (visible !== undefined && visible !== 'auto' && visible !== 'always' && visible !== 'never') {
    throw new TypeError('combobox scrollbar visible is invalid.');
  }
  if (axis !== undefined && axis !== 'vertical' && axis !== 'horizontal' && axis !== 'both') {
    throw new TypeError('combobox scrollbar axis is invalid.');
  }
  if (
    visualState !== undefined &&
    visualState !== 'idle' &&
    visualState !== 'active' &&
    visualState !== 'hover' &&
    visualState !== 'disabled' &&
    visualState !== 'inactive'
  ) {
    throw new TypeError('combobox scrollbar visualState is invalid.');
  }
  return {
    ...(visible === undefined ? {} : { visible }),
    ...(axis === undefined ? {} : { axis }),
    ...(visualState === undefined ? {} : { visualState }),
  };
}
