import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdir, mkdtemp, readFile, rename, rm, symlink, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

async function fixture(run) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'lavish-bundle-'));
  const sourceDir = path.join(directory, 'project', '.lavish');
  const stateDir = path.join(directory, 'state');
  const configDir = path.join(directory, 'config');
  const archiveRoot = path.join(directory, 'archive');
  await Promise.all([sourceDir, stateDir, configDir].map((dir) => mkdir(dir, { recursive: true })));
  const file = path.join(sourceDir, 'plan.html');
  const html = '<title>Bundle plan</title><link href="assets/style.css"><img src="assets/logo.png">';
  await mkdir(path.join(sourceDir, 'assets'));
  await writeFile(file, html);
  await writeFile(path.join(sourceDir, 'assets/style.css'), 'body { color: red; background: url("nested/icon.png"); }');
  await mkdir(path.join(sourceDir, 'assets/nested'));
  await writeFile(path.join(sourceDir, 'assets/nested/icon.png'), 'icon-one');
  await writeFile(path.join(sourceDir, 'assets/logo.png'), 'logo-one');
  await writeFile(path.join(stateDir, 'state.json'), JSON.stringify({ sessions: { demo: { file } } }));
  await writeFile(path.join(configDir, 'config.json'), JSON.stringify({ projects: [], archiveRoot }));
  const socket = createServer();
  await new Promise((resolve) => socket.listen(0, '127.0.0.1', resolve));
  const port = socket.address().port;
  await new Promise((resolve) => socket.close(resolve));
  const service = spawn(process.execPath, ['scripts/local-api.mjs'], {
    env: { ...process.env, LAVISH_TRACKER_API_PORT: String(port), LAVISH_TRACKER_CONFIG_DIR: configDir, LAVISH_AXI_STATE_DIR: stateDir, LAVISH_AXI_BIN: '/usr/bin/true' },
    stdio: 'ignore',
  });
  const exited = once(service, 'exit');
  const api = `http://127.0.0.1:${port}/api`;
  const get = async (route) => {
    const response = await fetch(`${api}${route}`);
    const result = await response.json();
    assert.equal(response.ok, true, result.error);
    return result;
  };
  const post = async (route, value = { file }) => {
    const response = await fetch(`${api}${route}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(value) });
    const result = await response.json();
    assert.equal(response.ok, true, result.error);
    return result;
  };
  const history = () => get(`/artifacts/versions?file=${encodeURIComponent(file)}`);
  try {
    for (let i = 0; i < 60; i += 1) {
      try { if ((await fetch(`http://127.0.0.1:${port}/health`)).ok) break; } catch { /* Starting. */ }
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    await run({ directory, sourceDir, file, html, api, get, post, history });
  } finally {
    service.kill('SIGTERM');
    await exited;
    await rm(directory, { recursive: true, force: true });
  }
}

