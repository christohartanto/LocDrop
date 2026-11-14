# B-7: first-reader rule under concurrency

- Date: 2026-11-14T03:56:34.056Z
- Node: v24.11.1
- CPU: AMD Ryzen 7 5700U with Radeon Graphics          (16 threads)
- OS: Windows_NT 10.0.26300
- Table: LocDrop @ http://localhost:8000
- MAX_ACTIVE_NOTES: 5, READ_RADIUS_M: 100
**Setup:** 20 runs. Each run, 20 different users (all within 5 m) call `POST /notes/{id}/open` on the same "delete after first read" note at the same moment.

**Result:** 20 / 20 runs were fully correct (exactly 1 text returned, exactly 1 slot release, no unexpected errors).

| metric | min | max | mean |
| --- | --- | --- | --- |
| textsReturned | 1 | 1 | 1 |
| gone410 | 19 | 19 | 19 |
| otherErrors | 0 | 0 | 0 |
| slotReleases | 1 | 1 | 1 |
| wallMs | 160.1 | 936.3 | 236.6 |

**Conclusion:** the conditional transaction (note status `active → consumed` + slot release) let exactly one reader win in every run; the other 19 were rejected with 410 and the author's slot was released exactly once.

**Suggested chart:** bar chart of `textsReturned` per run (expected: 1 every run), optionally stacked with `gone410`.
