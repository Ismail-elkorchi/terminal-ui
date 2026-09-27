import type { ComponentRenderInput } from '../../component/contracts.ts';
import type { RenderSpan, TerminalStyle } from '../../visual/render-content.ts';
import { span } from '../../visual/render-content.ts';

export function textEntryMarkerSpan<TModel extends { readonly error: string }, TPart extends string>(
  input: ComponentRenderInput<TModel, TPart>,
  style: TerminalStyle | undefined,
): RenderSpan {
  const marker = input.disabled
    ? ' '
    : input.model.error !== ''
    ? input.theme.tokens.symbols.statusError
    : input.focus === 'self'
    ? input.theme.tokens.symbols.pointer
    : input.theme.tokens.colors['control.background'] === undefined
    ? input.theme.tokens.symbols.borderSingle.vertical
    : ' ';
  return span(`${marker} `, {
    ...(style === undefined ? {} : { style }),
    source: input.frameSource({
      cellRole: 'decoration',
      partName: 'border',
      partType: 'frame',
      description: 'frame.prefix',
    }),
  });
}
