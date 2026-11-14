// SHARED (Phase 0a). Recreates the LocDropTest table before the test run.

export default async function setup() {
  process.env.TABLE_NAME = "LocDropTest";
  const { createTable } = await import("../scripts/lib/table");
  try {
    await createTable("LocDropTest", { reset: true });
  } catch (err) {
    throw new Error(
      `Could not create the LocDropTest table. Is DynamoDB Local running? (npm run db:up)\n${String(err)}`,
    );
  }
}
