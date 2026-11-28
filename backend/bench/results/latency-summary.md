# L-1: endpoint latency (local)

- Date: 2026-11-28T09:59:29.437Z
- Node: v24.11.1
- CPU: AMD Ryzen 7 5700U with Radeon Graphics          (16 threads)
- OS: Windows_NT 10.0.26300
- Table: LocDrop @ http://localhost:8000
- MAX_ACTIVE_NOTES: 5, READ_RADIUS_M: 100

**Setup:** each endpoint called sequentially over HTTP (10 warm-up calls not counted) against the local API: Express → the real Lambda handlers → DynamoDB Local in Docker, all on one laptop. Times are measured by the client (full round trip).

| endpoint | n | p50 ms | p95 ms | mean ms | max ms | errors |
| --- | --- | --- | --- | --- | --- | --- |
| POST /auth/register | 30 | 132 | 156.7 | 134.6 | 164.7 | 0 |
| POST /auth/login | 30 | 126.1 | 136.6 | 125.8 | 139.6 | 0 |
| GET /me | 200 | 7 | 8.9 | 7.2 | 23.9 | 0 |
| POST /groups | 200 | 14.4 | 18.4 | 14.7 | 23.5 | 0 |
| POST /groups/join | 200 | 11.9 | 14.7 | 12.1 | 23.7 | 0 |
| GET /groups | 200 | 12.1 | 15.5 | 12.4 | 18.3 | 0 |
| POST /notes | 200 | 14.8 | 21.1 | 15.6 | 34.3 | 0 |
| GET /notes/mine | 200 | 7.7 | 14.2 | 9.2 | 17.7 | 0 |
| GET /notes/nearby | 200 | 37 | 50.5 | 38.8 | 71.7 | 0 |
| POST /notes/{id}/open | 200 | 6.5 | 7.7 | 6.6 | 11.1 | 0 |
| DELETE /notes/{id} | 200 | 23.1 | 29.3 | 22.3 | 39.4 | 0 |
| pop-up: POST /notes → note_nearby | 50 | 427.8 | 435.5 | 427.4 | 441.6 | 0 |
| pop-up: DELETE → note_gone | 50 | 426.3 | 433.6 | 426.3 | 435.8 | 0 |

**Notes:**
- Register and login are the slowest because they hash or verify the password with bcrypt (cost 10), which is deliberately slow to protect passwords.
- `POST /notes` and `DELETE /notes/{id}` run a DynamoDB transaction (note + slot counter together).
- `GET /notes/nearby` runs 9 geohash cell queries in parallel and then the exact distance check.
- `POST /groups` runs a 3-item transaction (group + unique join code + membership); `GET /groups` is one query (the caller is in ~210 groups by then, a worst case).
- **Pop-up rows** (A-10) time the whole path: the HTTP write, the table's change stream, `notify`, and the WebSocket message to a phone 20 m away (n = 50, 3 warm-up). Locally the dev server reads DynamoDB Local's stream every 0.4 s, so most of that time is waiting for the next read. On AWS, Lambda reads the stream instead: `npm run smoke:live -- --aws` measured about 0.45–0.8 s warm (2.6 s on the first, cold run).
- These are local numbers (no network between client, server and database). On AWS expect higher absolute values (network + Lambda), so use them to compare endpoints with each other, not as production latency.

**Suggested chart:** horizontal bar chart of p50 with p95 as an error bar or second bar, one bar per endpoint.
