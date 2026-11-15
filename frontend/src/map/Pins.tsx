// The player marker and note pins, shared by the real map and the radar fallback.

import type { NoteSummary } from "../api/types";

export function pinLabel(n: NoteSummary): string {
  return `Note from ${n.authorName ?? "Anonymous"}, ${n.distanceM} m away${n.burnOnRead ? ", disappears after first read" : ""}`;
}

/** Inner markup of a note pin (the wrapper <button class="pin"> is created by the map or radar). */
export function pinHtml(n: NoteSummary): string {
  const kind = n.burnOnRead ? "fire" : n.authorName === null ? "anon" : "note";
  const glyph = n.burnOnRead ? "🔥" : n.authorName === null ? "?" : "✉";
  return `<span class="pin__body pin__body--${kind}"><span class="pin__glyph">${glyph}</span></span><span class="pin__shadow"></span>`;
}

export function pinClass(n: NoteSummary, selected: boolean): string {
  return `pin${selected ? " is-selected" : ""}${n.burnOnRead ? " pin--fire" : ""}`;
}

export function playerHtml(initial: string): string {
  return `<span class="player__pulse"></span><span class="player__body"><span class="player__face">${initial}</span></span>`;
}
