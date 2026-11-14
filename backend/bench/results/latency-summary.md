# L-1: endpoint latency (local)

- Date: 2026-11-14T07:23:21.053Z
- Node: v24.11.1
- CPU: AMD Ryzen 7 5700U with Radeon Graphics          (16 threads)
- OS: Windows_NT 10.0.26300
- Table: LocDrop @ http://localhost:8000
- MAX_ACTIVE_NOTES: 5, READ_RADIUS_M: 100

**Setup:** each endpoint called sequentially over HTTP (10 warm-up calls not counted) against the local API: Express → the real Lambda handlers → DynamoDB Local in Docker, all on one laptop. Times are measured by the client (full round trip).

| endpoint | n | p50 ms | p95 ms | mean ms | max ms | errors |
| --- | --- | --- | --- | --- | --- | --- |
| POST /auth/register | 30 | 130.2 | 141.3 | 130.5 | 142.4 | 0 |
| POST /auth/login | 30 | 123.5 | 136.1 | 123.7 | 139.2 | 0 |
| GET /me | 200 | 6.9 | 8 | 7 | 8.8 | 0 |
| POST /notes | 200 | 13.4 | 16.8 | 13.8 | 21.1 | 0 |
| GET /notes/mine | 200 | 8.3 | 9.9 | 8.5 | 22.1 | 0 |
| GET /notes/nearby | 200 | 28.3 | 44.7 | 30.7 | 62.3 | 0 |
| POST /notes/{id}/open | 200 | 6.5 | 7.8 | 6.7 | 10.4 | 0 |
| DELETE /notes/{id} | 200 | 16.5 | 20.7 | 16.8 | 23.8 | 0 |

**Notes:**
- Register and login are the slowest because they hash or verify the password with bcrypt (cost 10), which is deliberately slow to protect passwords.
- `POST /notes` and `DELETE /notes/{id}` run a DynamoDB transaction (note + slot counter together).
- `GET /notes/nearby` runs 9 geohash cell queries in parallel and then the exact distance check.
- These are local numbers (no network between client, server and database). On AWS expect higher absolute values (network + Lambda), so use them to compare endpoints with each other, not as production latency.

**Suggested chart:** horizontal bar chart of p50 with p95 as an error bar or second bar, one bar per endpoint.
