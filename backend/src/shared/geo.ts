// SHARED (Phase 0a). Geohash + distance helpers.

import ngeohash from "ngeohash";
import { config } from "./config";

const EARTH_RADIUS_M = 6_371_008.8;
const toRad = (deg: number) => (deg * Math.PI) / 180;

export function encode(lat: number, lng: number, precision = config.geohashPrecision): string {
  return ngeohash.encode(lat, lng, precision);
}

/** The caller's own cell plus its 8 neighbours (9 unique cells). */
export function cellsToSearch(lat: number, lng: number): string[] {
  const own = encode(lat, lng);
  return [...new Set([own, ...ngeohash.neighbors(own)])];
}

export function cellBounds(geohash: string): { minLat: number; minLng: number; maxLat: number; maxLng: number } {
  const [minLat, minLng, maxLat, maxLng] = ngeohash.decode_bbox(geohash);
  return { minLat, minLng, maxLat, maxLng };
}

/** Haversine distance in metres. */
export function distanceM(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(a)));
}

export function isValidLatLng(lat: number, lng: number): boolean {
  return Number.isFinite(lat) && Number.isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
}

/** Move a point by metres north/east (small distances only). */
export function offsetMeters(lat: number, lng: number, northM: number, eastM: number): { lat: number; lng: number } {
  const dLat = northM / 111_320;
  const dLng = eastM / (111_320 * Math.cos(toRad(lat)));
  return { lat: lat + dLat, lng: lng + dLng };
}
