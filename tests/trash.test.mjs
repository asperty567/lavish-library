import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import path from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';
import { trashFixture } from './fixtures/trash-library.mjs';

test('bulk trash validates selection, ends confirmed reviews first, and retains tombstones', async () => {
  const f = await trashFixture({ apiPort: 45_000 + (process.pid % 1_000) });
  const request = (names, endReviews = false) => fetch(`${f.api}/api/artifacts/trash`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ids: names.map((name) => f.id(f.files[name])), endReviews }),
  });
  try {
    assert.equal((await request(['live', 'finished'])).status, 400);
    assert.equal((await f.readState()).sessions.live.status, 'open');
    assert.deepEqual(f.endedKeys, []);
    await f.access(f.files.finished);
    assert.equal((await request(['finished', 'missing'], true)).status, 200);
    await assert.rejects(f.access(f.files.finished));
    await f.access(path.join(f.trashDir, 'finished.html'));
    assert.equal((await request(['finished'])).status, 400);
    f.behavior.refuse = true;
    assert.equal((await request(['live'], true)).status, 400);
    await f.access(f.files.live);
    f.behavior.refuse = false;
    f.behavior.wrongState = true;
    assert.equal((await request(['live'], true)).status, 400);
    assert.equal((await f.readState()).sessions.live.status, 'open');
    f.behavior.wrongState = false;
    f.behavior.pretendEnded = true;
    assert.equal((await request(['live'], true)).status, 400);
    await f.access(f.files.live);
    f.behavior.pretendEnded = false;
    assert.equal((await request(['live', 'feedback'], true)).status, 200);
    const state = await f.readState();
    assert.equal(state.sessions['live-secondary'].status, 'ended');
    assert.equal(state.sessions['live-secondary'].ended_by, 'user');
    for (const name of ['live', 'feedback']) {
      assert.equal(state.sessions[name].status, 'ended');
      assert.equal(state.sessions[name].ended_by, 'user');
      await assert.rejects(f.access(f.files[name]));
      await f.access(path.join(f.trashDir, `${name}.html`));
    }
    const library = await (await fetch(`${f.api}/api/library`)).json();
    assert.deepEqual(library.artifacts, []);
    const config = JSON.parse(await readFile(path.join(f.configDir, 'config.json'), 'utf8'));
    assert.deepEqual(config.trashedArtifacts.sort(), Object.values(f.files).sort());
  } finally { await f.close(); }
});

test('confirmation renders refusal inside the same action group as its buttons', async () => {
  const require = createRequire(import.meta.url);
  const source = await readFile(path.join(process.cwd(), 'app/trash-confirmation.tsx'), 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.ESNext } }).outputText
    .replaceAll('"react/jsx-runtime"', JSON.stringify(`file://${require.resolve('react/jsx-runtime')}`))
    .replaceAll("'react'", JSON.stringify(`file://${require.resolve('react')}`));
  const { TrashConfirmation } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
  const html = renderToStaticMarkup(React.createElement(TrashConfirmation, {
    count: 1, activeCount: 1, busy: false, error: 'Fixture refusal', onConfirm() {}, onCancel() {},
  }));
  assert.match(html, /role="group"/);
  assert.match(html, /class="trash-confirm"/);
  assert.match(html, /role="alert">Fixture refusal<\/p><\/div>$/);
  assert.ok(html.indexOf('role="alert"') > html.indexOf('<button'));
});
