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
lark-relay doctor-lark --config lark-relay.config.json --check-chats
lark-relay route-file \
  --config lark-relay.config.json \
  --file examples/mobilecode-status-event.json \
  --no-reply
```

`doctor-lark` verifies local command surfaces and event schema. It does not send
messages and does not consume live events.

`--check-chats` additionally runs a read-only `im +chat-list` check under the
configured Lark identity. It reports counts only:

- `visibleChatCount`: chats visible to the current user or bot identity.
- `configuredTargetChatCount`: entries in `lark.targetChatIds`.
- `matchedTargetChatCount`: configured targets that are visible to the identity.
- `hasPlaceholderTarget`: whether the config still contains example chat IDs.
- `readyForLiveSmoke`: true only when at least one configured target is visible.

If `visibleChatCount` or `matchedTargetChatCount` is `0`, add the bot to a
dedicated test chat and update `lark.targetChatIds` before running live relay
mode.

## 5. Run One Live Event

Preview the smoke message first. This does not send a message:

```bash
lark-relay p1-smoke --config lark-relay.config.json
```

After explicit human approval, either let the relay send the smoke message:

In terminal 1:

```bash
lark-relay run --config lark-relay.config.json --once --max-events 1 --timeout 2m
```

In terminal 2:

```bash
lark-relay p1-smoke --config lark-relay.config.json --send --yes --send-as user --mention-all
```

Or send the message manually in the configured Lark chat:

```text
[mobilecode] {"type":"mobilecode.status.v1","task_id":"bringup_1","state":"running","phase":"project_check","summary":"Lark CLI and lark-relay bring-up smoke passed.","updated_at":"2026-06-29T00:00:00.000Z"}
```

In group chats, Lark receive events may require an @mention. `lark-relay`
accepts leading mention tokens such as `@_all` before the configured trigger
prefix, so an event content like `@_all [mobilecode] {...}` still matches.

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
