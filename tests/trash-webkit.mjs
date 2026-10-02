// Explicit fixture-only browser run; not part of the fast node:test suite.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { trashFixture } from './fixtures/trash-library.mjs';

const { webkit } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const evidence = process.env.LAVISH_TRASH_EVIDENCE || '/Users/admin/.omo/evidence/lavish-trash/webkit';
await mkdir(evidence, { recursive: true });
const results = [];
for (const width of [1920, 390]) {
  const f = await trashFixture({ installedReviews: true });
  const proxy = spawn(process.execPath, ['scripts/ui-proxy.mjs'], {
    stdio: ['ignore', 'pipe', 'pipe'], env: { ...f.env, LAVISH_TRACKER_SITE_PORT: '46301' },
  });
  let browser;
  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Proxy startup timed out')), 10_000);
      proxy.stdout.on('data', (chunk) => { if (String(chunk).includes('UI proxy:')) { clearTimeout(timer); resolve(); } });
      proxy.once('error', reject);
      proxy.once('exit', (code) => { clearTimeout(timer); reject(new Error(`Proxy exited ${code}`)); });
    });
    browser = await webkit.launch({ headless: true });
    const context = await browser.newContext({
      viewport: { width, height: width === 390 ? 844 : 1080 },
      recordVideo: { dir: evidence, size: { width, height: width === 390 ? 844 : 1080 } },
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    const audit = async (state) => {
      const overflow = await page.evaluate(() => {
        const issues = [];
        for (const el of document.querySelectorAll('body *')) {
          const rect = el.getBoundingClientRect();
          const style = getComputedStyle(el);
          if (!rect.width || !rect.height || style.display === 'none' || style.visibility === 'hidden') continue;
          if (rect.left < -1 || rect.right > innerWidth + 1) issues.push({ tag: el.tagName, class: el.className, kind: 'viewport', left: rect.left, right: rect.right });
          if (el.clientWidth && el.scrollWidth > el.clientWidth + 1 && style.overflowX === 'visible') issues.push({ tag: el.tagName, class: el.className, kind: 'content', width: el.clientWidth, scroll: el.scrollWidth });
        }
        return { document: document.documentElement.scrollWidth > innerWidth, issues };
      });
      results.push({ width, state, overflow });
      assert.equal(overflow.document, false);
      assert.deepEqual(overflow.issues, []);
      await page.screenshot({ path: path.join(evidence, `${width}-${state}.png`), fullPage: true });
    };
    await page.goto('http://127.0.0.1:46300');
    const live = page.locator('.artifact-card').filter({ has: page.getByRole('heading', { name: 'Fixture live', exact: true }) });
    await live.waitFor();
    await audit('library');
    await live.getByRole('button', { name: 'Move Fixture live to Trash', exact: true }).click();
    await live.getByRole('group', { name: 'Confirm move to Trash' }).waitFor();
    await audit('confirmation');
    assert.equal((await f.readState()).sessions[Object.keys((await f.readState()).sessions)[0]].status, 'open');
    await live.getByRole('button', { name: 'Cancel', exact: true }).click();
    assert.equal(await live.getByRole('group').count(), 0);
    await f.access(f.files.live);
    // A server refusal must remain within this card, beside the pressed control.
    await page.route('**/api/artifacts/trash', (route) => route.fulfill({
      status: 409, contentType: 'application/json', body: JSON.stringify({ error: 'Fixture refusal: review could not be ended. No files were moved.' }),
    }));
    await live.getByRole('button', { name: 'Move Fixture live to Trash', exact: true }).click();
    await live.getByRole('button', { name: 'End review and move to Trash', exact: true }).click();
    await live.getByRole('alert').waitFor();
    assert.equal(await page.locator('.notice').count(), 0);
    assert.equal(await live.getByRole('group').getByRole('alert').count(), 1);
    await audit('refusal');
    await live.getByRole('button', { name: 'Cancel', exact: true }).click();
    await page.unroute('**/api/artifacts/trash');
    await live.getByRole('button', { name: 'Move Fixture live to Trash', exact: true }).click();
    await live.getByRole('button', { name: 'End review and move to Trash', exact: true }).click();
    await live.waitFor({ state: 'detached' });
    const ended = Object.values((await f.readState()).sessions).find((session) => session.file === f.files.live);
    assert.equal(ended.status, 'ended');
    assert.equal(ended.ended_by, 'user');
    await assert.rejects(f.access(f.files.live));
    await f.access(path.join(f.trashDir, 'live.html'));
    await audit('done');
    await page.getByRole('checkbox', { name: 'Select Fixture feedback', exact: true }).check();
    await page.getByRole('checkbox', { name: 'Select Fixture finished', exact: true }).check();
    await page.getByRole('button', { name: 'Move to Trash', exact: true }).click();
    const bulk = page.getByRole('group', { name: 'Confirm move to Trash' });
    await bulk.waitFor();
    assert.match(await bulk.innerText(), /1 of 2/);
    await audit('bulk-confirmation');
    await bulk.getByRole('button', { name: 'End review and move to Trash', exact: true }).click();
    await page.getByRole('heading', { name: 'Fixture feedback', exact: true }).waitFor({ state: 'detached' });
    await audit('bulk-done');
    assert.deepEqual(errors, []);
    const video = page.video();
    await context.close();
    await video.saveAs(path.join(evidence, `${width}-click-through.webm`));
    await browser.close();
    browser = null;
    console.log(`PASS WebKit ${width}: cancel, local refusal, end-before-trash, bulk; overflow clean`);
  } finally {
    await browser?.close();
    const exited = once(proxy, 'exit');
    proxy.kill('SIGTERM');
    await exited;
    await f.close();
  }
}
await writeFile(path.join(evidence, 'results.json'), JSON.stringify(results, null, 2));
