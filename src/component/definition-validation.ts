import { isAccessibleRole } from '../accessibility/index.ts';
import { elementStateFields } from '../element/metadata.ts';
import { isNonArrayObject } from '../foundation/validation.ts';

function assertSlotDefinitions(value: unknown, structure: 'leaf' | 'composite' | 'composed'): void {
  if (value === undefined) return;
  if (structure === 'leaf') throw new TypeError('Only composite or composed components can declare slots.');
  if (!isNonArrayObject(value)) throw new TypeError('Component definition slots must be an object.');
  for (const [name, slot] of Object.entries(value)) {
    if (!/^[A-Za-z][A-Za-z0-9_.-]*$/u.test(name)) {
      throw new TypeError(`Component slot name "${name}" is invalid.`);
    }
    if (!isNonArrayObject(slot)) throw new TypeError(`Component slot "${name}" must be an object.`);
    const owner = slot['owner'];
    if (slot['cardinality'] !== 'one'
      && slot['cardinality'] !== 'optional'
      && slot['cardinality'] !== 'many') {
      throw new TypeError(`Component slot "${name}" cardinality is invalid.`);
    }
    if (owner !== 'caller' && owner !== 'implementation') {
      throw new TypeError(`Component slot "${name}" owner is invalid.`);
    }
    if (slot['messages'] !== 'bubble' && slot['messages'] !== 'capture' && slot['messages'] !== 'none') {
      throw new TypeError(`Component slot "${name}" message policy is invalid.`);
    }
  }
}

export function assertDefinition(value: unknown): void {
  if (!isNonArrayObject(value)) throw new TypeError('Component definition must be an object.');
  const structure = value['structure'];
  const semantics = value['semantics'];
  if (structure !== 'leaf' && structure !== 'composite' && structure !== 'composed') {
    throw new TypeError('Component definition structure must be "leaf", "composite", or "composed".');
  }
  if (semantics !== 'semantic' && semantics !== 'decorative') {
    throw new TypeError('Component definition semantics must be "semantic" or "decorative".');
  }
  assertDefinitionIdentityAndAnatomy(value);
  assertDefinitionSlots(value, structure);
  assertDefinitionHooks(value, structure);
  assertDefinitionSemantics(value, structure, semantics);
  assertDefinitionInteraction(value, structure, semantics);
}

type ComponentDefinitionStructure = 'leaf' | 'composite' | 'composed';
type ComponentDefinitionSemantics = 'semantic' | 'decorative';

function assertDefinitionIdentityAndAnatomy(value: Readonly<Record<string, unknown>>): void {
  if (typeof value['name'] !== 'string' || !isQualifiedComponentName(value['name'])) {
    throw new TypeError('Component name must be a safe package-qualified identifier such as "acme/widgets/badge".');
  }
  const parts = value['parts'];
  if (parts !== undefined && (!Array.isArray(parts)
    || parts.some((part) => typeof part !== 'string'
      || !/^[A-Za-z][A-Za-z0-9_.-]*$/u.test(part)
      || part === 'root')
    || new Set(parts).size !== parts.length)) {
    throw new TypeError('Component parts must contain unique safe identifiers other than "root".');
  }
  if (value['identity'] !== 'required' && value['identity'] !== 'optional') {
    throw new TypeError('Component definition identity must be "required" or "optional".');
  }
  assertUniqueStringMembers(value['states'], elementStateFields, 'Component definition states');
  assertUniqueStringMembers(
    value['visualStates'],
    ['focused', 'hovered', 'pressed', 'selected', 'disabled', 'active', 'busy', 'readOnly'],
    'Component definition visualStates',
  );
  assertUniqueStringMembers(value['metadata'], ['focus', 'layer', 'styles'], 'Component definition metadata');
}

function assertDefinitionSlots(
  value: Readonly<Record<string, unknown>>,
  structure: ComponentDefinitionStructure,
): void {
  assertSlotDefinitions(value['slots'], structure);
  const slots = value['slots'];
  if (structure === 'composite' && (!isNonArrayObject(slots) || Object.keys(slots).length === 0)) {
    throw new TypeError('Composite component definitions require at least one named slot.');
  }
  const slotValues = isNonArrayObject(slots) ? Object.values(slots) : [];
  const hasCapturedSlot = slotValues.some((slot) => isNonArrayObject(slot) && slot['messages'] === 'capture');
  if (hasCapturedSlot !== (value['capture'] !== undefined)) {
    throw new TypeError('Component definition capture must be declared exactly when a slot captures messages.');
  }
  const hasImplementationSlot = slotValues.some(
    (slot) => isNonArrayObject(slot) && slot['owner'] === 'implementation'
  );
  if (structure === 'composed' && hasImplementationSlot) {
    throw new TypeError('Composed component slots must be caller-owned; compose() owns its implementation tree.');
  }
  if (structure !== 'composed' && hasImplementationSlot !== (value['implementationSlots'] !== undefined)) {
    throw new TypeError(
      'Component definition implementationSlots must be declared exactly when a slot is implementation-owned.'
    );
  }
}

