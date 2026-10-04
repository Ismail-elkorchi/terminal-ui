import type { TextPresentation } from '../../text/presentation.ts';
import { mapComponentAction } from '../message.ts';
import type { AccessibleNode } from '../../accessibility/types.ts';
import type { ElementState } from '../../element/metadata.ts';
import { executeSynchronousRenderCallback } from '../../foundation/synchronous-render.ts';
import { findUnsupportedField, isNonArrayObject } from '../../foundation/validation.ts';
import type { Rect } from '../../geometry/types.ts';
import type {
  ComponentRenderTarget,
  FocusTarget,
  LayoutNode,
  Measurement,
  RenderTarget,
} from '../../renderer/contracts.ts';
import type {
  RenderNode,
  RenderNodeRenderer,
} from '../../renderer/internal/render-tree/component-node.ts';
import { resolveRenderNodeStyle } from '../../renderer/internal/render-tree/component-node.ts';
import type { TextWidthProfile } from '../../text/types.ts';
import type { TerminalTheme } from '../../theme/theme.ts';
import { renderNodeFrameSource } from '../../visual/frame-source.ts';
import { decodeComponentHitTargets, mappedKeyBindings } from '../action-routing.ts';
import type {
  ComponentAccessibleSlotValues,
  ComponentIdentity,
  ComponentInput,
  ComponentInteractionInput,
  ComponentMetadataCapability,
  ComponentRenderInput,
  ComponentSlotMeasurements,
  ComponentSlotShape,
  ComponentSlotsDefinition,
  ComponentStateCapability,
  ComponentVisualState,
} from '../contracts.ts';
import { executeComponentPhase } from '../execution-error.ts';
import type {
  CompiledComponentDefinition,
  ComponentRuntimeContract,
  ComponentSlotRange,
} from './runtime-contracts.ts';

export function adaptDefinition<
  TOptions extends object,
  TModel extends object,
  TAction,
  TPart extends string,
  TStates extends readonly ComponentStateCapability[],
  TIdentity extends ComponentIdentity,
  TMetadata extends readonly ComponentMetadataCapability[],
  TSlots extends ComponentSlotsDefinition,
  TVisualStates extends readonly ComponentVisualState[]
