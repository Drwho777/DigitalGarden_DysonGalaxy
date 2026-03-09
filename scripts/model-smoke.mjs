import { execFile, spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import path from 'node:path';
import { promisify } from 'node:util';

const HOST = '127.0.0.1';
const BASE_PORT = Number(process.env.MODEL_TEST_BASE_PORT ?? 4825);
const STARTUP_TIMEOUT_MS = Number(
  process.env.MODEL_TEST_STARTUP_TIMEOUT_MS ?? 60_000,
);
const REQUEST_TIMEOUT_MS = Number(
  process.env.MODEL_TEST_REQUEST_TIMEOUT_MS ?? 30_000,
);
const CASE_DELAY_MS = Number(process.env.MODEL_TEST_CASE_DELAY_MS ?? 250);
const MAX_LOG_CHARS = 12_000;
const PROCESS_SHUTDOWN_TIMEOUT_MS = 5_000;
const execFileAsync = promisify(execFile);

const DEFAULT_MODELS = [
  '@cf/zai-org/glm-4.7-flash',
  '@cf/ibm-granite/granite-4.0-h-micro',
  '@cf/meta/llama-4-scout-17b-16e-instruct',
];

const DEFAULT_CASES = [
  {
    expectedAction: {
      targetId: 'p_garden',
      type: 'TELEPORT',
    },
    id: 'nav-open-garden',
    message: '打开数字花园日志',
  },
  {
    expectedAction: {
      targetId: 'p_garden',
      type: 'TELEPORT',
    },
    id: 'nav-go-garden',
    message: '带我去数字花园日志',
  },
  {
    expectedAction: {
      targetId: 'tech',
      type: 'TELEPORT',
    },
    id: 'nav-tech',
    message: '带我去工程与架构',
  },
  {
    expectedAction: null,
    id: 'nav-missing',
    message: '带我去量子深海',
  },
  {
    expectedAction: null,
    id: 'chat-intro',
    message: '请简单介绍这个数字花园',
  },
];

function getNpmCommand() {
  return process.platform === 'win32' ? 'npm.cmd' : 'npm';
}

function createSpawnEnv(overrides = {}) {
  return Object.fromEntries(
    Object.entries({
      ...process.env,
      ...overrides,
    }).filter(([key, value]) => !key.startsWith('=') && value !== undefined),
  );
}

function createDevServerCommand(port) {
  return ['run', 'dev', '--', '--host', HOST, '--port', String(port)];
}

function spawnDevServer(rootDir, modelId, port) {
  const env = createSpawnEnv({
    AI_MODEL: modelId,
    ASTRO_TELEMETRY_DISABLED: '1',
  });

  if (process.platform === 'win32') {
    const command = `${getNpmCommand()} ${createDevServerCommand(port).join(' ')}`;
    return spawn(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', command], {
      cwd: rootDir,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
  }

  return spawn(getNpmCommand(), createDevServerCommand(port), {
    cwd: rootDir,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function appendLog(buffer, chunk) {
  const nextValue = `${buffer}${chunk.toString('utf8')}`;
  return nextValue.length > MAX_LOG_CHARS
    ? nextValue.slice(nextValue.length - MAX_LOG_CHARS)
    : nextValue;
}

async function fetchJson(url, body, timeoutMs) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  const startedAt = performance.now();

  try {
    const response = await fetch(url, {
      body: JSON.stringify(body),
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
      },
      method: 'POST',
      signal: controller.signal,
    });

    const text = await response.text();
    let json = null;

    try {
      json = JSON.parse(text);
    } catch {
      json = null;
    }

    return {
      body: json,
      latencyMs: Math.round(performance.now() - startedAt),
      ok: response.ok,
      rawBody: text,
      status: response.status,
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

async function waitForServerReady(url, child) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < STARTUP_TIMEOUT_MS) {
    if (child.exitCode !== null) {
      throw new Error(`Dev server exited early with code ${child.exitCode}.`);
    }

    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
    } catch {}

    await delay(500);
  }

  throw new Error(
    `Timed out waiting for dev server after ${STARTUP_TIMEOUT_MS}ms.`,
  );
}

function evaluateCase(testCase, result) {
  if (result.timeout) {
    return {
      passed: false,
      reason: `timed out after ${REQUEST_TIMEOUT_MS}ms`,
    };
  }

  if (!result.ok) {
    return {
      passed: false,
      reason: `http ${result.status}`,
    };
  }

  if (!result.body || typeof result.body !== 'object') {
    return {
      passed: false,
      reason: 'response body is not valid JSON',
    };
  }

  if (
    typeof result.body.message !== 'string' ||
    result.body.message.trim().length === 0
  ) {
    return {
      passed: false,
      reason: 'message is empty',
    };
  }

  const actualAction = result.body.action ?? null;

  if (testCase.expectedAction === null) {
    return actualAction === null
      ? { passed: true }
      : {
          passed: false,
          reason: `expected action=null, received ${JSON.stringify(actualAction)}`,
        };
  }

  if (!actualAction) {
    return {
      passed: false,
      reason: 'expected TELEPORT action but received null',
    };
  }

  if (actualAction.type !== testCase.expectedAction.type) {
    return {
      passed: false,
      reason: `expected action.type=${testCase.expectedAction.type}, received ${actualAction.type}`,
    };
  }

  if (actualAction.targetId !== testCase.expectedAction.targetId) {
    return {
      passed: false,
      reason: `expected targetId=${testCase.expectedAction.targetId}, received ${actualAction.targetId}`,
    };
  }

  return { passed: true };
}

async function stopServer(child) {
  if (child.exitCode !== null) {
    return;
  }

  if (process.platform === 'win32') {
    try {
      await execFileAsync('taskkill', [
        '/PID',
        String(child.pid),
        '/T',
        '/F',
      ]);
    } catch {}

    await waitForChildExit(child, PROCESS_SHUTDOWN_TIMEOUT_MS);
    return;
  }

  child.kill('SIGTERM');
  await waitForChildExit(child, 1_000);

  if (child.exitCode === null) {
    child.kill('SIGKILL');
    await waitForChildExit(child, PROCESS_SHUTDOWN_TIMEOUT_MS);
  }
}

function waitForChildExit(child, timeoutMs) {
  if (child.exitCode !== null) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    const onExit = () => {
      clearTimeout(timeoutId);
      resolve();
    };

    const timeoutId = setTimeout(() => {
      child.off('exit', onExit);
      resolve();
    }, timeoutMs);

    child.once('exit', onExit);
  });
}

async function runModelSuite(modelId, index, rootDir) {
  const port = BASE_PORT + index;
  const url = `http://${HOST}:${port}`;
  const child = spawnDevServer(rootDir, modelId, port);

  let stdout = '';
  let stderr = '';

  child.stdout.on('data', (chunk) => {
    stdout = appendLog(stdout, chunk);
  });

  child.stderr.on('data', (chunk) => {
    stderr = appendLog(stderr, chunk);
  });

  const suiteStartedAt = performance.now();

  try {
    await waitForServerReady(`${url}/`, child);
  } catch (error) {
    await stopServer(child);
    return {
      error:
        error instanceof Error ? error.message : 'Unknown server startup error',
      modelId,
      port,
      results: [],
      started: false,
      stderr,
      stdout,
      suiteLatencyMs: Math.round(performance.now() - suiteStartedAt),
    };
  }

  const results = [];

  for (const testCase of DEFAULT_CASES) {
    try {
      const response = await fetchJson(
        `${url}/api/agent`,
        { message: testCase.message },
        REQUEST_TIMEOUT_MS,
      );
      const verdict = evaluateCase(testCase, response);

      results.push({
        ...verdict,
        action: response.body?.action ?? null,
        id: testCase.id,
        latencyMs: response.latencyMs,
        message: testCase.message,
        responseMessage:
          typeof response.body?.message === 'string'
            ? response.body.message
            : undefined,
        status: response.status,
      });
    } catch (error) {
      const timedOut =
        error instanceof Error && error.name === 'AbortError';

      results.push({
        id: testCase.id,
        latencyMs: REQUEST_TIMEOUT_MS,
        message: testCase.message,
        passed: false,
        reason: timedOut
          ? `timed out after ${REQUEST_TIMEOUT_MS}ms`
          : error instanceof Error
            ? error.message
            : 'Unknown request error',
        status: null,
        timeout: timedOut,
      });
    }

    await delay(CASE_DELAY_MS);
  }

  await stopServer(child);

  return {
    error: null,
    modelId,
    port,
    results,
    started: true,
    stderr,
    stdout,
    suiteLatencyMs: Math.round(performance.now() - suiteStartedAt),
  };
}

function printSuiteSummary(suite) {
  console.log(`\nModel: ${suite.modelId}`);
  console.log(`Port: ${suite.port}`);
  console.log(`Started: ${suite.started ? 'yes' : 'no'}`);
  console.log(`Duration: ${suite.suiteLatencyMs}ms`);

  if (suite.error) {
    console.log(`Startup error: ${suite.error}`);
    return;
  }

  for (const result of suite.results) {
    const prefix = result.passed ? 'PASS' : 'FAIL';
    const statusLabel = result.status === null ? 'n/a' : String(result.status);
    const reason = result.passed ? '' : ` | ${result.reason ?? 'failed'}`;
    const actionSummary = result.action
      ? ` | action=${result.action.type}:${result.action.targetId}`
      : '';

    console.log(
      `- ${prefix} ${result.id} | status=${statusLabel} | latency=${result.latencyMs}ms${actionSummary}${reason}`,
    );
  }
}

async function writeReport(rootDir, report) {
  const logsDir = path.join(rootDir, 'logs');
  await mkdir(logsDir, { recursive: true });

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const reportPath = path.join(logsDir, `ai-model-smoke-${timestamp}.json`);
  await writeFile(reportPath, JSON.stringify(report, null, 2), 'utf8');
  return reportPath;
}

async function main() {
  const rootDir = process.cwd();
  const models =
    process.argv.slice(2).length > 0 ? process.argv.slice(2) : DEFAULT_MODELS;

  console.log('Running AI model smoke test with current /api/agent implementation.');
  console.log(`Models: ${models.join(', ')}`);
  console.log(
    `Cases: ${DEFAULT_CASES.map((testCase) => testCase.id).join(', ')}`,
  );
  console.log(`Request timeout: ${REQUEST_TIMEOUT_MS}ms`);

  const suites = [];

  for (const [index, modelId] of models.entries()) {
    const suite = await runModelSuite(modelId, index, rootDir);
    suites.push(suite);
    printSuiteSummary(suite);
  }

  const summary = suites.map((suite) => ({
    failed:
      suite.error !== null ||
      suite.results.filter((result) => !result.passed).length,
    modelId: suite.modelId,
    passed: suite.results.filter((result) => result.passed).length,
    total: suite.results.length,
  }));

  console.log('\nSummary:');
  console.table(summary);

  const reportPath = await writeReport(rootDir, {
    generatedAt: new Date().toISOString(),
    requestTimeoutMs: REQUEST_TIMEOUT_MS,
    suites,
  });

  console.log(`Detailed report written to ${reportPath}`);

  if (summary.some((item) => item.failed)) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
