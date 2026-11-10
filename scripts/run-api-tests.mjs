
import { spawn } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  appendFileSync,
} from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, '..');
const apiDir = resolve(rootDir, 'apps/api');
const logsDir = resolve(rootDir, 'logs');
const postmanDir = resolve(rootDir, 'postman');

const collectionPath = resolve(
  postmanDir,
  'BrewLite_API.postman_collection.json',
);
const environmentPath = resolve(
  postmanDir,
  'BrewLite_Environment.postman_environment.json',
);

const runId = new Date().toISOString().replace(/[:.]/g, '-');
const runDir = resolve(logsDir, 'api-tests', runId);

mkdirSync(runDir, { recursive: true });

const runLogPath = resolve(runDir, 'run.log');
const serverLogPath = resolve(runDir, 'server.log');
const reportPath = resolve(runDir, 'report.json');
const summaryPath = resolve(runDir, 'summary.json');
const errorPath = resolve(runDir, 'errors.log');

const historyPath = resolve(logsDir, 'api-test-history.csv');

const latestRunLog = resolve(logsDir, 'api-test-run.log');
const latestErrorLog = resolve(logsDir, 'api-test-errors.log');
const latestReport = resolve(logsDir, 'newman-report.json');

let spawnedServer = null;
let activeChild = null;
let finalExitCode = 1;
let summary = null;

const startedAt = new Date();

function log(message = '') {
  const line = String(message);
  console.log(line);
  appendFileSync(runLogPath, `${line}\n`, 'utf-8');
}

function logServer(message) {
  appendFileSync(serverLogPath, String(message), 'utf-8');
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf-8'));
}

function writeJson(path, data) {
  writeFileSync(path, JSON.stringify(data, null, 2), 'utf-8');
}

function getBaseUrl() {
  const collection = readJson(collectionPath);
  const environment = readJson(environmentPath);

  const environmentBaseUrl = environment.values?.find(
    (item) => item.key === 'baseUrl' && !item.disabled,
  );

  const collectionBaseUrl = collection.variable?.find(
    (item) => item.key === 'baseUrl' && !item.disabled,
  );

  const baseUrl =
    environmentBaseUrl?.currentValue ||
    environmentBaseUrl?.value ||
    collectionBaseUrl?.value ||
    'http://localhost:3001/api/v1';

  return String(baseUrl).replace(/\/+$/, '');
}

// Ẩn thông tin nhạy cảm trước khi ghi report ra file.
function redactSensitive(value, key = '') {
  const sensitiveKey =
    /authorization|accessToken|refreshToken|password|secret|cookie|api[-_]?key/i;

  if (sensitiveKey.test(key)) {
    return '[REDACTED]';
  }

  if (Array.isArray(value)) {
    return value.map((item) => redactSensitive(item));
  }

  if (value && typeof value === 'object') {
    const result = {};

    for (const [childKey, childValue] of Object.entries(value)) {
      result[childKey] = redactSensitive(childValue, childKey);
    }

    return result;
  }

  if (key === 'raw' && typeof value === 'string') {
    try {
      return JSON.stringify(redactSensitive(JSON.parse(value)));
    } catch {
      return value;
    }
  }

  return value;
}

async function checkHealth(baseUrl) {
  try {
    const response = await fetch(`${baseUrl}/health`, {
      signal: AbortSignal.timeout(1500),
    });

    if (!response.ok) {
      return false;
    }

    const data = await response.json().catch(() => null);
    return data?.status === 'ok';
  } catch {
    return false;
  }
}

async function waitForServer(baseUrl, timeoutMs = 30000) {
  const started = Date.now();

  log('[INFO] Waiting for API server...');

  while (Date.now() - started < timeoutMs) {
    if (await checkHealth(baseUrl)) {
      log('[OK] API server is healthy.');
      return true;
    }

    if (
      spawnedServer?.exitCode !== null &&
      spawnedServer?.exitCode !== undefined
    ) {
      log(`[ERROR] API server exited with code ${spawnedServer.exitCode}.`);
      return false;
    }

    await new Promise((resolvePromise) => setTimeout(resolvePromise, 800));
  }

  log('[ERROR] API health check timed out.');
  return false;
}

function runProcess(command, args, options = {}) {
  return new Promise((resolvePromise) => {
    const child = spawn(command, args, {
      cwd: options.cwd || rootDir,
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: options.shell || false,
      windowsHide: true,
    });

    activeChild = child;

    child.stdout.on('data', (data) => {
      const output = data.toString();
      process.stdout.write(output);
      appendFileSync(runLogPath, output, 'utf-8');
    });

    child.stderr.on('data', (data) => {
      const output = data.toString();
      process.stderr.write(output);
      appendFileSync(runLogPath, output, 'utf-8');
    });

    child.on('error', (error) => {
      appendFileSync(
        runLogPath,
        `\n[PROCESS ERROR] ${error.stack || error.message}\n`,
        'utf-8',
      );

      activeChild = null;

      resolvePromise({
        exitCode: 127,
        error,
      });
    });

    child.on('close', (code, signal) => {
      activeChild = null;

      resolvePromise({
        exitCode: code ?? 1,
        signal,
      });
    });
  });
}

