import assert from "node:assert/strict";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import { DEFAULT_CONFIG, mergeConfig } from "../src/config.js";
import { Relay } from "../src/relay.js";

test("routes MobileCode evidence to Harvis and writes evidence", async () => {
  const temp = await mkdtemp(join(tmpdir(), "lark-relay-test-"));
  try {
    const calls = [];
    const config = mergeConfig(DEFAULT_CONFIG, {
      lark: {
        targetChatIds: ["oc_1"],
        triggerPrefixes: ["[mobilecode]"],
        replyMode: "dry-run"
      },
      harvis: {
        workspaceRoot: "/workspace"
      },
      state: {
        file: join(temp, "state.json"),
        evidenceDir: join(temp, "evidence")
      }
    });
    const relay = new Relay(config, {
      harvisClient: {
        route: async (event, payload) => {
          calls.push({ event, payload });
          return { routerMessage: { ok: true } };
        }
      },
      replyRunner: async () => ({ ok: true, code: 0, stdout: "{}", stderr: "" })
    });
    await relay.loadState();
    const evidence = await relay.routeRawEvent({
      event_id: "evt_1",
      message_id: "om_1",
      chat_id: "oc_1",
      sender_id: "ou_1",
      content: JSON.stringify({
        text:
          '[mobilecode] {"type":"mobilecode.evidence.v1","task_id":"mc_1","status":"verified","summary":"passed","next_action":"review"}'
      })
    });
    assert.equal(evidence.failureKind, "none");
    assert.equal(calls.length, 1);
    assert.equal(calls[0].payload.task_id, "mc_1");

    const daily = join(temp, "evidence", `${new Date().toISOString().slice(0, 10)}.jsonl`);
    const raw = await readFile(daily, "utf8");
    assert.match(raw, /mobilecode\.evidence\.v1/);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});

test("deduplicates processed events", async () => {
  const temp = await mkdtemp(join(tmpdir(), "lark-relay-dedupe-"));
  try {
    let callCount = 0;
    const config = mergeConfig(DEFAULT_CONFIG, {
      lark: { targetChatIds: ["oc_1"], triggerPrefixes: ["[mobilecode]"] },
      state: { file: join(temp, "state.json"), evidenceDir: join(temp, "evidence") }
    });
    const relay = new Relay(config, {
      harvisClient: {
        route: async () => {
          callCount += 1;
          return { routerMessage: { ok: true } };
        }
      },
      replyRunner: async () => ({ ok: true, code: 0, stdout: "{}", stderr: "" })
    });
    await relay.loadState();
    const event = {
      event_id: "evt_same",
      message_id: "om_1",
      chat_id: "oc_1",
      content: JSON.stringify({ text: "[mobilecode] hi" })
    };
    await relay.routeRawEvent(event);
    const second = await relay.routeRawEvent(event);
    assert.equal(callCount, 1);
    assert.equal(second.failureKind, "duplicate_event");
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});

test("routes MobileCode status fixture from Lark event with dry-run reply", async () => {
  const temp = await mkdtemp(join(tmpdir(), "lark-relay-p1-status-"));
  try {
    const calls = [];
    const replies = [];
    const config = mergeConfig(DEFAULT_CONFIG, {
      lark: {
        targetChatIds: ["oc_REPLACE_WITH_CHAT_ID"],
        triggerPrefixes: ["[mobilecode]"],
        replyMode: "dry-run"
      },
      state: {
        file: join(temp, "state.json"),
        evidenceDir: join(temp, "evidence")
      }
    });
    const relay = new Relay(config, {
      harvisClient: {
        route: async (event, payload) => {
          calls.push({ event, payload });
          return {
            routerMessage: { ok: true },
            agentRoomMessage: { ok: true },
            taskStatus: { ok: true }
          };
        }
      },
      replyRunner: async (command, args) => {
        replies.push([command, ...args]);
        return { ok: true, code: 0, stdout: "{}", stderr: "" };
      }
    });
    await relay.loadState();

    const event = JSON.parse(await readFile("examples/mobilecode-status-event.json", "utf8"));
    const evidence = await relay.routeRawEvent(event);

    assert.equal(evidence.failureKind, "none");
    assert.equal(calls[0].payload.type, "mobilecode.status.v1");
    assert.equal(calls[0].payload.state, "running");
    assert.equal(replies.length, 1);
    assert.equal(replies[0].includes("--dry-run"), true);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});
