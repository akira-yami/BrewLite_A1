import { execSync, spawn } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync, appendFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, '..');
const logsDir = resolve(rootDir, 'logs');
const postmanDir = resolve(rootDir, 'postman');

mkdirSync(logsDir, { recursive: true });

const collectionPath = resolve(postmanDir, 'BrewLite_API.postman_collection.json');
const environmentPath = resolve(postmanDir, 'BrewLite_Environment.postman_environment.json');
const runLogPath = resolve(logsDir, 'api-test-run.log');
const errorLogPath = resolve(logsDir, 'api-test-errors.log');
const reportJsonPath = resolve(logsDir, 'newman-report.json');

console.log('=====================================================');
console.log('   BrewLite API Test Suite & Diagnostics Runner      ');
console.log('=====================================================');
console.log(`Collection  : ${collectionPath}`);
console.log(`Environment : ${environmentPath}`);
console.log(`Logs Dir    : ${logsDir}`);
console.log('-----------------------------------------------------');

const startTime = new Date();
const logHeader = `[${startTime.toISOString()}] Starting BrewLite API test run...\n`;
writeFileSync(runLogPath, logHeader, 'utf-8');

try {
  // Execute Newman with CLI and JSON reporters
  const command = `npx newman run "${collectionPath}" -e "${environmentPath}" --reporters cli,json --reporter-json-export "${reportJsonPath}"`;
  console.log('Executing test run via Newman...\n');

  let output = '';
  try {
    output = execSync(command, {
      cwd: rootDir,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
  } catch (err) {
    // If Newman encountered assertion failures, execSync throws with stdout/stderr
    output = (err.stdout ? err.stdout.toString() : '') + (err.stderr ? err.stderr.toString() : '');
    if (!output && err.message) {
      output = err.message;
    }
  }

  appendFileSync(runLogPath, output + '\n', 'utf-8');
  console.log(output);

  // Parse JSON report
  if (existsSync(reportJsonPath)) {
    const report = JSON.parse(await import('node:fs').then(fs => fs.readFileSync(reportJsonPath, 'utf-8')));
    const stats = report.run.stats;
    const failures = report.run.failures || [];

    const summaryText = `
-----------------------------------------------------
TEST SUMMARY:
- Total Requests   : ${stats.requests.total} (Executed: ${stats.requests.execute || stats.requests.total}, Failed: ${stats.requests.failed})
- Total Assertions : ${stats.assertions.total} (Passed: ${stats.assertions.total - stats.assertions.failed}, Failed: ${stats.assertions.failed})
- Total Duration   : ${report.run.timings.completed - report.run.timings.started} ms
- Failures Count   : ${failures.length}
-----------------------------------------------------
`;
    console.log(summaryText);
    appendFileSync(runLogPath, summaryText + '\n', 'utf-8');

    if (failures.length > 0) {
      console.error(`[!] Found ${failures.length} failure(s). Writing details to ${errorLogPath}...`);
      let errorReport = `=====================================================\n`;
      errorReport += `BrewLite API Test Error Log - ${new Date().toISOString()}\n`;
      errorReport += `Total Failures: ${failures.length}\n`;
      errorReport += `=====================================================\n\n`;

      failures.forEach((f, idx) => {
        errorReport += `Failure #${idx + 1}:\n`;
        errorReport += `  Parent Folder: ${f.parent?.name || 'Root'}\n`;
        errorReport += `  Request Name : ${f.source?.name || 'Unknown'}\n`;
        errorReport += `  Test Name    : ${f.error?.test || 'N/A'}\n`;
        errorReport += `  Error Name   : ${f.error?.name || 'Error'}\n`;
        errorReport += `  Error Message: ${f.error?.message || 'Unknown error'}\n`;
        if (f.error?.stack) {
          errorReport += `  Stack Trace  :\n    ${f.error.stack.split('\n').join('\n    ')}\n`;
        }
        errorReport += `-----------------------------------------------------\n`;
      });

      writeFileSync(errorLogPath, errorReport, 'utf-8');
      console.log(`[!] Error log written to: ${errorLogPath}`);
      process.exit(1);
    } else {
      console.log('>>> ALL API TESTS PASSED SUCCESSFULLY! (0 failures) <<<');
      const successLog = `[${new Date().toISOString()}] ALL API TESTS PASSED! (Executed: ${stats.requests.total} requests, ${stats.assertions.total} assertions, 0 failures)\n`;
      appendFileSync(runLogPath, successLog, 'utf-8');
    }
  }
} catch (error) {
  console.error('Fatal error running API tests:', error);
  const fatalLog = `[${new Date().toISOString()}] FATAL ERROR:\n${error.stack || error.message}\n`;
  appendFileSync(runLogPath, fatalLog, 'utf-8');
  writeFileSync(errorLogPath, fatalLog, 'utf-8');
  process.exit(1);
}
