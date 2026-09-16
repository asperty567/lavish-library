import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, readdir, writeFile } from 'node:fs/promises';
import http from 'node:http';
import { after, before, test } from 'node:test';
import os from 'node:os';
import path from 'node:path';

const root = process.cwd();
const port = 44_000 + (process.pid % 1_000);
const api = `http://127.0.0.1:${port}/api`;
let service;
let fixture;
let lavishFile;
let outsideFile;
let undiscoveredLavishFile;

async function waitForApi() {
  return waitForService(port);
}

async function waitForService(servicePort) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${servicePort}/health`);
      if (response.ok) return;
    } catch { /* Service is still starting. */ }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error('Test API did not start.');
}

async function post(route, value) {
  const response = await fetch(`${api}${route}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(value) });
  const result = await response.json();
  assert.equal(response.ok, true, result.error);
  return result;
}

before(async () => {
  fixture = await mkdtemp(path.join(os.tmpdir(), 'lavish-tracker-test-'));
  const project = path.join(fixture, 'Signal Project');
  const lavishDir = path.join(project, '.lavish');
  const stateDir = path.join(fixture, 'lavish-state');
  const configDir = path.join(fixture, 'tracker-state');
  await Promise.all([mkdir(lavishDir, { recursive: true }), mkdir(stateDir, { recursive: true }), mkdir(configDir, { recursive: true })]);
  lavishFile = path.join(lavishDir, 'identity-plan.html');
  outsideFile = path.join(fixture, 'untracked.html');
  undiscoveredLavishFile = path.join(project, 'one', 'two', 'three', 'four', '.lavish', 'hidden.html');
  await mkdir(path.dirname(undiscoveredLavishFile), { recursive: true });
  await writeFile(lavishFile, '<!doctype html><html><head><title>Identity migration plan</title><meta name="description" content="Entra access architecture and delivery decisions"></head><body><h1>Identity migration</h1></body></html>');
  await writeFile(outsideFile, '<!doctype html><title>Not a Lavish</title>');
  await writeFile(undiscoveredLavishFile, '<!doctype html><title>Outside scanner depth</title>');
  await writeFile(path.join(stateDir, 'state.json'), JSON.stringify({ sessions: { demo: { file: lavishFile, status: 'open', updated_at: '2026-08-30T00:00:00.000Z', chat: [{ at: '2026-08-30T00:00:00.000Z' }] } } }));
  await writeFile(path.join(configDir, 'config.json'), JSON.stringify({ projects: [{ path: project, name: 'Signal Project' }], archiveRoot: null }));
  service = spawn(process.execPath, [path.join(root, 'scripts/local-api.mjs')], {
    cwd: root,
    env: { ...process.env, LAVISH_TRACKER_API_PORT: String(port), LAVISH_TRACKER_UI_PORT: '3007', LAVISH_TRACKER_CONFIG_DIR: configDir, LAVISH_AXI_STATE_DIR: stateDir, LAVISH_AXI_BIN: '/usr/bin/true', LAVISH_TRACKER_DROP_DIR: '' },
    stdio: 'ignore',
  });
  await waitForApi();
});

after(() => service?.kill('SIGTERM'));

test('builds a local library with known session activity', async () => {
  const response = await fetch(`${api}/library`);
  const library = await response.json();
  assert.equal(library.artifacts.length, 1);
  assert.equal(library.artifacts[0].title, 'Identity migration plan');
  assert.equal(library.artifacts[0].sessionMessages, 1);
});

test('records search, value, and outcome signals in insights', async () => {
  const library = await (await fetch(`${api}/library`)).json();
  const artifact = library.artifacts[0];
  await post('/events', { type: 'search', query: 'identity', resultCount: 1, projectId: artifact.projectId });
  await post('/artifacts/feedback', { file: lavishFile, value: 'useful', outcome: 'shipped', note: 'Turned into delivery work.' });
  const insights = await (await fetch(`${api}/insights?days=3650`)).json();
  assert.equal(insights.summary.totalArtifacts, 1);
  assert.equal(insights.summary.trackedSearches, 1);
  assert.equal(insights.summary.outcomes, 1);
  assert.equal(insights.searches[0].query, 'identity');
  assert.equal(insights.feedbackQueue.length, 0);
});

