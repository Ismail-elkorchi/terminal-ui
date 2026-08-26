export type ComponentDefinitionName = `${string}/${string}`;

export type ComponentExecutionPhase =
  | 'createModel'
  | 'inspection'
  | 'compose'
  | 'measure'
  | 'layout'
  | 'paint'
  | 'accessibility'
  | 'focus'
  | 'action'
  | 'pointer'
  | 'keyboard'
  | 'input'
  | 'paste'
  | 'metadata';

export class ComponentExecutionError extends Error {
  override readonly name = 'ComponentExecutionError';
  readonly component: ComponentDefinitionName;
  readonly instanceId: string | undefined;
  readonly phase: ComponentExecutionPhase;

  constructor(input: {
    readonly component: ComponentDefinitionName;
    readonly instanceId?: string;
    readonly phase: ComponentExecutionPhase;
    readonly cause: unknown;
  }) {
    const detail = input.cause instanceof Error && input.cause.message.length > 0
      ? ` ${input.cause.message}`
      : '';
    super(
      `Component "${input.component}" failed during ${input.phase}${
        input.instanceId === undefined ? '' : ` for instance "${input.instanceId}"`
      }.${detail}`,
      { cause: input.cause }
    );
    this.component = input.component;
    this.instanceId = input.instanceId;
    this.phase = input.phase;
  }
}

export function executeComponentPhase<TValue>(
  component: ComponentDefinitionName,
  instanceId: string | undefined,
  phase: ComponentExecutionPhase,
  operation: () => TValue
): TValue {
  try {
    return operation();
  } catch (cause) {
    if (cause instanceof ComponentExecutionError) throw cause;
    throw new ComponentExecutionError({
      component,
      ...(instanceId === undefined ? {} : { instanceId }),
      phase,
      cause
    });
  }
}
