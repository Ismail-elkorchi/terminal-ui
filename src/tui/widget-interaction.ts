import type { Widget } from '../widgets/index.ts';

export function widgetInteractionDisabled(widget: Widget): boolean {
  return widget.props['disabled'] === true;
}
