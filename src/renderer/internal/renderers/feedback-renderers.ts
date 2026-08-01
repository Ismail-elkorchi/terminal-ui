import {
  activityIndicatorAccessibleBase,
  helpBarAccessibleBase,
} from '../text-rendering.ts';
import {
  activityIndicatorBlock,
  helpBarBlock,
  statusBarBlock
} from '../feedback-visual.ts';
import {
  progressAccessibleBase,
  progressBlock
} from '../progress-bar-rendering.ts';
import {
  notificationAccessibleBase,
  notificationFocusTargets,
  notificationHitTargets,
  renderNotifications
} from '../notifications.ts';
import { statusBarAccessibleText } from '../feedback-visual.ts';
import { writeRenderBlock } from './support/block.ts';
import { feedbackMeasurements } from './feedback-measurements.ts';
import type { RendererMap } from './types.ts';

export const feedbackRenderers = {
  statusBar: {
    measure: feedbackMeasurements.statusBar,
    render: ({ renderNode, layoutNode, buffer, theme, widthProfile }) => {
      writeRenderBlock(buffer, layoutNode.bounds, statusBarBlock(renderNode, theme, widthProfile, layoutNode.bounds.width));
    },
    accessibility: ({ renderNode, id }) => ({
      id,
      role: 'status',
      label: id,
      value: statusBarAccessibleText(renderNode),
      live: 'polite'
    })
  },
  helpBar: {
    measure: feedbackMeasurements.helpBar,
    render: ({ renderNode, layoutNode, buffer, widthProfile }) => {
      writeRenderBlock(buffer, layoutNode.bounds, helpBarBlock(renderNode, widthProfile, layoutNode.bounds.width));
    },
    accessibility: ({ renderNode, id }) => helpBarAccessibleBase(renderNode, id)
  },
  activityIndicator: {
    measure: feedbackMeasurements.activityIndicator,
    render: ({ renderNode, layoutNode, buffer, theme }) => {
      writeRenderBlock(
        buffer,
        layoutNode.bounds,
        activityIndicatorBlock(renderNode, theme)
      );
    },
    accessibility: ({ renderNode, id }) =>
      activityIndicatorAccessibleBase(renderNode, id)
  },
  progressBar: {
    measure: feedbackMeasurements.progressBar,
    render: ({ renderNode, layoutNode, buffer, theme, widthProfile }) => {
      writeRenderBlock(buffer, layoutNode.bounds, progressBlock(renderNode, theme, widthProfile, layoutNode.bounds.width));
    },
    accessibility: ({ renderNode, id }) => progressAccessibleBase(renderNode, id)
  },
  notificationRegion: {
    measure: feedbackMeasurements.notificationRegion,
    render: ({ renderNode, layoutNode, buffer, theme }) => {
      renderNotifications(renderNode, buffer, layoutNode.bounds, theme);
    },
    accessibility: ({ renderNode, id, focused, focusedTargetId }) =>
      notificationAccessibleBase(renderNode, id, focused, focusedTargetId),
    focusTargets: ({ renderNode, bounds, widthProfile }) =>
      notificationFocusTargets(renderNode, bounds, widthProfile),
    hitTargets: ({ renderNode, bounds, widthProfile }) => notificationHitTargets(renderNode, bounds, widthProfile)
  },
  notificationHistory: {
    measure: feedbackMeasurements.notificationHistory,
    render: ({ renderNode, layoutNode, buffer, theme }) => {
      renderNotifications(renderNode, buffer, layoutNode.bounds, theme);
    },
    accessibility: ({ renderNode, id, focused, focusedTargetId }) =>
      notificationAccessibleBase(renderNode, id, focused, focusedTargetId),
    focusTargets: ({ renderNode, bounds, widthProfile }) =>
      notificationFocusTargets(renderNode, bounds, widthProfile),
    hitTargets: ({ renderNode, bounds, widthProfile }) =>
      notificationHitTargets(renderNode, bounds, widthProfile)
  }
} satisfies RendererMap<'statusBar' | 'helpBar' | 'activityIndicator' | 'progressBar' | 'notificationRegion' | 'notificationHistory'>;
