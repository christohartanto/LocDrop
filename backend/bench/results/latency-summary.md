# L-1: endpoint latency (local)

- Date: 2026-11-14T07:41:40.507Z
- Node: v24.11.1
- CPU: AMD Ryzen 7 5700U with Radeon Graphics          (16 threads)
- OS: Windows_NT 10.0.26300
- Table: LocDrop @ http://localhost:8000
- MAX_ACTIVE_NOTES: 5, READ_RADIUS_M: 100

**Setup:** each endpoint called sequentially over HTTP (10 warm-up calls not counted) against the local API: Express → the real Lambda handlers → DynamoDB Local in Docker, all on one laptop. Times are measured by the client (full round trip).

| endpoint | n | p50 ms | p95 ms | mean ms | max ms | errors |
| --- | --- | --- | --- | --- | --- | --- |
| POST /auth/register | 30 | 118.7 | 128.5 | 119.2 | 129.2 | 0 |
| POST /auth/login | 30 | 113.7 | 121.4 | 114.3 | 128.9 | 0 |
| GET /me | 200 | 7.6 | 8.5 | 7.7 | 17.5 | 0 |
| POST /notes | 200 | 20.8 | 25.1 | 21.2 | 35.1 | 0 |
| GET /notes/mine | 200 | 8.5 | 9.7 | 8.7 | 23 | 0 |
| GET /notes/nearby | 200 | 36.1 | 42.4 | 36.5 | 47.8 | 0 |
| POST /notes/{id}/open | 200 | 7.6 | 8.6 | 7.7 | 15.1 | 0 |
| DELETE /notes/{id} | 200 | 27.3 | 32.1 | 27.7 | 46.9 | 0 |

**Notes:**
- Register and login are the slowest because they hash or verify the password with bcrypt (cost 10), which is deliberately slow to protect passwords.
- `POST /notes` and `DELETE /notes/{id}` run a DynamoDB transaction (note + slot counter together).
- `GET /notes/nearby` runs 9 geohash cell queries in parallel and then the exact distance check.
- These are local numbers (no network between client, server and database). On AWS expect higher absolute values (network + Lambda), so use them to compare endpoints with each other, not as production latency.

**Suggested chart:** horizontal bar chart of p50 with p95 as an error bar or second bar, one bar per endpoint.