test('never enables foreground-time tracking', async () => {
  const result = await post('/insights/settings', { cadence: 'tunable', manual: true, weekly: true, monthly: true, contextual: true, foregroundTime: true });
  assert.equal(result.settings.foregroundTime, false);
});

test('rejects hostile browser origins and requires a session token', async () => {
  const searchesBefore = (await (await fetch(`${api}/insights?days=3650`)).json()).summary.trackedSearches;
  const hostilePost = await fetch(`${api}/events`, {
    method: 'POST',
    headers: { origin: 'https://attacker.example', 'content-type': 'application/json' },
    body: JSON.stringify({ type: 'search', query: 'should-not-record', resultCount: 0 }),
  });
  assert.equal(hostilePost.status, 403);
  const searchesAfter = (await (await fetch(`${api}/insights?days=3650`)).json()).summary.trackedSearches;
  assert.equal(searchesAfter, searchesBefore);

  const hostile = await fetch(`${api}/archive/disable`, {
    method: 'OPTIONS',
    headers: { origin: 'https://attacker.example', 'access-control-request-method': 'POST', 'access-control-request-headers': 'content-type' },
  });
  assert.equal(hostile.status, 403);
  assert.equal(hostile.headers.get('access-control-allow-origin'), null);

  const nullOrigin = await fetch(`${api}/archive/disable`, { method: 'POST', headers: { origin: 'null' } });
  assert.equal(nullOrigin.status, 403);
  const originlessBrowser = await fetch(`${api}/library`, { headers: { 'sec-fetch-site': 'cross-site' } });
  assert.equal(originlessBrowser.status, 403);

  const origin = 'http://localhost:3007';
  const preflight = await fetch(`${api}/library`, {
    method: 'OPTIONS',
    headers: { origin, 'access-control-request-method': 'GET', 'access-control-request-headers': 'x-lavish-token' },
  });
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get('access-control-allow-origin'), origin);
  assert.match(preflight.headers.get('access-control-allow-headers'), /x-lavish-token/);
  const sessionResponse = await fetch(`${api}/session`, { headers: { origin } });
  const session = await sessionResponse.json();
  assert.equal(sessionResponse.status, 200);
  assert.equal(sessionResponse.headers.get('access-control-allow-origin'), origin);
  assert.equal(typeof session.token, 'string');

  const unauthorized = await fetch(`${api}/library`, { headers: { origin } });
  assert.equal(unauthorized.status, 401);
  const authorized = await fetch(`${api}/library`, { headers: { origin, 'x-lavish-token': session.token } });
  assert.equal(authorized.status, 200);

  const otherLoopbackApp = await fetch(`${api}/session`, { headers: { origin: 'http://localhost:4173' } });
  assert.equal(otherLoopbackApp.status, 403);

  const ipOrigin = 'http://127.0.0.1:3007';
  const ipSession = await fetch(`${api}/session`, { headers: { origin: ipOrigin } });
  assert.equal(ipSession.status, 200);
  assert.equal(ipSession.headers.get('access-control-allow-origin'), ipOrigin);
});

