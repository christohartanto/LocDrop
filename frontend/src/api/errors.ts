// FE-10 (central error mapper): every ErrorCode from api.md → one friendly message.

import { ApiError } from "./client";

export function friendlyError(err: unknown): string {
  if (!(err instanceof ApiError)) return "Something went wrong. Please try again.";
  switch (err.code) {
    case "OUT_OF_RANGE": {
      const m = /(\d+)\s*m away/.exec(err.message);
      return m
        ? `Move a bit closer: this note is ${m[1]} m away. You need to be within 100 m.`
        : "Move a bit closer. You need to be within 100 m to read this note.";
    }
    case "NOTE_GONE":
      return "Too late! Someone else read this note first, or its author took it back.";
    case "NOTE_LIMIT_REACHED":
      return "You already have 5 notes out there. Recall one in My notes to drop a new one.";
    case "USERNAME_TAKEN":
      return "That username is taken. Try another one.";
    case "INVALID_CREDENTIALS":
      return "Wrong username or password.";
    case "NOT_FOUND":
      return "This note doesn't exist (or isn't visible to you).";
    case "NOT_GROUP_MEMBER":
      return "You're not a member of that group.";
    case "UNAUTHENTICATED":
      return "Please log in again.";
    case "VALIDATION_ERROR":
      return err.message;
    case "NOT_IMPLEMENTED":
      return "This feature isn't built on the server yet.";
    case "NETWORK_ERROR":
      return "Can't reach the LocDrop server. Is it running?";
    default:
      return "Something went wrong. Please try again.";
  }
}
