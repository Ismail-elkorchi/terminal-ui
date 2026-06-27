import assert from 'node:assert/strict';
import test from 'node:test';
import { defineCli, describeCli } from '@ismail-elkorchi/cli-core';

import { createMemoryTerminalHost } from '../../dist/host/index.js';
import { createCommandPalette, createShell, runShell } from '../../dist/shell/index.js';

function parsedInvocation(input) {
  const argv = input.split(/\s+/u).filter(Boolean);
  return {
    schemaVersion: 'cli-core.invocation.v1',
    ok: true,
    argv,
    command: undefined,
    commandPath: argv.slice(0, 1),
    usedAlias: undefined,
    options: { values: {}, present: {}, unknown: [], issues: [] },
    positionals: {},
    positionalList: argv.slice(1),
    passThrough: [],
    diagnostics: []
  };
}

function parsedShellInput(input) {
  return { ok: true, value: parsedInvocation(input) };
}

function parseArgv({ input }) {
  return { ok: true, value: splitShellWords(input) };
}

function splitShellWords(input) {
  const tokens = [];
  let token = '';
  let quote;

  for (const character of input) {
    if (quote !== undefined) {
      if (character === quote) {
        quote = undefined;
      } else {
        token += character;
      }
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
      continue;
    }
    if (/\s/u.test(character)) {
      if (token.length > 0) {
        tokens.push(token);
        token = '';
      }
      continue;
    }
    token += character;
  }

  if (token.length > 0) tokens.push(token);
  return Object.freeze(tokens);
}

function shellRunResult(exitStatus = 0) {
  return {
    schemaVersion: 'cli-core.run-result.v1',
    runId: 'test-run',
    mode: 'apply',
    invocation: parsedInvocation(''),
    ok: exitStatus === 0,
    exitKind: exitStatus === 0 ? 'ok' : 'external_error',
    exitStatus,
    events: [],
    effects: [],
    artifacts: [],
    diagnostics: []
  };
}

function cliDiagnostic(code, message, severity = 'warning') {
  return { code, message, severity, fields: {} };
}

function commandManifest(commands) {
  return describeCli(defineCli({ name: 'test', commands }));
}

test('shell dispatch parses, validates, runs, records history, and checkpoints state', async () => {
  const runs = [];
  const history = [];
  const checkpoints = [];
  const shell = createShell({
    commands: {
      kind: 'adapter',
      adapter: {
        describe: () => commandManifest([{ name: 'ship', description: 'Ship it' }]),
        parse: ({ input }) => parsedShellInput(input),
        validate: async (invocation) => ({ ok: invocation.argv?.[0] === 'ship' }),
        run: async (request) => {
          runs.push(request);
          return shellRunResult();
        }
      }
    },
    history: {
      read: async () => history,
      append: async (entry) => {
        history.push(entry);
      }
    },
    checkpoint: {
      enabled: true,
      read: async () => ({ input: 'draft' }),
      write: async (checkpoint) => {
        checkpoints.push(checkpoint);
      }
    }
  });

  assert.equal(shell.getState().input.text, '');
  await shell.dispatch({ kind: 'input', text: 'ship now' });
  assert.equal(shell.getState().input.text, 'ship now');
  assert.equal(shell.snapshot().root.children[0]?.value, 'ship now');

  const state = await shell.dispatch({ kind: 'submit' });

  assert.equal(state.mode, 'idle');
  assert.deepEqual(runs.map((run) => run.input), ['ship now']);
  assert.deepEqual(history.map((entry) => entry.input), ['ship now']);
  assert.equal(checkpoints.at(-1)?.input, '');
});

test('shell preserves cli-core diagnostics from successful parse, validation, and run stages', async () => {
  const parseWarning = cliDiagnostic('parse.note', 'Parser normalized the command.');
  const validationWarning = cliDiagnostic('validate.note', 'Validator used a default.');
  const runWarning = cliDiagnostic('run.note', 'Runner produced a warning.');
  const shell = createShell({
    commands: {
      kind: 'adapter',
      adapter: {
        describe: () => commandManifest([{ name: 'ship' }]),
        parse: ({ input }) => ({
          ok: true,
          value: { ...parsedInvocation(input), diagnostics: [parseWarning] }
        }),
        validate: async () => ({ ok: true, diagnostics: [validationWarning] }),
        run: async () => ({ ...shellRunResult(), diagnostics: [runWarning] })
      }
    }
  });

  await shell.dispatch({ kind: 'input', text: 'ship now' });
  const state = await shell.dispatch({ kind: 'submit' });

  assert.equal(state.lastCommand?.status, 'completed');
  assert.deepEqual(state.lastCommand?.diagnostics.map((item) => item.code), [
    'SHELL_COMMAND_PARSE_DIAGNOSTIC',
    'SHELL_COMMAND_VALIDATE_DIAGNOSTIC',
    'SHELL_COMMAND_RUN_DIAGNOSTIC'
  ]);
  assert.deepEqual(state.lastCommand?.diagnostics.map((item) => item.data?.cliCode), [
    'parse.note',
    'validate.note',
    'run.note'
  ]);
  assert.deepEqual(state.diagnostics.map((item) => item.message), [
    'Parser normalized the command.',
    'Validator used a default.',
    'Runner produced a warning.'
  ]);
});

