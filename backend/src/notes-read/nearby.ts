// OWNER: Wendy. B-1/B-2/B-3. Contract: api.md -> GET /notes/nearby?lat=..&lng=..

import { z } from "zod";
import { withAuth } from "../shared/auth";
import { json, parseQuery } from "../shared/http";
import { toNoteSummary } from "../shared/model";
import { findNearbyByGeohash } from "./query";
import { canSee } from "./visibility";

const Query = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
});

export const handler = withAuth(async (event, user) => {
  const { lat, lng } = parseQuery(event, Query);
  const { items } = await findNearbyByGeohash(lat, lng);
  const visible = await Promise.all(items.map(async (x) => ((await canSee(x.note, user.username)) ? x : null)));
  const notes = visible.filter((x) => x !== null).map((x) => toNoteSummary(x.note, x.distanceM));
  return json(200, { notes });
});
