import {
  createTextDocument, prepareTextBuffer, prepareTextDocument, prepareTextDocumentLine,
  type CooperativeWorkContext, type PreparedTextBuffer, type PreparedTextDocumentLine,
  type TextDocument, type TextEditBuffer, type TextPreparationRequest,
} from '@ismail-elkorchi/terminal-ui/text';

const buffer: TextEditBuffer = { text: 'prepared source', cursor: 0 };
const document = createTextDocument(buffer.text);
const context: CooperativeWorkContext = { signal: new AbortController().signal, yield: () => Promise.resolve() };
const request: TextPreparationRequest = { throughOffset: 5, words: true, geometry: true,
  locale: 'en', widthProfile: { emoji: 'wide', ambiguous: 'narrow' },
};
const loaded: Promise<TextDocument> = prepareTextDocument(buffer.text, context);
const preparedBuffer: Promise<PreparedTextBuffer> = prepareTextBuffer(buffer, request, context);
const preparedLine: Promise<PreparedTextDocumentLine> = prepareTextDocumentLine(document, 0, request, context);
void prepareTextDocumentLine(document, 0, { throughColumnCells: 10 }, context);

void preparedBuffer.then(result => {
  const sameSource: TextEditBuffer = result.buffer;
  const source: string = result.text;
  // @ts-expect-error prepared request dependencies are immutable
  result.request.throughOffset = 6;
  // @ts-expect-error source managers and native iterators are not a public result
  void result.source;
  return [sameSource, source];
});
// @ts-expect-error preparation uses UTF-16 numeric offsets
void prepareTextBuffer(buffer, { throughOffset: '5' }, context);
// @ts-expect-error geometry policy accepts only supported width profiles
void prepareTextBuffer(buffer, { widthProfile: { emoji: 'auto', ambiguous: 'narrow' } }, context);
// @ts-expect-error obsolete or guessed viewport controls do not belong to source preparation
void prepareTextDocumentLine(document, 0, { viewportWidth: 80 }, context);
void [loaded, preparedBuffer, preparedLine];
