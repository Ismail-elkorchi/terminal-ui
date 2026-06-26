import { diagnostic } from '../diagnostics.ts';
import { ok } from '../result.ts';
import type { TerminalDiagnostic } from '../diagnostics.ts';
import type { TerminalDiagnosticCode } from '../diagnostics.ts';
import type {
  CliCoreCommandSourceInput,
  CliCoreShellAdapter,
  ShellCommandSource,
  ShellRunRequest,
  ShellSuggestion
} from './types.ts';
import { describeCli, parseCli, runCli, validateCli } from '@ismail-elkorchi/cli-core';
import type {
  CliDiagnostic,
  CommandManifest,
  ManifestAlias,
  ManifestCommand,
  ParsedInvocation,
  RunResult,
  SemanticValidationResult
} from '@ismail-elkorchi/cli-core';

export function createCliCoreCommandSource(input: CliCoreCommandSourceInput): ShellCommandSource {
  return input;
}

export function adapterForSource(source: ShellCommandSource): CliCoreShellAdapter | undefined {
  if (source.kind === 'adapter') return source.adapter;
  if (source.kind === 'program') return adapterForProgramSource(source);
  return undefined;
}

export function manifestForSource(source: ShellCommandSource): CommandManifest | undefined {
  if (source.kind === 'adapter') return source.adapter.describe();
  if (source.kind === 'manifest') return source.manifest;
  return describeCli(source.program);
}

export function suggestionsForSource(source: ShellCommandSource): readonly ShellSuggestion[] {
  const manifest = manifestForSource(source);
  return (manifest?.commands ?? []).flatMap(commandSuggestion);
}

export function shellParseFailure(message: string): TerminalDiagnostic {
  return diagnostic('SHELL_COMMAND_PARSE_FAILED', message);
}

export function diagnosticsFromCli(
  items: readonly CliDiagnostic[] | undefined,
  code: TerminalDiagnosticCode,
  fallback?: TerminalDiagnostic
): readonly TerminalDiagnostic[] {
  if (items === undefined || items.length === 0) return fallback === undefined ? [] : [fallback];
  return items.map((item) => diagnosticFromCli(item, code));
}

export function parseStageDiagnostics(invocation: ParsedInvocation): readonly TerminalDiagnostic[] {
  return diagnosticsFromCli(invocation.diagnostics, 'SHELL_COMMAND_PARSE_DIAGNOSTIC');
}

export function parseDiagnostics(invocation: ParsedInvocation): readonly TerminalDiagnostic[] {
  return diagnosticsFromCli(
    invocation.diagnostics,
    'SHELL_COMMAND_PARSE_FAILED',
    diagnostic('SHELL_COMMAND_PARSE_FAILED', 'Command parsing failed.')
  );
}

export function validationStageDiagnostics(result: SemanticValidationResult): readonly TerminalDiagnostic[] {
  return diagnosticsFromCli(result.diagnostics, 'SHELL_COMMAND_VALIDATE_DIAGNOSTIC');
}

export function validationDiagnostics(result: SemanticValidationResult): readonly TerminalDiagnostic[] {
  return diagnosticsFromCli(
    result.diagnostics,
    'SHELL_COMMAND_VALIDATE_FAILED',
    diagnostic('SHELL_COMMAND_VALIDATE_FAILED', 'Command validation failed.')
  );
}

export function runStageDiagnostics(result: RunResult): readonly TerminalDiagnostic[] {
  return diagnosticsFromCli(result.diagnostics, 'SHELL_COMMAND_RUN_DIAGNOSTIC');
}

export function runDiagnostics(result: RunResult): readonly TerminalDiagnostic[] {
  return diagnosticsFromCli(
    result.diagnostics,
    'SHELL_COMMAND_RUN_FAILED',
    diagnostic('SHELL_COMMAND_RUN_FAILED', 'Command run failed.')
  );
}

function adapterForProgramSource(source: Extract<ShellCommandSource, { readonly kind: 'program' }>): CliCoreShellAdapter {
  return {
    describe: () => describeCli(source.program),
    parse: ({ input }) => {
      const argv = source.parseArgv({ input });
      if (!argv.ok) return argv;
      return ok(parseCli(source.program, { argv: argv.value }));
    },
    validate: (invocation) => validateCli(source.program, invocation),
    ...(source.run === undefined ? {} : {
      run: (request: ShellRunRequest) => runCli(source.program, {
        mode: 'apply',
        ...source.run?.request,
        invocation: request.invocation,
        ...(request.validation === undefined ? {} : { validation: request.validation })
      })
    })
  };
}

function commandSuggestion(command: ManifestCommand): readonly ShellSuggestion[] {
  if (command.name.length === 0 || command.path.length === 0) return [];
  const aliases = command.aliases.map(aliasLabel);
  const usage = commandUsage(command);
  const deprecatedHelp = deprecatedHelpText(command.deprecated);
  return [{
    id: command.id,
    label: command.path.join(' '),
    ...(command.description === undefined ? {} : { description: command.description }),
    ...(usage === undefined ? {} : { usage }),
    ...(aliases.length === 0 ? {} : { aliases }),
    ...(deprecatedHelp === undefined ? {} : { help: deprecatedHelp })
  }];
}

function deprecatedHelpText(deprecated: boolean | string | undefined): string | undefined {
  if (deprecated === undefined || deprecated === false) return undefined;
  return deprecated === true ? 'Deprecated.' : `Deprecated: ${deprecated}`;
}

function diagnosticFromCli(item: CliDiagnostic, code: TerminalDiagnosticCode): TerminalDiagnostic {
  const hint = typeof item.fields['hint'] === 'string' ? item.fields['hint'] : undefined;
  const target = typeof item.fields['target'] === 'string' ? item.fields['target'] : undefined;
  return diagnostic(
    code,
    item.message,
    {
      severity: item.severity,
      ...(hint === undefined ? {} : { hint }),
      ...(target === undefined ? {} : { target }),
      data: { cliCode: item.code }
    }
  );
}

function aliasLabel(alias: ManifestAlias): string {
  return alias.path.join(' ');
}

function commandUsage(command: ManifestCommand): string | undefined {
  const parts = [
    command.path.join(' '),
    ...command.options.filter((option) => !option.hidden).map((option) => option.flags[0] ?? `--${option.name}`),
    ...command.positionals.map((positional) => positional.required ? `<${positional.name}>` : `[${positional.name}]`)
  ].filter((part) => part.length > 0);
  return parts.length === 0 ? undefined : parts.join(' ');
}