async function startApiServer() {
  const distMainPath = resolve(apiDir, 'dist/main.js');

  if (!existsSync(distMainPath)) {
    log('[INFO] API build not found. Building API...');

    const command =
      process.platform === 'win32'
        ? process.env.ComSpec || 'cmd.exe'
        : 'npm';

    const args =
      process.platform === 'win32'
        ? ['/d', '/s', '/c', 'npm run build']
        : ['run', 'build'];

    const buildResult = await runProcess(command, args, {
      cwd: apiDir,
    });

    if (buildResult.exitCode !== 0) {
      throw new Error(`API build failed. Exit code: ${buildResult.exitCode}`);
    }
  }

  log('[INFO] Starting API server from apps/api/dist/main.js...');

  spawnedServer = spawn('node', ['dist/main.js'], {
    cwd: apiDir,
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });

  spawnedServer.stdout.on('data', (data) => {
    logServer(data.toString());
  });

  spawnedServer.stderr.on('data', (data) => {
    logServer(data.toString());
  });

  spawnedServer.on('error', (error) => {
    logServer(`\n[SERVER PROCESS ERROR]\n${error.stack || error.message}\n`);
  });
}

async function stopApiServer() {
  if (!spawnedServer || spawnedServer.exitCode !== null) {
    return;
  }

  log('[INFO] Stopping API server started by this script...');

  spawnedServer.kill('SIGTERM');

  await Promise.race([
    new Promise((resolvePromise) => {
      spawnedServer.once('close', resolvePromise);
    }),
    new Promise((resolvePromise) => {
      setTimeout(resolvePromise, 3000);
    }),
  ]);

  if (spawnedServer.exitCode === null) {
    log('[WARN] API server did not stop within 3 seconds.');
  }
}

function getParentName(failure) {
  if (Array.isArray(failure.parent)) {
    return failure.parent.map((item) => item.name).join(' / ');
  }

  return failure.parent?.name || 'Root';
}

function getAssertionDetails(failure) {
  const error = failure.error || {};

  const expected = error.expected;
  const actual = error.actual;

  const details = [];

  if (expected !== undefined) {
    details.push(`Expected : ${JSON.stringify(expected)}`);
  }

  if (actual !== undefined) {
    details.push(`Actual   : ${JSON.stringify(actual)}`);
  }

  return details;
}

// Tìm execution tương ứng để lấy thêm thông tin request/response.
function findExecution(report, failure) {
  const executions = report.run?.executions || [];
  const requestName = failure.source?.name;

  if (!requestName) {
    return null;
  }

  const matchingExecutions = executions.filter(
    (execution) => execution.item?.name === requestName,
  );

  if (matchingExecutions.length === 0) {
    return null;
  }

  const assertionName =
    failure.error?.test ||
    failure.error?.assertion;

  if (assertionName) {
    for (const execution of matchingExecutions) {
      const assertion = execution.assertions?.find(
        (item) =>
          item.assertion === assertionName &&
          item.error,
      );

      if (assertion) {
        return execution;
      }
    }
  }

  return matchingExecutions[matchingExecutions.length - 1];
}

function getResponseInfo(execution) {
  const response = execution?.response;

  if (!response) {
    return [];
  }

  const body =
    typeof response.stream === 'string'
      ? response.stream
      : Buffer.isBuffer(response.stream)
        ? response.stream.toString('utf-8')
        : '';

  return [
    `HTTP Status : ${response.code ?? 'Unknown'}`,
    `Status Text : ${response.status ?? 'Unknown'}`,
    body ? `Response Body:\n${body.slice(0, 3000)}` : '',
  ].filter(Boolean);
}

function formatFailure(failure, index, report) {
  const parentName = getParentName(failure);
  const requestName = failure.source?.name || 'Unknown request';
  const error = failure.error || {};

  const execution = findExecution(report, failure);

  const assertionName =
    error.test ||
    error.assertion ||
    'Unknown assertion';

  const request = execution?.request;

  const method =
    request?.method ||
    error.method ||
    'Unknown';

  const url =
    request?.url?.raw ||
    error.url ||
    'Unknown';

  const details = getAssertionDetails(failure);
  const responseInfo = getResponseInfo(execution);

  return [
    `FAILURE #${index + 1}`,
    `Folder       : ${parentName}`,
    `Request      : ${requestName}`,
    `Method       : ${method}`,
    `URL          : ${url}`,
    `Assertion    : ${assertionName}`,
    `Error name   : ${error.name || 'AssertionError'}`,
    `Error message: ${error.message || 'Unknown error'}`,
    ...details,
    ...responseInfo,
    error.stack ? `Stack:\n${error.stack}` : '',
    '-----------------------------------------------------',
  ]
    .filter(Boolean)
    .join('\n');
}

