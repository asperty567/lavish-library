import { spawn, execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { once } from 'node:events';
import { access, chmod, mkdtemp, mkdir, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

export async function trashFixture({ installedReviews = false, uiPort = 46300, apiPort = 46318 } = {}) {
  const root = process.cwd();
  const fixture = await realpath(await mkdtemp(path.join(os.tmpdir(), 'lavish-trash-')));
  const project = path.join(fixture, 'Fixture Library');
  const lavishDir = path.join(project, '.lavish');
  const stateDir = path.join(fixture, 'state');
  const configDir = path.join(fixture, 'config');
  const trashDir = path.join(fixture, 'trash');
  await Promise.all([lavishDir, stateDir, configDir, trashDir].map((dir) => mkdir(dir, { recursive: true })));
  const files = Object.fromEntries(['live', 'feedback', 'finished', 'missing'].map((name) => [name, path.join(lavishDir, `${name}.html`)]));
  for (const name of ['live', 'feedback', 'finished']) await writeFile(files[name], `<!doctype html><title>Fixture ${name}</title><p>Synthetic review only</p>`);
  const stateFile = path.join(stateDir, 'state.json');
  const state = { sessions: Object.fromEntries(Object.entries(files).map(([name, file]) => [name, {
    file, status: name === 'finished' ? 'ended' : name === 'feedback' ? 'feedback' : 'open',
    updated_at: '2026-09-14T00:00:00.000Z', chat: [],
  }])) };
  state.sessions['live-secondary'] = { file: files.live, status: 'feedback', chat: [] };
  await writeFile(stateFile, JSON.stringify(state));
  await writeFile(path.join(configDir, 'config.json'), JSON.stringify({ projects: [{ path: project, name: 'Fixture Library' }] }));
  const fakeTrash = path.join(fixture, 'trash-file');
  // Assert the ordering in the actual file mover, not just the HTTP response.
  await writeFile(fakeTrash, `#!/usr/bin/env node\nimport {readFileSync,renameSync} from 'node:fs';\nimport path from 'node:path';\nconst file=process.argv[2];\nconst state=JSON.parse(readFileSync(process.env.TEST_STATE_FILE,'utf8'));\nif(Object.values(state.sessions).some(s=>s.file===file && ['open','feedback'].includes(s.status))) process.exit(9);\nrenameSync(file,path.join(process.env.TEST_TRASH_DIR,path.basename(file)));\n`);
  await chmod(fakeTrash, 0o755);
  const behavior = { refuse: false, wrongState: false, pretendEnded: false };
  const endedKeys = [];
  const review = createServer(async (req, res) => {
    res.setHeader('content-type', 'application/json');
    if (req.url === '/health') return res.end(JSON.stringify({ app: 'lavish-axi', state_dir: behavior.wrongState ? fixture : stateDir }));
    const key = req.url?.match(/^\/api\/([^/]+)\/end$/)?.[1];
    if (!key || req.method !== 'POST' || behavior.refuse) {
      res.statusCode = 409;
      return res.end(JSON.stringify({ error: 'Fixture refusal' }));
    }
    const current = JSON.parse(await readFile(stateFile, 'utf8'));
    if (!behavior.pretendEnded) {
      current.sessions[key].status = 'ended';
      current.sessions[key].ended_by = 'user';
      await writeFile(stateFile, JSON.stringify(current));
    }
    endedKeys.push(key);
    res.end(JSON.stringify({ status: 'ended' }));
  });
  review.listen(0, '127.0.0.1');
  await once(review, 'listening');
  const reviewPort = review.address().port;
  // Reserve a port for the installed daemon without ever using its live default.
  if (installedReviews) await new Promise((resolve) => review.close(resolve));
  const env = { ...process.env, LAVISH_TRACKER_API_PORT: String(apiPort), LAVISH_TRACKER_UI_PORT: String(uiPort),
    LAVISH_TRACKER_PUBLIC_ORIGIN: '', LAVISH_TRACKER_PUBLIC_HOST: '',
    LAVISH_TRACKER_CONFIG_DIR: configDir, LAVISH_AXI_STATE_DIR: stateDir, LAVISH_TRACKER_DROP_DIR: '',
    LAVISH_TRACKER_TRASH_BIN: fakeTrash, TEST_TRASH_DIR: trashDir, TEST_STATE_FILE: stateFile,
    LAVISH_AXI_PORT: String(reviewPort), LAVISH_AXI_HOST: '127.0.0.1', LAVISH_AXI_LINK_HOST: '127.0.0.1',
    LAVISH_AXI_ALLOWED_HOSTS: '127.0.0.1 localhost', LAVISH_AXI_TELEMETRY: '0', LAVISH_AXI_NO_OPEN: '1' };
  if (installedReviews) {
    await writeFile(stateFile, '{"sessions":{}}');
    for (const name of ['live', 'feedback']) {
      await promisify(execFile)('/opt/homebrew/bin/lavish-axi', [files[name], '--no-open'], { env, timeout: 20_000 });
    }
  }
  const service = spawn(process.execPath, [path.join(root, 'scripts/local-api.mjs')], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'], env });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Fixture API startup timed out')), 10_000);
    let output = '';
    service.stdout.on('data', (chunk) => {
      output += chunk;
      if (output.includes('Lavish Tracker library service:')) { clearTimeout(timer); resolve(); }
    });
    service.once('error', reject);
    service.once('exit', (code) => { clearTimeout(timer); reject(new Error(`Fixture API exited ${code}`)); });
  });
  return {
    fixture, files, stateFile, configDir, trashDir, behavior, endedKeys, env,
    api: `http://127.0.0.1:${apiPort}`, reviewOrigin: `http://127.0.0.1:${reviewPort}`,
    id: (file) => createHash('sha1').update(file).digest('hex').slice(0, 12),
    readState: async () => JSON.parse(await readFile(stateFile, 'utf8')),
    async close() {
      const exited = once(service, 'exit');
      service.kill('SIGTERM');
      await exited;
      if (installedReviews) {
        await fetch(`http://127.0.0.1:${reviewPort}/shutdown`, { method: 'POST', signal: AbortSignal.timeout(3_000) }).catch(() => {});
      } else await new Promise((resolve) => review.close(resolve));
      await rm(fixture, { recursive: true, force: true });
    },
    access,
  };
}
