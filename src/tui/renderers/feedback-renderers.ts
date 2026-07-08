import {
  helpBarAccessibleBase,
  spinnerAccessibleBase,
} from '../text-widgets.ts';
import {
  helpBarBlock,
  statusBarBlock,
  spinnerBlock
} from '../feedback-visual.ts';
import {
  progressAccessibleBase,
  progressBlock
} from '../progress-widget.ts';
import {
  notificationStackAccessibleBase,
  notificationStackHitTargets,
  renderNotificationStack
} from '../notifications.ts';
import { stringify } from '../widget-props.ts';
import { writeRenderBlock } from './support/block.ts';
import type { RendererMap } from './types.ts';

export const feedbackRenderers = {
  statusBar: {
    render: ({ widget, node, buffer }) => {
      writeRenderBlock(buffer, node.bounds, statusBarBlock(widget));
    },
    accessibility: ({ widget, id }) => ({
      id,
      role: 'status',
      label: id,
      value: stringify(widget.props['text']),
      live: 'polite'
    })
  },
  helpBar: {
    render: ({ widget, node, buffer }) => {
      writeRenderBlock(buffer, node.bounds, helpBarBlock(widget, node.bounds.width));
    },
    accessibility: ({ widget, id }) => helpBarAccessibleBase(widget, id)
  },
  spinner: {
    render: ({ widget, node, buffer, theme }) => {
      writeRenderBlock(buffer, node.bounds, spinnerBlock(widget, theme));
    },
    accessibility: ({ widget, id }) => spinnerAccessibleBase(widget, id)
  },
  progressBar: {
    render: ({ widget, node, buffer, theme }) => {
      writeRenderBlock(buffer, node.bounds, progressBlock(widget, theme, node.bounds.width));
    },
    accessibility: ({ widget, id }) => progressAccessibleBase(widget, id)
  },
  notificationStack: {
    render: ({ widget, node, buffer, theme }) => {
      renderNotificationStack(widget, buffer, node.bounds, theme);
    },
    accessibility: ({ widget, id, focused }) => notificationStackAccessibleBase(widget, id, focused),
    hitTargets: ({ widget, bounds }) => notificationStackHitTargets(widget, bounds)
  }
} satisfies RendererMap<'statusBar' | 'helpBar' | 'spinner' | 'progressBar' | 'notificationStack'>;
