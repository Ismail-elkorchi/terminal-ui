import { prepareTextAreaLayout, textArea, type PreparedTextAreaLayout,
  type TextAreaOptions, type TextAreaLayoutRequest } from '@ismail-elkorchi/terminal-ui/components';
import { prepareTextAreaLayout as prepareFormTextArea } from '@ismail-elkorchi/terminal-ui/components/forms';
import { createTextDocument, defaultTextWidthProfile } from '@ismail-elkorchi/terminal-ui/text';
import { defaultTheme } from '@ismail-elkorchi/terminal-ui/theme';

const document = createTextDocument('wrapped editor');
type Message = { readonly kind: 'edit' } | { readonly kind: 'layout'; readonly request: TextAreaLayoutRequest };
const options: TextAreaOptions<Message> = {
  id: 'editor', state: { document, caret: { position: { offset: 0, affinity: 'downstream' } } },
  wrap: true, onTransition: () => ({ kind: 'edit' as const }), preparedLayout: null,
  onLayoutRequest: request => ({ kind: 'layout', request }),
};
const context = { signal: new AbortController().signal, yield: () => Promise.resolve() };
function prepare(request: TextAreaLayoutRequest): Promise<PreparedTextAreaLayout> {
  void prepareFormTextArea(request, context);
  return prepareTextAreaLayout(request, context);
}
function admitted(preparedLayout: PreparedTextAreaLayout) {
  const prepared = textArea({ ...options, preparedLayout });
  const width: number = preparedLayout.width;
  // @ts-expect-error admitted layout dependencies are immutable
  preparedLayout.width = 40;
  // @ts-expect-error capabilities do not expose internal geometry or source managers
  void preparedLayout.geometry;
  // @ts-expect-error callbacks and application option objects are not retained in public results
  void preparedLayout.options;
  return [prepared, width];
}
// @ts-expect-error prepared layout capabilities cannot be forged structurally
const forged: PreparedTextAreaLayout = { document, width: 80, height: 24, wrap: true,
  widthProfile: defaultTextWidthProfile, theme: defaultTheme };
// @ts-expect-error request capabilities must originate in the accepted-layout notification
const forgedRequest: TextAreaLayoutRequest = { document, layoutRevision: '1', width: 80, height: 24,
  widthProfile: defaultTextWidthProfile, theme: defaultTheme, measurementWidths: [80] };
// @ts-expect-error component preparation does not accept manually guessed content dimensions
void prepareTextAreaLayout({ contentWidth: 78, height: 24, theme: defaultTheme, widthProfile: defaultTextWidthProfile }, context);
void [prepare, admitted, forged, forgedRequest];
