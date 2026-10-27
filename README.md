# Hive Online

A self-hosted, two-player Hive board game for the browser. Create a table and share a six-character invite code, join the public lobby, or pass one screen back and forth in hot-seat mode.

- **Live online play** over Socket.IO with persistent games
- **Invite codes and public tables** with casual or ranked results
- **Ranked accounts** with e-mail verification and Elo ratings
- **Anonymous guest play** with generated names and casual-only games
- **Hot-seat mode** with undo, configurable names, Ladybug & Mosquito and tournament opening
- **Light and dark themes** that follow each player's saved preference
- **Persistent SQLite storage** with no external database
- **Docker deployment** to a small home server such as a Raspberry Pi

This is a fan-made implementation of Hive, designed by John Yianni and published by Gen42 Games. It is not affiliated with Gen42 Games.

---

## Quick start (development)

Requirements: **Node.js 22+** and npm.

```powershell
npm ci
.\dev.ps1
```

Open <http://localhost:5173>. The API runs on port 3000 and Vite proxies `/api` and `/socket.io` to it.

Run the checks at any time:

```powershell
npm run typecheck
npm test
npm run build
```

`npm run build` writes the browser bundle to `dist/client` and the bundled server to `dist/server`. To run that production build locally:

```powershell
$env:NODE_ENV = "production"
npm start
```

Open <http://localhost:3000>.

Development data lives in `data/hive.db`; the generated config lives in `config/app.json`. Both are ignored by git and by Docker. Delete `data/hive.db` to reset a development instance.

---

## Deploy to homebridge.local

The deployment target in this repository is `pi@homebridge.local`, with state under `/home/pi/portainer_data/hive`:

```text
/home/pi/portainer_data/hive/
├── docker-compose.yml
├── .env
├── remote-deploy.sh
├── config/
│   └── app.json          # persistent configuration
├── data/
│   └── hive.db           # persistent database
└── site/                 # source refreshed by each deploy
```

Port **8085** is used because 8080 is already occupied on the target host.

### One-command deploy

```powershell
.\deploy.ps1
```

The script:

1. packages the source (without `node_modules`, `dist`, `data` or `config`),
2. uploads it to `homebridge.local`,
3. installs the deployment compose file and environment,
4. builds the Docker image **on the Pi** (correct arm64 native modules),
5. restarts the container and waits for its health check.

Then open <http://homebridge.local:8085>. The deployment also starts **Mailpit**, a local mail inbox, at <http://homebridge.local:8025> so verification e-mails can be inspected while testing.

The script merges `<RemoteRoot>/.env` instead of replacing it: `HIVE_PORT`, `PUBLIC_URL` and `TZ` are refreshed on every deploy, but mail secrets such as `ZEPTOMAIL_TOKEN` and `SMTP_PASS` are preserved. Add those values once on the host:

```bash
ssh pi@homebridge.local
nano /home/pi/portainer_data/hive/.env
```

Useful options:

```powershell
# A different host port and public URL
.\deploy.ps1 -Port 8090 -PublicUrl http://homebridge.local:8090

# Upload an existing config, including SMTP credentials
.\deploy.ps1 -ConfigFile .\config\app.json

# Deploy without waiting for the HTTP health check
.\deploy.ps1 -SkipHealthCheck
```

The first deployment seeds `config/app.json` from `config.example.json`. Later deployments leave an existing config untouched unless `-ConfigFile` is passed.

### Manual deployment

```bash
ssh pi@homebridge.local
mkdir -p /home/pi/portainer_data/hive/{site,data,config}
# copy the project into site/, then copy deploy/compose.yml to
# /home/pi/portainer_data/hive/docker-compose.yml and deploy/remote-deploy.sh
# to /home/pi/portainer_data/hive/remote-deploy.sh
cd /home/pi/portainer_data/hive
docker compose build
docker compose up -d
```

### Local Docker check

```powershell
docker compose up --build
```

This builds the same image locally and exposes it on <http://localhost:8085>. Local `./data` and `./config` are bind-mounted into the container.

---

## Configuration

Configuration is read from `config/app.json` (or `/config/app.json` in the container). Environment variables override the file, which is convenient for deployments.

