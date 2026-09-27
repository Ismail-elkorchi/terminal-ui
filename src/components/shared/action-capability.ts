export type ComponentActionCapability =
  | 'navigate'
  | 'edit'
  | 'commitSelection'
  | 'activate'
  | 'changeStructure';

export interface ComponentActionAvailability {
  readonly busy?: boolean;
  readonly readOnly?: boolean;
}

export function allowsComponentAction(
  availability: ComponentActionAvailability,
  capability: ComponentActionCapability
): boolean {
  if (availability.busy === true) return false;
  return availability.readOnly !== true || capability === 'navigate';
}
