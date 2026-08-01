import type { ElementStyles } from '../../element/metadata.ts';
import { renderNodeId } from '../../foundation/identity.ts';
import type { ScrollPolicy } from '../../interaction/scroll.ts';
import type { ScrollbarOptions } from '../../interaction/scrollbar.ts';
import type { RenderNode, RenderNodeOfKind } from '../../renderer/model/index.ts';
import type { MenuAction } from '../../ui-model/menu.ts';
import type { MenuStylePart } from '../../ui-model/style-parts.ts';
import type { MenuPresentation } from '../../ui-model/menu.ts';
import { menuItemsForRenderer } from './interaction.ts';
import { popupSurfaceRenderNode } from './popup-surface.ts';

export interface MenuPopupInput<TMessage> {
  readonly parentElementId: string;
  readonly presentation: MenuPresentation;
  readonly title?: string;
  readonly emptyText?: string;
  readonly scrollbar?: ScrollbarOptions;
  readonly scrollPolicy?: ScrollPolicy;
  readonly styles?: ElementStyles<MenuStylePart>;
  readonly toActionMessage: (action: MenuAction) => TMessage;
}

export function menuPopupRenderNode<TMessage>(input: MenuPopupInput<TMessage>): RenderNode<TMessage> {
  return popupSurfaceRenderNode({
    parentElementId: input.parentElementId,
    child: menuPopupCollection(input),
    ...(input.title === undefined ? {} : { title: input.title })
  });
}

function menuPopupCollection<TMessage>(input: MenuPopupInput<TMessage>): RenderNodeOfKind<TMessage, 'menu'> {
  const toActionMessage = input.toActionMessage;
  return {
    id: renderNodeId(`${input.parentElementId}:popup:menu`, 'menu popup collection'),
    kind: 'menu',
    props: {
      items: menuItemsForRenderer(input.presentation.items),
      presentation: input.presentation,
      ...(input.emptyText === undefined ? {} : { emptyText: input.emptyText }),
      ...(input.scrollbar === undefined ? {} : { scrollbar: input.scrollbar }),
      ...(input.scrollPolicy === undefined ? {} : { scrollPolicy: input.scrollPolicy }),
      toActionMessage,
      toScrollMessage: (event) => toActionMessage({ kind: 'scroll', event })
    },
    ...(input.styles === undefined ? {} : { styles: input.styles }),
    focus: { disabled: true }
  };
}
