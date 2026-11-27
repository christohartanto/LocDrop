// OWNER: Vincent. A-9 / A-10. Saving WebSocket connections and finding the ones near a note.

import { DeleteCommand, PutCommand, QueryCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { config } from "../shared/config";
import { ddb, isConditionalCheckFailed } from "../shared/db";
import { cellsToSearch, encode } from "../shared/geo";
import { connCellPk, connKey, GSI1 } from "../shared/keys";
import type { ConnectionItem } from "../shared/model";

const expiry = () => Math.floor(Date.now() / 1000) + config.connectionTtlS;

export async function saveConnection(connectionId: string, username: string): Promise<void> {
  const item: ConnectionItem = {
    ...connKey(connectionId),
    SK: "META",
    connectionId,
    username,
    connectedAt: new Date().toISOString(),
    expiresAt: expiry(),
  };
  await ddb.send(new PutCommand({ TableName: config.tableName, Item: item }));
}

/** Returns false if the connection is unknown (already disconnected or expired). */
export async function updateLocation(connectionId: string, lat: number, lng: number): Promise<boolean> {
  const geohash = encode(lat, lng);
  try {
    await ddb.send(
      new UpdateCommand({
        TableName: config.tableName,
        Key: connKey(connectionId),
        UpdateExpression: "SET lat = :lat, lng = :lng, geohash = :gh, gsi1pk = :pk, gsi1sk = :sk, expiresAt = :exp",
        ConditionExpression: "attribute_exists(PK)",
        ExpressionAttributeValues: {
          ":lat": lat,
          ":lng": lng,
          ":gh": geohash,
          ":pk": connCellPk(geohash),
          ":sk": connectionId,
          ":exp": expiry(),
        },
      }),
    );
    return true;
  } catch (err) {
    if (isConditionalCheckFailed(err)) return false;
    throw err;
  }
}

export async function deleteConnection(connectionId: string): Promise<void> {
  await ddb.send(new DeleteCommand({ TableName: config.tableName, Key: connKey(connectionId) }));
}

/** Live connections whose last location is in the note's cell or one of its 8 neighbours. */
export async function connectionsNear(lat: number, lng: number): Promise<ConnectionItem[]> {
  const now = Math.floor(Date.now() / 1000);
  const perCell = await Promise.all(
    cellsToSearch(lat, lng).map(async (cell) => {
      const items: ConnectionItem[] = [];
      let startKey: Record<string, unknown> | undefined;
      do {
        const res = await ddb.send(
          new QueryCommand({
            TableName: config.tableName,
            IndexName: GSI1,
            KeyConditionExpression: "gsi1pk = :pk",
            ExpressionAttributeValues: { ":pk": connCellPk(cell) },
            ExclusiveStartKey: startKey,
          }),
        );
        items.push(...((res.Items ?? []) as ConnectionItem[]));
        startKey = res.LastEvaluatedKey;
      } while (startKey);
      return items;
    }),
  );
  // TTL deletes expired items only eventually, so skip them here too.
  return perCell.flat().filter((c) => c.expiresAt > now && c.lat !== undefined && c.lng !== undefined);
}
