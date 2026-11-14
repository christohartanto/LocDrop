# B-8: nearby lookup, geohash 9-cell query vs full-table scan

- Date: 2026-11-14T07:41:00.983Z
- Node: v24.11.1
- CPU: AMD Ryzen 7 5700U with Radeon Graphics          (16 threads)
- OS: Windows_NT 10.0.26300
- Table: LocDropBench @ http://localhost:8000
- MAX_ACTIVE_NOTES: 5, READ_RADIUS_M: 100

**Setup:** notes spread uniformly over a 10 km × 10 km area around the demo center. At each table size (1000 / 10000 / 50000), 30 random query points; each point is queried with both methods. Read radius 100 m, geohash precision 7 (cell ≈ 153 m × 153 m), 9 cells per query.

| size | method | p50 ms | p95 ms | mean examined | mean returned | mismatches |
| --- | --- | --- | --- | --- | --- | --- |
| 1000 | geohash | 31.7 | 38.5 | 1.8 | 0.1 | 0 |
| 1000 | scan | 73.8 | 83.3 | 1000 | 0.1 | 0 |
| 10000 | geohash | 41 | 58.5 | 20.5 | 3.4 | 0 |
| 10000 | scan | 774.4 | 1057.4 | 10000 | 3.4 | 0 |
| 50000 | geohash | 35.3 | 42.7 | 97 | 16.6 | 0 |
| 50000 | scan | 10464.5 | 16115.2 | 50000 | 16.6 | 0 |

**Correctness:** both methods returned exactly the same notes for every query point (0 mismatches). A separate unit test (`tests/slice-b/boundary.test.ts`) checks notes just across a cell edge and corner are found.

**Notes:** "examined" = items DynamoDB had to read, which does not depend on hardware. Scan always reads the whole table, so its cost grows with total table size. Geohash reads only the notes in the 9 cells around the reader (about 0.2% of the table here), so its cost grows with how crowded that area is, not with total table size. In this test all notes sit in the same 10 km box, so a bigger table also means denser cells, which is why geohash examined rises from about 2 to about 97, while its latency stays at about 15 to 30 ms. Absolute latency is DynamoDB Local on a laptop, not AWS.

**Suggested charts:** (1) p50 latency vs table size, one line per method (log scale on x); (2) mean examined items vs table size, one line per method.

Total benchmark time: 522.7 s.
