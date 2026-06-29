import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_CONFIG, mergeConfig } from "../src/config.js";
import { buildConsumeArgs, doctorLarkCli } from "../src/lark.js";

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