function buildErrorLog(failures, report, stats, newmanExitCode) {
  const lines = [
    '=====================================================',
    '             BREWLITE API TEST ERROR LOG',
    '=====================================================',
    `Run ID            : ${runId}`,
    `Time              : ${new Date().toISOString()}`,
    `Newman Exit Code  : ${newmanExitCode}`,
    `Total Requests    : ${stats.requests?.total || 0}`,
    `Failed Requests   : ${stats.requests?.failed || 0}`,
    `Total Assertions  : ${stats.assertions?.total || 0}`,
    `Failed Assertions : ${stats.assertions?.failed || 0}`,
    `Total Failures    : ${failures.length}`,
    '=====================================================',
    '',
  ];

  if (failures.length === 0) {
    lines.push('No detailed assertion failures returned by Newman.');
  } else {
    failures.forEach((failure, index) => {
      lines.push(formatFailure(failure, index, report), '');
    });
  }

  lines.push('=====================================================');

  return lines.join('\n');
}

function writeHistory(data) {
  const header =
    'runId,startedAt,finishedAt,result,requestsTotal,requestsFailed,assertionsTotal,assertionsFailed,durationMs,newmanExitCode\n';

  if (!existsSync(historyPath)) {
    writeFileSync(historyPath, header, 'utf-8');
  }

  const values = [
    data.runId,
    data.startedAt,
    data.finishedAt,
    data.result,
    data.requestsTotal,
    data.requestsFailed,
    data.assertionsTotal,
    data.assertionsFailed,
    data.durationMs,
    data.newmanExitCode ?? '',
  ];

  const csvLine = values
    .map((value) => `"${String(value ?? '').replace(/"/g, '""')}"`)
    .join(',');

  appendFileSync(historyPath, `${csvLine}\n`, 'utf-8');
}

function writeFailureLog(message) {
  const content = [
    '=====================================================',
    `BrewLite API Test Error Log - ${new Date().toISOString()}`,
    `Run ID: ${runId}`,
    '=====================================================',
    '',
    message,
    '',
  ].join('\n');

  writeFileSync(errorPath, content, 'utf-8');
  appendFileSync(latestErrorLog, `${content}\n`, 'utf-8');
}

function getDuration(report) {
  const started = report.run?.timings?.started;
  const completed = report.run?.timings?.completed;

  if (typeof started === 'number' && typeof completed === 'number') {
    return completed - started;
  }

  return Date.now() - startedAt.getTime();
}

