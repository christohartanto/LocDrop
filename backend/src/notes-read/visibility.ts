// OWNER: Wendy. B-3. Who may see a note (api.md: public, OR written by the caller, OR group member).

import { isMember } from "../groups/membership";
import type { NoteItem } from "../shared/model";

export async function canSee(note: NoteItem, username: string): Promise<boolean> {
  if (note.visibility === "public") return true;
  if (note.authorUsername === username) return true;
  if (note.visibility === "group" && note.groupId) return isMember(username, note.groupId);
  return false;
}
