import { defineComponent } from '../../dist/components/index.js';

const unitMeasurement = Object.freeze({
  minWidth: 0,
  minHeight: 0,
  preferredWidth: 1,
  preferredHeight: 1
});

export const leafComponentDefinition = Object.freeze({
  structure: 'leaf',
  name: 'testLeaf',
  parts: Object.freeze([]),
  measure: () => unitMeasurement
});

export const compositeComponentDefinition = Object.freeze({
  structure: 'composite',
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

export function componentElement({ definition, ...options }) {
  return defineComponent({
    semantics: 'semantic',
    ...definition
  })(options);
}
