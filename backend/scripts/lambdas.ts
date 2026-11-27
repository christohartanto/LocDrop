// SHARED (S-3). Which handler file becomes which Lambda function in AWS.
// Must match backend/template.yaml and src/local/routes.ts (build-lambdas checks this).
// The dev-only naive route (POST /dev/naive/notes) is deliberately NOT deployed.

export interface HttpLambdaSpec {
  kind?: "http";
  name: string; // function logical id in template.yaml, and build folder name
  entry: string; // handler source file (relative to backend/)
  method: "GET" | "POST" | "DELETE";
  path: string; // API Gateway route path
}

/** WebSocket routes ($connect, ...) and the stream-triggered notify function. */
export interface OtherLambdaSpec {
  kind: "ws" | "stream";
  name: string;
  entry: string;
  route?: string; // WebSocket route key
}

export type LambdaSpec = HttpLambdaSpec | OtherLambdaSpec;
export const isHttp = (l: LambdaSpec): l is HttpLambdaSpec => l.kind === undefined || l.kind === "http";

export const lambdas: LambdaSpec[] = [
  { name: "RegisterFn", entry: "src/auth/register.ts", method: "POST", path: "/auth/register" },
  { name: "LoginFn", entry: "src/auth/login.ts", method: "POST", path: "/auth/login" },
  { name: "MeFn", entry: "src/auth/me.ts", method: "GET", path: "/me" },
  { name: "GroupsCreateFn", entry: "src/groups/create.ts", method: "POST", path: "/groups" },
  { name: "GroupsJoinFn", entry: "src/groups/join.ts", method: "POST", path: "/groups/join" },
  { name: "GroupsListFn", entry: "src/groups/list.ts", method: "GET", path: "/groups" },
  { name: "NotesCreateFn", entry: "src/notes-write/create.ts", method: "POST", path: "/notes" },
  { name: "NotesMineFn", entry: "src/notes-write/mine.ts", method: "GET", path: "/notes/mine" },
  { name: "NotesNearbyFn", entry: "src/notes-read/nearby.ts", method: "GET", path: "/notes/nearby" },
  { name: "NotesOpenFn", entry: "src/notes-read/open.ts", method: "POST", path: "/notes/{id}/open" },
  { name: "NotesRecallFn", entry: "src/notes-lifecycle/recall.ts", method: "DELETE", path: "/notes/{id}" },
  // Live pop-ups (A-9, A-10)
  { kind: "ws", name: "WsConnectFn", entry: "src/realtime/connect.ts", route: "$connect" },
  { kind: "ws", name: "WsDisconnectFn", entry: "src/realtime/disconnect.ts", route: "$disconnect" },
  { kind: "ws", name: "WsLocationFn", entry: "src/realtime/location.ts", route: "location" },
  { kind: "stream", name: "NotifyFn", entry: "src/realtime/notify.ts" },
];
