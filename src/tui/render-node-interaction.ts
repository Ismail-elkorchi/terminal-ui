export function renderNodeInteractionDisabled(widget: { readonly props: object }): boolean {
  return Reflect.get(widget.props, 'disabled') === true;
}
