const MOBILECODE_PAYLOAD_TYPES = new Set([
  "mobilecode.status.v1",
  "mobilecode.action_evidence.v1",
  "mobilecode.evidence.v1"
]);

export function isMobileCodePayload(payload) {
  return payload && MOBILECODE_PAYLOAD_TYPES.has(payload.type);
}

export function buildAgentRoomProjection(payload, config, event = {}) {
  if (!isMobileCodePayload(payload)) {
    throw new Error(`Unsupported Agent Room payload type: ${payload?.type || "unknown"}`);
  }

  const taskId = stringValue(payload.task_id) || stableMissing("task");
  const status = statusFromPayload(payload);
  const topicId =
    stringValue(payload.topic_id) ||
    stringValue(payload.agent_room_topic_id) ||
    stringValue(payload.source?.agent_room_topic_id) ||
    "";
  const content = contentFromPayload(payload);

  return {
    schema: "harvis.agent_room.mobilecode_projection.v1",
    topic_id: topicId || null,
    event_id: stringValue(event.eventId) || stringValue(payload.event_id) || null,
    message: {
      transport: "feishu",
      agent_id: config.mobilecode.agentId,
      role: "mobile-runtime",
      content,
      sensitivity: payload.redaction === "private_local" ? "private_local" : "public_safe",
      source_refs: sourceRefsFromPayload(payload)
    },
    task_status: {
      task_id: taskId,
      status,
      phase: stringValue(payload.phase) || stringValue(payload.action) || null,
      correlation_id: stringValue(payload.correlation_id) || null,
      next_action: stringValue(payload.next_action) || null
    },
    display: {
      title: titleFromPayload(payload),
      summary: summaryFromPayload(payload),
      badges: badgesFromPayload(payload),
      progress: payload.progress || null,
      approval: payload.approval || null,
      artifacts: Array.isArray(payload.artifacts) ? payload.artifacts : []
    }
  };
}

export function contentFromPayload(payload) {
  if (payload.type === "mobilecode.status.v1") {
    return `MobileCode status ${statusFromPayload(payload)}: ${summaryFromPayload(payload)}`;
  }
  if (payload.type === "mobilecode.action_evidence.v1") {
    return `MobileCode ${stringValue(payload.action) || "action"} ${statusFromPayload(
      payload
    )}: ${summaryFromPayload(payload)}`;
  }
  return `MobileCode evidence ${statusFromPayload(payload)}: ${summaryFromPayload(payload)}`;
}

function statusFromPayload(payload) {
  return stringValue(payload.state) || stringValue(payload.status) || "reported";
}

function summaryFromPayload(payload) {
  if (payload.summary) return stringValue(payload.summary);
  if (payload.progress?.current) return stringValue(payload.progress.current);
  if (payload.phase) return `phase=${payload.phase}`;
  return "MobileCode update.";
}

function titleFromPayload(payload) {
  if (payload.type === "mobilecode.status.v1") return "MobileCode Status";
  if (payload.type === "mobilecode.action_evidence.v1") return "MobileCode ActionEvidence";
  return "MobileCode Evidence";
}

function badgesFromPayload(payload) {
  return [
    payload.type,
    statusFromPayload(payload),
    stringValue(payload.phase) || stringValue(payload.action)
  ].filter(Boolean);
}

function sourceRefsFromPayload(payload) {
  const refs = [];
  if (payload.task_id) refs.push(`task:${payload.task_id}`);
  if (payload.correlation_id) refs.push(`correlation:${payload.correlation_id}`);
  if (payload.approval?.approval_id) refs.push(`approval:${payload.approval.approval_id}`);
  if (Array.isArray(payload.artifacts)) {
    for (const artifact of payload.artifacts) {
      if (artifact.ref) refs.push(`artifact:${artifact.ref}`);
    }
  }
  return refs;
}

function stableMissing(prefix) {
  return `${prefix}_missing`;
}

function stringValue(value) {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return "";
}
