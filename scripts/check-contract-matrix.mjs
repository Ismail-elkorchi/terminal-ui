import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import { contractKinds, contractScenarios } from '../tests/contracts/matrix.ts';

const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
const jsrJson = JSON.parse(await readFile(new URL('../jsr.json', import.meta.url), 'utf8'));
const npmEntrypoints = codeEntrypoints(packageJson.exports);
const jsrEntrypoints = codeEntrypoints(jsrJson.exports);

assert.deepEqual(jsrEntrypoints, npmEntrypoints, 'npm and JSR code entrypoints must match exactly.');
assert.equal(new Set(contractScenarios.map((scenario) => scenario.id)).size, contractScenarios.length,
  'Contract scenario ids must be unique.');

const knownContracts = new Set(contractKinds);
const knownEntrypoints = new Set(npmEntrypoints);
const packageScripts = packageJson.scripts ?? {};

for (const scenario of contractScenarios) {
  assert.ok(scenario.entrypoints.length > 0, `${scenario.id} must own at least one entrypoint.`);
  assert.ok(scenario.contracts.length > 0, `${scenario.id} must prove at least one contract.`);
  assert.ok(scenario.hosts.length > 0, `${scenario.id} must declare its host applicability.`);
  if (scenario.hosts.includes('none')) {
    assert.deepEqual(scenario.hosts, ['none'], `${scenario.id} cannot combine host-independent and host-specific profiles.`);
  }
  assert.equal(typeof packageScripts[scenario.runner], 'string', `${scenario.id} has unknown runner ${scenario.runner}.`);
  await access(new URL(`../${scenario.path}`, import.meta.url));

  for (const entrypoint of scenario.entrypoints) {
    assert.ok(knownEntrypoints.has(entrypoint), `${scenario.id} names unknown entrypoint ${entrypoint}.`);
  }
  for (const contract of scenario.contracts) {
    assert.ok(knownContracts.has(contract), `${scenario.id} names unknown contract ${contract}.`);
  }
  if (scenario.contracts.includes('type_constraint')) {
    const source = await readFile(new URL(`../${scenario.path}`, import.meta.url), 'utf8');
    assert.match(source, /@ts-expect-error/u, `${scenario.id} claims no executable invalid-call assertion.`);
  }
  if (scenario.contracts.includes('portable_runtime')) {
    assert.deepEqual(scenario.artifacts, ['npm_tarball'], `${scenario.id} must execute the installed npm artifact.`);
    assert.deepEqual(scenario.runtimes, ['node', 'deno', 'bun'], `${scenario.id} must run under all portable runtimes.`);
    const source = await readFile(new URL(`../${scenario.path}`, import.meta.url), 'utf8');
    assert.doesNotMatch(source, /(?:from\s+|import\s*\()['"]node:/u, `${scenario.id} is not language-neutral.`);
  }
}

for (const entrypoint of npmEntrypoints) {
  const covered = new Set(contractScenarios
    .filter((scenario) => scenario.entrypoints.includes(entrypoint))
    .flatMap((scenario) => scenario.contracts));
  for (const contract of requiredContracts(entrypoint)) {
    assert.ok(covered.has(contract), `${entrypoint} is missing ${contract} contract coverage.`);
  }
}

const canonicalSchemas = JSON.parse(await readFile(new URL('../jsr.json', import.meta.url), 'utf8'));
const jsrSchemaEntrypoints = Object.keys(canonicalSchemas.exports)
  .filter((entrypoint) => entrypoint.startsWith('./schemas/') && entrypoint.endsWith('.json'))
  .sort();
assert.ok(jsrSchemaEntrypoints.length > 0, 'JSR must expose concrete schema artifacts.');
assert.deepEqual(packageJson.exports['./schemas/*.json'], { default: './dist/schemas/*.json' });

function codeEntrypoints(exports) {
  return Object.keys(exports)
    .filter((entrypoint) => !entrypoint.includes('*') && !entrypoint.startsWith('./schemas/'))
    .sort();
}

function requiredContracts(entrypoint) {
  const required = ['positive_type', 'portable_runtime'];
  if (entrypoint !== './schemas') required.push('type_constraint');
  if (entrypoint === './host' || entrypoint === './protocol' || entrypoint === './tui') {
    required.push('host_runtime');
  }
  if (entrypoint === './transcript' || entrypoint === './schemas') required.push('schema_artifact');
  return required;
}
