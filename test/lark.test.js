import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_CONFIG, mergeConfig } from "../src/config.js";
import { buildConsumeArgs, doctorLarkCli, extractChatIds } from "../src/lark.js";

test("builds persistent Lark event consumer args by default", () => {
  const config = mergeConfig(DEFAULT_CONFIG, {
    lark: {
      profile: "mobilecode",
      eventKey: "im.message.receive_v1",
      identity: "bot"
    }
  });

  assert.deepEqual(buildConsumeArgs(config), [
    "--profile",
    "mobilecode",
    "event",
    "consume",
    "im.message.receive_v1",
    "--as",
    "bot",
    "--timeout",
    "0"
  ]);
});

test("builds bounded Lark event consumer args for smoke runs", () => {
  const config = mergeConfig(DEFAULT_CONFIG, {
    lark: {
      eventKey: "im.message.receive_v1",
      identity: "bot"
    }
  });

  assert.deepEqual(buildConsumeArgs(config, { maxEvents: 1, timeout: "2m" }), [
    "event",
    "consume",
    "im.message.receive_v1",
    "--as",
    "bot",
    "--max-events",
    "1",
    "--timeout",
    "2m"
  ]);
});

test("doctorLarkCli verifies local command surfaces without sending messages", async () => {
  const calls = [];
  const config = mergeConfig(DEFAULT_CONFIG, {
    lark: { profile: "mobilecode", eventKey: "im.message.receive_v1" }
  });

  const report = await doctorLarkCli(config, {
    runner: async (command, args) => {
      calls.push([command, ...args]);
      return { ok: true, code: 0, stdout: "ok", stderr: "" };
    }
  });

  assert.equal(report.ok, true);
  assert.deepEqual(
    calls.map((call) => call.join(" ")),
    [
      "lark-cli --version",
      "lark-cli event consume --help",
      "lark-cli im +messages-reply --help",
      "lark-cli --profile mobilecode event schema im.message.receive_v1 --json"
    ]
  );
});

test("doctorLarkCli can check bot-visible chats without exposing chat details", async () => {
  const calls = [];
  const config = mergeConfig(DEFAULT_CONFIG, {
    lark: {
      profile: "mobilecode",
      eventKey: "im.message.receive_v1",
      targetChatIds: ["oc_live"]
    }
  });

  const report = await doctorLarkCli(config, {
    checkChats: true,
    runner: async (command, args) => {
      calls.push([command, ...args]);
      if (args.includes("+chat-list")) {
        return {
          ok: true,
          code: 0,
          stdout: JSON.stringify({
            data: {
              chats: [
                { chat_id: "oc_live", name: "private test group" },
                { chat_id: "oc_other", name: "another private group" }
              ]
            }
          }),
          stderr: ""
        };
      }
      return { ok: true, code: 0, stdout: "ok", stderr: "" };
    }
  });

  assert.equal(report.ok, true);
  assert.deepEqual(report.chatVisibility, {
    ok: true,
    visibleChatCount: 2,
    configuredTargetChatCount: 1,
    matchedTargetChatCount: 1,
    hasPlaceholderTarget: false,
    readyForLiveSmoke: true
  });
  assert.deepEqual(calls.at(-1), [
    "lark-cli",
    "--profile",
    "mobilecode",
    "im",
    "+chat-list",
    "--as",
    "bot",
    "--page-size",
    "100",
    "--format",
    "json"
  ]);
});

test("doctorLarkCli reports placeholder targets as not ready for live smoke", async () => {
  const config = mergeConfig(DEFAULT_CONFIG, {
    lark: {
      targetChatIds: ["oc_REPLACE_WITH_CHAT_ID"]
    }
  });

  const report = await doctorLarkCli(config, {
    checkChats: true,
    runner: async (_command, args) => {
      if (args.includes("+chat-list")) {
        return {
          ok: true,
          code: 0,
          stdout: JSON.stringify({ data: { chats: [{ chat_id: "oc_live" }] } }),
          stderr: ""
        };
      }
      return { ok: true, code: 0, stdout: "ok", stderr: "" };
    }
  });

  assert.equal(report.chatVisibility.hasPlaceholderTarget, true);
  assert.equal(report.chatVisibility.readyForLiveSmoke, false);
});

test("extractChatIds supports common lark-cli JSON envelopes", () => {
  assert.deepEqual(extractChatIds(JSON.stringify({ chats: [{ chat_id: "oc_1" }] })), [
    "oc_1"
  ]);
  assert.deepEqual(
    extractChatIds(JSON.stringify({ data: { items: [{ chatId: "oc_2" }] } })),
    ["oc_2"]
  );
});
