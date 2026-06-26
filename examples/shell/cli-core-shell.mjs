import { defineCli } from '@ismail-elkorchi/cli-core';
import { createMemoryTerminalHost } from '@ismail-elkorchi/terminal-ui/host';
import { createShell, runShell } from '@ismail-elkorchi/terminal-ui/shell';

const parseArgv = ({ input }) => ({
  ok: true,
  value: Object.freeze(input.trim().split(/\s+/u).filter(Boolean))
});

const program = defineCli({
  name: 'example',
  commands: [{
    name: 'greet',
    description: 'Print a greeting',
    positionals: [{ name: 'name', required: true }]
  }]
});

const shell = createShell({
  prompt: '$ ',
  commands: {
    kind: 'program',
    program,
    parseArgv,
    run: {
      request: {
        handlers: {
          greet: (context) => ({
            exitStatus: 0,
            artifacts: [{
              schemaVersion: 'cli-core.run-artifact.v1',
              name: 'greeting',
              mediaType: 'text/plain',
              data: `Hello ${context.invocation.positionals.name}`
            }]
          })
        }
      }
    }
  }
});

const host = createMemoryTerminalHost({ isTty: false });
host.input('greet Ada\n');
host.stdin.close();

const result = await runShell(shell, host);

console.log(JSON.stringify({
  status: result.status,
  exitCode: result.exitCode,
  commands: result.transcript?.commands.map((command) => ({
    input: command.input,
    status: command.status,
    exitCode: command.exitCode
  }))
}));
