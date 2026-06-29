# lark-relay

`lark-relay` uses Lark/Feishu as a message bridge so MobileCode, Harvis, and
local agents can communicate without exposing a public IP address.

```text
MobileCode / humans / bots
  -> Lark chat
  -> lark-relay running on Mac mini
  -> http://127.0.0.1 Harvis API
  -> Harvis Agent Room / task board / evidence
  -> Lark acknowledgement
```

It is intentionally a relay, not an autonomous agent. It filters messages,
validates payloads, deduplicates events, calls local Harvis endpoints, writes
local evidence, and sends human-readable acknowledgements back to Lark.

## Why

Running Harvis on a private Mac mini is safer than exposing it to the internet,
but phones and Lark bots still need a way to send task results back. Lark
already provides authenticated cloud messaging. `lark-relay` turns that into a
controlled local inbox.

## Install

Run directly from GitHub:

```bash
npx github:Harzva/lark-relay --help
npx github:Harzva/lark-relay init --config lark-relay.config.json
```

After the package is published to npm, run without installing:

```bash
npx @harzva/lark-relay --help
npx @harzva/lark-relay init --config lark-relay.config.json
```

After npm publication, install globally:

```bash
npm install -g @harzva/lark-relay
lark-relay --help
```

Local development:

```bash
git clone https://github.com/Harzva/lark-relay.git
cd lark-relay
npm install
npm test
```

## Requirements

- Node.js 20+
- A working `lark-cli` profile that can consume `im.message.receive_v1`
- A local Harvis HTTP API, usually `http://127.0.0.1:8765`
- A Lark chat id allowlist

Harvis can remain localhost-only. No public domain, webhook tunnel, router port
forwarding, or phone-to-Mac direct connection is required.

## Roadmap

See [ROADMAP.md](ROADMAP.md) for the MobileCode + Harvis bidirectional roadmap,
including git commit governance and `cxsaprk`/`cxspark` assisted execution rules.

## Quick Start

Create a config:

```bash
lark-relay init --config ~/.config/lark-relay/config.json
```

Edit these fields:

```json
{
  "lark": {
    "profile": "harvis-mobilecode-bot",
    "targetChatIds": ["oc_your_chat_id"]
  },
  "harvis": {
    "baseUrl": "http://127.0.0.1:8765",
    "workspaceRoot": "/path/to/harvis-workspace"
  }
}
```

Check the config:

```bash
lark-relay check --config ~/.config/lark-relay/config.json
lark-relay doctor-lark --config ~/.config/lark-relay/config.json
```

Run one local fixture without replying to Lark:

```bash
lark-relay route-file \
  --config ~/.config/lark-relay/config.json \
  --file examples/mobilecode-evidence-event.json \
  --no-reply
```

Start the relay:

```bash
lark-relay run --config ~/.config/lark-relay/config.json
```

## MobileCode Payload

Send this to the configured Lark chat with the configured trigger prefix:

```json
{
  "type": "mobilecode.evidence.v1",
  "task_id": "mc_123",
  "status": "verified",
  "summary": "Phone preview passed.",
  "evidence": [
    {
      "kind": "screenshot",
      "url": "lark://file/xxx"
    }
  ],
  "next_action": "ready_for_publish"
}
```

With the default prefix:

```text
[mobilecode] {"type":"mobilecode.evidence.v1","task_id":"mc_123","status":"verified","summary":"Phone preview passed.","next_action":"ready_for_publish"}
```

## Safety Model

- Known-chat allowlist by default.
- Trigger-prefix filtering by default.
- Duplicate Lark events are ignored.
- Lark replies default to dry-run.
- Local absolute paths are redacted in relay evidence.
- No raw shell execution from Lark messages.
- Harvis remains the local processing authority.

## Commands

```bash
lark-relay init
lark-relay check
lark-relay doctor-lark
lark-relay render-agent-room --file examples/mobilecode-status.readonly.json
lark-relay route-file --file event.json
lark-relay run
```

See [docs/protocol.md](docs/protocol.md) for payload details and
[docs/lark-cli-bringup.md](docs/lark-cli-bringup.md) for the first Lark CLI
bring-up. See [docs/harvis-mobilecode-integration.md](docs/harvis-mobilecode-integration.md)
for the Harvis Agent Room + MobileCode handoff contract, and
[docs/operations.md](docs/operations.md) for launchd/systemd examples.

## Production Notes

Use `replyMode=live` only after dry-run evidence proves that the bot is in the
right chat and loop guards are working. Live mode also requires:

```json
{
  "safety": {
    "allowLiveReplies": true
  }
}
```

Keep credentials in `lark-cli`, environment variables, Keychain, or your
private secret manager. Do not put tokens, cookies, `.env` values, credential
dumps, or raw private logs in this repository.
