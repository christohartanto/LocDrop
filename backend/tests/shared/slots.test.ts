// Needs DynamoDB Local. Proves conditional writes + transaction retry behave correctly under concurrency.

import { describe, expect, it } from "vitest";
import { createUser, getUser, uniqueName } from "../../bench/lib/fixtures";
import { config } from "../../src/shared/config";
import { isConditionFailedAt, transactWrite, TransactionFailed } from "../../src/shared/db";
import { releaseSlot, reserveSlot } from "../../src/slots";

describe("slots", () => {
  it(`30 simultaneous reserveSlot calls → exactly N (${config.maxActiveNotes}) succeed`, async () => {
    const { username } = await createUser(uniqueName("slot"));
    const results = await Promise.allSettled(Array.from({ length: 30 }, () => transactWrite([reserveSlot(username)])));

    const ok = results.filter((r) => r.status === "fulfilled").length;
    const rejected = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");
    const unexpected = rejected.filter((r) => !isConditionFailedAt(r.reason, 0));
    if (unexpected.length) console.error("Unexpected errors:", unexpected.map((r) => r.reason));

    expect(ok).toBe(config.maxActiveNotes);
    expect(unexpected).toHaveLength(0);
    expect((await getUser(username))?.activeNoteCount).toBe(config.maxActiveNotes);
  });

  it("releaseSlot with count 0 fails with ConditionalCheckFailed", async () => {
    const { username } = await createUser(uniqueName("slot"));
    const err = await transactWrite([releaseSlot(username)]).catch((e) => e);
    expect(err).toBeInstanceOf(TransactionFailed);
    expect(isConditionFailedAt(err, 0)).toBe(true);
    expect((await getUser(username))?.activeNoteCount).toBe(0);
  });

  it("reserve then release returns the count to 0", async () => {
    const { username } = await createUser(uniqueName("slot"));
    await transactWrite([reserveSlot(username)]);
    await transactWrite([releaseSlot(username)]);
    expect((await getUser(username))?.activeNoteCount).toBe(0);
  });
});
