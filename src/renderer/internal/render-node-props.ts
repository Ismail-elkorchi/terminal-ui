export function numberProp(renderNode: { readonly props: object }, key: PropertyKey): number | undefined {
  const value = Reflect.get(renderNode.props, key) as unknown;
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}