test('allows the configured Tailscale UI origin and Serve host', async () => {
  const publicHost = 'mac-studio.tail1c136e.ts.net';
  const publicOrigin = `https://${publicHost}:3000`;
  const servicePort = port + 2;
  const configDir = await mkdtemp(path.join(os.tmpdir(), 'lavish-tracker-tailscale-'));
  const stateDir = await mkdtemp(path.join(os.tmpdir(), 'lavish-tracker-tailscale-state-'));
  const project = path.join(configDir, 'Signal Project');
  const lavishDir = path.join(project, '.lavish');
  const lavishFile = path.join(lavishDir, 'identity-plan.html');
  await mkdir(lavishDir, { recursive: true });
  await writeFile(lavishFile, '<!doctype html><title>Identity migration plan</title>');
  await writeFile(path.join(configDir, 'config.json'), JSON.stringify({ projects: [{ path: project, name: 'Signal Project' }], archiveRoot: null }));
  await writeFile(path.join(stateDir, 'state.json'), JSON.stringify({
    sessions: {
      demo: {
        file: lavishFile,
        status: 'open',
        url: 'http://127.0.0.1:4387/session/tailscale-demo',
        updated_at: '2026-08-30T00:00:00.000Z',
      },
    },
  }));
  const publicService = spawn(process.execPath, [path.join(root, 'scripts/local-api.mjs')], {
    cwd: root,
    env: {
      ...process.env,
      LAVISH_TRACKER_API_PORT: String(servicePort),
      LAVISH_TRACKER_UI_PORT: '3007',
      LAVISH_TRACKER_PUBLIC_HOST: publicHost,
      LAVISH_TRACKER_PUBLIC_ORIGIN: publicOrigin,
      LAVISH_TRACKER_CONFIG_DIR: configDir,
      LAVISH_AXI_STATE_DIR: stateDir,
      LAVISH_AXI_BIN: '/usr/bin/true',
      LAVISH_TRACKER_DROP_DIR: '',
    },
    stdio: 'ignore',
  });

  try {
    await waitForService(servicePort);
    const sessionResponse = await fetch(`http://127.0.0.1:${servicePort}/api/session`, { headers: { origin: publicOrigin } });
    const session = await sessionResponse.json();
    assert.equal(sessionResponse.status, 200);
    assert.equal(sessionResponse.headers.get('access-control-allow-origin'), publicOrigin);
    assert.equal(typeof session.token, 'string');

    const served = await new Promise((resolve, reject) => {
      const req = http.request({
        hostname: '127.0.0.1',
        port: servicePort,
        path: '/health',
        headers: { host: `${publicHost}:${servicePort}` },
      }, (res) => {
        res.resume();
        res.on('end', () => resolve(res.statusCode));
      });
      req.on('error', reject);
      req.end();
    });
    assert.equal(served, 200);

    const libraryResponse = await fetch(`http://127.0.0.1:${servicePort}/api/library`, {
      headers: { origin: publicOrigin, 'x-lavish-token': session.token },
    });
    const library = await libraryResponse.json();
    assert.equal(libraryResponse.status, 200);
    assert.equal(library.server.url, `http://${publicHost}:4387`);
    assert.equal(library.artifacts[0].url, `http://${publicHost}:4387/session/tailscale-demo`);

    const openResponse = await fetch(`http://127.0.0.1:${servicePort}/api/artifacts/open`, {
      method: 'POST',
      headers: { origin: publicOrigin, 'content-type': 'application/json', 'x-lavish-token': session.token },
      body: JSON.stringify({ file: lavishFile, reopen: false, query: null }),
    });
    const opened = await openResponse.json();
    assert.equal(openResponse.status, 202);
    assert.equal(opened.url, `http://${publicHost}:4387/session/tailscale-demo`);
  } finally {
    publicService.kill('SIGTERM');
  }
});