>(compiled: CompiledComponentDefinition<
  TOptions,
  TModel,
  TAction,
  TPart,
  TStates,
  TIdentity,
  TMetadata,
  TSlots,
  TVisualStates
>): RenderNodeRenderer<unknown, 'component'> {
  const { contract, definition } = compiled;
  const onLayout = definition.semantics === 'decorative' ? undefined : definition.onLayout;
  const renderer: RenderNodeRenderer<unknown, 'component'> = {
    ...(onLayout === undefined ? {} : {
      onLayout: (input) => executeComponentPhase(definition.name, input.renderNode.id, 'layout', () => {
        const previous = input.previous;
        const action = onLayout.call(undefined, {
          ...componentInput<TModel>(input.renderNode, input.layoutNode.bounds, input.layoutNode.viewport, input.theme, input.widthProfile, input.textPresentation),
          commitId: input.commitId,
          allocatedBounds: input.layoutNode.bounds,
          ...(previous === undefined ? {} : { previous: {
            ...componentInput<TModel>(previous.renderNode, previous.layoutNode.bounds, previous.layoutNode.viewport, previous.theme, previous.widthProfile, previous.textPresentation),
            allocatedBounds: previous.layoutNode.bounds,
          } }),
        });
        return mapComponentAction(action, input.renderNode.props.toActionMessage);
      }),
    }),
    ...(definition.semantics !== 'semantic' || definition.keys === undefined
      ? {}
      : {
          keyMap: (input) => executeComponentPhase(
            definition.name,
            input.renderNode.id,
            'keyboard',
            () => mappedKeyBindings(
              definition.keys?.call(undefined, {
                ...componentInput<TModel>(
                  input.renderNode,
                  input.layoutNode.bounds,
                  input.layoutNode.viewport,
                  input.theme,
                  input.widthProfile,
                  input.textPresentation,
                ),
                focus: input.focus,
                ...(input.focusedTargetId === undefined
                  ? {}
                  : { focusedTargetId: input.focusedTargetId }),
              }),
              input.renderNode.props.toActionMessage,
              definition.name,
              input.renderNode.id,
            ),
          ),
        }),
    ...(definition.structure !== 'leaf' && definition.clipChildren === true ? { clipChildren: true } : {}),
    measure: (input) => executeComponentPhase(definition.name, input.renderNode.id, 'measure', () =>
      definition.structure === 'composed'
        ? input.measureChild(0)
        : definition.measure.call(undefined, {
            ...componentBaseInput<TModel>(input.renderNode, input.theme, input.widthProfile, input.textPresentation),
            constraints: { width: input.bounds.width, height: input.bounds.height },
            childCount: input.childCount,
            measureChild: input.measureChild,
            slots: componentSlotMeasurements(input.renderNode.props.slots, input.measureChild)
          })
    ),
    ...(definition.structure === 'leaf' ? {} : {
      layout: (input) => executeComponentPhase(definition.name, input.renderNode.id, 'layout', () =>
        definition.structure === 'composed'
          ? [input.bounds]
          : decodeComponentLayout(definition.layout.call(undefined, {
              ...componentInput<TModel>(input.renderNode, input.bounds, input.viewport, input.theme, input.widthProfile, input.textPresentation),
              childCount: input.childCount,
              measureChild: input.measureChild,
              slots: componentSlotMeasurements(input.renderNode.props.slots, input.measureChild)
            }), contract, input.renderNode.props.slots, localBounds(input.bounds), input.childCount)
              .map((bounds) => bounds === null ? null : toAbsoluteRect(bounds, input.bounds))
      )
    }),
    render: (input) => {
      const renderInput = componentRenderInput<TModel, TPart>(contract, input);
      if (definition.structure === 'leaf') {
        executeComponentPhase(definition.name, input.renderNode.id, 'paint', () => {
          executeSynchronousRenderCallback(definition.render, renderInput, 'Component render');
        });
        return;
      }
      if (definition.structure === 'composed') {
        input.renderChildren();
        return;
      }
      if (definition.renderBeforeChildren !== undefined) {
        const renderBeforeChildren = definition.renderBeforeChildren;
        executeComponentPhase(definition.name, input.renderNode.id, 'paint', () => {
          executeSynchronousRenderCallback(renderBeforeChildren, renderInput, 'Component renderBeforeChildren');
        });
      }
      input.renderChildren();
      if (definition.renderAfterChildren !== undefined) {
        const renderAfterChildren = definition.renderAfterChildren;
        executeComponentPhase(definition.name, input.renderNode.id, 'paint', () => {
          executeSynchronousRenderCallback(renderAfterChildren, renderInput, 'Component renderAfterChildren');
        });
      }
    },
    ...(definition.semantics === 'decorative' ? {} : {
      accessibility: (input) => executeComponentPhase(
        definition.name,
        input.renderNode.id,
        'accessibility',
        () => {
          const accessible = definition.accessibility.call(undefined, {
            ...componentInput<TModel>(
              input.renderNode,
              input.layoutNode.bounds,
              input.layoutNode.viewport,
              input.theme,
              input.widthProfile,
              input.textPresentation
            ),
            id: input.id,
            focused: input.focused,
            focus: input.focus,
            ...(input.focusedTargetId === undefined ? {} : { focusedTargetId: input.focusedTargetId }),
            children: input.children,
            slots: accessibleSlotValues<TSlots>(
              input.renderNode.props.slots,
              input.renderNode.children ?? [],
              input.layoutNode.children,
              input.accessibleNodes
            )
          });
          return input.renderNode.props.accessibleName === undefined
            ? accessible
            : { ...accessible, label: input.renderNode.props.accessibleName };
        },
      ),
      ...(definition.focusTargets === undefined ? {} : {
        focusTargets: (input) => executeComponentPhase(definition.name, input.renderNode.id, 'focus', () =>
          definition.focusTargets.call(undefined, componentInteractionInput(
            contract,
            input.renderNode,
            input.bounds,
            input.viewport,
            input.theme,
            input.widthProfile,
              input.textPresentation
          )).map((target) => toAbsoluteFocusTarget(target, input.bounds))
        )
      }),
      ...(definition.hitTargets === undefined ? {} : {
        hitTargets: (input) => executeComponentPhase(definition.name, input.renderNode.id, 'pointer', () =>
          decodeComponentHitTargets(
            definition.hitTargets?.call(undefined, componentInteractionInput(
              contract,
              input.renderNode,
              input.bounds,
              input.layoutNode.viewport,
              input.theme,
              input.widthProfile,
              input.textPresentation
            )) ?? [],
            input.bounds,
            input.renderNode.props.toActionMessage,
            definition.name,
            input.renderNode.id
          ))
      })
    })
  };
  return Object.freeze(renderer);
}

