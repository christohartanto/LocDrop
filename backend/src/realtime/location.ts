// OWNER: Vincent. A-9. WebSocket "location" route: { "action": "location", "lat": ..., "lng": ... }
// Saves where the phone is, so notify knows which connections are near a new note.
// Invalid messages are ignored (400); there's no reply on success.

import { z } from "zod";
import { updateLocation } from "./connections";
import type { WsHandler } from "./ws-events";

const LocationMessage = z.object({
  action: z.literal("location"),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

export const handler: WsHandler = async (event) => {
  let raw: unknown;
  try {
    const text = event.isBase64Encoded && event.body ? Buffer.from(event.body, "base64").toString() : event.body;
    raw = JSON.parse(text ?? "");
  } catch {
    return { statusCode: 400, body: "Body must be valid JSON" };
  }
  const msg = LocationMessage.safeParse(raw);
  if (!msg.success) return { statusCode: 400, body: "Expected { action: 'location', lat, lng }" };

  const known = await updateLocation(event.requestContext.connectionId, msg.data.lat, msg.data.lng);
  return known ? { statusCode: 200 } : { statusCode: 410, body: "Connection unknown; reconnect" };
};
