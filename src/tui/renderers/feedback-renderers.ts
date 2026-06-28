import {
  helpBarAccessibleBase,
  helpBarText,
  spinnerAccessibleBase,
  spinnerBlock
} from '../text-widgets.ts';
import {
  progressAccessibleBase,
  progressBlock
} from '../progress-widget.ts';
import { stringify } from '../widget-props.ts';
import { writeBlock, writeRenderBlock } from './support/block.ts';
import type { RendererMap } from './types.ts';

export const feedbackRenderers = {
  statusBar: {
    render: ({ widget, node, buffer }) => {
      writeBlock(buffer, node.bounds, stringify(widget.props['text']));
    },
    accessibility: ({ widget, id }) => ({
      id,
      role: 'status',
      label: id,
      value: stringify(widget.props['text'])
    })
  },
  helpBar: {
    render: ({ widget, node, buffer }) => {
      writeBlock(buffer, node.bounds, helpBarText(widget));
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
      writeRenderBlock(buffer, node.bounds, progressBlock(widget, theme));
    },
    accessibility: ({ widget, id }) => progressAccessibleBase(widget, id)
  }
} satisfies RendererMap<'statusBar' | 'helpBar' | 'spinner' | 'progressBar'>;
