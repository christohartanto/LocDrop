// SHARED (Phase 0a). Usage: npm run token -- alice   → prints a login token for manual testing.

import { signToken } from "../src/shared/auth";

const username = process.argv[2];
if (!username) {
  console.error("Usage: npm run token -- <username>");
  process.exit(1);
}
console.log(signToken(username));