function accessibleSlotValues<TSlots extends ComponentSlotShape>(
  ranges: readonly ComponentSlotRange[],
  roots: readonly RenderNode[],
  layouts: readonly LayoutNode[],
  accessibleNodes: ReadonlyMap<RenderNode, AccessibleNode>
): ComponentAccessibleSlotValues<TSlots> {
  return Object.freeze(Object.fromEntries(ranges.map((range) => [
    range.name,
    Object.freeze(range.accessiblePaths.flatMap((path) => {
      const root = renderNodeAtPath(roots, layouts, path);
      const accessible = root === undefined ? undefined : accessibleNodes.get(root);
      return accessible === undefined ? [] : [accessible];
    }))
  ]))) as ComponentAccessibleSlotValues<TSlots>;
}

function renderNodeAtPath(
  roots: readonly RenderNode[],
  layouts: readonly LayoutNode[],
  path: readonly number[]
): RenderNode | undefined {
  let nodes = roots;
  let layoutNodes = layouts;
  let current: RenderNode | undefined;
  for (const index of path) {
    current = nodes[index];
    const layout = layoutNodes[index];
    if (current === undefined || layout?.visible !== true || layout.inert) return undefined;
    nodes = current.children ?? [];
    layoutNodes = layout.children;
  }
  return current;
}

function componentBaseInput<TModel extends object>(
  renderNode: {
    readonly id?: string;
    readonly props: { readonly model: unknown; readonly accessibleName?: string };
    readonly state?: ElementState;
  },
  theme: TerminalTheme,
  widthProfile: TextWidthProfile,
  textPresentation?: TextPresentation,
): Omit<ComponentInput<TModel>, 'bounds' | 'viewport'> {
  return {
    ...(renderNode.id === undefined ? {} : { id: renderNode.id }),
    ...(renderNode.props.accessibleName === undefined
      ? {}
      : { accessibleName: renderNode.props.accessibleName }),
    model: renderNode.props.model as Readonly<TModel>,
    disabled: renderNode.state?.disabled === true,
    busy: renderNode.state?.busy === true,
    readOnly: renderNode.state?.readOnly === true,
    inert: renderNode.state?.inert === true,
    theme,
    widthProfile,
    textPresentation
  };
}

function componentInput<TModel extends object>(
  renderNode: {
    readonly id?: string;
    readonly props: { readonly model: unknown; readonly accessibleName?: string };
    readonly state?: ElementState;
  },
  bounds: Rect,
  viewport: Rect,
  theme: TerminalTheme,
  widthProfile: TextWidthProfile,
  textPresentation?: TextPresentation,
): ComponentInput<TModel> {
  return {
    ...componentBaseInput<TModel>(renderNode, theme, widthProfile, textPresentation),
    bounds: localBounds(bounds),
    viewport: localViewport(bounds, viewport)
  };
}

function assertComponentRenderTarget(target: RenderTarget): asserts target is ComponentRenderTarget {
  if (target.coordinateSpace !== 'component') {
    throw new TypeError('Component rendering requires a zero-based component drawing target.');
  }
}

