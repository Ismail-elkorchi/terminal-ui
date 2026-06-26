export type RuntimeTarget = 'node' | 'deno' | 'bun' | 'memory';

export type TerminalUiEntrypoint =
  | 'root'
  | 'host'
  | 'input'
  | 'protocol'
  | 'text'
  | 'theme'
  | 'prompts'
  | 'shell'
  | 'tui'
  | 'widgets'
  | 'accessibility'
  | 'transcript'
  | 'testing'
  | 'schemas';

export interface TerminalUiPackage {
  readonly name: '@ismail-elkorchi/terminal-ui';
  readonly version: string;
  readonly schemaVersion: 'terminal-ui.v1';
  readonly runtimeTargets: readonly RuntimeTarget[];
  readonly entrypoints: readonly TerminalUiEntrypoint[];
}

export const terminalUiPackage: TerminalUiPackage = {
  name: '@ismail-elkorchi/terminal-ui',
  version: '0.1.0',
  schemaVersion: 'terminal-ui.v1',
  runtimeTargets: ['node', 'deno', 'bun', 'memory'],
  entrypoints: [
    'root',
    'host',
    'input',
    'protocol',
    'text',
    'theme',
    'prompts',
    'shell',
    'tui',
    'widgets',
    'accessibility',
    'transcript',
    'testing',
    'schemas'
  ]
};
