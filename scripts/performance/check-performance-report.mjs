import { readFile } from 'node:fs/promises';
import process from 'node:process';
import { structuralBudgetViolations, timingRegressionViolations } from './performance-contract.mjs';

const [currentPath, baselinePath] = process.argv.slice(2);
if (currentPath === undefined) throw new TypeError('Usage: check-performance-report.mjs CURRENT [BASELINE]');
const current = JSON.parse(await readFile(currentPath, 'utf8'));
const violations = [...structuralBudgetViolations(current)];
if (baselinePath !== undefined) {
  const baseline = JSON.parse(await readFile(baselinePath, 'utf8'));
  violations.push(...timingRegressionViolations(baseline, current));
}
if (violations.length > 0) {
  process.stderr.write(`${violations.join('\n')}\n`);
  process.exitCode = 1;
}
