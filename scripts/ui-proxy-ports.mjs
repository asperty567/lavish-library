function parsePort(value, fallback) {
  const port = Number(value || fallback);
  return Number.isInteger(port) && port > 0 && port <= 65_535 ? port : fallback;
}

export function uiProxyListenPorts(env = process.env) {
  const uiPort = parsePort(env.LAVISH_TRACKER_UI_PORT, 3000);
  const ports = [uiPort];
  const origin = String(env.LAVISH_TRACKER_PUBLIC_ORIGIN || '');
  if (!origin) return ports;
  try {
    const publicPort = new URL(origin).port;
    // Serve publishes the catalog on :3000. A stale LaunchAgent UI_PORT of 3007
    // must not leave loopback :3000 empty.
    if (publicPort === '3000' && uiPort !== 3000) ports.push(3000);
  } catch {
    // Ignore malformed PUBLIC_ORIGIN and keep the configured UI port.
  }
  return ports;
}

export function uiProxyUpstreamPorts(env = process.env) {
  const uiPort = parsePort(env.LAVISH_TRACKER_UI_PORT, 3000);
  return {
    sitePort: parsePort(env.LAVISH_TRACKER_SITE_PORT, uiPort + 1000),
    apiPort: parsePort(env.LAVISH_TRACKER_API_PORT, 4318),
  };
}
