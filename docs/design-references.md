# Design references for the frontend (for Eugene)

Pulled from Gummble (real screens from shipped iOS apps). **Borrow the layout and patterns, not the look.** Keep LocDrop's own colours and style, and don't copy images or assets into the repo. Links open in Gummble; you may need to be logged in.

## FE-3: Nearby screen ⭐ best match

**Swarm: "Explore" nearby list:** https://gummble.com/screens/sc_5a9edb03e12945bc98b45fab0e962e7a

What to borrow:
- Simple rows: a **pin icon** on the left, **title** in bold, then a grey line underneath with **"100 m • New York"**.
- A section header ("Nearby") above the list.
- Plenty of white space; no cards or borders needed.

LocDrop version:
- Row title: author name, or "Anonymous" in italics.
- Grey line: `30 m · 5 min ago`.
- 🔥 badge on the right for "disappears after first read".
- Don't show the note text in the list (the API doesn't send it). Use a teaser like "Tap to read" instead.

## FE-3: Empty state (no notes nearby)

**Family: "There's nothing here, yet":** https://gummble.com/screens/sc_0b878ee876da4e09b00542a0a068f7d2

What to borrow: a short bold title, one grey sentence explaining what to do, one soft button, all centred.

LocDrop version:
> **No notes here, yet**
> Be the first to leave one at this spot.
> [ Write a note ]

## FE-4: Opening a note ⭐ good match

**NGL: anonymous message card:** https://gummble.com/screens/sc_227188de6057469586568aec97246718

What to borrow:
- The message shown as **one big centred card**: a coloured header strip with large bold text below it.
- Two big full-width buttons at the bottom.
- It makes reading a message feel like an event, which suits "you found a note".

LocDrop version:
- Card header: `alice · 30 m away` or `Anonymous · 30 m away`.
- Card body: the note text, large.
- If `consumedByThisRead`: a line under the card, e.g. "🔥 You were the first reader. This note is now gone for everyone else."
- Button: "Back to nearby".

## FE-1: Register / login

**Greenlight: create username + password:** https://gummble.com/screens/sc_5cdd0a02e34741b4972ce41c72de6cfc

What to borrow:
- An icon at the top, a big title, one sentence of explanation.
- Two large rounded input fields, each with a **rule written underneath** (e.g. "Minimum 6 characters. Letters and numbers only.").
- A show/hide-password eye icon.
- One full-width button pinned to the bottom.

LocDrop version, using the rules from `api.md`:
- Under username: "3–20 characters: lowercase letters, numbers or _".
- Under password: "At least 8 characters".
- No email field.

## FE-2: Location permission denied

**Life360: "Device permissions" card:** https://gummble.com/screens/sc_744bda09698c4a938d39bab53f04d8d5

What to borrow: a friendly **card at the top** with a small illustration, a bold title and one sentence saying what to do, instead of a scary full-screen error.

LocDrop version:
> **Location is off**
> LocDrop needs your location to show notes near you. Turn it on in your browser's site settings, then refresh.

Also useful: **Swarm "Location access"**, which explains *why* location is needed as a list of features: https://gummble.com/screens/sc_3afc7e09ca7f4f83816eafa2c4eccf35

## FE-5: Write note

I didn't find a strong match in Gummble (the searches returned unrelated screens). Suggested layout, based on common compose screens:
- Top bar: "Cancel" on the left, a bold **"Drop"** button on the right (disabled while the text is empty).
- A large text area filling the screen, with a placeholder like "What's happening here?".
- A live `x / 280` counter under the text area; turn it red near the limit.
- Below that, three simple rows with switches: **Anonymous**, **Delete after first read 🔥**, and **Group (coming soon)**, which is greyed out.
- A small line at the bottom: "📍 Dropping at your current location".

Tip: the NGL card above also works as a style for the text area (a card with a coloured header).

## Error messages (one place: `src/api/errors.ts`)

Gummble's wording search didn't find good matches for these, so these are suggestions written for LocDrop's error codes:

| Code | Suggested message |
|---|---|
| `OUT_OF_RANGE` | "Move a bit closer: this note is {distance} m away. You need to be within 100 m." (the server's message includes the distance) |
| `NOTE_GONE` | "Too late! Someone else read this note first, or its author took it back." |
| `NOTE_LIMIT_REACHED` | "You have 5 notes out there already. Recall one in My notes to drop a new one." |
| `USERNAME_TAKEN` | "That username is taken. Try another one." |
| `INVALID_CREDENTIALS` | "Wrong username or password." |
| `NOT_FOUND` | "This note doesn't exist (or isn't visible to you)." |
| `UNAUTHENTICATED` | Go back to the login screen with "Please log in again." |
| `VALIDATION_ERROR` | Show the problem next to the field (the server message says which field) |
| `INTERNAL` / network error | "Something went wrong. Please try again." |

For "move closer", Taco Bell uses a small **ⓘ icon + "Move closer"** hint above the scanner. A short inline hint with an icon is less alarming than a red error box: https://gummble.com/screens/sc_b4a7a392a825458f976019f2936ac2be