async function waitForVersion(history, count) {
  for (let i = 0; i < 100; i += 1) {
    const result = await history();
    if (result.versions.length >= count) return result;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  assert.fail(`Watcher did not archive ${count} versions`);
}

test('reconciliation archives asset-only edits and current compares the complete bundle', async () => {
  await fixture(async ({ sourceDir, get, post, history }) => {
    await post('/artifacts/snapshot'); // No watcher installed: reconciliation must catch the edit.
    const baseline = (await history()).versions[0];
    await writeFile(path.join(sourceDir, 'assets/logo.png'), 'logo-two');
    assert.equal((await history()).versions.some((version) => version.isCurrent), false);
    await get('/library');
    const result = await history();
    assert.equal(result.versions.length, 2);
    assert.equal(result.versions[0].sha256, baseline.sha256);
    assert.notEqual(result.versions[0].bundleSha256, baseline.bundleSha256);
    assert.equal(result.versions[0].isCurrent, true);
    assert.equal(result.versions[1].isCurrent, false);
    await get('/library');
    assert.equal((await history()).versions.length, 2);
  });
});

test('directory watchers archive nested assets and survive atomic replacement', async () => {
  await fixture(async ({ sourceDir, get, history }) => {
    await get('/library');
    const icon = path.join(sourceDir, 'assets/nested/icon.png');
    await writeFile(`${icon}.tmp`, 'icon-two');
    await rename(`${icon}.tmp`, icon);
    let result = await waitForVersion(history, 2);
    assert.equal(result.versions[0].reason, 'change');
    await writeFile(icon, 'icon-three');
    result = await waitForVersion(history, 3);
    assert.equal(result.versions[0].reason, 'change');
    assert.equal(result.versions[0].isCurrent, true);
    await writeFile(path.join(sourceDir, 'assets/style.css'), 'body { background: url("nested/new/deep.png"); }');
    result = await waitForVersion(history, 4);
    assert.equal(result.versions[0].reason, 'change');
    await mkdir(path.join(sourceDir, 'assets/nested/new'));
    await writeFile(path.join(sourceDir, 'assets/nested/new/deep.png'), 'new-dependency');
    result = await waitForVersion(history, 5);
    assert.equal(result.versions[0].reason, 'change');
    await rm(path.join(sourceDir, 'assets/nested/new/deep.png'));
    result = await waitForVersion(history, 6);
    assert(result.versions[0].bundle.some((entry) => entry.path === 'assets/nested/new/deep.png' && entry.status === 'missing'));
  });
});

test('restore snapshots newer asset bytes, including assets omitted by current HTML', async () => {
  await fixture(async ({ sourceDir, file, html, post, history }) => {
    await post('/artifacts/snapshot');
    const baseline = (await history()).versions[0];
    await writeFile(path.join(sourceDir, 'assets/logo.png'), 'newer-logo');
    await post('/versions/restore', { file, versionId: baseline.id });
    let result = await history();
    const safety = result.versions.find((version) => version.reason === 'pre-restore');
    assert(safety);
    assert.equal(await readFile(path.join(result.archivePath, path.dirname(safety.file), 'assets/logo.png'), 'utf8'), 'newer-logo');
    assert.equal(await readFile(path.join(sourceDir, 'assets/logo.png'), 'utf8'), 'logo-one');
    await writeFile(file, '<title>Bundle plan</title>');
    await writeFile(path.join(sourceDir, 'assets/logo.png'), 'unreferenced-newer-logo');
    await post('/versions/restore', { file, versionId: baseline.id });
    result = await history();
    const omittedSafety = result.versions.find((version) => version.reason === 'pre-restore');
    assert.equal(await readFile(path.join(result.archivePath, path.dirname(omittedSafety.file), 'assets/logo.png'), 'utf8'), 'unreferenced-newer-logo');
    await post('/versions/restore', { file, versionId: omittedSafety.id });
    assert.equal(await readFile(file, 'utf8'), '<title>Bundle plan</title>');
    assert.equal(await readFile(path.join(sourceDir, 'assets/logo.png'), 'utf8'), 'unreferenced-newer-logo');
    assert.equal((await history()).versions[0].isCurrent, true);
    assert.notEqual(await readFile(file, 'utf8'), html);
  });
});

test('schemaVersion 1 archives compare assets, restore, and retain original entries and bytes', async () => {
  await fixture(async ({ sourceDir, file, html, post, history }) => {
    await writeFile(file, `${html}<img src="legacy-missing.png">`);
    await post('/artifacts/snapshot');
    const baselineHistory = await history();
    const manifestFile = path.join(baselineHistory.archivePath, 'manifest.json');
    const manifest = JSON.parse(await readFile(manifestFile, 'utf8'));
    manifest.schemaVersion = 1;
    for (const version of manifest.versions) {
      delete version.bundleSha256;
      delete version.bundle;
      delete version.supplementalAssets;
    }
    await writeFile(manifestFile, JSON.stringify(manifest));
    const legacy = manifest.versions[0];
    const legacyHtml = await readFile(path.join(baselineHistory.archivePath, legacy.file));
    assert.equal((await history()).versions[0].isCurrent, true);
    await writeFile(path.join(sourceDir, 'assets/logo.png'), 'legacy-newer-logo');
    await writeFile(path.join(sourceDir, 'legacy-missing.png'), 'not-in-legacy-archive');
    assert.equal((await history()).versions[0].isCurrent, false);
    await post('/versions/restore', { file, versionId: legacy.id });
    assert.equal(await readFile(path.join(sourceDir, 'assets/logo.png'), 'utf8'), 'logo-one');
    const updated = JSON.parse(await readFile(manifestFile, 'utf8'));
    assert.equal(updated.schemaVersion, 2);
    assert.equal(await readFile(path.join(sourceDir, 'legacy-missing.png'), 'utf8'), 'not-in-legacy-archive');
    assert.deepEqual(updated.versions[0], legacy);
    assert.deepEqual(await readFile(path.join(baselineHistory.archivePath, legacy.file)), legacyHtml);
  });
});

test('missing assets affect identity; remote, data, and escaping symlink bytes are excluded', async () => {
  await fixture(async ({ directory, sourceDir, file, html, post, history }) => {
    const external = path.join(directory, 'external.png');
    await writeFile(external, 'outside-one');
    await symlink(external, path.join(sourceDir, 'linked.png'));
    await writeFile(file, `${html}<img src="missing/deep.png"><img src="linked.png"><img src="https://example.invalid/image.png"><img src="data:image/png;base64,AAAA"><img srcset="data:image/png;base64,BBBB 1x, assets/logo.png 2x">`);
    await post('/artifacts/snapshot');
    let result = await history();
    assert(result.versions[0].bundle.some((entry) => entry.path === 'missing/deep.png' && entry.status === 'missing'));
    assert(result.versions[0].bundle.some((entry) => entry.path === 'linked.png' && entry.status === 'symlink'));
    assert.equal(result.versions[0].bundle.some((entry) => /https:|data:|AAAA|BBBB/.test(entry.path)), false);
    await writeFile(external, 'outside-two');
    await post('/artifacts/snapshot');
    assert.equal((await history()).versions.length, 1);
    await mkdir(path.join(sourceDir, 'missing'));
    await writeFile(path.join(sourceDir, 'missing/deep.png'), 'found');
    await post('/artifacts/snapshot');
    result = await history();
    assert.equal(result.versions.length, 2);
    assert.equal(result.versions[0].isCurrent, true);
    assert.equal(await readFile(external, 'utf8'), 'outside-two');
  });
});


test('referenced directory contents keep literal filenames and safety copies survive type changes', async () => {
  await fixture(async ({ sourceDir, file, post, history }) => {
    const assetDir = path.join(sourceDir, 'bundle');
    await mkdir(assetDir);
    await writeFile(path.join(assetDir, 'a#b%20.png'), 'literal-one');
    await writeFile(file, '<title>Directory bundle</title><link href="bundle/">');
    await post('/artifacts/snapshot');
    const baselineHistory = await history();
    const baseline = baselineHistory.versions[0];
    assert.equal(await readFile(path.join(baselineHistory.archivePath, path.dirname(baseline.file), 'bundle/a#b%20.png'), 'utf8'), 'literal-one');
    await writeFile(path.join(assetDir, 'a#b%20.png'), 'literal-two');
    await writeFile(file, '<title>No references</title>');
    await post('/versions/restore', { file, versionId: baseline.id });
    const safety = (await history()).versions.find((version) => version.reason === 'pre-restore');
    await post('/versions/restore', { file, versionId: safety.id });
    assert.equal(await readFile(path.join(assetDir, 'a#b%20.png'), 'utf8'), 'literal-two');
    await rm(assetDir, { recursive: true });
    await writeFile(assetDir, 'directory-replaced-with-file');
    await post('/versions/restore', { file, versionId: baseline.id });
    const typeSafety = (await history()).versions.find((version) => version.reason === 'pre-restore');
    await post('/versions/restore', { file, versionId: typeSafety.id });
    assert.equal(await readFile(assetDir, 'utf8'), 'directory-replaced-with-file');
  });
});

test('restoring missing assets preserves newly created bytes before removing them', async () => {
  await fixture(async ({ sourceDir, file, html, post, history }) => {
    await writeFile(file, `${html}<img src="later.png">`);
    await post('/artifacts/snapshot');
    const missingVersion = (await history()).versions[0];
    await writeFile(path.join(sourceDir, 'later.png'), 'created-after-snapshot');
    await post('/versions/restore', { file, versionId: missingVersion.id });
    await assert.rejects(readFile(path.join(sourceDir, 'later.png')), { code: 'ENOENT' });
    const result = await history();
    const safety = result.versions.find((version) => version.reason === 'pre-restore');
    assert.equal(await readFile(path.join(result.archivePath, path.dirname(safety.file), 'later.png'), 'utf8'), 'created-after-snapshot');
    assert.equal(result.versions[0].isCurrent, true);
  });
});

test('navigation links are not dependencies and restore keeps later artifacts and directories', async () => {
  await fixture(async ({ directory, sourceDir, file, html, get, post, history }) => {
    await writeFile(file, `${html}<a href="report.html">Report</a><a href="docs/">Docs</a><iframe src="embedded.html"></iframe><img src="late-dir/">`);
    await post('/artifacts/snapshot');
    const baseline = (await history()).versions[0];
    assert.equal(baseline.bundle.some((entry) => entry.path === 'report.html' || entry.path === 'docs'), false);
    assert(baseline.bundle.some((entry) => entry.path === 'embedded.html' && entry.status === 'missing'));
    assert(baseline.bundle.some((entry) => entry.path === 'late-dir' && entry.status === 'missing'));
    const report = path.join(sourceDir, 'report.html');
    const embedded = path.join(sourceDir, 'embedded.html');
    await writeFile(report, '<title>Report</title>');
    await writeFile(embedded, '<title>Embedded</title>');
    await mkdir(path.join(sourceDir, 'docs'));
    await writeFile(path.join(sourceDir, 'docs/guide.txt'), 'guide');
    await mkdir(path.join(sourceDir, 'late-dir'));
    await writeFile(path.join(sourceDir, 'late-dir/image.png'), 'late');
    await writeFile(path.join(directory, 'state/state.json'), JSON.stringify({ sessions: { demo: { file }, embedded: { file: embedded } } }));
    await get('/library');
    await post('/versions/restore', { file, versionId: baseline.id });
    assert.equal(await readFile(report, 'utf8'), '<title>Report</title>');
    assert.equal(await readFile(embedded, 'utf8'), '<title>Embedded</title>');
    assert.equal(await readFile(path.join(sourceDir, 'docs/guide.txt'), 'utf8'), 'guide');
    assert.equal(await readFile(path.join(sourceDir, 'late-dir/image.png'), 'utf8'), 'late');
    const library = await get('/library');
    assert.equal(library.artifacts.find((artifact) => artifact.file === embedded)?.exists, true);
  });
});

test('restore refuses symlinked destinations without modifying external bytes', async () => {
  await fixture(async ({ directory, sourceDir, file, api, post, history }) => {
    await post('/artifacts/snapshot');
    const baseline = (await history()).versions[0];
    const externalDir = path.join(directory, 'external');
    await mkdir(externalDir);
    await writeFile(path.join(externalDir, 'logo.png'), 'external-logo');
    await rm(path.join(sourceDir, 'assets'), { recursive: true });
    await symlink(externalDir, path.join(sourceDir, 'assets'));
    const response = await fetch(`${api}/versions/restore`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ file, versionId: baseline.id }) });
    assert.equal(response.status, 400);
    assert.match((await response.json()).error, /symlinked asset/);
    assert.equal(await readFile(path.join(externalDir, 'logo.png'), 'utf8'), 'external-logo');
    assert.equal((await history()).versions[0].isCurrent, false);
  });
});


test('archive and restore refuse a symlinked source HTML without changing its target', async () => {
  await fixture(async ({ directory, file, api, post, history }) => {
    await post('/artifacts/snapshot');
    const baseline = (await history()).versions[0];
    const externalFile = path.join(directory, 'external.html');
    await writeFile(externalFile, '<title>External HTML</title>');
    await rm(file);
    await symlink(externalFile, file);
    for (const [route, value] of [['/artifacts/snapshot', { file }], ['/versions/restore', { file, versionId: baseline.id }]]) {
      const response = await fetch(`${api}${route}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(value) });
      assert.equal(response.status, 400);
      assert.match((await response.json()).error, /symlink/);
    }
    assert.equal(await readFile(externalFile, 'utf8'), '<title>External HTML</title>');
  });
});
