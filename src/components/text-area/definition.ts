import { committedTextAreaLayoutRequest } from './prepared-layout.ts';
import { controlKeyBindings } from '../shared/control-key-bindings.ts';
import type { TextAreaKeyAction } from '../keymaps.ts';
import { defineComponent } from '../../component/definition.ts';
import type { ComponentMessage } from '../../component/message.ts';
import { componentScrollbarHitTargets } from '../../component/scrollbar.ts';
import type { Element } from '../../element/types.ts';
import {
  assertOptionalCallback,
  assertRequiredPropertyCallback,
  isNonArrayObject,
} from '../../foundation/validation.ts';
import { ignoreMessage } from '../../interaction/message.ts';
import { textDocumentSelectionRange, textDocumentText } from '../../text/document.ts';
import { withoutTransitionCallback } from '../shared/form-control-helpers.ts';
import {
  inspectTextDocumentValue,
  inspectTextSelection,
  inspectValidation,
} from '../shared/inspection.ts';
import { textEditingHandlers } from '../shared/text-key-bindings.ts';
import { textPointerTarget } from '../shared/text-pointer-target.ts';
import { measureTextArea, projectedCaret, textAreaGeometry, textAreaCommittedLayout, textAreaLayoutPending } from './geometry.ts';
import type { TextAreaComponentAction } from './interaction.ts';
import {
  pointerOffset,
  textAreaDragScrollRequest,
  textAreaVisualHandlers,
  textAreaPendingVisualHandlers,
  textAreaWordSelectionAt,
} from './interaction.ts';
import { createTextAreaModel } from './model.ts';
import type { ScrollableTextAreaOptions, TextAreaOptions } from './options.ts';
import { paintTextArea } from './paint.ts';

type TextAreaFactory = <const TMessage extends ComponentMessage = never>(
  options: TextAreaOptions<TMessage>,
) => Element<TMessage>;

