import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  buildMobileCodeHandoffMessage,
  buildMobileCodeHandoffPayload,
  HandoffError,
  validateMobileCodeHandoff
} from "../src/handoff.js";

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

test("validates an approval-gated project_check handoff", async () => {
  const envelope = await readJson("examples/harvis-mobilecode-task.project_check.json");
  const gate = validateMobileCodeHandoff(envelope);

  assert.deepEqual(gate, {
    action: "project_check",
    approvalId: "appr_project_check_001",
    taskId: "hm_task_project_check_001",
    correlationId: "corr_mobilecode_harvis_001"
  });
});

test("builds a MobileCode handoff payload from the Harvis task envelope", async () => {
  const envelope = await readJson("examples/harvis-mobilecode-task.project_check.json");
  const payload = buildMobileCodeHandoffPayload(envelope);

  assert.equal(payload.type, "mobilecode.handoff.v1");
  assert.equal(payload.action, "project_check");
  assert.equal(payload.approval.required, true);
  assert.equal(payload.approval.approval_id, "appr_project_check_001");
  assert.equal(payload.evidence_contract.expected_types.includes("mobilecode.action_evidence.v1"), true);
});

test("builds a prefixed handoff message for Lark transport", async () => {
  const envelope = await readJson("examples/harvis-mobilecode-task.project_check.json");
  const message = buildMobileCodeHandoffMessage(envelope);

  assert.equal(message.startsWith("[mobilecode-handoff] "), true);
  assert.equal(message.includes('"type":"mobilecode.handoff.v1"'), true);
});

test("rejects handoffs without approval id", async () => {
  const envelope = await readJson("examples/harvis-mobilecode-task.project_check.json");
  delete envelope.handoff.approval_id;

  assert.throws(() => validateMobileCodeHandoff(envelope), HandoffError);
});

test("rejects P2 handoffs that require a device", async () => {
  const envelope = await readJson("examples/harvis-mobilecode-task.project_check.json");
  envelope.target.device_selector.kind = "android_emulator";
  envelope.target.device_selector.required = true;

  assert.throws(() => validateMobileCodeHandoff(envelope), /validation failed/);
});
