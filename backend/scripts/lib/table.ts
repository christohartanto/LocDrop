// SHARED (Phase 0a). Table definition (see docs/data-model.md).

import {
  CreateTableCommand,
  DeleteTableCommand,
  DescribeTableCommand,
  waitUntilTableExists,
  waitUntilTableNotExists,
} from "@aws-sdk/client-dynamodb";
import { ddb } from "../../src/shared/db";
import { GSI1, GSI2 } from "../../src/shared/keys";

async function exists(name: string): Promise<boolean> {
  try {
    await ddb.send(new DescribeTableCommand({ TableName: name }));
    return true;
  } catch (err) {
    if ((err as { name?: string }).name === "ResourceNotFoundException") return false;
    throw err;
  }
}

export async function createTable(name: string, opts: { reset?: boolean } = {}): Promise<"created" | "exists"> {
  if (await exists(name)) {
    if (!opts.reset) return "exists";
    await ddb.send(new DeleteTableCommand({ TableName: name }));
    await waitUntilTableNotExists({ client: ddb, maxWaitTime: 60 }, { TableName: name });
  }

  const S = "S" as const;
  await ddb.send(
    new CreateTableCommand({
      TableName: name,
      BillingMode: "PAY_PER_REQUEST",
      AttributeDefinitions: [
        { AttributeName: "PK", AttributeType: S },
        { AttributeName: "SK", AttributeType: S },
        { AttributeName: "gsi1pk", AttributeType: S },
        { AttributeName: "gsi1sk", AttributeType: S },
        { AttributeName: "gsi2pk", AttributeType: S },
        { AttributeName: "gsi2sk", AttributeType: S },
      ],
      KeySchema: [
        { AttributeName: "PK", KeyType: "HASH" },
        { AttributeName: "SK", KeyType: "RANGE" },
      ],
      GlobalSecondaryIndexes: [
        {
          IndexName: GSI1,
          KeySchema: [
            { AttributeName: "gsi1pk", KeyType: "HASH" },
            { AttributeName: "gsi1sk", KeyType: "RANGE" },
          ],
          Projection: { ProjectionType: "ALL" },
        },
        {
          IndexName: GSI2,
          KeySchema: [
            { AttributeName: "gsi2pk", KeyType: "HASH" },
            { AttributeName: "gsi2sk", KeyType: "RANGE" },
          ],
          Projection: { ProjectionType: "ALL" },
        },
      ],
      StreamSpecification: { StreamEnabled: true, StreamViewType: "NEW_AND_OLD_IMAGES" },
    }),
  );
  await waitUntilTableExists({ client: ddb, maxWaitTime: 60 }, { TableName: name });
  return "created";
}
