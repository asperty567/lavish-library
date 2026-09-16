import assert from 'node:assert/strict';
import { test } from 'node:test';
import { uiProxyListenPorts, uiProxyUpstreamPorts } from '../scripts/ui-proxy-ports.mjs';

test('listens on :3000 by default', () => {
  assert.deepEqual(uiProxyListenPorts({}), [3000]);
  assert.deepEqual(uiProxyUpstreamPorts({}), { sitePort: 4000, apiPort: 4318 });
});

test('adds loopback :3000 when a stale UI_PORT is 3007 and PUBLIC_ORIGIN is the catalog', () => {
  const env = {
    LAVISH_TRACKER_UI_PORT: '3007',
    LAVISH_TRACKER_PUBLIC_ORIGIN: 'https://mac-studio.tail1c136e.ts.net:3000',
  };
  assert.deepEqual(uiProxyListenPorts(env), [3007, 3000]);
  assert.deepEqual(uiProxyUpstreamPorts(env), { sitePort: 4007, apiPort: 4318 });
});

test('does not steal :3000 when PUBLIC_ORIGIN is unset', () => {
  assert.deepEqual(uiProxyListenPorts({ LAVISH_TRACKER_UI_PORT: '3007' }), [3007]);
});

test('does not bind :443 when PUBLIC_ORIGIN has no explicit port', () => {
  assert.deepEqual(
    uiProxyListenPorts({
      LAVISH_TRACKER_UI_PORT: '3007',
      LAVISH_TRACKER_PUBLIC_ORIGIN: 'https://mac-studio.tail1c136e.ts.net',
    }),
    [3007],
  );
});
