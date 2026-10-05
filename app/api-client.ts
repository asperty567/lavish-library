// local-api.mjs returns a string error on failed JSON requests.
export type ApiError = { readonly error?: string };

function apiOrigin() {
  if (typeof window === 'undefined') return 'http://127.0.0.1:4318';
  const { hostname, origin, port, protocol } = window.location;
  if (origin) return origin;
  const hostPort = port ? `:${port}` : '';
  if (hostname === '127.0.0.1' || hostname === 'localhost' || hostname === '::1') return `http://${hostname}${hostPort || ':3000'}`;
  return `${protocol}//${hostname}${hostPort}`;
}

let tokenPromise: Promise<string> | null = null;

async function sessionToken() {
  if (!tokenPromise) {
    tokenPromise = fetch(`${apiOrigin()}/api/session`, { cache: 'no-store' })
      .then(async (response) => {
        const result = await response.json<ApiError & { readonly token?: string }>();
        if (!response.ok || typeof result.token !== 'string') throw new Error(result.error || 'Could not authorize the local library service.');
        return result.token;
      })
      .catch((error) => {
        tokenPromise = null;
        throw error;
      });
  }
  return tokenPromise;
}

async function request(path: string, init: RequestInit, retry: boolean): Promise<Response> {
  const token = await sessionToken();
  const headers = new Headers(init.headers);
  headers.set('x-lavish-token', token);
  const response = await fetch(`${apiOrigin()}/api${path}`, { ...init, headers });
  if (response.status === 401 && retry) {
    tokenPromise = null;
    return request(path, init, false);
  }
  return response;
}

export function apiFetch(path: string, init: RequestInit = {}) {
  return request(path, init, true);
}
