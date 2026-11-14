// OWNER: Vincent. A-8. Contract: api.md -> POST /dev/naive/notes (dev only, benchmark)
// Placeholder from Phase 0a: returns 501 until implemented.

import { withAuth } from "../shared/auth";
import { notImplemented } from "../shared/http";

export const handler = withAuth(async () => notImplemented("A-8"));