function componentRenderInput<TModel extends object, TPart extends string>(
  contract: ComponentRuntimeContract,
  input: Parameters<RenderNodeRenderer<unknown, 'component'>['render']>[0]
): ComponentRenderInput<TModel, TPart> {
  const buffer = input.buffer;
  assertComponentRenderTarget(buffer);
  return {
    ...componentInteractionInput<TModel, TPart>(
      contract,
      input.renderNode,
      input.layoutNode.bounds,
      input.layoutNode.viewport,
      input.theme,
      input.widthProfile,
              input.textPresentation
    ),
    target: buffer,
    focus: input.focus,
    ...(input.focusedTargetId === undefined ? {} : { focusedTargetId: input.focusedTargetId }),
    ...(input.pointerState === undefined ? {} : { pointerState: input.pointerState }),
  };
}

function componentInteractionInput<TModel extends object, TPart extends string>(
  contract: ComponentRuntimeContract,
  renderNode: Parameters<typeof resolveRenderNodeStyle>[0] & {
    readonly props: { readonly model: unknown };
    readonly state?: ElementState;
  },
  bounds: Rect,
  viewport: Rect,
  theme: TerminalTheme,
  widthProfile: TextWidthProfile,
  textPresentation?: TextPresentation,
): ComponentInteractionInput<TModel, TPart> {
  return {
    ...componentInput<TModel>(renderNode, bounds, viewport, theme, widthProfile, textPresentation),
    ...(renderNode.styles === undefined ? {} : { styles: renderNode.styles }),
    ...componentHelpers<TPart>(renderNode, contract)
  };
}

function componentHelpers<TPart extends string>(
  renderNode: Parameters<typeof resolveRenderNodeStyle>[0],
  contract: ComponentRuntimeContract
): Pick<ComponentRenderInput<object, TPart>, 'style' | 'frameSource'> {
  const cachedByContract = componentHelperCache.get(renderNode) ?? new WeakMap<object, ComponentHelpers>();
  componentHelperCache.set(renderNode, cachedByContract);
  const cached = cachedByContract.get(contract);
  if (cached !== undefined) return cached;
  const styles = new Map<string, ReturnType<typeof resolveRenderNodeStyle>>();
  const sources = new Map<string, ReturnType<typeof renderNodeFrameSource>>();
  const helpers: ComponentHelpers = {
    style(input) {
      if (input.part !== 'root' && !contract.partSet.has(input.part)) {
        throw new TypeError(`Component "${contract.name}" requested undeclared style part "${input.part}".`);
      }
      const unsupportedState = input.states?.find((state) => !contract.visualStateSet.has(state));
      if (unsupportedState !== undefined) {
        throw new TypeError(
          `Component "${contract.name}" requested undeclared visual state "${unsupportedState}".`,
        );
      }
      const key = JSON.stringify(input);
      if (styles.has(key)) return styles.get(key);
      const style = resolveRenderNodeStyle(renderNode, input);
      styles.set(key, style);
      return style;
    },
    frameSource(input = {}) {
      const description = input.description ?? input.partName;
      const key = JSON.stringify({ ...input, description });
      const cachedSource = sources.get(key);
      if (cachedSource !== undefined) return cachedSource;
      const source = renderNodeFrameSource({
        ...(renderNode.id === undefined ? {} : { id: renderNode.id }),
        kind: contract.name
      }, {
        rendererFamily: 'component',
        cellRole: 'content',
        ...input,
        ...(description === undefined ? {} : { description })
      });
      sources.set(key, source);
      return source;
    }
  };
  cachedByContract.set(contract, helpers);
  return helpers;
}

type ComponentHelpers = Pick<ComponentRenderInput<object>, 'style' | 'frameSource'>;
const componentHelperCache = new WeakMap<object, WeakMap<object, ComponentHelpers>>();

function decodeChildBounds(values: unknown, parent: Rect, childCount: number): readonly (Rect | null)[] {
  if (!Array.isArray(values)) throw new TypeError('Composite component layout must return an array.');
  if (values.length !== childCount) {
    throw new RangeError(`Composite component layout returned ${String(values.length)} bounds for ${String(childCount)} children.`);
  }
  return Object.freeze(values.map((value, index) => {
    if (value === null) return null;
    if (!rectHasValidCoordinates(value) || !rectFits(value, parent)) {
      throw new RangeError(`Composite component child ${String(index)} returned bounds outside its parent.`);
    }
    return Object.freeze({ ...value });
  }));
}

