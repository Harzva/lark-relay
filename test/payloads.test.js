import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_CONFIG } from "../src/config.js";
import {
  normalizeLarkEvent,
  parseRelayPayload,
  redact,
  shouldProcessEvent
} from "../src/payloads.js";

test("normalizes Lark text payloads with JSON content", () => {
  const event = normalizeLarkEvent({
    event_id: "evt_1",
    message_id: "om_1",
    chat_id: "oc_1",
    sender_id: "ou_1",
    content: JSON.stringify({ text: "[mobilecode] hello" })
  });
  assert.equal(event.eventId, "evt_1");
  assert.equal(event.messageId, "om_1");
  assert.equal(event.text, "[mobilecode] hello");
});

test("filters by chat and trigger prefix", () => {
  const config = {
    ...structuredClone(DEFAULT_CONFIG),
    lark: {
      ...structuredClone(DEFAULT_CONFIG.lark),
      targetChatIds: ["oc_1"],
      triggerPrefixes: ["[mobilecode]"]
    }
  };
  const event = normalizeLarkEvent({
    event_id: "evt_1",
    message_id: "om_1",
    chat_id: "oc_1",
    content: JSON.stringify({ text: "[mobilecode] ping" })
  });
  const decision = shouldProcessEvent(event, config);
  assert.equal(decision.ok, true);
  assert.equal(decision.text, "ping");
});

test("parses MobileCode evidence payload", () => {
  const payload = parseRelayPayload(
    '{"type":"mobilecode.evidence.v1","status":"verified","summary":"ok"}',
    DEFAULT_CONFIG
  );
  assert.equal(payload.type, "mobilecode.evidence.v1");
  assert.equal(payload.status, "verified");
});

test("redacts local paths", () => {
  const value = redact({ path: "/Users/example/private/file.txt" });
  assert.equal(value.path, "[local-path]");
});