```json
{
  "publicUrl": "http://homebridge.local:8085",
  "mailMode": "smtp",
  "registration": {
    "allowGuests": true,
    "requireVerifiedForRanked": true
  },
  "smtp": {
    "host": "mailpit",
    "port": 1025,
    "secure": false,
    "user": "",
    "pass": "",
    "from": "admin@example.com",
    "allowNoAuth": true
  },
  "zeptomail": {
    "apiUrl": "https://api.zeptomail.eu/v1.1/email",
    "token": ""
  },
  "ollama": {
    "enabled": true,
    "url": "http://192.168.1.148:11434",
    "model": "llama3.1:8b",
    "timeoutMs": 12000,
    "minDelayMs": 900
  },
  "bot": {
    "difficulty": "auto"
  }
}
```

| Setting | Default | Purpose |
| --- | --- | --- |
| `publicUrl` | `http://homebridge.local:8085` in production | Used in invite links and verification e-mails |
| `mailMode` | `smtp` when an SMTP host is set, otherwise `log` | `smtp`, `zeptomail` or `log` |
| `registration.allowGuests` | `true` | Allow anonymous guest sessions |
| `registration.requireVerifiedForRanked` | `true` | Only verified accounts affect Elo |
| `smtp.*` | empty | Outgoing SMTP transport (Mailpit by default) |
| `smtp.allowNoAuth` | `false` | Permit relays such as Mailpit that need no credentials |
| `zeptomail.*` | ZeptoMail EU endpoint, empty token | HTTP API delivery when `mailMode` is `zeptomail` |
| `ollama.enabled` | `true` | Use the Ollama language model for the computer opponent |
| `ollama.url` | `http://localhost:11434` | Reachable Ollama base URL |
| `ollama.model` | `llama3.1:8b` | Model the opponent asks for |
| `ollama.timeoutMs` | `12000` | Move deadline; a timeout falls back to the heuristic |
| `ollama.minDelayMs` | `900` | Cosmetic pause before the computer replies |
| `bot.difficulty` | `auto` | `auto` scales with the player's rating; `novice`, `casual`, `skilled`, `expert` or `master` pins every new game |

Supported environment variables:

| Variable | Maps to |
| --- | --- |
| `PUBLIC_URL` | `publicUrl` |
| `PORT`, `HOST` | listen address |
| `DATA_DIR`, `CONFIG_DIR` | storage paths |
| `ALLOW_GUESTS` | `registration.allowGuests` |
| `REQUIRE_VERIFIED` | `registration.requireVerifiedForRanked` |
| `MAIL_MODE` | `mailMode` |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`, `SMTP_ALLOW_NO_AUTH` | `smtp.*` |
| `ZEPTOMAIL_API_URL`, `ZEPTOMAIL_TOKEN` | `zeptomail.*` |
| `OLLAMA_ENABLED`, `OLLAMA_URL`, `OLLAMA_MODEL`, `OLLAMA_TIMEOUT_MS` | `ollama.*` |
| `BOT_MIN_DELAY_MS` | `ollama.minDelayMs` |
| `BOT_DIFFICULTY` | `bot.difficulty` |
| `SESSION_DAYS` | session lifetime, clamped to 1–90 days (default 30; guests always get 7) |
| `TRUST_PROXY` | trust one upstream proxy for `X-Forwarded-For`/`X-Forwarded-Proto` (default `false`) |

### Security and TLS

- `TRUST_PROXY` is **off by default** because the container port is normally published directly. Only set `TRUST_PROXY=true` when a reverse proxy forwards requests; otherwise a client can spoof its address and bypass the IP rate limiters.
- Session cookies are marked `Secure` automatically when `PUBLIC_URL` starts with `https://`. Terminate TLS at the proxy and set `PUBLIC_URL=https://…` before exposing the app outside a trusted network.
- HSTS is sent only on HTTPS requests. The app also sets `X-Frame-Options: DENY`, a restrictive CSP (the theme boot script is served as `/theme-init.js`, not inline), and rejects Socket.IO handshakes whose `Origin` does not match the request host or `PUBLIC_URL`.
- `.env` and `config/app.json` carry mail credentials. The deployment scripts restrict `.env` to mode `600`, and the server writes `config/app.json` as `600`; never commit either file.

### E-mail and account verification

Three mail modes are supported:

| `MAIL_MODE` | Behaviour |
| --- | --- |
| `smtp` | Sends through an SMTP relay (`SMTP_HOST`/`SMTP_PORT`). The bundled deployment points this at Mailpit. |
| `zeptomail` | Sends through the ZeptoMail HTTP API using `ZEPTOMAIL_TOKEN`. |
| `log` | Sends nothing and writes the verification link to the container log. |

