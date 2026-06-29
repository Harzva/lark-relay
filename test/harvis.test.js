import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { DEFAULT_CONFIG, mergeConfig } from "../src/config.js";
import { HarvisClient, toHarvisTaskStatus } from "../src/harvis.js";

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

test("HarvisClient routes MobileCode status to Agent Room and task status", async () => {
  const calls = [];
  const client = new HarvisClient(
    mergeConfig(DEFAULT_CONFIG, {
      harvis: { baseUrl: "http://127.0.0.1:8765" }
    }),
    {
      fetchImpl: async (url, init) => {
        calls.push({ url, body: JSON.parse(init.body) });
        if (url.endsWith("/agent-room/topic")) {
          return new Response(JSON.stringify({ ok: true, data: { topic_id: "topic_mobilecode" } }), {
            status: 200
          });
        }
        if (url.endsWith("/agent-room/task")) {
          return new Response(JSON.stringify({ ok: true, data: { task_id: "task_harvis" } }), {
            status: 200
          });
        }
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }
    }
  );

  const status = await readJson("examples/mobilecode-status.readonly.json");
  const result = await client.route(
    {
      eventId: "evt_status",
      messageId: "om_status",
      chatId: "oc_1",
      senderId: "ou_1"
    },
    status
  );

  assert.equal(result.routerMessage.ok, true);
  assert.equal(result.agentRoomMessage.ok, true);
  assert.equal(result.taskStatus.ok, true);
  assert.deepEqual(
    calls.map((call) => call.url),
    [
      "http://127.0.0.1:8765/router/message",
      "http://127.0.0.1:8765/agent-room/topic",
      "http://127.0.0.1:8765/agent-room/message",
      "http://127.0.0.1:8765/agent-room/task",
      "http://127.0.0.1:8765/agent-room/task/status"
    ]
  );
  assert.equal(calls[1].body.title, "MobileCode Runtime");
  assert.equal(calls[2].body.topic_id, "topic_mobilecode");
  assert.equal(calls[2].body.agent_id, "agent:mobilecode");
  assert.equal(
    calls[2].body.metadata.agent_room_projection.task_status.task_id,
    "hm_task_project_check_001"
  );
  assert.equal(calls[3].body.status, "in_progress");
  assert.equal(calls[3].body.metadata.agent_room_projection.task_status.task_id, "hm_task_project_check_001");
  assert.equal(calls[4].body.task_id, "task_harvis");
  assert.equal(calls[4].body.status, "in_progress");
});

test("maps MobileCode status words to Harvis task status words", () => {
  assert.equal(toHarvisTaskStatus("running"), "in_progress");
  assert.equal(toHarvisTaskStatus("verified"), "done");
  assert.equal(toHarvisTaskStatus("needs_approval"), "waiting_approval");
  assert.equal(toHarvisTaskStatus("failed"), "blocked");
  assert.equal(toHarvisTaskStatus("unexpected"), "in_progress");
});
