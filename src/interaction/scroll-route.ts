import type { RoutedPointerEvent } from '../input/pointer.ts';
import type { MessageResolution } from './message.ts';
import type { ScrollState } from './scroll.ts';

export const scrollRouteDescriptor = Symbol('terminal-ui.scroll-route');

export interface ScrollRouteStep<TMessage> {
  readonly nextState: ScrollState;
  readonly message: MessageResolution<TMessage>;
}

export interface ScrollRouteDescriptor<TMessage> {
  readonly state: ScrollState;
  route(event: RoutedPointerEvent, state: ScrollState): ScrollRouteStep<TMessage>;
}

export interface ScrollRoutable<TMessage> {
  readonly [scrollRouteDescriptor]?: ScrollRouteDescriptor<TMessage>;
}