const instantiateTextArea = defineComponent<Omit<TextAreaOptions<ComponentMessage>, 'id' | 'disabled' | 'readOnly' | 'busy' | 'onTransition' | 'onContextMenu' | 'styles' | 'meta'>, TextAreaComponentAction>()({
  name: 'terminal-ui/components/text-area',
  identity: 'required',
  structure: 'leaf',
  semantics: 'semantic',
  accessibleRole: 'textbox',
  states: ['disabled', 'readOnly', 'busy'],
  metadata: ['focus', 'layer', 'styles'],
  parts: [
    'value',
    'placeholder',
    'selection',
    'cursor',
    'error',
    'gutter',
    'lineNumber',
    'activeLine',
    'decoration',
    'scrollbarTrack', 'scrollbarThumb',
  ],
  visualStates: ['focused', 'hovered', 'active', 'selected', 'disabled', 'readOnly'],
  createModel: (value) => createTextAreaModel(value),
  inspection: ({ model }) => {
    if (!model.sourceReady) return { details: { layoutPending: true }, validation: inspectValidation(model.required, '') };
    const selection = model.selection === undefined
      ? undefined
      : textDocumentSelectionRange(model.document, model.selection, model.caret);
    return {
      value: inspectTextDocumentValue(model.document),
      ...(selection === undefined ? {} : { selection: inspectTextSelection(selection) }),
      details: { caretOffset: model.caret.position.offset },
      validation: inspectValidation(model.required, model.error),
    };
  },
  measure: measureTextArea,
  onLayout(input) {
    const request = committedTextAreaLayoutRequest(input);
    if (request !== undefined) return { kind: 'layoutRequest', request };
    const snapshot = textAreaCommittedLayout(input);
    return snapshot === undefined ? ignoreMessage() : { kind: 'layout', snapshot };
  },
  reuse: { paint: (model: object) => [model] as const },
  render: paintTextArea,
  keys: (input) => controlKeyBindings<TextAreaKeyAction, TextAreaComponentAction>(input.model.keymap, {
    ...textEditingHandlers(input.readOnly),
    ...(textAreaLayoutPending(input) ? textAreaPendingVisualHandlers() : textAreaVisualHandlers(input)),
    ...(input.readOnly ? {} : {
      undo: () => ({ kind: 'undo' }),
      redo: () => ({ kind: 'redo' }),
      newline: () => ({ kind: 'edit', operation: { kind: 'insert', text: '\n' } }),
    }),
  }),
  onInput: ({ text, readOnly }) =>
    readOnly ? ignoreMessage() : ({ kind: 'edit', operation: { kind: 'insert', text } }),
  onPaste: ({ text, readOnly }) =>
    readOnly ? ignoreMessage() : ({ kind: 'edit', operation: { kind: 'insert', text } }),
  focusTargets(input) {
    if (textAreaLayoutPending(input)) return [{ id: 'self', bounds: input.bounds }];
    const geometry = textAreaGeometry(input);
    const displayCaret = projectedCaret(geometry.projection, input.model.caret);
    const caret = geometry.layout.cursorAt(
      displayCaret.position.offset,
      displayCaret.position.affinity,
    );
    const row = caret.rowIndex - geometry.scrollbar.scroll.offsetRow;
    const column = geometry.prefixWidth +
      caret.columnCells -
      geometry.scrollbar.scroll.offsetColumn;
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
      ...(row < 0 || row >= geometry.scrollbar.contentBounds.height ? {} : {
        cursor: {
          row,
          column: Math.max(
            0,
            Math.min(
              Math.max(0, input.bounds.width - 1),
              column,
            ),
          ),
          ...(cursorStyle === undefined ? {} : { style: cursorStyle }),
          source: input.frameSource({ cellRole: 'cursor', partName: 'cursor', partType: 'cursor' }),
        },
      }),
    }];
  },
  hitTargets(input) {
    if (textAreaLayoutPending(input)) return [{
      id: `${input.id ?? 'text-area'}:pending`, bounds: input.bounds, cursor: 'text',
      focus: { kind: 'target' as const, targetId: 'self' },
      accepts: ['pointerDown', 'click', 'dragStart', 'drag', 'dragEnd', 'contextMenu', 'scroll'],
      message: () => ({ kind: 'unavailable' as const, reason: 'layout-pending' as const }),
    }];
    const geometry = textAreaGeometry(input);
    const selectionRange = input.model.selection === undefined
      ? undefined
      : textDocumentSelectionRange(input.model.document, input.model.selection, input.model.caret);
    return [
      textPointerTarget<TextAreaComponentAction>({
        id: `${input.id ?? 'text-area'}:text`,
        bounds: geometry.scrollbar.contentBounds,
        ...(selectionRange === undefined ? {} : { selection: selectionRange }),
        focusTargetId: 'self',
        offsetAt(event, origin) {
          return pointerOffset(
            input,
            origin === 'press'
              ? event.pressLocalRow ?? event.localRow ?? event.row
              : event.localRow ?? event.row,
            origin === 'press'
              ? event.pressLocalColumn ?? event.localColumn ?? event.column
              : event.localColumn ?? event.column,
          );
        },
        wordSelectionAt: (offset) => textAreaWordSelectionAt(input.model.document, offset),
        onPointer: (transition, event) => {
          const scrollRequest = textAreaDragScrollRequest(input, geometry, transition, event);
          return {
            kind: 'pointer',
            transition,
            ...(scrollRequest === undefined ? {} : { scrollRequest }),
          };
        },
        onContextMenu: (event) => ({ kind: 'contextMenu', event }),
      }),
      ...(input.model.scroll === undefined ? [] : componentScrollbarHitTargets<TextAreaComponentAction>({
        id: input.id ?? 'text-area',
        plan: geometry.scrollbar,
        ...(input.model.scrollPolicy === undefined ? {} : { policy: input.model.scrollPolicy }),
        onScroll: (request) => ({ kind: 'scroll', request }),
      })),
    ];
  },
  accessibility(input) {
    const { id, model, focused } = input;
    if (textAreaLayoutPending(input)) return { id, role: 'textbox', value: '', busy: true,
      description: 'Preparing editor layout', required: model.required, ...(focused ? { focused: true } : {}) };
    const geometry = textAreaGeometry(input);
    const scroll = geometry.scrollbar.scroll;
    const scrollGeometry = geometry.scrollbar.geometry;
    const visibleRows = Math.min(scrollGeometry.contentRows, scrollGeometry.viewportRows);
    const start = visibleRows === 0 ? 0 : scroll.offsetRow + 1;
    const end = visibleRows === 0
      ? 0
      : Math.min(scrollGeometry.contentRows, scroll.offsetRow + visibleRows);
    const logicalLines = geometry.usesPlaceholder
      ? 0
      : geometry.projection.accessibilityLineCount();
    const description = `${String(logicalLines)} lines. Showing ${String(start)}-${
      String(end)
    } of ${String(scrollGeometry.contentRows)} rows. Omitted before: ${
      String(scroll.offsetRow)
    }. Omitted after: ${String(Math.max(0, scrollGeometry.contentRows - end))}. Horizontal offset: ${
      String(scroll.offsetColumn)
    }.${model.selection === undefined ? '' : ' Selection active.'}${
      model.required ? ' Required.' : ''
    }${model.error === '' ? '' : ` ${model.error}`}`;
    const selection = model.selection === undefined
      ? undefined
      : textDocumentSelectionRange(model.document, model.selection, model.caret);
    const accessibilityCaret = geometry.usesPlaceholder
      ? 0
      : geometry.projection.accessibilityOffsetAtSourceOffset(
          model.caret.position.offset,
          model.caret.position.affinity
        );
    const accessibilitySelection = geometry.usesPlaceholder || selection === undefined
      ? undefined
      : {
          startOffset: geometry.projection.accessibilityOffsetAtSourceOffset(
            selection.startOffset,
            'downstream'
          ),
          endOffsetExclusive: geometry.projection.accessibilityOffsetAtSourceOffset(
            selection.endOffsetExclusive,
            'upstream'
          )
        };
    const accessibilityWindow = geometry.usesPlaceholder
      ? undefined
      : geometry.projection.accessibilityWindow(
          accessibilityCaret,
          Math.min(
            65_536,
            Math.max(4_096, scrollGeometry.viewportRows * input.bounds.width * 8),
          ),
        );
    return {
      id,
      role: 'textbox',
      value: accessibilityWindow?.text ?? textDocumentText(model.document),
      ...(accessibilityWindow === undefined ? {} : {
        textWindow: {
          startOffset: accessibilityWindow.startOffset,
          endOffsetExclusive: accessibilityWindow.endOffsetExclusive,
          totalLength: accessibilityWindow.totalLength,
        },
      }),
      textPosition: {
        caretOffset: accessibilityCaret,
        ...(accessibilitySelection === undefined ? {} : { selection: accessibilitySelection }),
      },
      description,
      required: model.required,
      invalid: model.error !== '',
      ...(model.error === '' ? {} : {
        errorMessage: `${id}:error`,
        children: [{ id: `${id}:error`, role: 'text' as const, value: model.error }],
      }),
      ...(focused ? { focused: true } : {}),
    };
  },
});

