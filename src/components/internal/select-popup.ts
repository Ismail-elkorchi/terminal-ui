import type { ElementStyles } from '../../element/metadata.ts';
import type { RenderNode, RenderNodeOfKind } from '../../renderer/model/index.ts';
import { renderNodeId } from '../../foundation/identity.ts';
import type { ScrollbarOptions } from '../../interaction/scrollbar.ts';
import type { ChoiceItem } from '../../ui-model/contracts.ts';
import type { SelectAction } from '../../ui-model/choice-controls.ts';
import type { ListAction } from '../../ui-model/list.ts';
import type { ListCollectionRecord } from '../../ui-model/list.ts';
import type { SelectPresentation } from '../../ui-model/choice-controls.ts';
import { completeCollection } from '../../ui-model/collection.ts';
import { prepareListView } from '../../ui-model/list-view.ts';
import { popupSurfaceRenderNode } from './popup-surface.ts';

export interface SelectPopupInput<TMessage> {
  readonly parentElementId: string;
  readonly options: readonly ChoiceItem<unknown>[];
  readonly presentation: Extract<SelectPresentation, { readonly kind: 'open' }>;
  readonly scrollbar?: ScrollbarOptions;
  readonly styles?: ElementStyles;
  readonly toActionMessage: (action: SelectAction) => TMessage;
}

export function selectPopupRenderNode<TMessage>(input: SelectPopupInput<TMessage>): RenderNode<TMessage> {
  return popupSurfaceRenderNode({
    parentElementId: input.parentElementId,
    child: selectPopupList(input)
  });
}

function selectPopupList<TMessage>(input: SelectPopupInput<TMessage>): RenderNodeOfKind<TMessage, 'list'> {
  const toActionMessage = input.toActionMessage;
  const collection = completeCollection(input.options.map((option, index): ListCollectionRecord<unknown> => ({
    id: option.id,
    itemIndex: index,
    value: option.value,
    item: {
      id: option.id,
      label: option.label,
      ...(option.description === undefined ? {} : { description: option.description }),
      disabled: option.disabled === true
    }
  })));
  return {
    id: renderNodeId(`${input.parentElementId}:popup:list`, 'select popup list'),
    kind: 'list',
    props: {
      view: prepareListView(collection),
      ...(input.presentation.highlighted === undefined ? {} : { selectedId: input.presentation.highlighted }),
      ...(input.presentation.scroll === undefined ? {} : { scroll: input.presentation.scroll }),
      ...(input.scrollbar === undefined ? {} : { scrollbar: input.scrollbar }),
      ...(input.presentation.scroll === undefined ? {} : {
        toScrollMessage: (event) => toActionMessage({ kind: 'scroll', event })
      }),
      toActionMessage: (action) => toActionMessage(selectActionForList(action))
    },
    focus: { disabled: true },
    ...stylesProperty(input.styles)
  };
}

function selectActionForList(action: ListAction): SelectAction {
  switch (action.kind) {
    case 'select':
    case 'activate': return { kind: 'commit', id: action.id };
    case 'move': return action;
    case 'page': return { kind: 'move', delta: action.delta };
    case 'first': return action;
    case 'last': return action;
    case 'scroll': return action;
  }
}

function stylesProperty(styles: ElementStyles | undefined): { readonly styles?: ElementStyles } {
  const popupStyles = selectPopupStyles(styles);
  return popupStyles === undefined ? {} : { styles: popupStyles };
}

function selectPopupStyles(styles: ElementStyles | undefined): ElementStyles | undefined {
  if (styles === undefined) return undefined;
  const parts = styles.parts;
  return {
    ...(styles.root === undefined ? {} : { root: styles.root }),
    ...(parts === undefined ? {} : {
      parts: {
        ...(parts['marker'] === undefined ? {} : { marker: parts['marker'] }),
        ...(parts['option'] === undefined ? {} : { item: parts['option'] }),
        ...(parts['description'] === undefined ? {} : { description: parts['description'] })
      }
    }),
    ...(styles.states === undefined ? {} : { states: styles.states })
  };
}