function componentSlotMeasurements(
  ranges: readonly { readonly name: string; readonly start: number; readonly count: number }[],
  measureChild: (index: number) => Measurement
): ComponentSlotMeasurements<ComponentSlotsDefinition> {
  const byName = new Map(ranges.map((range) => [range.name, range]));
  return Object.freeze({
    count(name: string) {
      return byName.get(name)?.count ?? 0;
    },
    measure(name: string, index = 0) {
      const range = byName.get(name);
      if (range === undefined || !Number.isSafeInteger(index) || index < 0 || index >= range.count) {
        throw new RangeError(`Component slot "${name}" has no child at index ${String(index)}.`);
      }
      return measureChild(range.start + index);
    }
  });
}

function decodeComponentLayout(
  value: unknown,
  definition: ComponentRuntimeContract,
  ranges: readonly { readonly name: string; readonly start: number; readonly count: number }[],
  parent: Rect,
  childCount: number
): readonly (Rect | null)[] {
  if (!isNonArrayObject(value)) throw new TypeError('Composite component layout must return a slot bounds object.');
  const allowed = new Set(definition.slots.map((slot) => slot.name));
  const unsupported = findUnsupportedField(value, allowed);
  if (unsupported !== undefined) {
    throw new TypeError(`Composite component layout contains unknown slot "${unsupported}".`);
  }
  const flattened: (Rect | null)[] = [];
  for (const slot of definition.slots) {
    const range = ranges.find((candidate) => candidate.name === slot.name);
    const count = range?.count ?? 0;
    const current = value[slot.name];
    const bounds = slot.cardinality === 'many'
      ? current
      : current === undefined ? [] : [current];
    if (!Array.isArray(bounds) || bounds.length !== count) {
      throw new RangeError(
        `Composite component slot "${slot.name}" returned invalid bounds for ${String(count)} children.`
      );
    }
    flattened.push(...bounds as (Rect | null)[]);
  }
  return decodeChildBounds(flattened, parent, childCount);
}

function localBounds(bounds: Rect): Rect {
  return Object.freeze({ row: 0, column: 0, width: bounds.width, height: bounds.height });
}

function localViewport(bounds: Rect, viewport: Rect): Rect {
  const top = Math.max(bounds.row, viewport.row);
  const left = Math.max(bounds.column, viewport.column);
  const bottom = Math.min(bounds.row + bounds.height, viewport.row + viewport.height);
  const right = Math.min(bounds.column + bounds.width, viewport.column + viewport.width);
  return Object.freeze({
    row: Math.max(0, top - bounds.row),
    column: Math.max(0, left - bounds.column),
    width: Math.max(0, right - left),
    height: Math.max(0, bottom - top)
  });
}

function toAbsoluteRect(value: Rect, allocation: Rect): Rect {
  return Object.freeze({
    row: allocation.row + value.row,
    column: allocation.column + value.column,
    width: value.width,
    height: value.height
  });
}

function toAbsoluteFocusTarget(target: FocusTarget, allocation: Rect): FocusTarget {
  return Object.freeze({
    ...target,
    bounds: toAbsoluteRect(target.bounds, allocation),
    ...(target.cursor === undefined
      ? {}
      : {
          cursor: Object.freeze({
            ...target.cursor,
            row: allocation.row + target.cursor.row,
            column: allocation.column + target.cursor.column
          })
        })
  });
}

function rectHasValidCoordinates(value: unknown): value is Rect {
  if (!isNonArrayObject(value)) return false;
  const width = value['width'];
  const height = value['height'];
  return Number.isSafeInteger(value['row'])
    && Number.isSafeInteger(value['column'])
    && typeof width === 'number'
    && Number.isSafeInteger(width)
    && width >= 0
    && typeof height === 'number'
    && Number.isSafeInteger(height)
    && height >= 0;
}

function rectFits(value: Rect, parent: Rect): boolean {
  return value.row >= parent.row
    && value.column >= parent.column
    && value.row + value.height <= parent.row + parent.height
    && value.column + value.width <= parent.column + parent.width;
}
