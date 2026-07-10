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
import { stringify } from '../render-node-props.ts';
import { writeRenderBlock } from './support/block.ts';
import type { RendererMap } from './types.ts';

export const feedbackRenderers = {
  statusBar: {
    render: ({ renderNode, layoutNode, buffer }) => {
      writeRenderBlock(buffer, layoutNode.bounds, statusBarBlock(renderNode));
    },
    accessibility: ({ renderNode, id }) => ({
      id,
      role: 'status',
      label: id,
      value: stringify(renderNode.props.text),
      live: 'polite'
    })
  },
  helpBar: {
    render: ({ renderNode, layoutNode, buffer }) => {
      writeRenderBlock(buffer, layoutNode.bounds, helpBarBlock(renderNode, layoutNode.bounds.width));
    },
    accessibility: ({ renderNode, id }) => helpBarAccessibleBase(renderNode, id)
  },
  spinner: {
    render: ({ renderNode, layoutNode, buffer, theme }) => {
      writeRenderBlock(buffer, layoutNode.bounds, spinnerBlock(renderNode, theme));
    },
    accessibility: ({ renderNode, id }) => spinnerAccessibleBase(renderNode, id)
  },
  progressBar: {
    render: ({ renderNode, layoutNode, buffer, theme }) => {
      writeRenderBlock(buffer, layoutNode.bounds, progressBlock(renderNode, theme, layoutNode.bounds.width));
    },
    accessibility: ({ renderNode, id }) => progressAccessibleBase(renderNode, id)
  },
  notificationStack: {
    render: ({ renderNode, layoutNode, buffer, theme }) => {
      renderNotificationStack(renderNode, buffer, layoutNode.bounds, theme);
    },
    accessibility: ({ renderNode, id, focused }) => notificationStackAccessibleBase(renderNode, id, focused),
    hitTargets: ({ renderNode, bounds }) => notificationStackHitTargets(renderNode, bounds)
  }
} satisfies RendererMap<'statusBar' | 'helpBar' | 'spinner' | 'progressBar' | 'notificationStack'>;
