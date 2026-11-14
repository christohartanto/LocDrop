// OWNER: Vincent. A-3. Contract: api.md -> GET /me
// Placeholder from Phase 0a: returns 501 until implemented.

import { withAuth } from "../shared/auth";
import { notImplemented } from "../shared/http";

export const handler = withAuth(async () => notImplemented("A-3"));
