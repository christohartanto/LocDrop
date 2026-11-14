// SHARED (Phase 0a). Usage: npm run db:init   |   npm run db:reset (deletes all data first)

import { config } from "../src/shared/config";
import { createTable } from "./lib/table";

const reset = process.argv.includes("--reset");

try {
  const result = await createTable(config.tableName, { reset });
  console.log(result === "created" ? `Created table ${config.tableName}` : `Table ${config.tableName} already exists`);
} catch (err) {
  console.error(`Failed to create table at ${config.dynamoEndpoint}. Is DynamoDB Local running? (npm run db:up)`);
  console.error(err);
  process.exit(1);
}