test('ignores archive side effects when resolving one artifact', async () => {
  const archiveFixture = await mkdtemp(path.join(os.tmpdir(), 'lavish-tracker-archive-test-'));
  const project = path.join(archiveFixture, 'Archive Project');
  const lavishDir = path.join(project, '.lavish');
  const stateDir = path.join(archiveFixture, 'lavish-state');
  const configDir = path.join(archiveFixture, 'tracker-state');
  const archiveRoot = path.join(archiveFixture, 'archive-root');
  const servicePort = port + 1;
  const serviceApi = `http://127.0.0.1:${servicePort}/api`;
  const primaryFile = path.join(lavishDir, 'primary.html');
  const secondaryFile = path.join(lavishDir, 'secondary.html');
  await Promise.all([mkdir(lavishDir, { recursive: true }), mkdir(stateDir, { recursive: true }), mkdir(configDir, { recursive: true }), mkdir(archiveRoot, { recursive: true })]);
  await writeFile(primaryFile, '<!doctype html><title>Primary</title>');
  await writeFile(secondaryFile, '<!doctype html><title>Secondary</title>');
  await writeFile(path.join(stateDir, 'state.json'), JSON.stringify({ sessions: {} }));
  await writeFile(path.join(configDir, 'config.json'), JSON.stringify({ projects: [{ path: project, name: 'Archive Project' }], archiveRoot }));

  const archiveService = spawn(process.execPath, [path.join(root, 'scripts/local-api.mjs')], {
    cwd: root,
    env: { ...process.env, LAVISH_TRACKER_API_PORT: String(servicePort), LAVISH_TRACKER_CONFIG_DIR: configDir, LAVISH_AXI_STATE_DIR: stateDir, LAVISH_AXI_BIN: '/usr/bin/true', LAVISH_TRACKER_DROP_DIR: '' },
    stdio: 'ignore',
  });

  try {
    await waitForService(servicePort);
    const response = await fetch(`${serviceApi}/artifacts/versions?file=${encodeURIComponent(primaryFile)}`);
    const result = await response.json();
    assert.equal(response.status, 200);
    assert.deepEqual(result.versions, []);

    const archivedEntries = await readdir(archiveRoot);
    assert.equal(archivedEntries.length, 0);
  } finally {
    archiveService.kill('SIGTERM');
  }
});

test('rejects HTML files outside the known Lavish library', async () => {
  const response = await fetch(`${api}/artifacts/open`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ file: outsideFile }),
  });
  const result = await response.json();
  assert.equal(response.status, 400);
  assert.match(result.error, /not a known Lavish artifact/i);

  const versionsResponse = await fetch(`${api}/artifacts/versions?file=${encodeURIComponent(outsideFile)}`);
  const versionsResult = await versionsResponse.json();
  assert.equal(versionsResponse.status, 400);
  assert.match(versionsResult.error, /not a known Lavish artifact/i);

  const undiscoveredResponse = await fetch(`${api}/artifacts/versions?file=${encodeURIComponent(undiscoveredLavishFile)}`);
  const undiscoveredResult = await undiscoveredResponse.json();
  assert.equal(undiscoveredResponse.status, 400);
  assert.match(undiscoveredResult.error, /not a known Lavish artifact/i);
});

test('library refresh updates the cached artifact allowlist', async () => {
  const addedFile = path.join(path.dirname(lavishFile), 'fresh-artifact.html');
  await writeFile(addedFile, '<!doctype html><title>Fresh Artifact</title>');

  const beforeRefresh = await fetch(`${api}/artifacts/versions?file=${encodeURIComponent(addedFile)}`);
  assert.equal(beforeRefresh.status, 400);

  const libraryResponse = await fetch(`${api}/library`);
  const library = await libraryResponse.json();
  assert.equal(libraryResponse.status, 200);
  assert(library.artifacts.some((artifact) => artifact.file === addedFile));

  const afterRefresh = await fetch(`${api}/artifacts/versions?file=${encodeURIComponent(addedFile)}`);
  const versions = await afterRefresh.json();
  assert.equal(afterRefresh.status, 200);
  assert.deepEqual(versions.versions, []);
});

