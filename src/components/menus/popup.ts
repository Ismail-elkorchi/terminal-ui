import type { ComponentMessage } from '../../component/message.ts';
import type { Element } from '../../element/types.ts';
import { popupAllowsDismissal, standardPopupDismissal } from '../../interaction/popup.ts';
import { portal, surface } from '../../layout/factories/surfaces.ts';
import type { MenuPopupOptions } from './contracts.ts';
import { menu, menuComponentTransition, publicMenuView } from './menu.ts';

export function menuPopup(options: MenuPopupOptions): Element<ComponentMessage> {
  const {
    id,
    view,
    accessibleName,
    maxVisibleItems,
    emit,
    dismissOutside,
    scrollbar,
    scrollPolicy,
    styles,
    placement = 'auto',
    busy = false,
  } = options;
  const popupMenu = menu({
    id: `${id ?? 'menu'}:popup:menu`,
    view: publicMenuView(view),
    ...(scrollbar === undefined ? {} : { scrollbar }),
    ...(scrollPolicy === undefined ? {} : { scrollPolicy }),
    ...(styles === undefined ? {} : { styles }),
    meta: { accessibleName },
    ...(busy ? { busy: true } : {}),
    onTransition: (transition) => emit(menuComponentTransition(transition)),
    onActivate: (event) => emit({ kind: 'activate', event }),
  });
  return portal(
    surface(popupMenu, {
      id: `${id ?? 'menu'}:popup`,
      appearance: 'raised',
      border: { kind: 'single' },
      maxHeight: maxVisibleItems + 2,
    }),
    {
      id: `${id ?? 'menu'}:portal`,
      anchor: { kind: 'allocation' },
      placement,
      margin: 0,
      fit: 'available',
      ...(popupAllowsDismissal(standardPopupDismissal, 'outsidePress')
        ? { onOutsidePress: dismissOutside }
        : {}),
      meta: { layer: { zIndex: 20, underlay: 'clear' } },
    },
  );
}
