# Protocol

`lark-relay` treats Lark as a message transport, not as the source of truth.
The source of truth is the local Harvis Agent Room, task board, run ledger, and
evidence files.

## `mobilecode.evidence.v1`

MobileCode sends this payload to a Lark chat with a configured trigger prefix.

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

Required:

- `type`
- `status`
- `summary`

Recommended:

- `task_id`
- `evidence`
- `next_action`

## Harvis Mapping

The relay sends a normalized message to:

- `POST /router/message`
- `POST /agent-room/message` for MobileCode evidence
- `POST /agent-room/task/status` when `task_id` is present

If the Agent Room task-status endpoint is not available yet, that optional
request can fail without dropping the main router message.

## Harvis + MobileCode Task Handoff

For Harvis-initiated work, use the task envelope in
`schemas/mobilecode-harvis-task.schema.json`.

The first supported approval-gated actions are:

- `project_check`
- `validate`

See [harvis-mobilecode-integration.md](harvis-mobilecode-integration.md) for the
P0 fixtures and the Agent Room mapping.

## Safety

- Lark messages are filtered by chat id and trigger prefix.
- Duplicate event ids are ignored.
- Local absolute paths are redacted in evidence output.
- Lark live replies are disabled unless `safety.allowLiveReplies=true`.
- The relay never executes shell commands from Lark messages.
