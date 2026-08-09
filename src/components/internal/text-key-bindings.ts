import type { ElementKeyTriggerBinding } from '../../element/metadata.ts';
import type { TextEditOperation } from '../../text/index.ts';

export interface TextEditingAction {
  readonly kind: 'edit';
  readonly operation: TextEditOperation;
}

export function textEditingTriggers(
  readOnly: boolean,
  multiline: boolean
): readonly ElementKeyTriggerBinding<TextEditingAction>[] {
  const bindings: ElementKeyTriggerBinding<TextEditingAction>[] = [
    repeatingMovement('arrowLeft', 'moveLeft'),
    repeatingMovement('arrowRight', 'moveRight'),
    repeatingMovement('home', 'moveHome'),
    repeatingMovement('end', 'moveEnd'),
    movement('arrowLeft', 'moveLeft', { shift: true }),
    movement('arrowRight', 'moveRight', { shift: true }),
    movement('home', 'moveHome', { shift: true }),
    movement('end', 'moveEnd', { shift: true }),
    ...wordMovement('arrowLeft', 'moveWordLeft'),
    ...wordMovement('arrowRight', 'moveWordRight'),
    key('a', { ctrl: true }, { kind: 'selectAll' })
  ];
  if (multiline) {
    bindings.push(
      repeatingMovement('arrowUp', 'moveLineUp'),
      repeatingMovement('arrowDown', 'moveLineDown'),
      repeatingMovement('pageUp', 'movePageUp'),
      repeatingMovement('pageDown', 'movePageDown'),
      movement('arrowUp', 'moveLineUp', { shift: true }),
      movement('arrowDown', 'moveLineDown', { shift: true }),
      movement('pageUp', 'movePageUp', { shift: true }),
      movement('pageDown', 'movePageDown', { shift: true })
    );
  }
  if (!readOnly) {
    bindings.push(
      repeatingEdit('backspace', { kind: 'deleteBackward' }),
      repeatingEdit('delete', { kind: 'deleteForward' }),
      ...wordDeletion('backspace', 'deleteWordBackward'),
      ...wordDeletion('delete', 'deleteWordForward')
    );
  }
  return bindings.flatMap((binding) =>
    binding.trigger.eventType === 'repeat'
      || (binding.trigger.kind === 'key' && binding.trigger.key === 'a')
      ? [binding]
      : [binding, repeat(binding)]);
}

function repeatingMovement(
  keyName: 'arrowLeft' | 'arrowRight' | 'arrowUp' | 'arrowDown' | 'pageUp' | 'pageDown' | 'home' | 'end',
  kind: 'moveLeft' | 'moveRight' | 'moveLineUp' | 'moveLineDown' | 'movePageUp' | 'movePageDown' | 'moveHome' | 'moveEnd'
): ElementKeyTriggerBinding<TextEditingAction> {
  return repeatingEdit(keyName, { kind });
}

function repeatingEdit(
  keyName: Parameters<typeof trigger>[0],
  operation: TextEditOperation
): ElementKeyTriggerBinding<TextEditingAction> {
  const binding = key(keyName, {}, operation);
  return repeat(binding);
}

function repeat(
  binding: ElementKeyTriggerBinding<TextEditingAction>
): ElementKeyTriggerBinding<TextEditingAction> {
  return {
    trigger: { ...binding.trigger, eventType: 'repeat' },
    onKey: binding.onKey
  };
}

function movement(
  keyName: 'arrowLeft' | 'arrowRight' | 'arrowUp' | 'arrowDown' | 'pageUp' | 'pageDown' | 'home' | 'end',
  kind: Extract<TextEditOperation, { readonly select?: boolean }>['kind'],
  modifiers: { readonly shift: true }
): ElementKeyTriggerBinding<TextEditingAction> {
  return key(keyName, modifiers, selectedMovement(kind));
}

function selectedMovement(
  kind: Extract<TextEditOperation, { readonly select?: boolean }>['kind']
): TextEditOperation {
  switch (kind) {
    case 'moveLeft': return { kind: 'moveLeft', select: true };
    case 'moveRight': return { kind: 'moveRight', select: true };
    case 'moveWordLeft': return { kind: 'moveWordLeft', select: true };
    case 'moveWordRight': return { kind: 'moveWordRight', select: true };
    case 'moveHome': return { kind: 'moveHome', select: true };
    case 'moveEnd': return { kind: 'moveEnd', select: true };
    case 'moveLineUp': return { kind: 'moveLineUp', select: true };
    case 'moveLineDown': return { kind: 'moveLineDown', select: true };
    case 'movePageUp': return { kind: 'movePageUp', select: true };
    case 'movePageDown': return { kind: 'movePageDown', select: true };
  }
}

function wordMovement(
  keyName: 'arrowLeft' | 'arrowRight',
  kind: 'moveWordLeft' | 'moveWordRight'
): readonly ElementKeyTriggerBinding<TextEditingAction>[] {
  return [
    key(keyName, { ctrl: true }, { kind }),
    key(keyName, { alt: true }, { kind }),
    key(keyName, { ctrl: true, shift: true }, { kind, select: true }),
    key(keyName, { alt: true, shift: true }, { kind, select: true })
  ];
}

function wordDeletion(
  keyName: 'backspace' | 'delete',
  kind: 'deleteWordBackward' | 'deleteWordForward'
): readonly ElementKeyTriggerBinding<TextEditingAction>[] {
  return [
    key(keyName, { ctrl: true }, { kind }),
    key(keyName, { alt: true }, { kind })
  ];
}

function key(
  keyName: Parameters<typeof trigger>[0],
  modifiers: Parameters<typeof trigger>[1],
  operation: TextEditOperation
): ElementKeyTriggerBinding<TextEditingAction> {
  return { trigger: trigger(keyName, modifiers), onKey: () => ({ kind: 'edit', operation }) };
}

function trigger(
  keyName: 'a' | 'arrowLeft' | 'arrowRight' | 'arrowUp' | 'arrowDown' | 'pageUp' | 'pageDown' | 'home' | 'end' | 'backspace' | 'delete',
  modifiers: { readonly ctrl?: boolean; readonly alt?: boolean; readonly shift?: boolean }
) {
  return { kind: 'key' as const, key: keyName, modifiers };
}
