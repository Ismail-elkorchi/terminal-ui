import type { ElementStyles } from '../../element/metadata.ts';
import { renderNodeId } from '../../foundation/identity.ts';
import type { ScrollPolicy } from '../../interaction/scroll.ts';
import type { ScrollbarOptions } from '../../interaction/scrollbar.ts';
import type { RenderNode, RenderNodeOfKind } from '../../renderer/model/index.ts';
import type { MenuAction } from '../../ui-model/menu.ts';
import type { MenuStylePart } from '../../ui-model/style-parts.ts';
import type { MenuPresentation } from '../../ui-model/menu.ts';
import { normalizeBorderTitle } from '../../visual/border.ts';
import { menuItemsForRenderer } from './interaction.ts';

export interface MenuPopupInput<TMessage> {
  readonly ownerId: string;
  readonly presentation: MenuPresentation;
  readonly title?: string;
  readonly emptyText?: string;
  readonly scrollbar?: ScrollbarOptions;
  readonly scrollPolicy?: ScrollPolicy;
  readonly styles?: ElementStyles<MenuStylePart>;
  readonly toActionMessage?: (action: MenuAction) => TMessage;
}

export function menuPopupRenderNode<TMessage>(input: MenuPopupInput<TMessage>): RenderNode<TMessage> {
  return {
    id: renderNodeId(`${input.ownerId}:popup`, 'menu popup'),
    kind: 'surface',
    props: {
      variant: 'raised',
      border: { kind: 'rounded' },
      padding: 0,
      ...(input.title === undefined ? {} : { title: normalizeBorderTitle(input.title) })
    },
    children: [menuPopupCollection(input)],
    layer: { zIndex: 20, underlay: 'clear' },
    focus: { disabled: true }
  };
}

function menuPopupCollection<TMessage>(input: MenuPopupInput<TMessage>): RenderNodeOfKind<TMessage, 'menu'> {
  const toActionMessage = input.toActionMessage;
  return {
    id: renderNodeId(`${input.ownerId}:popup:menu`, 'menu popup collection'),
    kind: 'menu',
    props: {
      items: menuItemsForRenderer(input.presentation.items),
      presentation: input.presentation,
      ...(input.emptyText === undefined ? {} : { emptyText: input.emptyText }),
      ...(input.scrollbar === undefined ? {} : { scrollbar: input.scrollbar }),
      ...(input.scrollPolicy === undefined ? {} : { scrollPolicy: input.scrollPolicy }),
      ...(toActionMessage === undefined ? {} : {
        toActionMessage,
        toScrollMessage: (event) => toActionMessage({ kind: 'scroll', event })
      })
    },
    ...(input.styles === undefined ? {} : { styles: input.styles }),
    focus: { disabled: true }
  };
}