The default deployment starts a **Mailpit** service (`hive-mailpit`) on the same Docker network. `SMTP_HOST=mailpit`, `SMTP_PORT=1025` and `SMTP_ALLOW_NO_AUTH=true` therefore work out of the box. Mailpit captures messages instead of delivering them, so use it for testing: open <http://homebridge.local:8025> to read the verification e-mail.

For real delivery, edit the remote `.env`:

```bash
# Deliver through ZeptoMail's HTTP API (token stays on the host)
MAIL_MODE=zeptomail
ZEPTOMAIL_TOKEN=your-private-token
ZEPTOMAIL_API_URL=https://api.zeptomail.eu/v1.1/email
SMTP_FROM=admin@example.com
```

```bash
docker compose -f /home/pi/portainer_data/hive/docker-compose.yml up -d
```

`ZEPTOMAIL_TOKEN` is never written by `deploy.ps1`; a normal redeploy keeps whatever is already in `.env`. The sender address comes from `SMTP_FROM` in both modes.

With mail configured, registration sends a verification link to the address. Ranked games require both players to be verified accounts (configurable). Guests and unverified accounts can still play casual games.

If mail is **not** configured (or delivery fails):

- verification links are printed to the container log;
- the account can be verified manually by an administrator;
- the registration page tells new players up front that an admin has to verify them, so nobody is left waiting for an e-mail that will never arrive.

```bash
# See unverified accounts
docker compose -f /home/pi/portainer_data/hive/docker-compose.yml \
  exec hive node dist/server/verify-user.js --list

# Verify one account by username or e-mail
docker compose -f /home/pi/portainer_data/hive/docker-compose.yml \
  exec hive node dist/server/verify-user.js QueenOfSix
```

The same command works locally with `npm run verify-user -- --list`.

### Ranked play

- New accounts start at **1200**.
- K-factor is 40 for the first 10 ranked games, 32 up to 30 games, then 24.
- Only games where both players are verified count for rating.
- Guests, unverified accounts and hot-seat games are casual.

### Computer opponent

The lobby offers **Play HiveMind**, a private single-player game against a built-in opponent. HiveMind always plays Onyx; you play Ivory. These games are always casual: they never affect Elo, never appear in the public lobby and are excluded from the live-table counters.

The opponent is a hybrid:

