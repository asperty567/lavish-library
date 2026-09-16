import { spawn } from 'node:child_process';
import path from 'node:path';

const mode = process.argv[2] === 'start' ? 'start' : 'dev';
const root = process.cwd();
const bin = path.join(root, 'node_modules', '.bin', 'vinext');
const requestedUiPort = Number(process.env.LAVISH_TRACKER_UI_PORT || 3000);
const uiPort = Number.isInteger(requestedUiPort) && requestedUiPort > 0 && requestedUiPort <= 65_535
  ? requestedUiPort
  : 3000;
const requestedSitePort = Number(process.env.LAVISH_TRACKER_SITE_PORT || uiPort + 1000);
const sitePort = Number.isInteger(requestedSitePort) && requestedSitePort > 0 && requestedSitePort <= 65_535
  ? requestedSitePort
  : uiPort + 1000;
// vinext start defaults to 0.0.0.0:3000 and ignores vite.config.ts; Tailscale already owns :3000.
// The UI proxy owns uiPort so /api and files stay on the same origin as the catalog.
const childEnv = { ...process.env, LAVISH_TRACKER_UI_PORT: String(uiPort), LAVISH_TRACKER_SITE_PORT: String(sitePort) };
const api = spawn(process.execPath, [path.join(root, 'scripts', 'local-api.mjs')], { stdio: 'inherit', env: childEnv });
const site = spawn(bin, [mode, '-H', '127.0.0.1', '-p', String(sitePort)], {
  stdio: 'inherit',
  env: { ...childEnv, PORT: String(sitePort) },
});
const proxy = spawn(process.execPath, [path.join(root, 'scripts', 'ui-proxy.mjs')], { stdio: 'inherit', env: childEnv });
let closing = false;

function close(code = 0) {
  if (closing) return;
  closing = true;
  api.kill('SIGTERM');
  site.kill('SIGTERM');
  proxy.kill('SIGTERM');
  setTimeout(() => process.exit(code), 100).unref();
}

for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => close());
api.on('exit', (code) => { if (!closing) close(code || 1); });
site.on('exit', (code) => { if (!closing) close(code || 0); });
proxy.on('exit', (code) => { if (!closing) close(code || 1); });
