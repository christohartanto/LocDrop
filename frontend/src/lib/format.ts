export function timeAgo(iso: string): string {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.floor(h / 24);
  return `${d} d ago`;
}

export const formatDistance = (m: number) => (m < 1 ? "here" : `${Math.round(m)} m`);
/** "right here" / "30 m away" (formatDistance + "away" read as "here away" at 0 m). */
export const formatAway = (m: number) => (m < 1 ? "right here" : `${Math.round(m)} m away`);
