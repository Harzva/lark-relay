const ALLOWED_HANDOFF_ACTIONS = new Set(["project_check", "validate"]);

export class HandoffError extends Error {
  constructor(message, details = []) {
    super(message);
    this.name = "HandoffError";
    this.details = details;
  }
}

export function validateMobileCodeHandoff(envelope) {
  const errors = [];
  if (!envelope || typeof envelope !== "object" || Array.isArray(envelope)) {
    throw new HandoffError("MobileCode handoff must be a JSON object.", [
      "Expected mobilecode.harvis.task.v1 envelope."
    ]);
  }
  if (envelope.schema_version !== "mobilecode.harvis.task.v1") {
    errors.push("schema_version must be mobilecode.harvis.task.v1.");
  }
  if (!stringValue(envelope.task_id).startsWith("hm_task_")) {
    errors.push("task_id must start with hm_task_.");
  }
  if (!stringValue(envelope.correlation_id).startsWith("corr_")) {
    errors.push("correlation_id must start with corr_.");
  }
  if (envelope.source?.system !== "harvis") {
    errors.push("source.system must be harvis.");
  }
  if (envelope.target?.runtime !== "mobilecode") {
    errors.push("target.runtime must be mobilecode.");
  }
  if (envelope.handoff?.mode !== "approval_gated_action") {
    errors.push("handoff.mode must be approval_gated_action.");
  }
  if (envelope.handoff?.requires_approval !== true) {
    errors.push("handoff.requires_approval must be true.");
  }
  if (!stringValue(envelope.handoff?.approval_id).startsWith("appr_")) {
    errors.push("handoff.approval_id is required and must start with appr_.");
  }

  const action = stringValue(envelope.task?.kind);
  if (!ALLOWED_HANDOFF_ACTIONS.has(action)) {
    errors.push("task.kind must be project_check or validate.");
  }
  const allowedActions = Array.isArray(envelope.handoff?.allowed_actions)
    ? envelope.handoff.allowed_actions
    : [];
  if (!allowedActions.includes(action)) {
    errors.push("handoff.allowed_actions must include task.kind.");
  }
  if (allowedActions.some((item) => !ALLOWED_HANDOFF_ACTIONS.has(item))) {
    errors.push("handoff.allowed_actions can only contain project_check or validate.");
  }
  if (envelope.target?.device_selector?.required === true) {
    errors.push("P2 handoff cannot require a phone, emulator, or simulator.");
  }
  const deviceKind = envelope.target?.device_selector?.kind;
  if (deviceKind && deviceKind !== "none") {
    errors.push("P2 handoff device_selector.kind must be none.");
  }
  if (!Array.isArray(envelope.evidence_contract?.expected_types)) {
    errors.push("evidence_contract.expected_types is required.");
  } else if (!envelope.evidence_contract.expected_types.includes("mobilecode.action_evidence.v1")) {
    errors.push("evidence_contract.expected_types must include mobilecode.action_evidence.v1.");
  }

  if (errors.length) {
    throw new HandoffError("MobileCode handoff validation failed.", errors);
  }
  return {
    action,
    approvalId: envelope.handoff.approval_id,
    taskId: envelope.task_id,
    correlationId: envelope.correlation_id
  };
}

export function buildMobileCodeHandoffPayload(envelope) {
  const gate = validateMobileCodeHandoff(envelope);
  return {
    type: "mobilecode.handoff.v1",
    schema_version: envelope.schema_version,
    task_id: gate.taskId,
    correlation_id: gate.correlationId,
    action: gate.action,
    approval: {
      required: true,
      approval_id: gate.approvalId,
      risk: envelope.handoff.risk,
      summary: envelope.handoff.human_summary || envelope.task.title
    },
    source: envelope.source,
    task: {
      title: envelope.task.title,
      input: envelope.task.input,
      timeout_ms: envelope.task.timeout_ms
    },
    evidence_contract: envelope.evidence_contract
  };
}

export function buildMobileCodeHandoffMessage(envelope, { prefix = "[mobilecode-handoff]" } = {}) {
  return `${prefix} ${JSON.stringify(buildMobileCodeHandoffPayload(envelope))}`;
}

function stringValue(value) {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return "";
}
