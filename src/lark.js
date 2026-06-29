import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";

export function buildConsumeArgs(config, { maxEvents = 0, timeout = "0" } = {}) {
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

export function buildSendMessageArgs(
  config,
  { text, idempotencyKey = randomUUID(), dryRun = true } = {}
) {
  const chatId = config.lark.targetChatIds?.[0];
  if (!chatId) throw new Error("lark.targetChatIds must contain one chat for send.");
  const args = [];
  if (config.lark.profile) args.push("--profile", config.lark.profile);
  args.push(
    "im",
    "+messages-send",
    "--as",
    config.lark.identity,
    "--chat-id",
    chatId,
    "--text",
    text,
    "--idempotency-key",
    idempotencyKey,
    "--format",
    "json"
  );
  if (dryRun) args.push("--dry-run");
  return args;
}

export function spawnEventConsumer(config, handlers, options = {}) {
  const args = buildConsumeArgs(config, options);
  const child = spawn(config.lark.cliBin, args, {
    cwd: options.cwd || process.cwd(),
    // Keep stdin open: unbounded `lark-cli event consume` treats stdin EOF as shutdown.
    stdio: ["pipe", "pipe", "pipe"]
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

export async function sendMessage(
  config,
  { text, idempotencyKey, dryRun = true, runner = runCommand }
) {
  const args = buildSendMessageArgs(config, { text, idempotencyKey, dryRun });
  const result = await runner(config.lark.cliBin, args);
  return { command: [config.lark.cliBin, ...args], ...result };
}

export async function doctorLarkCli(config, { runner = runCommand, checkChats = false } = {}) {
  const checks = [];
  const runCheck = async (name, args) => {
    const result = await runner(config.lark.cliBin, args);
    checks.push({
      name,
      ok: result.ok,
      code: result.code,
      command: [config.lark.cliBin, ...args],
      error: result.ok ? null : summarizeError(result.stderr || result.stdout)
    });
    return result;
  };

  await runCheck("lark_cli_version", ["--version"]);
  await runCheck("event_consume_help", ["event", "consume", "--help"]);
  await runCheck("im_reply_help", ["im", "+messages-reply", "--help"]);

  const schemaArgs = [];
  if (config.lark.profile) schemaArgs.push("--profile", config.lark.profile);
  schemaArgs.push("event", "schema", config.lark.eventKey, "--json");
  await runCheck("event_schema", schemaArgs);

  const chatVisibility = checkChats
    ? await checkChatVisibility(config, runCheck)
    : null;

  return {
    ok: checks.every((check) => check.ok),
    eventKey: config.lark.eventKey,
    identity: config.lark.identity,
    profile: config.lark.profile || null,
    chatVisibility,
    checks
  };
}

async function checkChatVisibility(config, runCheck) {
  const args = [];
  if (config.lark.profile) args.push("--profile", config.lark.profile);
  args.push(
    "im",
    "+chat-list",
    "--as",
    config.lark.identity,
    "--page-size",
    "100",
    "--format",
    "json"
  );
  const result = await runCheck("im_chat_list", args);
  const chatIds = result.ok ? extractChatIds(result.stdout) : [];
  const visibleChatIds = new Set(chatIds);
  const targetChatIds = config.lark.targetChatIds || [];
  const hasPlaceholderTarget = targetChatIds.some(isPlaceholderChatId);
  const matchedTargetChatCount = targetChatIds.filter((chatId) =>
    visibleChatIds.has(chatId)
  ).length;

  return {
    ok: result.ok,
    visibleChatCount: visibleChatIds.size,
    configuredTargetChatCount: targetChatIds.length,
    matchedTargetChatCount,
    hasPlaceholderTarget,
    readyForLiveSmoke:
      result.ok &&
      visibleChatIds.size > 0 &&
      targetChatIds.length > 0 &&
      matchedTargetChatCount > 0 &&
      !hasPlaceholderTarget
  };
}

export function extractChatIds(stdout = "") {
  let parsed;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    return [];
  }
  return extractChatItems(parsed)
    .map((chat) => chat?.chat_id || chat?.chatId || chat?.id)
    .filter((chatId) => typeof chatId === "string" && chatId.startsWith("oc_"));
}

function extractChatItems(value) {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== "object") return [];
  for (const key of ["chats", "items", "data"]) {
    const nested = value[key];
    if (Array.isArray(nested)) return nested;
    const nestedItems = extractChatItems(nested);
    if (nestedItems.length) return nestedItems;
  }
  return [];
}

function isPlaceholderChatId(chatId) {
  return (
    typeof chatId !== "string" ||
    chatId.trim() === "" ||
    /REPLACE|your_chat_id|example/i.test(chatId)
  );
}

function summarizeError(value = "") {
  return value.trim().split(/\r?\n/).slice(0, 4).join("\n") || "command failed";
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
