import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { buildAgentRoomProjection } from "../src/agent-room.js";
import { DEFAULT_CONFIG } from "../src/config.js";

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

test("projects MobileCode status into an Agent Room task update", async () => {
  const status = await readJson("examples/mobilecode-status.readonly.json");
  const projection = buildAgentRoomProjection(status, DEFAULT_CONFIG, {
    eventId: "evt_status"
  });

  assert.equal(projection.schema, "harvis.agent_room.mobilecode_projection.v1");
  assert.equal(projection.event_id, "evt_status");
  assert.equal(projection.message.agent_id, "agent:mobilecode");
  assert.equal(projection.message.role, "mobile-runtime");
  assert.equal(projection.task_status.task_id, "hm_task_project_check_001");
  assert.equal(projection.task_status.status, "running");
  assert.equal(projection.task_status.phase, "project_check");
  assert.match(projection.message.content, /MobileCode status running/);
});

test("projects MobileCode ActionEvidence into Agent Room display data", async () => {
  const actionEvidence = await readJson("examples/mobilecode-action-evidence.project_check.json");
  const projection = buildAgentRoomProjection(actionEvidence, DEFAULT_CONFIG);

  assert.equal(projection.display.title, "MobileCode ActionEvidence");
  assert.equal(projection.task_status.status, "verified");
  assert.equal(projection.task_status.phase, "project_check");
  assert.deepEqual(projection.display.badges, [
    "mobilecode.action_evidence.v1",
    "verified",
    "project_check"
  ]);
  assert.equal(projection.display.artifacts[0].ref, "examples/mobilecode-status.readonly.json");
});
