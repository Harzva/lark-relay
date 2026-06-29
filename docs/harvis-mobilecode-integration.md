# Harvis + MobileCode Integration

This document defines the first integration contract between Harvis and the
existing MobileCode runtime.

Goal:

```text
Harvis Agent Room -> approval-gated handoff -> existing MobileCode
MobileCode status/evidence -> lark-relay -> Harvis Agent Room
```

Non-goals:

- Do not move Harvis into MobileCode.
- Do not move MobileCode execution into `lark-relay`.
- Do not rebuild phone control, app QA, model inference, GitHub publishing, or
  document generation inside this repository.
- Do not expose Harvis through a public IP address.

`lark-relay` is the bridge and protocol adapter. Harvis remains the local source
of truth for Agent Room, approvals, task state, and ActionEvidence. MobileCode
remains the mobile execution and evidence runtime.

## Reference Direction

The Harvis direction from `4-Digital-Me` is:

- Agent Room is an auditable multi-agent collaboration room, not a plain group
  chat.
- Agent Room events carry topic id, event id, agent id, source refs,
  sensitivity, and content.
- Approval candidates are first-class UI/runtime objects.
- Runtime state should be visible through status and event records.

This integration borrows those shapes without copying private state or local
runtime data.

## Phases

### P0 Protocol And Fixtures

Deliverables:

- `docs/harvis-mobilecode-integration.md`
- `schemas/mobilecode-harvis-task.schema.json`
- `examples/harvis-mobilecode-task.project_check.json`
- `examples/mobilecode-status.readonly.json`
- `examples/mobilecode-action-evidence.project_check.json`

Acceptance:

- Harvis can construct a valid `mobilecode.harvis.task.v1` task envelope.
- MobileCode can export status and ActionEvidence JSON without changing remote
  state.
- Agent Room can render the status/evidence fixtures as a task timeline.

### P1 Read-Only Status Bridge

MobileCode exports read-only JSON:

- `mobilecode.status.v1`
- `mobilecode.action_evidence.v1`
- optionally `mobilecode.evidence.v1` for Lark relay write-back

Harvis reads those objects and displays them in Agent Room. P1 must not trigger
MobileCode execution automatically.

### P2 Single Approval-Gated Handoff

Support exactly one approved action at a time:

- `project_check`
- or `validate`

The action must be represented by `mobilecode.harvis.task.v1`, must carry an
approval id, and must return ActionEvidence. Free-form shell commands are not a
valid handoff.

### P3 GitHub And Mobile Smoke Evidence

Only after P1/P2 are stable:

- attach GitHub Pages evidence
- attach GitHub Actions evidence
- attach mobile smoke evidence
- use an Android emulator when Android deployment or mobile smoke requires it

## Task Envelope

Harvis sends a `mobilecode.harvis.task.v1` envelope. The schema is
`schemas/mobilecode-harvis-task.schema.json`.

Current allowed task kinds:

- `project_check`
- `validate`

Example:

```json
{
  "schema_version": "mobilecode.harvis.task.v1",
  "task_id": "hm_task_project_check_001",
  "correlation_id": "corr_mobilecode_harvis_001",
  "source": {
    "system": "harvis",
    "agent_room_topic_id": "topic_mobilecode_bridge_001",
    "requested_by": "agent:planner"
  },
  "handoff": {
    "mode": "approval_gated_action",
    "requires_approval": true,
    "approval_id": "appr_project_check_001",
    "allowed_actions": ["project_check"],
    "risk": "low"
  },
  "task": {
    "kind": "project_check",
    "title": "Check MobileCode bridge readiness"
  }
}
```

The full fixture is
`examples/harvis-mobilecode-task.project_check.json`.

## Status Export

MobileCode exports `mobilecode.status.v1` so Harvis can render a read-only task
card in Agent Room.

Minimum fields:

- `type`
- `task_id`
- `correlation_id`
- `runtime`
- `state`
- `phase`
- `updated_at`
- `next_action`

Recommended state values:

- `queued`
- `accepted`
- `running`
- `needs_human`
- `verified`
- `failed`
- `cancelled`

Fixture:

- `examples/mobilecode-status.readonly.json`

## ActionEvidence Export

MobileCode exports `mobilecode.action_evidence.v1` after an approved action.

Minimum fields:

- `type`
- `task_id`
- `correlation_id`
- `action`
- `status`
- `summary`
- `observations`
- `created_at`
- `next_action`

Fixture:

- `examples/mobilecode-action-evidence.project_check.json`

`lark-relay` can later normalize this into `mobilecode.evidence.v1` for the
existing Lark transport.

## Agent Room Mapping

Harvis should map these objects into Agent Room as:

| MobileCode Object | Agent Room Surface |
| --- | --- |
| `mobilecode.harvis.task.v1` | approval candidate + task card |
| `mobilecode.status.v1` | task status update |
| `mobilecode.action_evidence.v1` | ActionEvidence timeline event |
| `mobilecode.evidence.v1` | relay evidence and Lark acknowledgement |

Recommended Agent Room event fields:

- `event_id`
- `topic_id`
- `agent_id`
- `role`
- `source_refs`
- `sensitivity`
- `content`

## Safety Rules

- Use git commits at each substantial phase boundary.
- Keep all examples public-safe; no tokens, cookies, `.env` values, credential
  dumps, raw chat logs, or private local paths.
- Do not accept a Lark text message as a shell command.
- Use approval-gated handoff for actions, even low-risk ones.
- Use Android emulator verification only when Android deployment or mobile smoke
  evidence is in scope.
