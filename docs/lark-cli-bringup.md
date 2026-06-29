# Lark CLI Bring-Up

This guide brings up the first safe path:

```text
Lark CLI profile -> lark-relay -> local Harvis API
```

It does not require a public IP address and does not move MobileCode logic into
`lark-relay`.

## 1. Check Local CLI

```bash
command -v lark-cli
lark-cli --version
lark-cli doctor
```

If `lark-cli doctor` reports missing permissions, fix them in the Lark developer
console for bot identity. Do not run user login for a bot-only relay.

## 2. Confirm Event Support

```bash
lark-cli event schema im.message.receive_v1 --json
lark-cli event consume im.message.receive_v1 --as bot --max-events 1 --timeout 2m
```

Send a message to the target Lark chat while the bounded consume command is
running. It should exit after one event or after the timeout.

For long-running event consumers, keep stdin open. `lark-relay run` does this
internally.

## 3. Create Relay Config

```bash
lark-relay init --config lark-relay.config.json
```

Edit only public-safe fields in the config:

```json
{
  "lark": {
    "profile": "your-lark-cli-profile",
    "identity": "bot",
    "targetChatIds": ["oc_your_chat_id"],
    "replyMode": "dry-run"
  },
  "harvis": {
    "baseUrl": "http://127.0.0.1:8765"
  }
}
```

Keep credentials in `lark-cli`, environment variables, Keychain, or another
private secret manager.

## 4. Run Non-Destructive Relay Checks

```bash
lark-relay check --config lark-relay.config.json
lark-relay doctor-lark --config lark-relay.config.json
lark-relay route-file \
  --config lark-relay.config.json \
  --file examples/mobilecode-evidence-event.json \
  --no-reply
```

`doctor-lark` verifies local command surfaces and event schema. It does not send
messages and does not consume live events.

## 5. Run One Live Event

In terminal 1:

```bash
lark-relay run --config lark-relay.config.json --once --max-events 1 --timeout 2m
```

In the configured Lark chat, send:

```text
[mobilecode] {"type":"mobilecode.evidence.v1","task_id":"bringup_1","status":"verified","summary":"Lark CLI and lark-relay bring-up smoke passed.","next_action":"connect_harvis_live"}
```

Expected result:

- `lark-relay` logs that the Lark consumer is ready.
- One event is routed.
- A local evidence JSONL entry is written.
- Lark reply stays dry-run unless `replyMode` is changed to `live`.

## 6. Enable Live Replies Later

Only after dry-run evidence proves the bot is in the right chat:

```json
{
  "lark": {
    "replyMode": "live"
  },
  "safety": {
    "allowLiveReplies": true
  }
}
```

Do not enable live replies until loop guards, target chat allowlist, and message
format are verified.
