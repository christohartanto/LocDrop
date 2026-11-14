// SHARED (Phase 0a). DynamoDB client + transaction helper with retry on TransactionConflict.

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  TransactWriteCommand,
  type TransactWriteCommandInput,
} from "@aws-sdk/lib-dynamodb";
import { config } from "./config";

const client = new DynamoDBClient(
  config.dynamoEndpoint
    ? {
        endpoint: config.dynamoEndpoint,
        region: config.region,
        credentials: { accessKeyId: "local", secretAccessKey: "local" },
      }
    : { region: config.region },
);

export const ddb = DynamoDBDocumentClient.from(client, {
  marshallOptions: { removeUndefinedValues: true },
});

export type TransactItem = NonNullable<TransactWriteCommandInput["TransactItems"]>[number];

/** A transaction was cancelled for a definite reason (e.g. a condition failed). One reason code per item. */
export class TransactionFailed extends Error {
  constructor(public reasons: string[]) {
    super(`Transaction cancelled: [${reasons.join(", ")}]`);
    this.name = "TransactionFailed";
  }
}

export const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

const RETRYABLE_NAMES = new Set(["TransactionConflictException", "TransactionInProgressException"]);

function reasonsOf(err: unknown): string[] | null {
  const e = err as { name?: string; CancellationReasons?: { Code?: string }[] };
  if (e?.name !== "TransactionCanceledException") return null;
  return (e.CancellationReasons ?? []).map((r) => r?.Code ?? "None");
}

/**
 * Run a DynamoDB transaction.
 * - Any ConditionalCheckFailed → throws TransactionFailed(reasons) immediately.
 * - Only TransactionConflict (another transaction touched the same item) → retry with random backoff.
 */
export async function transactWrite(
  items: TransactItem[],
  opts: { maxAttempts?: number } = {},
): Promise<void> {
  const maxAttempts = opts.maxAttempts ?? 15;
  let lastErr: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await ddb.send(new TransactWriteCommand({ TransactItems: items }));
      return;
    } catch (err) {
      lastErr = err;
      const reasons = reasonsOf(err);
      if (reasons) {
        if (reasons.includes("ConditionalCheckFailed")) throw new TransactionFailed(reasons);
        const onlyConflicts = reasons.every((r) => r === "None" || r === "TransactionConflict");
        if (!onlyConflicts) throw new TransactionFailed(reasons);
      } else if (!RETRYABLE_NAMES.has((err as { name?: string })?.name ?? "")) {
        throw err;
      }
      await sleep((5 + Math.random() * 20) * attempt);
    }
  }
  throw lastErr;
}

/** True if the transaction failed because the condition on item `index` failed. */
export function isConditionFailedAt(err: unknown, index: number): boolean {
  return err instanceof TransactionFailed && err.reasons[index] === "ConditionalCheckFailed";
}

/** True for a single-item write (Put/Update/Delete) whose ConditionExpression failed. */
export function isConditionalCheckFailed(err: unknown): boolean {
  return (err as { name?: string })?.name === "ConditionalCheckFailedException";
}
