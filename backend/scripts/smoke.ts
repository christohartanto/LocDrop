// SHARED (Phase 0a). Checks that the running local API is wired correctly. Usage: npm run smoke

import { signToken } from "../src/shared/auth";
import { routes } from "../src/local/routes";

const API_URL = process.env.API_URL ?? "http://localhost:3000";
const PUBLIC = new Set(["POST /auth/register", "POST /auth/login"]);
let failures = 0;

function report(ok: boolean, label: string, detail: string) {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}  ${detail}`);
}

async function call(method: string, path: string, token?: string, body?: unknown) {
  const res = await fetch(API_URL + path, {
    method,
    headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(body !== undefined ? { "content-type": "application/json" } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    /* not JSON */
  }
  return { status: res.status, json, text };
}

const concrete = (p: string) => p.replace("{id}", "smoke-does-not-exist");

try {
  const health = await call("GET", "/health");
  report(health.status === 200 && health.json?.ok === true, "GET /health", `→ ${health.status}`);
} catch {
  console.error(`FAIL  Cannot reach ${API_URL}. Start the API first: npm run dev:api`);
  process.exit(1);
}

const token = signToken("alice");

for (const r of routes) {
  const key = `${r.method} ${r.path}`;
  const path = concrete(r.path) + (r.path === "/notes/nearby" ? "?lat=22.69&lng=114.21" : "");
  const body = r.method === "GET" || r.method === "DELETE" ? undefined : {};

  if (!PUBLIC.has(key)) {
    const noAuth = await call(r.method, path, undefined, body);
    report(
      noAuth.status === 401 && noAuth.json?.error?.code === "UNAUTHENTICATED",
      `${key} without token`,
      `→ ${noAuth.status} ${noAuth.json?.error?.code ?? ""}`,
    );
  }

  const withAuth = await call(r.method, path, token, body);
  const okStatus = withAuth.status < 500 || withAuth.status === 501;
  const okBody = withAuth.status === 204 || withAuth.json !== null;
  report(okStatus && okBody, `${key} with token`, `→ ${withAuth.status} ${withAuth.json?.error?.code ?? ""}`);
}

const unknown = await call("GET", "/does-not-exist");
report(unknown.status === 404 && unknown.json?.error?.code === "NOT_FOUND", "GET /does-not-exist", `→ ${unknown.status}`);

console.log(failures === 0 ? "\nAll smoke checks passed." : `\n${failures} smoke check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
