#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { ConfigError, loadConfig, writeDefaultConfig } from "./config.js";
import { Relay } from "./relay.js";

const VERSION = "0.1.0";

async function main(argv) {
  const [command = "help", ...args] = argv;
  if (command === "--help" || command === "-h" || command === "help") {
    printHelp();
    return 0;
  }
  if (command === "--version" || command === "-v" || command === "version") {
    console.log(VERSION);
    return 0;
  }
  if (command === "init") return initCommand(args);
  if (command === "check") return checkCommand(args);
  if (command === "route-file") return routeFileCommand(args);
  if (command === "run") return runCommand(args);
  throw new Error(`Unknown command: ${command}`);
}

async function initCommand(args) {
  const options = parseOptions(args);
  const configPath = options.config || "lark-relay.config.json";
  const written = await writeDefaultConfig(configPath, { force: options.force === true });
  console.log(`Created ${written}`);
  console.log("Edit lark.targetChatIds and lark.profile before running live relay mode.");
  return 0;
}

async function checkCommand(args) {
  const options = parseOptions(args);
  const { config, path } = await loadConfig(options.config || "lark-relay.config.json");
  const report = {
    ok: true,
    config: path,
    lark: {
      cliBin: config.lark.cliBin,
      profile: config.lark.profile || null,
      replyMode: config.lark.replyMode,
      targetChatCount: config.lark.targetChatIds.length
    },
    harvis: {
      baseUrl: config.harvis.baseUrl,
      workspaceRoot: config.harvis.workspaceRoot || null,
      dryRunHarvis: config.safety.dryRunHarvis
    },
    state: config.state
  };
  console.log(JSON.stringify(report, null, 2));
  return 0;
}

async function routeFileCommand(args) {
  const options = parseOptions(args);
  if (!options.file) throw new Error("route-file requires --file <event.json>");
  const { config } = await loadConfig(options.config || "lark-relay.config.json");
  const raw = await readFile(resolve(options.file), "utf8");
  const event = JSON.parse(raw);
  const relay = new Relay(config);
  await relay.loadState();
  const evidence = await relay.routeRawEvent(event, { reply: options.reply !== false });
  console.log(JSON.stringify(evidence, null, 2));
  return evidence.failureKind === "none" || evidence.skipped ? 0 : 1;
}

async function runCommand(args) {
  const options = parseOptions(args);
  const { config } = await loadConfig(options.config || "lark-relay.config.json");
  const relay = new Relay(config);
  const result = await relay.run({
    once: options.once === true,
    maxEvents: Number(options.maxEvents || options["max-events"] || 0),
    timeout: String(options.timeout || "60s")
  });
  console.log(JSON.stringify(result, null, 2));
  return 0;
}

function parseOptions(args) {
  const options = {};
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg.startsWith("--")) {
      options._ = options._ || [];
      options._.push(arg);
      continue;
    }
    const key = arg.slice(2);
    if (key === "force" || key === "once" || key === "no-reply") {
      options[key === "no-reply" ? "reply" : key] = key === "no-reply" ? false : true;
      continue;
    }
    const value = args[index + 1];
    if (value === undefined || value.startsWith("--")) {
      options[key] = true;
      continue;
    }
    options[key] = value;
    index += 1;
  }
  return options;
}

function printHelp() {
  console.log(`lark-relay v${VERSION}

No-public-IP Lark relay for MobileCode, Harvis, and local agent runtimes.

Usage:
  lark-relay init [--config lark-relay.config.json] [--force]
  lark-relay check [--config lark-relay.config.json]
  lark-relay route-file --file event.json [--config lark-relay.config.json] [--no-reply]
  lark-relay run [--config lark-relay.config.json] [--once] [--max-events 1] [--timeout 60s]

Install:
  npx github:Harzva/lark-relay init
  npm install -g @harzva/lark-relay  # after npm publication

Core idea:
  MobileCode -> Lark -> lark-relay on Mac mini -> http://127.0.0.1 Harvis API.

Safety defaults:
  - dry-run Lark replies
  - known-chat allowlist
  - no raw shell execution
  - Harvis remains localhost-only
`);
}

main(process.argv.slice(2))
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error) => {
    if (error instanceof ConfigError) {
      console.error(error.message);
      for (const detail of error.details) console.error(`- ${detail}`);
      process.exitCode = 2;
      return;
    }
    console.error(error.stack || error.message || String(error));
    process.exitCode = 1;
  });
