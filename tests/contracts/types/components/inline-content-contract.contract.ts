import { button, richText, text, type InlineContent } from '@ismail-elkorchi/terminal-ui/components';
import { surface } from '@ismail-elkorchi/terminal-ui/layout';

const content: InlineContent = [
  { kind: 'text', text: 'Open', style: { fg: { kind: 'theme', token: 'text.default' } } },
  { kind: 'symbol', unicode: '→', ascii: '->', accessibleText: 'next' }
];
richText({ segments: content });
button({
  id: 'open',
  label: 'Open',
  onPress: () => undefined,
  leading: [{ kind: 'symbol', unicode: '◆', ascii: '*', accessibleText: 'status' }],
  meta: { styles: { parts: { label: { fg: { kind: 'theme', token: 'custom.brand' } } } } }
});
surface(text('body'), {
  title: [{ kind: 'symbol', unicode: '◆', ascii: '*', accessibleText: 'status' }],
  border: { kind: 'single' }
});

// @ts-expect-error frame source metadata is renderer-produced
richText({ segments: [{ kind: 'text', text: 'unsafe', source: { elementId: 'caller' } }] });
// @ts-expect-error symbolic content requires accessible text
richText({ segments: [{ kind: 'symbol', unicode: '→', ascii: '->' }] });
surface(text('invalid title source'), {
  // @ts-expect-error surface titles cannot supply renderer source metadata
  title: [{ kind: 'text', text: 'Title', source: { elementId: 'caller' } }]
});
button({
  id: 'invalid-token',
  label: 'Invalid',
  onPress: () => undefined,
  meta: {
    styles: {
      // @ts-expect-error custom color tokens require the custom.* namespace
      parts: { label: { fg: { kind: 'theme', token: 'brand.accent' } } }
    }
  }
});
