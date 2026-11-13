# Setup checklist (install once)

Commands are for **Windows PowerShell**. Use `curl.exe`, not `curl`: in Windows PowerShell 5.1, `curl` is a different command.

## Who needs what

| Tool | Eugene | Vincent | Wendy |
|---|---|---|---|
| Git | ✅ | ✅ | ✅ |
| Node.js LTS (22 or 24) | ✅ | ✅ | ✅ |
| Claude Code | ✅ | ✅ | ✅ |
| Docker Desktop (+ WSL 2) | Optional (only to run the real backend on his own laptop) | ✅ | ✅ (runs the final benchmarks) |
| Java 17+ | Only if Docker fails | Only if Docker fails | Only if Docker fails |

## 1. Git

Install from https://git-scm.com/download/win.

```powershell
git --version                       # git version 2.x
git config --global user.name       # should print your name; if empty, set it:
# git config --global user.name "Your Name"
# git config --global user.email "you@example.com"
```

## 2. Node.js (LTS)

Install the **LTS** version from https://nodejs.org (22.x or 24.x).

```powershell
node -v                             # v22.x or v24.x
npm -v                              # 10.x or newer
```

## 3. Claude Code

```powershell
claude --version                    # prints a version number
```

## 4. Docker Desktop (Vincent, Wendy; optional for Eugene)

1. Turn on WSL 2: `wsl --install`, then **restart** the computer.
2. Install Docker Desktop from https://www.docker.com/products/docker-desktop and start it. Wait until it says "Engine running".

```powershell
wsl --status                        # Default Version: 2
docker --version                    # Docker version 2x.x
docker compose version              # Docker Compose version v2.x
docker run --rm hello-world         # prints "Hello from Docker!"
```

Check that DynamoDB Local works:

```powershell
docker run --rm -d -p 8000:8000 --name ddb-check amazon/dynamodb-local
curl.exe -s http://localhost:8000   # prints any response text = running ("connection refused" = not running)
docker stop ddb-check
```

## 5. Project check (after Phase 0a is merged)

```powershell
git clone https://github.com/<wendy-github-username>/locdrop.git
cd locdrop
npm run setup
npm run db:up
npm run db:init
npm test                            # all tests pass
npm run seed
npm run dev:api                     # in a second terminal
curl.exe http://localhost:3000/health   # {"ok":true}
npm run smoke                       # all PASS
```

## Fallbacks if Docker won't install

Common causes: virtualization is off in the BIOS, or Windows Home is missing WSL features.

**Fallback A: run DynamoDB Local without Docker (needs Java 17+).**

```powershell
java -version                       # 17 or newer (install from https://adoptium.net if missing)
```

1. Download DynamoDB Local (the `.zip`) from the AWS docs page **"Deploying DynamoDB locally on your computer"** and unzip it to e.g. `C:\dynamodb-local`.
2. Start it, keeping the window open:
   ```powershell
   cd C:\dynamodb-local
   java "-Djava.library.path=./DynamoDBLocal_lib" -jar DynamoDBLocal.jar -sharedDb -inMemory -port 8000
   ```
3. Everything else is the same. Just **skip** `npm run db:up`.

**Fallback B: use a teammate's database over Wi-Fi** (same network).

1. On the teammate's laptop (with Docker running), allow port 8000 through Windows Firewall and find their IP with `ipconfig`.
2. On your laptop, before running the API:
   ```powershell
   $env:DYNAMO_ENDPOINT="http://<teammate-ip>:8000"
   npm run dev:api
   ```

**Fallback C (Eugene only): no database at all.** Use `npm run dev:web:mock` (fake data). To use the real API, run `npm run dev:web` with `VITE_API_URL` pointing at a teammate's API, set in `frontend/.env.development.local`:

```
VITE_API_URL=http://<teammate-ip>:3000
```

(The teammate must allow port 3000 through the firewall.)

## Ports used

| Port | What |
|---|---|
| 5173 | Frontend (Vite) |
| 3000 | Local API (Express) |
| 8000 | DynamoDB Local |