async function main() {
  log('=====================================================');
  log('       BREWLITE API TEST SUITE & DIAGNOSTICS         ');
  log('=====================================================');
  log(`Run ID      : ${runId}`);
  log(`Collection  : ${collectionPath}`);
  log(`Environment : ${environmentPath}`);
  log(`Run folder  : ${runDir}`);
  log('-----------------------------------------------------');

  if (!existsSync(collectionPath)) {
    throw new Error(`Postman collection not found: ${collectionPath}`);
  }

  if (!existsSync(environmentPath)) {
    throw new Error(`Postman environment not found: ${environmentPath}`);
  }

  readJson(collectionPath);
  readJson(environmentPath);

  const baseUrl = getBaseUrl();
  log(`API Base URL: ${baseUrl}`);

  let isReady = await checkHealth(baseUrl);

  if (isReady) {
    log('[OK] Connected to an existing API server.');

    logServer(
      `[${new Date().toISOString()}] Using an existing API server. Server log is not available for this process.\n`,
    );
  } else {
    log('[INFO] API is not running. Attempting to start it...');

    await startApiServer();

    isReady = await waitForServer(baseUrl, 30000);

    if (!isReady) {
      throw new Error(
        'Cannot start API server. Check PostgreSQL, apps/api/.env and server.log.',
      );
    }
  }

  const newmanPath = resolve(apiDir, 'node_modules/newman/bin/newman.js');

  if (!existsSync(newmanPath)) {
    throw new Error(
      `Newman not found: ${newmanPath}. Run npm install in apps/api first.`,
    );
  }

  log('');
  log('[INFO] Executing Postman collection with Newman...');
  log('');

  const newmanArgs = [
    newmanPath,
    'run',
    collectionPath,
    '-e',
    environmentPath,
    '--reporters',
    'cli,json',
    '--reporter-json-export',
    reportPath,
    '--timeout-request',
    '15000',
  ];

  const newmanResult = await runProcess(process.execPath, newmanArgs, {
    cwd: rootDir,
  });

  if (!existsSync(reportPath)) {
    throw new Error(
      `Newman did not generate a JSON report. Exit code: ${newmanResult.exitCode}`,
    );
  }

  const rawReport = readJson(reportPath);
  const safeReport = redactSensitive(rawReport);

  writeJson(reportPath, safeReport);
  writeJson(latestReport, safeReport);

  const stats = rawReport.run?.stats || {};
  const requests = stats.requests || {};
  const assertions = stats.assertions || {};
  const failures = rawReport.run?.failures || [];

  const requestsTotal = requests.total || 0;
  const requestsFailed = requests.failed || 0;

  const assertionsTotal = assertions.total || 0;
  const assertionsFailed = assertions.failed || 0;

  const durationMs = getDuration(rawReport);

  const passed =
    newmanResult.exitCode === 0 &&
    requestsFailed === 0 &&
    assertionsFailed === 0 &&
    failures.length === 0;

  const finishedAt = new Date();

  summary = {
    runId,
    result: passed ? 'PASSED' : 'FAILED',
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    durationMs,
    newmanExitCode: newmanResult.exitCode,
    requests: {
      total: requestsTotal,
      failed: requestsFailed,
      passed: requestsTotal - requestsFailed,
    },
    assertions: {
      total: assertionsTotal,
      failed: assertionsFailed,
      passed: assertionsTotal - assertionsFailed,
    },
    failureCount: failures.length,
    files: {
      runLog: runLogPath,
      serverLog: serverLogPath,
      report: reportPath,
      errors: errorPath,
    },
  };

  writeJson(summaryPath, summary);

  const failureDetails = buildErrorLog(
    failures,
    rawReport,
    stats,
    newmanResult.exitCode,
  );

  writeFailureLog(failureDetails);

  log('');
  log('=====================================================');
  log('                    TEST SUMMARY                     ');
  log('=====================================================');
  log(`Result             : ${summary.result}`);
  log(`Total Requests     : ${requestsTotal}`);
  log(`Passed Requests    : ${requestsTotal - requestsFailed}`);
  log(`Failed Requests    : ${requestsFailed}`);
  log(`Total Assertions   : ${assertionsTotal}`);
  log(`Passed Assertions  : ${assertionsTotal - assertionsFailed}`);
  log(`Failed Assertions  : ${assertionsFailed}`);
  log(`Total Failures     : ${failures.length}`);
  log(`Duration           : ${durationMs} ms`);
  log(`Newman Exit Code   : ${newmanResult.exitCode}`);
  log('=====================================================');

  if (!passed) {
    log(`[FAILED] Error details saved to: ${errorPath}`);
    finalExitCode = 1;
  } else {
    log('[PASSED] All API tests passed.');
    finalExitCode = 0;
  }

  log(`[INFO] JSON report : ${reportPath}`);
  log(`[INFO] Summary     : ${summaryPath}`);

  writeHistory({
    runId,
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    result: summary.result,
    requestsTotal,
    requestsFailed,
    assertionsTotal,
    assertionsFailed,
    durationMs,
    newmanExitCode: newmanResult.exitCode,
  });
}

async function cleanup() {
  if (activeChild) {
    activeChild.kill('SIGTERM');
  }

  await stopApiServer();
}

process.once('SIGINT', () => {
  log('\n[WARN] Received SIGINT. Stopping test processes...');
  activeChild?.kill('SIGTERM');
  spawnedServer?.kill('SIGTERM');
});

process.once('SIGTERM', () => {
  log('\n[WARN] Received SIGTERM. Stopping test processes...');
  activeChild?.kill('SIGTERM');
  spawnedServer?.kill('SIGTERM');
});

try {
  await main();
} catch (error) {
  const message = [
    'FATAL ERROR',
    error.stack || error.message,
  ].join('\n');

  log('');
  log(`[FATAL] ${error.message}`);

  writeFailureLog(message);

  summary = {
    runId,
    result: 'ERROR',
    startedAt: startedAt.toISOString(),
    finishedAt: new Date().toISOString(),
    error: error.message,
    files: {
      runLog: runLogPath,
      serverLog: serverLogPath,
      errors: errorPath,
    },
  };

  writeJson(summaryPath, summary);
  finalExitCode = 1;
} finally {
  await cleanup();

  if (existsSync(runLogPath)) {
    appendFileSync(
      latestRunLog,
      `\n\n================ RUN ${runId} ================\n`,
      'utf-8',
    );

    appendFileSync(
      latestRunLog,
      readFileSync(runLogPath, 'utf-8'),
      'utf-8',
    );
  }

  log('');
  log(`[INFO] Run logs saved in: ${runDir}`);
}

process.exitCode = finalExitCode;
