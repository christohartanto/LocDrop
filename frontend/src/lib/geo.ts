// Small geo helpers for the UI (dev location presets, mock server, "moved > 20 m" checks).
// The real distance rule lives on the server; the UI never filters notes by distance.

const toRad = (d: number) => (d * Math.PI) / 180;

export function distanceM(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6_371_008.8 * Math.asin(Math.min(1, Math.sqrt(a)));
}

export function offsetMeters(lat: number, lng: number, northM: number, eastM: number) {
  return { lat: lat + northM / 111_320, lng: lng + eastM / (111_320 * Math.cos(toRad(lat))) };
}

/** Same demo center as api.md / backend seed. */
export const DEMO_CENTER = { lat: 22.69, lng: 114.21 };
