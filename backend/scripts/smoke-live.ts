// SHARED (A-9 / A-10). End-to-end check of live pop-ups over the real network path:
// two new users; B connects a WebSocket and sends a location; A drops a note next to B → B must get
// note_nearby; A recalls it → B must get note_gone. Also checks a bad token is refused.
// Usage:
//   local:  npm run smoke:live                                  (needs npm run dev:api)
//   AWS:    npm run smoke:live -- --aws                         (reads backend/.aws-build/outputs.json)
//   or set API_URL and WS_URL yourself.
// It recalls its note; the two test accounts it creates stay (names start with "live_").

import { readFileSync } from "node:fs";
import WebSocket from "ws";

const aws = process.argv.includes("--aws");
const outputs = aws ? JSON.parse(readFileSync(new URL("../.aws-build/outputs.json", import.meta.url), "utf8")) : {};
const API_URL: string = process.env.API_URL ?? outputs.ApiUrl ?? "http://localhost:3000";
const WS_URL: string = process.env.WS_URL ?? outputs.WsUrl ?? API_URL.replace(/^http/, "ws");
const WAIT_MS = 15_000;

let failures = 0;
const report = (ok: boolean, label: string, detail = "") => {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? `  ${detail}` : ""}`);
};

async function call(method: string, path: string, token?: string, body?: unknown) {
  const res = await fetch(API_URL + path, {
    method,
    headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(body ? { "content-type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  return { status: res.status, json: text ? JSON.parse(text) : null };
}

const suffix = Date.now().toString(36).slice(-6);
async function newUser(prefix: string) {
  const r = await call("POST", "/auth/register", undefined, { username: `live_${prefix}_${suffix}`, password: "password123" });
  if (r.status !== 201) throw new Error(`register failed: ${r.status} ${JSON.stringify(r.json)}`);
  return r.json as { token: string; username: string };
}

function open(token: string): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`${WS_URL}?token=${encodeURIComponent(token)}`);
    ws.once("open", () => resolve(ws));
    ws.once("error", reject);
    ws.once("unexpected-response", (_req, res) => reject(new Error(`refused with HTTP ${res.statusCode}`)));
  });
}

function nextMessage(ws: WebSocket, match: (m: any) => boolean): Promise<any> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      ws.off("message", onMsg);
      reject(new Error(`no matching message within ${WAIT_MS / 1000} s`));
    }, WAIT_MS);
    const onMsg = (data: WebSocket.RawData) => {
      const m = JSON.parse(data.toString());
      if (!match(m)) return;
      clearTimeout(timer);
      ws.off("message", onMsg);
      resolve(m);
    };
    ws.on("message", onMsg);
  });
}

console.log(`Live pop-up check: API ${API_URL}\n                   WS  ${WS_URL}\n`);

// a random spot far from demo data, so real users never see the test note
const spot = { lat: -50 + Math.random() * 10, lng: -150 + Math.random() * 10 };

try {
  await open("not-a-token").then(
    (ws) => {
      ws.close();
      report(false, "bad token is refused", "(connection was accepted)");
    },
    () => report(true, "bad token is refused"),
  );

  const author = await newUser("a");
  const reader = await newUser("b");
  const ws = await open(reader.token);
  report(true, "reader connects with a login token");
  ws.send(JSON.stringify({ action: "location", ...spot }));
  await new Promise((r) => setTimeout(r, 1500)); // let the location land before the note does

  const started = Date.now();
  const nearbyMsg = nextMessage(ws, (m) => m.type === "note_nearby");
  const created = await call("POST", "/notes", author.token, {
    text: "live pop-up check",
    lat: spot.lat + 0.0002, // ~22 m north
    lng: spot.lng,
    visibility: "public",
    anonymous: false,
    burnOnRead: false,
  });
  if (created.status !== 201) throw new Error(`POST /notes → ${created.status}`);
  const m = await nearbyMsg.catch((e: Error) => e);
  const ok = !(m instanceof Error) && m.note?.id === created.json.id && m.note?.text === undefined;
  report(ok, "note_nearby arrives (no text in it)", m instanceof Error ? m.message : `${Date.now() - started} ms, ${m.note?.distanceM} m away`);

  const goneStarted = Date.now();
  const goneMsg = nextMessage(ws, (x) => x.type === "note_gone" && x.id === created.json.id);
  const recalled = await call("DELETE", `/notes/${created.json.id}`, author.token);
  if (recalled.status !== 204) throw new Error(`DELETE /notes → ${recalled.status}`);
  const g = await goneMsg.catch((e: Error) => e);
  report(!(g instanceof Error), "note_gone arrives after recall", g instanceof Error ? g.message : `${Date.now() - goneStarted} ms`);

  ws.close();
} catch (err) {
  report(false, "unexpected error", String(err));
}

console.log(failures ? `\n${failures} check(s) failed.` : "\nAll live pop-up checks passed.");
process.exit(failures ? 1 : 0);