test('indexes Desktop drop files and opens them over HTTP for the tailnet', async () => {
  const dropFixture = await mkdtemp(path.join(os.tmpdir(), 'lavish-tracker-drop-'));
  const configDir = path.join(dropFixture, 'tracker-state');
  const stateDir = path.join(dropFixture, 'lavish-state');
  const dropDir = path.join(dropFixture, 'from-mini', 'firstmate');
  const pngFile = path.join(dropDir, 'Beautyline_ShortDesc_Ingredients.png');
  const storyboardFile = path.join(dropDir, 'relay-partner-flow-phase0-storyboard.html');
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
  const publicHost = 'mac-studio.tail1c136e.ts.net';
  const publicOrigin = `https://${publicHost}:3000`;
  const servicePort = port + 3;
  await Promise.all([mkdir(dropDir, { recursive: true }), mkdir(configDir, { recursive: true }), mkdir(stateDir, { recursive: true })]);
  await writeFile(pngFile, png);
  await writeFile(storyboardFile, '<!doctype html><title>Relay partner flow phase 0</title><p>Storyboard</p>');
  await writeFile(path.join(configDir, 'config.json'), JSON.stringify({ projects: [], archiveRoot: null }));
  await writeFile(path.join(stateDir, 'state.json'), JSON.stringify({ sessions: {} }));

  const dropService = spawn(process.execPath, [path.join(root, 'scripts/local-api.mjs')], {
    cwd: root,
    env: {
      ...process.env,
      LAVISH_TRACKER_API_PORT: String(servicePort),
      LAVISH_TRACKER_UI_PORT: '3007',
      LAVISH_TRACKER_PUBLIC_HOST: publicHost,
      LAVISH_TRACKER_PUBLIC_ORIGIN: publicOrigin,
      LAVISH_TRACKER_CONFIG_DIR: configDir,
      LAVISH_AXI_STATE_DIR: stateDir,
      LAVISH_AXI_BIN: '/usr/bin/true',
      LAVISH_TRACKER_DROP_DIR: dropDir,
    },
    stdio: 'ignore',
  });

  try {
    await waitForService(servicePort);
    const sessionResponse = await fetch(`http://127.0.0.1:${servicePort}/api/session`, { headers: { origin: publicOrigin } });
    const session = await sessionResponse.json();
    assert.equal(sessionResponse.status, 200);

    const libraryResponse = await fetch(`http://127.0.0.1:${servicePort}/api/library`, {
      headers: { origin: publicOrigin, 'x-lavish-token': session.token },
    });
    const library = await libraryResponse.json();
    assert.equal(libraryResponse.status, 200);
    const screenshot = library.artifacts.find((artifact) => artifact.file === pngFile);
    const storyboard = library.artifacts.find((artifact) => artifact.file === storyboardFile);
    assert.equal(screenshot?.kind, 'drop');
    assert.equal(screenshot?.title, 'Beautyline ShortDesc Ingredients');
    assert.equal(storyboard?.kind, 'drop');
    assert.match(storyboard?.title || '', /Relay partner flow phase 0/i);
    assert.equal(screenshot.url, `${publicOrigin}/api/artifacts/file?id=${screenshot.id}`);

    const openResponse = await fetch(`http://127.0.0.1:${servicePort}/api/artifacts/open`, {
      method: 'POST',
      headers: { origin: publicOrigin, 'content-type': 'application/json', 'x-lavish-token': session.token },
      body: JSON.stringify({ file: pngFile, reopen: false, query: null }),
    });
    const opened = await openResponse.json();
    assert.equal(openResponse.status, 202);
    assert.equal(opened.url, screenshot.url);

    const fileResponse = await fetch(`http://127.0.0.1:${servicePort}/api/artifacts/file?id=${screenshot.id}`, {
      headers: { 'sec-fetch-site': 'cross-site' },
    });
    const body = Buffer.from(await fileResponse.arrayBuffer());
    assert.equal(fileResponse.status, 200);
    assert.equal(fileResponse.headers.get('content-type'), 'image/png');
    assert.deepEqual(body, png);

    const unknown = await fetch(`http://127.0.0.1:${servicePort}/api/artifacts/file?id=deadbeefdead`);
    assert.equal(unknown.status, 400);
  } finally {
    dropService.kill('SIGTERM');
  }
});