export const textArea: TextAreaFactory = (options) => {
  assertOptionalCallback(options.onLayout, 'text-area onLayout');
  assertOptionalCallback(options.onLayoutRequest, 'text-area onLayoutRequest');
  assertOptionalCallback(options.onContextMenu, 'text-area onContextMenu');
  if (options.disabled === true && options.onTransition === undefined) {
    const { onContextMenu, ...rest } = withoutTransitionCallback(options);
    void onContextMenu;
    return instantiateTextArea({ ...rest, disabled: true, onAction: (action) => action.kind === 'layoutRequest' ? options.onLayoutRequest?.(action.request) ?? ignoreMessage() : action.kind === 'layout' ? options.onLayout?.(action.snapshot) ?? ignoreMessage() : ignoreMessage() });
  }
  assertRequiredPropertyCallback(options, 'onTransition', 'textArea onTransition');
  if (!isScrollableTextArea(options)) {
    const { onTransition, onContextMenu, ...componentOptions } = options;
    return instantiateTextArea({
      ...componentOptions,
      onAction: (action) => action.kind === 'layoutRequest' ? options.onLayoutRequest?.(action.request) ?? ignoreMessage() : action.kind === 'layout'
        ? options.onLayout?.(action.snapshot) ?? ignoreMessage()
        : action.kind === 'contextMenu'
        ? onContextMenu?.(action.event) ?? ignoreMessage()
        : action.kind === 'scroll' ? ignoreMessage() : onTransition(action),
    });
  }
  const { onTransition, onContextMenu, ...componentOptions } = options;
  return instantiateTextArea({
    ...componentOptions,
    onAction: (action) => action.kind === 'layoutRequest' ? options.onLayoutRequest?.(action.request) ?? ignoreMessage() : action.kind === 'layout'
        ? options.onLayout?.(action.snapshot) ?? ignoreMessage()
        : action.kind === 'contextMenu'
      ? onContextMenu?.(action.event) ?? ignoreMessage()
      : onTransition(action),
  });
};

function isScrollableTextArea<TMessage extends ComponentMessage>(
  options: Exclude<TextAreaOptions<TMessage>, { readonly disabled: true }>,
): options is ScrollableTextAreaOptions<TMessage> {
  return hasScrollState(options.state);
}

function hasScrollState(value: unknown): boolean {
  return isNonArrayObject(value) && Reflect.get(value, 'scroll') !== undefined;
}
