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

## `mobilecode.status.v1`

MobileCode can export this read-only status object for P1.

```json
{
  "type": "mobilecode.status.v1",
  "task_id": "hm_task_project_check_001",
  "correlation_id": "corr_mobilecode_harvis_001",
  "state": "running",
  "phase": "project_check",
  "updated_at": "2026-06-29T09:41:00Z",
  "next_action": "continue_project_check"
}
```

Schema: `schemas/mobilecode-status.schema.json`.

## `mobilecode.action_evidence.v1`

MobileCode can export this read-only ActionEvidence object for P1/P2.

```json
{
  "type": "mobilecode.action_evidence.v1",
  "task_id": "hm_task_project_check_001",
  "correlation_id": "corr_mobilecode_harvis_001",
  "action": "project_check",
  "status": "verified",
  "summary": "Project check passed.",
  "observations": [],
  "created_at": "2026-06-29T09:42:00Z",
  "next_action": "render_in_harvis_agent_room"
}
```

Schema: `schemas/mobilecode-action-evidence.schema.json`.

## Harvis Mapping

The relay sends a normalized message to:

- `POST /router/message`
- `POST /agent-room/message` for MobileCode status/evidence payloads
- `POST /agent-room/task/status` for MobileCode payloads when `task_id` is present

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
