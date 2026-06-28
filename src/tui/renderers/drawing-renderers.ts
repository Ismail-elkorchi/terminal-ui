import {
  absoluteAccessibleBase,
  absoluteChildBounds,
  canvasAccessibleBase,
  overlayAccessibleBase,
  overlayChildBounds,
  renderCanvas,
  surfaceAccessibleBase,
  surfaceChildBounds
} from '../drawing-widgets.ts';
import { focusTarget, hasKeyboardOrInputMap } from './support/common.ts';
import type { RendererMap } from './types.ts';

export const drawingRenderers = {
  canvas: {
    render: (input) => {
      renderCanvas(input);
    },
    accessibility: ({ widget, id, focused }) => canvasAccessibleBase(widget, id, focused),
    focusTargets: ({ widget, bounds }) => hasKeyboardOrInputMap(widget) ? [focusTarget(bounds)] : []
  },
  surface: {
    layout: ({ widget, bounds }) => surfaceChildBounds(widget, bounds),
    render: (input) => {
      input.renderChildren();
    },
    accessibility: ({ widget, id, focused }) => surfaceAccessibleBase(widget, id, focused)
  },
  absolute: {
    layout: ({ widget, bounds }) => absoluteChildBounds(widget, bounds),
    render: (input) => {
      input.renderChildren();
    },
    accessibility: ({ id, focused }) => absoluteAccessibleBase(id, focused)
  },
  overlay: {
    layout: ({ widget, bounds }) => overlayChildBounds(widget, bounds),
    render: (input) => {
      input.renderChildren();
    },
    accessibility: ({ id, focused }) => overlayAccessibleBase(id, focused)
  }
} satisfies RendererMap<'canvas' | 'surface' | 'absolute' | 'overlay'>;
