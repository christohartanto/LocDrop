// OWNER: Vincent. A-4. Input rules for the groups endpoints (api.md "Validation rules").

import { randomInt } from "node:crypto";
import { z } from "zod";

export const GROUP_NAME_MAX = 40;
export const JOIN_CODE_LENGTH = 6;
/** No 0/O, 1/I/L or 8 (looks like B), so a code read out loud or off a screen is hard to mistype. 30^6 ≈ 729 million codes. */
export const JOIN_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ2345679";

export const CreateGroupBody = z.object({
  name: z.string().trim().min(1, "must not be empty").max(GROUP_NAME_MAX, `at most ${GROUP_NAME_MAX} characters`),
});

/** Codes are case-insensitive; spaces and dashes are ignored ("abc-234" = "ABC234"). */
export const JoinGroupBody = z.object({
  joinCode: z
    .string()
    .transform((s) => s.replace(/[\s-]/g, "").toUpperCase())
    .pipe(z.string().regex(new RegExp(`^[A-Z0-9]{${JOIN_CODE_LENGTH}}$`), `${JOIN_CODE_LENGTH} letters or numbers`)),
});

export function newJoinCode(): string {
  let code = "";
  for (let i = 0; i < JOIN_CODE_LENGTH; i++) code += JOIN_CODE_ALPHABET[randomInt(JOIN_CODE_ALPHABET.length)];
  return code;
}