test('shell exposes manifest-backed suggestions, command palette, and help previews', async () => {
  const commands = {
    kind: 'manifest',
    manifest: commandManifest([
      {
        name: 'deploy',
        aliases: ['ship'],
        description: 'Deploy an environment',
        positionals: [{ name: 'environment', required: true, description: 'Environment name' }]
      },
      {
        name: 'doctor',
        description: 'Inspect local setup'
      }
    ])
  };
  const shell = createShell({ commands });

  let state = await shell.dispatch({ kind: 'input', text: 'ship' });
  assert.equal(state.suggestions[0]?.label, 'deploy');
  assert.equal(state.transientLayer?.kind, 'suggestions');

  state = await shell.dispatch({ kind: 'palette', action: 'help' });
  assert.equal(state.transientLayer?.kind, 'help');
  assert.equal(state.transientLayer?.preview.usage, 'deploy <environment>');
  assert.match(shell.snapshot().root.children.at(-1)?.description ?? '', /Deploy an environment/);

  state = await shell.dispatch({ kind: 'cancel' });
  assert.equal(state.transientLayer?.kind, 'suggestions');

  state = await shell.dispatch({ kind: 'palette', action: 'open' });
  assert.equal(state.transientLayer?.kind, 'palette');
  assert.equal(shell.snapshot().root.children.at(-1)?.role, 'menu');

  state = await shell.dispatch({ kind: 'palette', action: 'accept' });
  assert.equal(state.input.text, 'deploy');
  assert.equal(state.transientLayer, undefined);

  const palette = createCommandPalette({ commands });
  const snapshot = palette.snapshot();
  assert.equal(snapshot.root.role, 'menu');
  assert.deepEqual(snapshot.root.children?.map((child) => child.label), ['deploy', 'doctor']);
});

test('shell program source parses and runs through cli-core', async () => {
  const runContexts = [];
  const program = defineCli({
    name: 'tool',
    commands: [{
      name: 'ship',
      aliases: ['deploy'],
      description: 'Ship an environment',
      positionals: [{ name: 'target', required: true }]
    }]
  });
  const shell = createShell({
    commands: {
      kind: 'program',
      program,
      parseArgv,
      run: {
        request: {
          handlers: {
            ship: (context) => {
              runContexts.push(context);
              return { exitStatus: 0 };
            }
          }
        }
      }
    }
  });

  await shell.dispatch({ kind: 'input', text: 'deploy "prod env"' });
  const state = await shell.dispatch({ kind: 'submit' });

  assert.equal(state.mode, 'idle');
  assert.equal(state.lastCommand?.status, 'completed');
  assert.deepEqual(state.lastCommand?.argv, ['deploy', 'prod env']);
  assert.deepEqual(runContexts.map((context) => context.invocation.positionals['target']), ['prod env']);
});

test('runShell processes line input through the memory host and restores terminal state', async () => {
  const runs = [];
  const shell = createShell({
    prompt: '$ ',
    transcript: { enabled: true },
    commands: {
      kind: 'adapter',
      adapter: {
        describe: () => commandManifest([{ name: 'echo' }]),
        parse: ({ input }) => parsedShellInput(input),
        run: async (request) => {
          runs.push(request);
          return shellRunResult();
        }
      }
    }
  });
  const host = createMemoryTerminalHost();
  const running = runShell(shell, host);

  host.input('echo hello\r\u0004');
  host.stdin.close();
  const result = await running;

  assert.equal(result.status, 'completed');
  assert.equal(result.exitCode, 0);
  assert.deepEqual(runs.map((run) => run.input), ['echo hello']);
  assert.match(host.output(), /\$ echo hello\n\$ /);
  assert.equal(result.transcript?.schemaVersion, 'terminal-ui.shell-transcript.v1');
  assert.deepEqual(result.transcript?.commands.map((command) => ({
    input: command.input,
    argv: command.argv,
    status: command.status,
    exitCode: command.exitCode
  })), [{
    input: 'echo hello',
    argv: ['echo', 'hello'],
    status: 'completed',
    exitCode: 0
  }]);
  assert.ok(host.restores().length > 0);
});

