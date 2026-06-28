import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";

export function buildConsumeArgs(config, { maxEvents = 0, timeout = "60s" } = {}) {
  const args = [];
  if (config.lark.profile) args.push("--profile", config.lark.profile);
  args.push("event", "consume", config.lark.eventKey, "--as", config.lark.identity);
  if (maxEvents > 0) args.push("--max-events", String(maxEvents));
  if (timeout) args.push("--timeout", timeout);
  return args;
}

export function buildReplyArgs(config, { messageId, text, idempotencyKey = randomUUID() }) {
  const args = [];
  if (config.lark.profile) args.push("--profile", config.lark.profile);
  args.push(
    "im",
    "+messages-reply",
    "--as",
    config.lark.identity,
    "--message-id",
    messageId,
    "--text",
    text,
    "--idempotency-key",
    idempotencyKey,
    "--format",
    "json"
  );
  if (config.lark.replyInThread) args.push("--reply-in-thread");
  if (config.lark.replyMode === "dry-run") args.push("--dry-run");
  return args;
}

export function spawnEventConsumer(config, handlers, options = {}) {
  const args = buildConsumeArgs(config, options);
  const child = spawn(config.lark.cliBin, args, {
    cwd: options.cwd || process.cwd(),
    stdio: ["ignore", "pipe", "pipe"]
  });
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");

  let buffer = "";
  child.stdout.on("data", (chunk) => {
    buffer += chunk;
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() || "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed) handlers.onEventLine?.(trimmed);
    }
  });
  child.stderr.on("data", (chunk) => handlers.onStderr?.(chunk));
  child.on("error", (error) => handlers.onError?.(error));
  child.on("exit", (code, signal) => handlers.onExit?.(code, signal));
  return child;
}

export async function sendReply(config, { messageId, text, runner = runCommand }) {
  const args = buildReplyArgs(config, { messageId, text });
  const result = await runner(config.lark.cliBin, args);
  return { command: [config.lark.cliBin, ...args], ...result };
}

export function runCommand(command, args) {
  return new Promise((resolve) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", (error) => {
      resolve({ ok: false, code: null, stdout, stderr: error.message });
    });
    child.on("exit", (code) => {
      resolve({ ok: code === 0, code, stdout, stderr });
    });
  });
}
