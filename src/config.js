import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

export const DEFAULT_CONFIG = Object.freeze({
  schemaVersion: "lark-relay.config.v1",
  lark: {
    cliBin: "lark-cli",
    profile: "",
    identity: "bot",
    eventKey: "im.message.receive_v1",
    targetChatIds: ["oc_REPLACE_WITH_CHAT_ID"],
    triggerPrefixes: ["[mobilecode]", "@MobileCode"],
    stripTriggerPrefix: true,
    replyMode: "dry-run",
    replyInThread: true,
    ignoreSenderIds: []
  },
  harvis: {
    baseUrl: "http://127.0.0.1:8765",
    workspaceRoot: "",
    tokenEnv: "HARVIS_HTTP_TOKEN",
    tokenFile: "",
    timeoutMs: 5000,
    routes: {
      routerMessage: "/router/message",
      agentRoomMessage: "/agent-room/message",
      taskStatus: "/agent-room/task/status"
    }
  },
  mobilecode: {
    agentId: "agent:mobilecode",
    acceptedTypes: [
      "mobilecode.status.v1",
      "mobilecode.action_evidence.v1",
      "mobilecode.evidence.v1"
    ],
    evidenceReplyTemplate:
      "MobileCode evidence received: {status}. {summary} Next: {next_action}"
  },
  state: {
    file: ".lark-relay/state.json",
    evidenceDir: ".lark-relay/evidence",
    maxProcessedEvents: 1000
  },
  safety: {
    allowLiveReplies: false,
    redactLocalPaths: true,
    requireKnownChat: true,
    dryRunHarvis: false
  }
});

export class ConfigError extends Error {
  constructor(message, details = []) {
    super(message);
    this.name = "ConfigError";
    this.details = details;
  }
}

export async function fileExists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

export async function loadConfig(path) {
  const absolutePath = resolve(path);
  let raw;
  try {
    raw = await readFile(absolutePath, "utf8");
  } catch (error) {
    throw new ConfigError(`Could not read config: ${absolutePath}`, [error.message]);
  }

  let decoded;
  try {
    decoded = JSON.parse(raw);
  } catch (error) {
    throw new ConfigError(`Config is not valid JSON: ${absolutePath}`, [error.message]);
  }

  const config = mergeConfig(DEFAULT_CONFIG, decoded);
  const errors = validateConfig(config);
  if (errors.length) {
    throw new ConfigError("Config validation failed", errors);
  }
  return { config, path: absolutePath };
}

export async function writeDefaultConfig(path, { force = false } = {}) {
  const absolutePath = resolve(path);
  if (!force && (await fileExists(absolutePath))) {
    throw new ConfigError(`Config already exists: ${absolutePath}`, [
      "Use --force to overwrite it."
    ]);
  }
  await mkdir(dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, `${JSON.stringify(DEFAULT_CONFIG, null, 2)}\n`, "utf8");
  return absolutePath;
}

export function mergeConfig(base, override) {
  if (!isPlainObject(override)) return structuredClone(base);
  const output = structuredClone(base);
  mergeInto(output, override);
  return output;
}

function mergeInto(target, source) {
  for (const [key, value] of Object.entries(source)) {
    if (isPlainObject(value) && isPlainObject(target[key])) {
      mergeInto(target[key], value);
    } else {
      target[key] = value;
    }
  }
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function validateConfig(config) {
  const errors = [];
  if (config.schemaVersion !== "lark-relay.config.v1") {
    errors.push("schemaVersion must be lark-relay.config.v1.");
  }
  if (!config.lark || typeof config.lark.cliBin !== "string" || !config.lark.cliBin.trim()) {
    errors.push("lark.cliBin is required.");
  }
  if (!["bot", "user", "auto"].includes(config.lark.identity)) {
    errors.push("lark.identity must be bot, user, or auto.");
  }
  if (!["dry-run", "live"].includes(config.lark.replyMode)) {
    errors.push("lark.replyMode must be dry-run or live.");
  }
  if (config.lark.replyMode === "live" && config.safety?.allowLiveReplies !== true) {
    errors.push("live replies require safety.allowLiveReplies=true.");
  }
  if (!Array.isArray(config.lark.targetChatIds)) {
    errors.push("lark.targetChatIds must be an array.");
  }
  if (!Array.isArray(config.lark.triggerPrefixes)) {
    errors.push("lark.triggerPrefixes must be an array.");
  }
  if (config.safety?.requireKnownChat && config.lark.targetChatIds.length === 0) {
    errors.push("lark.targetChatIds cannot be empty when safety.requireKnownChat=true.");
  }
  if (!config.harvis || typeof config.harvis.baseUrl !== "string") {
    errors.push("harvis.baseUrl is required.");
  }
  if (config.harvis?.baseUrl && !/^https?:\/\//.test(config.harvis.baseUrl)) {
    errors.push("harvis.baseUrl must start with http:// or https://.");
  }
  if (typeof config.harvis?.timeoutMs !== "number" || config.harvis.timeoutMs <= 0) {
    errors.push("harvis.timeoutMs must be a positive number.");
  }
  if (!Array.isArray(config.mobilecode?.acceptedTypes)) {
    errors.push("mobilecode.acceptedTypes must be an array.");
  }
  if (!config.state?.file || typeof config.state.file !== "string") {
    errors.push("state.file is required.");
  }
  if (!config.state?.evidenceDir || typeof config.state.evidenceDir !== "string") {
    errors.push("state.evidenceDir is required.");
  }
  return errors;
}