test('runShell records successful cli-core diagnostics in command transcripts', async () => {
  const shell = createShell({
    prompt: '$ ',
    transcript: { enabled: true },
    commands: {
      kind: 'adapter',
      adapter: {
        describe: () => commandManifest([{ name: 'echo' }]),
        parse: ({ input }) => ({
          ok: true,
          value: { ...parsedInvocation(input), diagnostics: [cliDiagnostic('parse.note', 'Parsed with a note.')] }
        }),
        run: async () => ({ ...shellRunResult(), diagnostics: [cliDiagnostic('run.note', 'Ran with a note.')] })
      }
    }
  });
  const host = createMemoryTerminalHost();
  const running = runShell(shell, host);

  host.input('echo hello\r\u0004');
  host.stdin.close();
  const result = await running;

  assert.equal(result.status, 'completed');
  assert.deepEqual(result.transcript?.commands[0]?.diagnostics.map((item) => item.code), [
    'SHELL_COMMAND_PARSE_DIAGNOSTIC',
    'SHELL_COMMAND_RUN_DIAGNOSTIC'
  ]);
  assert.deepEqual(result.transcript?.commands[0]?.diagnostics.map((item) => item.data?.cliCode), [
    'parse.note',
    'run.note'
  ]);
});

test('runShell redacts secret-like command values from shell transcripts', async () => {
  const runs = [];
  const shell = createShell({
    prompt: '$ ',
    transcript: { enabled: true },
    commands: {
      kind: 'adapter',
      adapter: {
        describe: () => commandManifest([{ name: 'deploy' }]),
        parse: ({ input }) => ({
          ok: true,
          value: {
            ...parsedInvocation(input),
            diagnostics: [cliDiagnostic('parse.secret', 'Parse warning mentioned token super-secret.')]
          }
        }),
        run: async (request) => {
          runs.push(request);
          return {
            ...shellRunResult(),
            diagnostics: [
              cliDiagnostic('run.secret', 'Run warning mentioned API_KEY=top-secret and password hidden.')
            ]
          };
        }
      }
    }
  });
  const host = createMemoryTerminalHost();
  const command = 'deploy --token super-secret API_KEY=top-secret --password=hidden normal';
  const running = runShell(shell, host);

  host.input(`${command}\r\u0004`);
  host.stdin.close();
  const result = await running;
  const transcriptJson = JSON.stringify(result.transcript);
  const diagnosticsJson = JSON.stringify(result.diagnostics);

  assert.equal(result.status, 'completed');
  assert.deepEqual(runs.map((run) => run.input), [command]);
  assert.equal(transcriptJson.includes('super-secret'), false);
  assert.equal(transcriptJson.includes('top-secret'), false);
  assert.equal(transcriptJson.includes('hidden'), false);
  assert.equal(diagnosticsJson.includes('super-secret'), false);
  assert.equal(diagnosticsJson.includes('top-secret'), false);
  assert.equal(diagnosticsJson.includes('hidden'), false);
  assert.match(diagnosticsJson, /\[redacted\]/u);
  assert.match(result.transcript?.commands[0]?.input ?? '', /--token \[redacted\]/u);
  assert.match(result.transcript?.commands[0]?.input ?? '', /API_KEY=\[redacted\]/u);
  assert.match(result.transcript?.commands[0]?.input ?? '', /--password=\[redacted\]/u);
  assert.deepEqual(result.transcript?.commands[0]?.argv, [
    'deploy',
    '--token',
    '[redacted]',
    'API_KEY=[redacted]',
    '--password=[redacted]',
    'normal'
  ]);
});

test('runShell defaults non-TTY hosts to transcript-only execution', async () => {
  const runs = [];
  const shell = createShell({
    prompt: '$ ',
    commands: {
      kind: 'adapter',
      adapter: {
        describe: () => commandManifest([{ name: 'echo' }]),
        parse: ({ input }) => parsedShellInput(input),
        run: async (request) => {
          runs.push(request);
          return shellRunResult();
        }
      }
    }
  });
  const host = createMemoryTerminalHost({ isTty: false });
  host.input('echo hello\n');
  host.stdin.close();

  const result = await runShell(shell, host);

  assert.equal(result.status, 'completed');
  assert.deepEqual(runs.map((run) => run.input), ['echo hello']);
  assert.equal(result.transcript?.schemaVersion, 'terminal-ui.shell-transcript.v1');
  assert.equal(result.transcript?.commands[0]?.input, 'echo hello');
  assert.equal(host.output(), '');
  assert.equal(host.restores().length, 0);
});

