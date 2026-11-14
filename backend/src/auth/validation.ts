// OWNER: Vincent. Input rules from api.md ("Validation rules").

import { z } from "zod";

/** Username is lower-cased first, then checked. Password 8–72 chars (bcrypt only uses the first 72 bytes). */
export const AuthBody = z.object({
  username: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9_]{3,20}$/, "3–20 characters: lowercase letters, numbers or _"),
  password: z.string().min(8, "at least 8 characters").max(72, "at most 72 characters"),
});

/** Login: don't reveal the rules (any wrong input is just "wrong username or password"), only require strings. */
export const LoginBody = z.object({
  username: z.string().trim().toLowerCase().min(1).max(100),
  password: z.string().min(1).max(200),
});
