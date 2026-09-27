import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, realpath, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

async function freePort() {
  const server = createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

async function fixture(run, { bin = '/usr/bin/true', health = null } = {}) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'lavish-review-'));
  const lavishDir = path.join(directory, 'project', '.lavish');
  const stateDir = path.join(directory, 'state');
  const configDir = path.join(directory, 'config');
  await Promise.all([lavishDir, stateDir, configDir].map((dir) => mkdir(dir, { recursive: true })));
  const file = path.join(lavishDir, 'plan.html');
  await writeFile(file, '<title>Review plan</title>');
  const chat = [{ role: 'agent', text: 'Reply', at: '2026-09-01T00:00:00Z' }, { role: 'user', kind: 'input', text: 'Answer', at: '2026-09-02T00:00:00Z' }];
  await writeFile(path.join(stateDir, 'state.json'), JSON.stringify({ sessions: { demo: { file, status: 'open', chat } } }));
  await writeFile(path.join(configDir, 'config.json'), JSON.stringify({ projects: [], archiveRoot: null }));
  const port = await freePort();
  const upstream = createServer((req, res) => {
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify(health));
  });
  await new Promise((resolve) => upstream.listen(0, '127.0.0.1', resolve));
  const upstreamPort = upstream.address().port;
  const service = spawn(process.execPath, ['scripts/local-api.mjs'], {
    env: { ...process.env, LAVISH_TRACKER_API_PORT: String(port), LAVISH_AXI_PORT: String(upstreamPort), LAVISH_AXI_STATE_DIR: stateDir, LAVISH_TRACKER_CONFIG_DIR: configDir, LAVISH_AXI_BIN: bin },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  service.stderr.on('data', (chunk) => { output += chunk; });
  const exited = new Promise((resolve) => service.once('exit', resolve));
  const api = `http://127.0.0.1:${port}/api`;
  const post = async (route, value) => fetch(`${api}${route}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(value) });
  try {
    for (let i = 0; i < 60; i += 1) {
      try { if ((await fetch(`http://127.0.0.1:${port}/health`)).ok) break; } catch { /* Starting. */ }
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    await run({ api, post, file, lavishDir, stateDir, configDir, upstreamPort });
  } catch (error) {
    error.message += `\nCompanion stderr: ${output}`;
    throw error;
  } finally {
    service.kill('SIGTERM');
    await exited;
    await new Promise((resolve) => upstream.close(resolve));
    await rm(directory, { recursive: true, force: true });
  }
}

test('counts agent replies separately from structured reviewer messages', async () => {
  await fixture(async ({ api }) => {
    const library = await (await fetch(`${api}/library`)).json();
    assert.equal(library.artifacts[0].sessionMessages, 1);
    assert.equal(library.artifacts[0].lastUsedAt, '2026-09-02T00:00:00Z');
    const insights = await (await fetch(`${api}/insights?days=3650`)).json();
    assert.equal(insights.summary.sessionReplies, 1);
  });
});

test('probes the configured Lavish port and accepts older health responses', async () => {
  await fixture(async ({ api, upstreamPort }) => {
    const library = await (await fetch(`${api}/library`)).json();
    assert.equal(library.server.running, true);
    assert.equal(library.server.url, `http://127.0.0.1:${upstreamPort}`);
  }, { health: { app: 'lavish-axi', ok: true } });
});

test('recognizes the matching installation identity from upstream 0.1.78', async () => {
  const health = { app: 'lavish-axi', ok: true };
  await fixture(async ({ api, stateDir }) => {
    health.state_id = createHash('sha256').update(path.join(await realpath(stateDir), 'state.json')).digest('hex').slice(0, 16);
    const library = await (await fetch(`${api}/library`)).json();
    assert.equal(library.server.running, true);
    health.state_id = 'another-installation';
    const foreign = await (await fetch(`${api}/library`)).json();
    assert.equal(foreign.server.running, false);
  }, { health });
});

test('reports a missing CLI without killing the companion or recording an open', async () => {
  await fixture(async ({ api, post, file, configDir }) => {
    const response = await post('/artifacts/open', { file });
    assert.equal(response.status, 400);
    assert.match((await response.json()).error, /ENOENT|could not launch/i);
    assert.equal((await fetch(`${api}/library`)).status, 200);
    const analytics = await readFile(path.join(configDir, 'analytics.json'), 'utf8').then(JSON.parse).catch(() => ({ events: [] }));
    assert.equal(analytics.events.filter((event) => event.type === 'open').length, 0);
  }, { bin: '/nonexistent/lavish-axi' });
});

test('explicit none clears an outcome while omitted fields retain feedback', async () => {
  await fixture(async ({ post, file }) => {
    await post('/artifacts/feedback', { file, value: 'useful', outcome: 'shipped', note: 'Original note' });
    const valueOnly = await (await post('/artifacts/feedback', { file, value: 'unfinished' })).json();
    assert.equal(valueOnly.feedback.outcome, 'shipped');
    const cleared = await (await post('/artifacts/feedback', { file, outcome: 'none', note: '' })).json();
    assert.equal(cleared.feedback.outcome, null);
    assert.equal(cleared.feedback.note, null);
    assert.equal(cleared.feedback.value, 'unfinished');
  });
});

test('does not discover generated exports unless they are explicitly in session history', async () => {
  await fixture(async ({ api, file, lavishDir, stateDir }) => {
    await writeFile(path.join(lavishDir, 'plan.export.html'), '<title>Portable copy</title>');
    let library = await (await fetch(`${api}/library`)).json();
    assert.equal(library.artifacts.length, 1);
    const exported = path.join(lavishDir, 'plan.export.html');
    await writeFile(path.join(stateDir, 'state.json'), JSON.stringify({ sessions: { original: { file }, exported: { file: exported } } }));
    library = await (await fetch(`${api}/library`)).json();
    assert.equal(library.artifacts.length, 2);
  });
});
