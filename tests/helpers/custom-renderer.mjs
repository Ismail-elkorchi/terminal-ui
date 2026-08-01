const unitMeasurement = Object.freeze({
  minWidth: 0,
  minHeight: 0,
  preferredWidth: 1,
  preferredHeight: 1
});

export const leafRendererDefinition = Object.freeze({
  kind: 'leaf',
  name: 'testLeaf',
  parts: Object.freeze([]),
  measure: () => unitMeasurement
});

export const compositeRendererDefinition = Object.freeze({
  kind: 'composite',
  name: 'testComposite',
  parts: Object.freeze([]),
  measure: ({ childCount, measureChild }) => {
    const children = Array.from({ length: childCount }, (_unused, index) =>
      measureChild(index)
    );
    return {
      minWidth: Math.max(0, ...children.map((child) => child.minWidth)),
      minHeight: children.reduce((height, child) => height + child.minHeight, 0),
      preferredWidth: Math.max(
        0,
        ...children.map((child) => child.preferredWidth)
      ),
      preferredHeight: children.reduce(
        (height, child) => height + child.preferredHeight,
        0
      )
    };
  }
});
