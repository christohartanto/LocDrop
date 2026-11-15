// Fallback when the street map can't load: a game radar with you in the centre, range rings,
// and the same note pins placed by their real direction and distance. North is up.

import type { NoteSummary } from "../api/types";
import { pinClass, pinHtml, pinLabel, playerHtml } from "./Pins";

interface Props {
  lat: number;
  lng: number;
  radiusM: number;
  initial: string;
  notes: NoteSummary[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}

export function Radar({ lat, lng, radiusM, initial, notes, selectedId, onSelect }: Props) {
  const reach = radiusM * 1.12; // metres from the centre to the edge of the dial
  const place = (n: NoteSummary) => {
    const east = (n.lng - lng) * 111_320 * Math.cos((lat * Math.PI) / 180);
    const north = (n.lat - lat) * 111_320;
    return { left: `${50 + (east / reach) * 50}%`, top: `${50 - (north / reach) * 50}%` };
  };
  return (
    <div className="radar" onClick={() => onSelect(null)}>
      <div className="radar__dial" role="group" aria-label="Radar of notes around you">
        <span className="radar__sweep" aria-hidden="true" />
        {[0.25, 0.5, 0.75, 1].map((f) => (
          <span key={f} className="radar__ring" style={{ width: `${(f / 1.12) * 100}%`, height: `${(f / 1.12) * 100}%` }} aria-hidden="true">
            <i>{Math.round(radiusM * f)} m</i>
          </span>
        ))}
        <span className="radar__north" aria-hidden="true">
          N
        </span>
        <div className="player player--radar" dangerouslySetInnerHTML={{ __html: playerHtml(initial) }} />
        {notes.map((n) => (
          <button
            key={n.id}
            type="button"
            className={`${pinClass(n, n.id === selectedId)} pin--radar`}
            style={place(n)}
            aria-label={pinLabel(n)}
            onClick={(e) => {
              e.stopPropagation();
              onSelect(n.id);
            }}
            dangerouslySetInnerHTML={{ __html: pinHtml(n) }}
          />
        ))}
      </div>
      <p className="radar__note">Map unavailable right now, so here's your radar. North is up.</p>
    </div>
  );
}
