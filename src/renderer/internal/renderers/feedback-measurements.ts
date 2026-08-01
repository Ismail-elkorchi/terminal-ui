import { notificationPreferredSize } from '../notifications.ts';
import { progressText } from '../progress-bar-rendering.ts';
import { statusBarText } from '../feedback-visual.ts';
import {
  activityIndicatorBlock,
  helpBarText
} from '../text-rendering.ts';
import { measureBlock, measureSize, measureText } from '../measurement.ts';
import type { RendererMeasurementMap } from './types.ts';

export const feedbackMeasurements = {
  statusBar: ({ renderNode, theme, widthProfile }) => measureText(
    statusBarText(renderNode, theme, widthProfile),
    { widthProfile }
  ),
  helpBar: ({ renderNode, widthProfile }) => measureText(helpBarText(renderNode, widthProfile), { widthProfile }),
  activityIndicator: ({ renderNode, theme, widthProfile }) => measureBlock(
    activityIndicatorBlock(renderNode, theme),
    { widthProfile }
  ),
  progressBar: ({ renderNode, theme, widthProfile }) => measureText(
    progressText(renderNode, theme, widthProfile),
    { widthProfile }
  ),
  notificationRegion: ({ renderNode, widthProfile }) => {
    const preferred = notificationPreferredSize(renderNode, widthProfile);
    return measureSize(preferred.width, preferred.height);
  },
  notificationHistory: ({ renderNode, widthProfile }) => {
    const preferred = notificationPreferredSize(renderNode, widthProfile);
    return measureSize(preferred.width, preferred.height);
  }
} satisfies RendererMeasurementMap<'statusBar' | 'helpBar' | 'activityIndicator' | 'progressBar' | 'notificationRegion' | 'notificationHistory'>;
