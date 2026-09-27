export const key = (name, modifiers = {}) => ({
  kind: 'key', key: name, eventType: 'press', location: 'standard',
  modifiers: { ctrl: false, shift: false, alt: false, meta: false, ...modifiers },
});
