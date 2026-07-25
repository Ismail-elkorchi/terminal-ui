export const contractKinds = [
  'positive_type',
  'portable_runtime',
  'host_runtime',
  'schema_artifact'
] as const;

export type ContractKind = (typeof contractKinds)[number];

export type ContractArtifact = 'declarations' | 'npm_tarball' | 'jsr_source' | 'repository';
export type ContractRuntime = 'typecheck' | 'node' | 'deno' | 'bun';
export type ContractHost = 'none' | 'memory' | 'non_tty' | 'pty' | 'native';

export interface ContractScenario {
  readonly id: string;
  readonly entrypoints: readonly string[];
  readonly contracts: readonly ContractKind[];
  readonly artifacts: readonly ContractArtifact[];
  readonly runtimes: readonly ContractRuntime[];
  readonly hosts: readonly ContractHost[];
  readonly path: string;
  readonly runner: string;
}

const typedEntrypoints = [
  ['.', 'root'],
  ['./host', 'host'],
  ['./input', 'input'],
  ['./interaction', 'interaction'],
  ['./protocol', 'protocol'],
  ['./text', 'text'],
  ['./theme', 'theme'],
  ['./prompts', 'prompts'],
  ['./tui', 'tui'],
  ['./components', 'components'],
  ['./layout', 'layout'],
  ['./behavior', 'behavior'],
  ['./renderer', 'renderer'],
  ['./accessibility', 'accessibility'],
  ['./transcript', 'transcript'],
  ['./testing', 'testing'],
  ['./schemas', 'schemas']
] as const;

const typeScenarios: readonly ContractScenario[] = typedEntrypoints.map(([entrypoint, name]) => ({
  id: `types:${name}`,
  entrypoints: [entrypoint],
  contracts: ['positive_type'],
  artifacts: ['declarations'],
  runtimes: ['typecheck'],
  hosts: ['none'],
  path: `tests/contracts/types/${name}.contract.ts`,
  runner: 'check:test-types'
}));

const portableScenarios: readonly ContractScenario[] = [
  portableScenario({
    id: 'core-host-protocol',
    entrypoints: ['.', './host', './protocol'],
    hosts: ['memory']
  }),
  portableScenario({
    id: 'input-interaction-text',
    entrypoints: ['./input', './interaction', './text'],
    hosts: ['none']
  }),
  portableScenario({
    id: 'theme-authoring',
    entrypoints: ['./theme', './components', './layout', './behavior'],
    hosts: ['none']
  }),
  portableScenario({
    id: 'prompts-tui',
    entrypoints: ['./prompts', './tui'],
    hosts: ['non_tty']
  }),
  portableScenario({
    id: 'renderer-accessibility',
    entrypoints: ['./renderer', './accessibility'],
    hosts: ['none']
  }),
  portableScenario({
    id: 'transcript-testing-schemas',
    entrypoints: ['./transcript', './testing', './schemas'],
    hosts: ['memory']
  })
];

export const contractScenarios: readonly ContractScenario[] = [
  ...typeScenarios,
  ...portableScenarios,
  {
    id: 'host:native-lifecycle',
    entrypoints: ['./host'],
    contracts: ['host_runtime'],
    artifacts: ['repository'],
    runtimes: ['node'],
    hosts: ['native'],
    path: 'tests/integration/node-host-lifecycle.test.mjs',
    runner: 'check:integration'
  },
  {
    id: 'protocol:pty-session',
    entrypoints: ['./protocol'],
    contracts: ['host_runtime'],
    artifacts: ['repository'],
    runtimes: ['node'],
    hosts: ['pty'],
    path: 'tests/integration/runtime-session-integration.test.mjs',
    runner: 'check:integration'
  },
  {
    id: 'tui:pty-lifecycle',
    entrypoints: ['./tui'],
    contracts: ['host_runtime'],
    artifacts: ['repository'],
    runtimes: ['node'],
    hosts: ['pty'],
    path: 'tests/integration/pty-tui.test.mjs',
    runner: 'check:integration'
  },
  {
    id: 'tui:pty-resize',
    entrypoints: ['./tui'],
    contracts: ['host_runtime'],
    artifacts: ['repository'],
    runtimes: ['node'],
    hosts: ['pty'],
    path: 'tests/integration/resize-streaming.test.mjs',
    runner: 'check:integration'
  },
  {
    id: 'tui:pty-crash-restore',
    entrypoints: ['./tui'],
    contracts: ['host_runtime'],
    artifacts: ['repository'],
    runtimes: ['node'],
    hosts: ['pty'],
    path: 'tests/integration/restore-crash.test.mjs',
    runner: 'check:integration'
  },
  {
    id: 'schemas:npm-artifacts',
    entrypoints: ['./transcript', './schemas'],
    contracts: ['schema_artifact'],
    artifacts: ['npm_tarball'],
    runtimes: ['node', 'deno', 'bun'],
    hosts: ['none'],
    path: 'tests/contracts/runtime/schema-artifacts.mjs',
    runner: 'check:consumer'
  },
  {
    id: 'schemas:jsr-artifacts',
    entrypoints: ['./transcript', './schemas'],
    contracts: ['schema_artifact'],
    artifacts: ['jsr_source'],
    runtimes: ['deno'],
    hosts: ['none'],
    path: 'tests/contracts/runtime/schema-artifacts.mjs',
    runner: 'check:jsr'
  }
];

interface PortableScenarioDefinition {
  readonly id: string;
  readonly entrypoints: readonly string[];
  readonly hosts: readonly ContractHost[];
}

function portableScenario(definition: PortableScenarioDefinition): ContractScenario {
  return {
    id: `portable:${definition.id}`,
    entrypoints: definition.entrypoints,
    contracts: ['portable_runtime'],
    artifacts: ['npm_tarball'],
    runtimes: ['node', 'deno', 'bun'],
    hosts: definition.hosts,
    path: `tests/contracts/runtime/${definition.id}.mjs`,
    runner: 'check:consumer'
  };
}
