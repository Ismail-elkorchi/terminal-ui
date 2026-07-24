import {
  prepareTextDocument,
  textDocumentLength,
  textDocumentLineCount
} from '../../../text/index.ts';
import { statusIndicatorText } from '../text-rendering.ts';
import { richTextBlock } from '../text-rendering.ts';
import { textAreaInputContentBounds } from '../input-visual.ts';
import { measureBlock, measureSize, measureText } from '../measurement.ts';
import { stringify } from '../render-node-props.ts';
import { layoutTextAreaDocument } from '../text-area/layout.ts';
import { textAreaWrapEnabled } from '../text-area/render-model.ts';
import { constrainedMeasureBounds } from './measurement-support.ts';
import type { RendererMeasurementMap } from './types.ts';

export const textMeasurements = {
  text: ({ renderNode, widthProfile }) => measureText(stringify(renderNode.props.content), { widthProfile }),
  richText: ({ renderNode, bounds, theme, widthProfile }) => measureBlock(
    richTextBlock(renderNode, constrainedMeasureBounds(bounds), theme, widthProfile),
    { widthProfile }
  ),
  textArea: ({ renderNode, bounds, theme, widthProfile }) => {
    const document = textDocumentLength(renderNode.props.document) === 0
      && (renderNode.props.placeholder?.length ?? 0) > 0
      ? prepareTextDocument(renderNode.props.placeholder ?? '')
      : renderNode.props.document;
    const contentBounds = textAreaInputContentBounds(
      bounds,
      theme,
      widthProfile,
      renderNode,
      textDocumentLineCount(document)
    );
    const layout = layoutTextAreaDocument(
      document,
      contentBounds.width,
      textAreaWrapEnabled(renderNode),
      widthProfile
    );
    const gutterColumns = Math.max(0, bounds.width - contentBounds.width);
    return measureSize(layout.intrinsicColumns + gutterColumns, layout.contentRows);
  },
  statusIndicator: ({ renderNode, theme, widthProfile }) => measureText(
    statusIndicatorText(renderNode, theme),
    { widthProfile }
  )
} satisfies RendererMeasurementMap<'text' | 'richText' | 'textArea' | 'statusIndicator'>;
