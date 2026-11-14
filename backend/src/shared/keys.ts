// SHARED (Phase 0a). Key builders for the single LocDrop table. See docs/data-model.md.

export const GSI1 = "GSI1"; // geo: gsi1pk = CELL#<geohash7>, gsi1sk = <createdAt>#<id> (active notes only)
export const GSI2 = "GSI2"; // author: gsi2pk = AUTHOR#<username>, gsi2sk = <createdAt>

export const userKey = (username: string) => ({ PK: `USER#${username}`, SK: "PROFILE" });
export const noteKey = (id: string) => ({ PK: `NOTE#${id}`, SK: "META" });
export const cellPk = (geohash: string) => `CELL#${geohash}`;
export const authorPk = (username: string) => `AUTHOR#${username}`;

export function noteIndexAttrs(n: { id: string; geohash: string; authorUsername: string; createdAt: string }) {
  return {
    gsi1pk: cellPk(n.geohash),
    gsi1sk: `${n.createdAt}#${n.id}`,
    gsi2pk: authorPk(n.authorUsername),
    gsi2sk: n.createdAt,
  };
}
