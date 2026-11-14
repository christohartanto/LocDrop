# A-8: N-note limit under concurrency, conditional transaction vs naive read-then-write

- Date: 2026-11-14T07:32:08.083Z
- Node: v24.11.1
- CPU: AMD Ryzen 7 5700U with Radeon Graphics          (16 threads)
- OS: Windows_NT 10.0.26300
- Table: LocDrop @ http://localhost:8000
- MAX_ACTIVE_NOTES: 5, READ_RADIUS_M: 100

**Setup:** 20 runs per version. Each run, one fresh user sends 50 `POST` "write note" requests at the same moment. The limit is N = 5 active notes. "counter" is the user's stored `activeNoteCount`; "real notes" is the number of active notes actually saved.

| mode | runs | min successes | mean successes | max successes | runs over limit | runs with counter ≠ real notes | other errors | mean wall ms |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| conditional | 20 | 5 | 5 | 5 | 0 | 0 | 0 | 549.7 |
| naive | 20 | 50 | 50 | 50 | 20 | 20 | 0 | 500.7 |

**Conditional version:** exactly 5 of 50 succeeded in every run, the other 45 got 409 NOTE_LIMIT_REACHED, and the counter always matched the real number of notes.

**Naive version:** 20 / 20 runs went over the limit (up to 50 notes instead of 5), and 20 / 20 runs ended with a counter that no longer matched the real number of notes (lost updates).

**Why:** the naive version reads the count, checks it, then writes count+1. Requests that arrive together all read the same old count, all pass the check, and overwrite each other's counter. The conditional version puts the check inside the write itself (`ADD activeNoteCount 1` only `IF activeNoteCount < N`) and combines it with the note write in one transaction, so the database rejects every write after the 5th.

**Suggested chart:** grouped bar chart of `successes` per run for both versions, with a horizontal reference line at N = 5.
