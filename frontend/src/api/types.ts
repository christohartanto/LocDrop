// Copied exactly from api.md (same as backend/src/shared/api-types.ts). Change api.md first (all three approve).
export type Visibility = "public" | "group";
export type NoteStatus = "active" | "consumed" | "recalled";

export interface AuthRequest { username: string; password: string }
export interface AuthResponse { token: string; username: string }

export interface Me { username: string; activeNoteCount: number; maxActiveNotes: number }

export interface CreateNoteRequest {
  text: string;
  lat: number;
  lng: number;
  visibility: Visibility;
  groupId?: string;          // required when visibility = "group"
  anonymous: boolean;
  burnOnRead: boolean;       // "delete after first read"
}

export interface MyNote {
  id: string;
  text: string;
  lat: number;
  lng: number;
  visibility: Visibility;
  groupId?: string;
  anonymous: boolean;
  burnOnRead: boolean;
  status: NoteStatus;
  createdAt: string;         // ISO 8601
  consumedAt?: string;
  recalledAt?: string;
}

export interface NoteSummary {
  id: string;
  distanceM: number;         // integer metres from the caller
  lat: number;               // where the note is (only notes in range are ever returned)
  lng: number;
  authorName: string | null; // null = anonymous
  visibility: Visibility;
  groupName?: string;        // unused until groups are built
  burnOnRead: boolean;
  createdAt: string;
}

export interface NoteDetail extends NoteSummary {
  text: string;
  consumedByThisRead: boolean; // true = this read triggered "delete after first read"
}

export type ErrorCode =
  | "VALIDATION_ERROR"     // 400
  | "UNAUTHENTICATED"      // 401
  | "INVALID_CREDENTIALS"  // 401
  | "NOT_GROUP_MEMBER"     // 403
  | "OUT_OF_RANGE"         // 403
  | "NOT_FOUND"            // 404
  | "USERNAME_TAKEN"       // 409
  | "NOTE_LIMIT_REACHED"   // 409
  | "NOTE_GONE"            // 410
  | "INTERNAL"             // 500
  | "NOT_IMPLEMENTED";     // 501 (placeholder endpoints only)

export interface ErrorBody { error: { code: ErrorCode; message: string } }
