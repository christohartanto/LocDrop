// SHARED (Phase 0a). Timed HTTP calls to the local API.

export const API_URL = process.env.API_URL ?? "http://localhost:3000";

export async function request(
  method: string,
  path: string,
  opts: { token?: string; body?: unknown } = {},
): Promise<{ status: number; body: any; ms: number }> {
  const started = performance.now();
  const res = await fetch(API_URL + path, {
    method,
    headers: {
      ...(opts.token ? { authorization: `Bearer ${opts.token}` } : {}),
      ...(opts.body !== undefined ? { "content-type": "application/json" } : {}),
    },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  const text = await res.text();
  const ms = performance.now() - started;
  let body: any = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return { status: res.status, body, ms };
}

export async function ensureServer(): Promise<void> {
  try {
    const res = await fetch(`${API_URL}/health`);
    if (res.ok) return;
  } catch {
    /* fall through */
  }
  console.error(`Cannot reach the API at ${API_URL}. Start it first: npm run dev:api:quiet`);
  process.exit(1);
}
