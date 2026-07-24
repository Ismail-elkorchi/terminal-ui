import { notificationStackPreferredSize } from '../notifications.ts';
import { progressText } from '../progress-bar-rendering.ts';
import { statusBarText } from '../feedback-visual.ts';
import { helpBarText, spinnerBlock } from '../text-rendering.ts';
import { measureBlock, measureSize, measureText } from '../measurement.ts';
import type { RendererMeasurementMap } from './types.ts';

export const feedbackMeasurements = {
  statusBar: ({ renderNode, theme, widthProfile }) => measureText(
    statusBarText(renderNode, theme, widthProfile),
    { widthProfile }
  ),
  helpBar: ({ renderNode, widthProfile }) => measureText(helpBarText(renderNode, widthProfile), { widthProfile }),
  spinner: ({ renderNode, theme, widthProfile }) => measureBlock(spinnerBlock(renderNode, theme), { widthProfile }),
  progressBar: ({ renderNode, theme, widthProfile }) => measureText(
    progressText(renderNode, theme, widthProfile),
    { widthProfile }
  ),
  notificationStack: ({ renderNode, widthProfile }) => {
    const preferred = notificationStackPreferredSize(renderNode, widthProfile);
    return measureSize(preferred.width, preferred.height);
  }
} satisfies RendererMeasurementMap<'statusBar' | 'helpBar' | 'spinner' | 'progressBar' | 'notificationStack'>;