1. The rules engine generates every legal move and a one-ply heuristic ranks them (queen pressure, defence, beetle pins, opening timing).
2. For the strongest-looking moves, a reply search checks whether the opponent can immediately surround your queen, so the bot blocks a one-move loss instead of chasing a shiny attack.
3. The top candidates are sent to an [Ollama](https://ollama.com) chat model with a compact description of the board, hands and candidate list. The model may only pick a move that is close to the search's best; otherwise the search's choice stands.
4. Any error, timeout, unreachable server or invalid answer falls back to the search move, so a game can never stall on the AI.

**Difficulty scales with your rating.** New accounts start at 1200 (Skilled). The tiers are:

| Rating | Level | What changes |
| --- | --- | --- |
| under 1100 | Novice | no reply search, frequent random moves |
| 1100–1199 | Casual | four-move reply check, occasional mistakes |
| 1200–1349 | Skilled | eight-move reply check, rare mistakes |
| 1350–1499 | Expert | twelve-move reply check, model only allowed near-best moves |
| 1500+ | Master | deepest reply check, almost no randomness |

The lobby shows the level the next game will use and lets you pick a different one (Auto follows your rating). Set `BOT_DIFFICULTY` to a level to pin every new game server-wide, or leave it at `auto`. The selected level is stored with the game, so it stays put for the whole match.

Computer games are independent: several people can play HiveMind at once, each in their own game. Only one table talks to the language model at a time — the others use the reply search instantly, which keeps every game moving even on a single Ollama instance.

Point it at any Ollama server from the remote `.env`:

```bash
OLLAMA_URL=http://192.168.1.148:11434
OLLAMA_MODEL=llama3.1:8b
OLLAMA_TIMEOUT_MS=12000
BOT_DIFFICULTY=auto
```

A warm model replies in well under a second. The server preloads the model at startup and whenever a computer game is created (`keep_alive` keeps it resident for 30 minutes). Cold model loads can take 30–60 seconds; raise `OLLAMA_TIMEOUT_MS` if your first reply keeps falling back to the heuristic. Set `OLLAMA_ENABLED=false` to skip the model entirely and use only the heuristic — the computer opponent still works.

The model list is whatever your Ollama server has pulled (`ollama list`). Small instruction-following models such as `llama3.1:8b` or `qwen2.5-coder:7b` suit the numbered-choice prompt; reasoning-heavy models also work but reply more slowly.

### Appearance

The header carries a sun/moon toggle, and the profile page has a Light/Dark control. Signed-in players have the choice saved to their account, so it follows them to another browser; a `localStorage` copy makes the first paint match before React loads. Guests keep the choice on the device. Light is the default; choose Dark to return to the original look.

---

## Operations

```bash
# Status
ssh pi@homebridge.local 'cd /home/pi/portainer_data/hive && docker compose ps'

# Logs
ssh pi@homebridge.local 'cd /home/pi/portainer_data/hive && docker compose logs -f hive'

# Restart
ssh pi@homebridge.local 'cd /home/pi/portainer_data/hive && docker compose restart hive'

# Stop
ssh pi@homebridge.local 'cd /home/pi/portainer_data/hive && docker compose down'
```

`down` does not delete the bind-mounted `data/` or `config/` folders.

### Backup

The important files are the SQLite database and the config:

```bash
ssh pi@homebridge.local 'cd /home/pi/portainer_data/hive && tar -czf ~/hive-backup-$(date +%F).tar.gz data config'
```

For a consistent copy while the game is running, stop the container first:

```bash
ssh pi@homebridge.local 'cd /home/pi/portainer_data/hive && docker compose stop hive'
ssh pi@homebridge.local 'cd /home/pi/portainer_data/hive && tar -czf ~/hive-backup-$(date +%F).tar.gz data config'
ssh pi@homebridge.local 'cd /home/pi/portainer_data/hive && docker compose start hive'
```

Restore by stopping the container, replacing `data/` and `config/`, fixing ownership (`chown -R 1000:1000 data config`) and starting it again.

### Updating

Run `.\deploy.ps1` again from the development machine. The source in `site/` is replaced, the image is rebuilt and the container is recreated. Database and config remain in place.

---

## Project layout

```text
.
├── shared/                 # Pure rules engine shared by client and server
│   ├── hex.ts              # Hex coordinates and pixel maths
│   ├── types.ts            # Game types and piece metadata
│   └── hive/engine.ts      # Legal moves, placement, victory, AI-free rules
├── server/
│   ├── src/                # Express API, Socket.IO, SQLite, auth, Elo, mail
│   │   └── bot.ts          # HiveMind: heuristic ranking + Ollama move choice
│   ├── tests/              # Vitest rules and computer-opponent tests
│   └── tools/              # verify-user CLI
├── src/                    # React 19 client
│   ├── components/
│   ├── pages/
│   └── styles/
├── public/                 # Static assets and favicon
├── deploy/                 # Remote compose file and deployment helper
├── Dockerfile
├── docker-compose.yml      # Local Docker run
├── deploy.ps1              # PowerShell deployment to homebridge.local
└── dev.ps1                 # PowerShell development launcher
```

The rules engine is deliberately UI-free: the server resolves every action authoritatively, and the client uses the same engine to highlight legal moves. Unit tests live in `server/tests/engine.test.ts`; the computer opponent's ranking and prompt handling are covered by `server/tests/bot.test.ts`.

---

## Troubleshooting

**The page loads without styling or scripts.** The server may have been started before `dist/client` existed. Rebuild (`npm run build`) and restart the server.

**`EADDRINUSE` on port 3000.** Another development server is already running. Stop it or change `PORT`.

**The container is unhealthy.** Check `docker compose logs hive`. The usual causes are a missing writable `data/` directory or a bad config file. Ownership of bind mounts must allow uid/gid 1000.

**Verification e-mail never arrives.** If `MAIL_MODE=smtp` with Mailpit, the message is waiting in the Mailpit inbox at <http://homebridge.local:8025> rather than a real mailbox. Otherwise check the container log for the generated link, verify the mail settings, then use the `verify-user` CLI if necessary.

**Invite links point to the wrong host.** Set `publicUrl` (or `PUBLIC_URL`) to the address players actually use, including the port.

**HiveMind never uses the language model.** Check the container log for `Ollama is not reachable` or `returned an unusable move`; the heuristic keeps playing either way. Verify the URL from inside the container:

```bash
docker compose -f /home/pi/portainer_data/hive/docker-compose.yml \
  exec hive node -e "fetch((process.env.OLLAMA_URL||'') + '/api/tags').then(r => r.text()).then(console.log).catch(console.error)"
```

If the first move of a session falls back, the model was probably cold: raise `OLLAMA_TIMEOUT_MS` or pull a smaller model such as `gemma3:4b`.