test('runShell respects explicit non-TTY rejection policy', async () => {
  const shell = createShell({
    prompt: '$ ',
    nonTty: { mode: 'reject', diagnosticHint: 'Pass --command or enable transcript mode.' },
    commands: {
      kind: 'adapter',
      adapter: {
        describe: () => commandManifest([{ name: 'echo' }]),
        parse: ({ input }) => parsedShellInput(input)
      }
    }
  });
  const host = createMemoryTerminalHost({ isTty: false });

  const result = await runShell(shell, host);

  assert.equal(result.status, 'error');
  assert.equal(result.exitCode, 1);
  assert.equal(result.diagnostics[0]?.code, 'PROMPT_NON_TTY_DENIED');
  assert.equal(result.diagnostics[0]?.hint, 'Pass --command or enable transcript mode.');
  assert.equal(result.transcript, undefined);
  assert.equal(host.output(), '');
  assert.equal(host.restores().length, 0);
});

test('runShell exposes command palette navigation through normalized keyboard input', async () => {
  const runs = [];
  const shell = createShell({
    prompt: '$ ',
    commands: {
      kind: 'adapter',
      adapter: {
        describe: () => ({
          ...commandManifest([
            { name: 'deploy', description: 'Deploy an environment' },
            { name: 'doctor', description: 'Inspect local setup' }
          ])
        }),
        parse: ({ input }) => parsedShellInput(input),
        run: async (request) => {
          runs.push(request);
          return shellRunResult();
        }
      }
    }
  });
  const host = createMemoryTerminalHost();
  const running = runShell(shell, host);

  host.input('\t\u001B[B\t\r\u0004');
  host.stdin.close();
  const result = await running;

  assert.equal(result.status, 'completed');
  assert.deepEqual(runs.map((run) => run.input), ['doctor']);
  assert.match(host.output(), /doctor - Inspect local setup/);
});

test('runShell applies shell theme symbols and sanitizes rendered shell text', async () => {
  const shell = createShell({
    prompt: '$\u001B[31m ',
    theme: {
      symbols: { pointer: '=>\u001B[31m', unselected: '.\u001B[0m' },
      colors: { 'text.default': { kind: 'ansi', value: 10 } }
    },
    commands: {
      kind: 'adapter',
      adapter: {
        describe: () => ({
          ...commandManifest([
            { name: 'doctor', description: 'Inspect\u001B[33m local setup' },
            { name: 'deploy', description: 'Deploy an environment' }
          ])
        }),
        parse: ({ input }) => parsedShellInput(input)
      }
    }
  });
  const host = createMemoryTerminalHost();
  const running = runShell(shell, host);

  host.input('\t\u0004');
  host.stdin.close();
  const result = await running;
  const output = host.output();

  assert.equal(result.status, 'completed');
  assert.match(output, /\u001B\[(?:92|38;5;10)m/u);
  assert.match(output, /=> doctor - Inspect local setup/u);
  assert.match(output, /\. deploy - Deploy an environment/u);
  assert.doesNotMatch(output, /\u001B\[31m|\u001B\[33m/u);
});

test('runShell sanitizes typed and pasted shell input before display', async () => {
  const runs = [];
  const shell = createShell({
    prompt: '$ ',
    commands: {
      kind: 'adapter',
      adapter: {
        describe: () => commandManifest([{ name: 'echo' }]),
        parse: ({ input }) => parsedShellInput(input),
        run: async (request) => {
          runs.push(request.input);
          return shellRunResult();
        }
      }
    }
  });
  const host = createMemoryTerminalHost();
  const running = runShell(shell, host);

  host.input('echo safe\u001B[200~ \u001B[31mpaste\u001B[0m\u001B[201~\r\u0004');
  host.stdin.close();
  const result = await running;
  const output = host.output();

  assert.equal(result.status, 'completed');
  assert.deepEqual(runs, ['echo safe \u001B[31mpaste\u001B[0m']);
  assert.match(output, /\$ echo safe paste/u);
  assert.doesNotMatch(output, /\u001B\[31m|\u001B\[0m/u);
});

test('runShell shows command help and returns to the palette one layer at a time', async () => {
  const runs = [];
  const shell = createShell({
    prompt: '$ ',
    commands: {
      kind: 'adapter',
      adapter: {
        describe: () => ({
          ...commandManifest([{
            name: 'deploy',
            description: 'Deploy an environment',
            positionals: [{ name: 'environment', required: true }]
          }])
        }),
        parse: ({ input }) => parsedShellInput(input),
        run: async (request) => {
          runs.push(request);
          return shellRunResult();
        }
      }
    }
  });
  const host = createMemoryTerminalHost();
  const running = runShell(shell, host);

  host.input('\t?\u001B\t\r\u0004');
  host.stdin.close();
  const result = await running;

  assert.equal(result.status, 'completed');
  assert.deepEqual(runs.map((run) => run.input), ['deploy']);
  assert.match(host.output(), /usage: deploy <environment>/);
  assert.match(host.output(), /Deploy an environment/);
});
