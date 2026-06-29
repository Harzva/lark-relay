import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

test("Harvis MobileCode task schema constrains P0/P2 handoff actions", async () => {
  const schema = await readJson("schemas/mobilecode-harvis-task.schema.json");
  assert.equal(schema.properties.schema_version.const, "mobilecode.harvis.task.v1");
  assert.deepEqual(schema.properties.task.properties.kind.enum, ["project_check", "validate"]);
  assert.deepEqual(schema.properties.handoff.properties.allowed_actions.items.enum, [
    "project_check",
    "validate"
  ]);
  assert.equal(schema.properties.target.properties.runtime.const, "mobilecode");
});

test("MobileCode read-only export schemas define P1 payload types", async () => {
  const statusSchema = await readJson("schemas/mobilecode-status.schema.json");
  const actionEvidenceSchema = await readJson("schemas/mobilecode-action-evidence.schema.json");

  assert.equal(statusSchema.properties.type.const, "mobilecode.status.v1");
  assert.equal(actionEvidenceSchema.properties.type.const, "mobilecode.action_evidence.v1");
  assert.deepEqual(actionEvidenceSchema.properties.action.enum, ["project_check", "validate"]);
});

test("P0 fixtures share task and correlation identifiers", async () => {
  const task = await readJson("examples/harvis-mobilecode-task.project_check.json");
  const status = await readJson("examples/mobilecode-status.readonly.json");
  const evidence = await readJson("examples/mobilecode-action-evidence.project_check.json");

  assert.equal(task.schema_version, "mobilecode.harvis.task.v1");
  assert.equal(task.task.kind, "project_check");
  assert.equal(task.handoff.requires_approval, true);
  assert.deepEqual(task.handoff.allowed_actions, ["project_check"]);

  assert.equal(status.type, "mobilecode.status.v1");
  assert.equal(status.task_id, task.task_id);
  assert.equal(status.correlation_id, task.correlation_id);
  assert.equal(status.approval.approval_id, task.handoff.approval_id);

  assert.equal(evidence.type, "mobilecode.action_evidence.v1");
  assert.equal(evidence.task_id, task.task_id);
  assert.equal(evidence.correlation_id, task.correlation_id);
  assert.equal(evidence.action, task.task.kind);
  assert.equal(evidence.redaction, "public_safe");
});