function assertDefinitionHooks(
  value: Readonly<Record<string, unknown>>,
  structure: ComponentDefinitionStructure,
): void {
  const requiredHooks = structure === 'leaf'
    ? ['measure', 'render']
    : structure === 'composite'
      ? ['measure', 'layout']
      : ['compose'];
  for (const hook of requiredHooks) {
    if (typeof value[hook] !== 'function') throw new TypeError(`Component definition requires ${hook}().`);
  }
  for (const hook of optionalComponentDefinitionHooks) {
    if (value[hook] !== undefined && typeof value[hook] !== 'function') {
      throw new TypeError(`Component definition ${hook} must be a function when provided.`);
    }
  }
  if (value['createModel'] !== undefined && typeof value['createModel'] !== 'function') {
    throw new TypeError('Component definition createModel must be a function when provided.');
  }
  if (value['inspection'] !== undefined && typeof value['inspection'] !== 'function') {
    throw new TypeError('Component definition inspection must be a function when provided.');
  }
}

const optionalComponentDefinitionHooks = [
  'renderBeforeChildren',
  'renderAfterChildren',
  'capture',
  'implementationSlots',
  'layer',
  'focusScope',
  'focusTargets',
  'hitTargets',
  'keys',
  'onInput',
  'onPaste',
  'onFocus',
  'onFocusTarget',
  'focusNavigation',
] as const;

function assertDefinitionSemantics(
  value: Readonly<Record<string, unknown>>,
  structure: ComponentDefinitionStructure,
  semantics: ComponentDefinitionSemantics,
): void {
  if (structure !== 'leaf' && semantics === 'decorative') {
    throw new TypeError('Decorative component definitions must be leaf components.');
  }
  if (semantics === 'semantic' && typeof value['accessibility'] !== 'function') {
    throw new TypeError('Semantic component definition requires accessibility().');
  }
  if (semantics === 'semantic'
    && typeof value['accessibleRole'] !== 'function'
    && !isAccessibleRole(value['accessibleRole'])) {
    throw new TypeError('Semantic component definition accessibleRole must be an accessibility role or resolver.');
  }
  if (semantics === 'decorative' && value['accessibleRole'] !== undefined) {
    throw new TypeError('Decorative component definitions cannot declare accessibleRole.');
  }
  if (semantics === 'decorative' && value['accessibility'] !== undefined) {
    throw new TypeError('Decorative component definitions cannot define accessibility().');
  }
  if (semantics === 'decorative' && value['inspection'] !== undefined) {
    throw new TypeError('Decorative component definitions cannot define inspection().');
  }
}

function assertDefinitionInteraction(
  value: Readonly<Record<string, unknown>>,
  structure: ComponentDefinitionStructure,
  semantics: ComponentDefinitionSemantics,
): void {
  if (semantics === 'decorative' && decorativeInteractionFields.some((field) => value[field] !== undefined)) {
    throw new TypeError('Decorative component definitions cannot declare state or interaction.');
  }
  if (value['sensitiveInput'] !== undefined && typeof value['sensitiveInput'] !== 'boolean') {
    throw new TypeError('Component definition sensitiveInput must be a boolean.');
  }
  if (value['sensitiveInput'] === true && value['onInput'] === undefined && value['onPaste'] === undefined) {
    throw new TypeError('A sensitive-input component must declare onInput or onPaste.');
  }
  if (value['onFocusTarget'] !== undefined && value['focusTargets'] === undefined) {
    throw new TypeError('A component with onFocusTarget() must declare focusTargets().');
  }
  if (structure === 'leaf'
    && semantics === 'semantic'
    && value['focusTargets'] === undefined
    && (
      value['keys'] !== undefined
      || value['onInput'] !== undefined
      || value['onPaste'] !== undefined
      || value['onFocus'] !== undefined
      || value['focusNavigation'] !== undefined
      || value['sensitiveInput'] === true
    )) {
    throw new TypeError(
      'A semantic leaf component with keyboard, text, paste, or focus-owned behavior must declare focusTargets().'
    );
  }
  if (value['clipChildren'] !== undefined && typeof value['clipChildren'] !== 'boolean') {
    throw new TypeError('Component definition clipChildren must be a boolean.');
  }
}

const decorativeInteractionFields = [
  'states',
  'keys',
  'onInput',
  'onPaste',
  'onFocus',
  'onFocusTarget',
  'focusNavigation',
  'focusTargets',
  'hitTargets',
  'focusScope',
] as const;

function assertUniqueStringMembers(
  value: unknown,
  allowedValues: readonly string[],
  subject: string
): void {
  if (value === undefined) return;
  if (!Array.isArray(value)
    || value.some((member) => typeof member !== 'string' || !allowedValues.includes(member))
    || new Set(value).size !== value.length) {
    throw new TypeError(`${subject} must contain unique supported values.`);
  }
}

function isQualifiedComponentName(value: string): boolean {
  return /^(?:@[A-Za-z][A-Za-z0-9_.-]*\/[A-Za-z][A-Za-z0-9_.-]*|[A-Za-z][A-Za-z0-9_.-]*)(?:\/[A-Za-z][A-Za-z0-9_.-]*)+$/u.test(value);
}
