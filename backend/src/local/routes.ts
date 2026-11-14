// SHARED (Phase 0a). Route table: API Gateway route → handler file. Same mapping goes into template.yaml later.

import type { Handler } from "../shared/http";

export interface Route {
  method: "GET" | "POST" | "DELETE";
  path: string; // API Gateway style, e.g. /notes/{id}/open
  devOnly?: boolean;
  load: () => Promise<{ handler: Handler }>;
}

export const routes: Route[] = [
  { method: "POST", path: "/auth/register", load: () => import("../auth/register") },
  { method: "POST", path: "/auth/login", load: () => import("../auth/login") },
  { method: "GET", path: "/me", load: () => import("../auth/me") },
  { method: "POST", path: "/groups", load: () => import("../groups/create") },
  { method: "POST", path: "/groups/join", load: () => import("../groups/join") },
  { method: "GET", path: "/groups", load: () => import("../groups/list") },
  { method: "POST", path: "/notes", load: () => import("../notes-write/create") },
  { method: "GET", path: "/notes/mine", load: () => import("../notes-write/mine") },
  { method: "GET", path: "/notes/nearby", load: () => import("../notes-read/nearby") },
  { method: "POST", path: "/notes/{id}/open", load: () => import("../notes-read/open") },
  { method: "DELETE", path: "/notes/{id}", load: () => import("../notes-lifecycle/recall") },
  { method: "POST", path: "/dev/naive/notes", devOnly: true, load: () => import("../notes-write/create-naive") },
];
