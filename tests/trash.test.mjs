import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { access, mkdtemp, mkdir, readFile, writeFile, chmod, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import os from 'node:os';
import path from 'node:path';

const root = process.cwd();

test('bulk trash validates selection, refuses live files, and retains catalog tombstones', async () => {
  const fixture = await mkdtemp(path.join(os.tmpdir(), 'lavish-trash-test-'));
  const project = path.join(fixture, 'project');
  const lavishDir = path.join(project, '.lavish');
  const stateDir = path.join(fixture, 'state');
  const configDir = path.join(fixture, 'config');
  const trashDir = path.join(fixture, 'trash');
  await Promise.all([lavishDir, stateDir, configDir, trashDir].map((dir) => mkdir(dir, { recursive: true })));
  const live = path.join(lavishDir, 'live.html');
  const finished = path.join(lavishDir, 'finished.html');
  const missing = path.join(lavishDir, 'missing.html');
  const id = (file) => createHash('sha1').update(file).digest('hex').slice(0, 12);
  await writeFile(live, '<title>Live</title>');
  await writeFile(finished, '<title>Finished</title>');
  await writeFile(path.join(stateDir, 'state.json'), JSON.stringify({ sessions: {
    live: { file: live, status: 'open' }, finished: { file: finished, status: 'ended' }, missing: { file: missing, status: 'open' },
  } }));
  await writeFile(path.join(configDir, 'config.json'), JSON.stringify({ projects: [{ path: project, name: 'Project' }] }));
  const fakeTrash = path.join(fixture, 'trash-file');
  await writeFile(fakeTrash, '#!/bin/sh\nexec /bin/mv "$1" "$TEST_TRASH_DIR/"\n');
  await chmod(fakeTrash, 0o755);
  const port = 45_000 + (process.pid % 1_000);
  const service = spawn(process.execPath, [path.join(root, 'scripts/local-api.mjs')], {
    cwd: root, stdio: 'ignore', env: { ...process.env, LAVISH_TRACKER_API_PORT: String(port), LAVISH_TRACKER_CONFIG_DIR: configDir,
      LAVISH_AXI_STATE_DIR: stateDir, LAVISH_TRACKER_DROP_DIR: '', LAVISH_TRACKER_TRASH_BIN: fakeTrash, TEST_TRASH_DIR: trashDir },
  });
  try {
    let ready = false;
    for (let attempt = 0; attempt < 40; attempt++) {
      try { if ((await fetch(`http://127.0.0.1:${port}/health`)).ok) { ready = true; break; } } catch { /* starting */ }
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    assert.equal(ready, true);
    const request = (ids) => fetch(`http://127.0.0.1:${port}/api/artifacts/trash`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ids }),
    });
    assert.equal((await request([id(live), id(finished)])).status, 400);
    await access(finished);
    assert.equal((await request([id(finished), id(missing)])).status, 200);
    await assert.rejects(access(finished));
    await access(path.join(trashDir, 'finished.html'));
    const library = await (await fetch(`http://127.0.0.1:${port}/api/library`)).json();
    assert.deepEqual(library.artifacts.map((item) => item.title), ['Live']);
    assert.equal((await request([id(finished)])).status, 400);
    const config = JSON.parse(await readFile(path.join(configDir, 'config.json'), 'utf8'));
    assert.deepEqual(config.trashedArtifacts.sort(), [finished, missing].sort());
  } finally {
    service.kill('SIGTERM');
    await rm(fixture, { recursive: true, force: true });
  }
});
