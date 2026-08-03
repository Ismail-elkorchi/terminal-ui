import { defineComponent } from '../../dist/components/index.js';

const unitMeasurement = Object.freeze({
  minWidth: 0,
  minHeight: 0,
  preferredWidth: 1,
  preferredHeight: 1
});

export const leafComponentDefinition = Object.freeze({
  structure: 'leaf',
  name: 'terminal-ui-tests/components/testLeaf',
  parts: Object.freeze([]),
  decodeOptions: (value) => value,
  measure: () => unitMeasurement
});

export const compositeComponentDefinition = Object.freeze({
  structure: 'composite',
  name: 'terminal-ui-tests/components/testComposite',
  parts: Object.freeze([]),
  decodeOptions: (value) => value,
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
  const normalized = {
    semantics: 'semantic',
    ...definition
  };
  const emitsActions = normalized.hitTargets !== undefined
    || normalized.keys !== undefined
    || normalized.onInput !== undefined
    || normalized.onPaste !== undefined
    || normalized.pointer !== undefined;
  return defineComponent(normalized)({
    ...options,
    ...(emitsActions ? { onAction: (action) => action } : {})
  });
}
