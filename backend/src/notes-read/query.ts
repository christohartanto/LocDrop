// OWNER: Wendy. B-1 + B-2. Finding notes near a location.
// findNearbyByGeohash is what the API uses. findNearbyByScan exists only for the B-8 benchmark.

import { QueryCommand, ScanCommand } from "@aws-sdk/lib-dynamodb";
import { config } from "../shared/config";
import { ddb } from "../shared/db";
import { cellsToSearch, distanceM } from "../shared/geo";
import { cellPk, GSI1 } from "../shared/keys";
import type { NoteItem } from "../shared/model";

export interface NearbyResult {
  items: { note: NoteItem; distanceM: number }[];
  /** Items DynamoDB had to read (sum of ScannedCount): the cost of the lookup. */
  examined: number;
}

function filterAndSort(lat: number, lng: number, notes: NoteItem[]): NearbyResult["items"] {
  return notes
    .filter((n) => n.status === "active")
    .map((note) => ({ note, distanceM: distanceM(lat, lng, note.lat, note.lng) }))
    .filter((x) => x.distanceM <= config.readRadiusM)
    .sort((a, b) => a.distanceM - b.distanceM);
}

async function queryCell(cell: string): Promise<{ notes: NoteItem[]; examined: number }> {
  const notes: NoteItem[] = [];
  let examined = 0;
  let startKey: Record<string, unknown> | undefined;
  do {
    const res = await ddb.send(
      new QueryCommand({
        TableName: config.tableName,
        IndexName: GSI1,
        KeyConditionExpression: "gsi1pk = :pk",
        ExpressionAttributeValues: { ":pk": cellPk(cell) },
        ExclusiveStartKey: startKey,
      }),
    );
    notes.push(...((res.Items ?? []) as NoteItem[]));
    examined += res.ScannedCount ?? 0;
    startKey = res.LastEvaluatedKey;
  } while (startKey);
  return { notes, examined };
}

/** B-1 + B-2: query the caller's geohash cell + 8 neighbours in parallel, then exact distance check. */
export async function findNearbyByGeohash(lat: number, lng: number): Promise<NearbyResult> {
  const perCell = await Promise.all(cellsToSearch(lat, lng).map(queryCell));
  const notes = perCell.flatMap((c) => c.notes);
  const examined = perCell.reduce((sum, c) => sum + c.examined, 0);
  return { items: filterAndSort(lat, lng, notes), examined };
}

/** BENCHMARK ONLY (B-8): read the whole table, then the same distance check. */
export async function findNearbyByScan(lat: number, lng: number): Promise<NearbyResult> {
  const notes: NoteItem[] = [];
  let examined = 0;
  let startKey: Record<string, unknown> | undefined;
  do {
    const res = await ddb.send(new ScanCommand({ TableName: config.tableName, ExclusiveStartKey: startKey }));
    for (const item of res.Items ?? []) {
      if (item.SK === "META" && typeof item.PK === "string" && item.PK.startsWith("NOTE#")) notes.push(item as NoteItem);
    }
    examined += res.ScannedCount ?? 0;
    startKey = res.LastEvaluatedKey;
  } while (startKey);
  return { items: filterAndSort(lat, lng, notes), examined };
}
