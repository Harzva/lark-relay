import { createHash, randomUUID } from "node:crypto";

const LOCAL_PATH_RE = /(?:\/Users|\/Volumes|\/private|\/var\/folders)\/[^\s"'`),]+/g;

export function normalizeLarkEvent(raw) {
  const event = typeof raw === "string" ? JSON.parse(raw) : raw;
  const content = extractText(event);
  const messageId =
    stringValue(event.message_id) ||
    stringValue(event.id) ||
    stringValue(event.message?.message_id) ||
    "";
  const eventId =
    stringValue(event.event_id) ||
    stringValue(event.header?.event_id) ||
    stringValue(event.uuid) ||
    stableId("evt", [messageId, content, stringValue(event.sender_id)]);
  const chatId =
    stringValue(event.chat_id) ||
    stringValue(event.message?.chat_id) ||
    stringValue(event.event?.message?.chat_id) ||
    "";
  const senderId =
    stringValue(event.sender_id) ||
    stringValue(event.sender?.sender_id?.open_id) ||
    stringValue(event.event?.sender?.sender_id?.open_id) ||
    "";

  return {
    raw: event,
    eventId,
    requestId: stringValue(event.request_id) || stringValue(event.log_id) || randomUUID(),
    messageId,
    chatId,
    senderId,
    messageType: stringValue(event.message_type) || stringValue(event.message?.message_type),
    chatType: stringValue(event.chat_type) || stringValue(event.message?.chat_type),
    timestamp: stringValue(event.timestamp) || stringValue(event.create_time),
    text: content.trim()
  };
}

export function shouldProcessEvent(event, config) {
  if (!event.messageId) return { ok: false, reason: "missing_message_id" };
  if (config.lark.ignoreSenderIds.includes(event.senderId)) {
    return { ok: false, reason: "ignored_sender" };
  }
  if (config.safety.requireKnownChat && !config.lark.targetChatIds.includes(event.chatId)) {
    return { ok: false, reason: "unknown_chat" };
  }
  const matchedPrefix = config.lark.triggerPrefixes.find((prefix) =>
    event.text.startsWith(prefix)
  );
  if (config.lark.triggerPrefixes.length > 0 && !matchedPrefix) {
    return { ok: false, reason: "trigger_prefix_not_matched" };
  }
  const text =
    matchedPrefix && config.lark.stripTriggerPrefix
      ? event.text.slice(matchedPrefix.length).trim()
      : event.text;
  if (!text) return { ok: false, reason: "empty_message" };
  return { ok: true, reason: "matched", text, matchedPrefix };
}

export function parseRelayPayload(text, config) {
  const decoded = parseJsonish(text);
  if (!decoded) {
    return {
      type: "harvis.command.v1",
      text,
      source: "lark",
      status: "message",
      summary: text
    };
  }
  if (typeof decoded.type !== "string" || !decoded.type.trim()) {
    throw new PayloadError("payload type is required");
  }
  if (
    decoded.type.startsWith("mobilecode.") &&
    !config.mobilecode.acceptedTypes.includes(decoded.type)
  ) {
    throw new PayloadError(`unsupported MobileCode payload type: ${decoded.type}`);
  }
  return decoded;
}

export function payloadToHarvisText(payload) {
  if (payload.type === "mobilecode.evidence.v1") {
    const status = stringValue(payload.status) || "unknown";
    const summary = stringValue(payload.summary) || "MobileCode evidence update.";
    const nextAction = stringValue(payload.next_action) || "review";
    return `MobileCode evidence ${status}: ${summary} Next action: ${nextAction}`;
  }
  if (payload.type === "harvis.approval.v1") {
    return `Approval update: ${stringValue(payload.decision) || "unknown"} ${stringValue(
      payload.reason
    )}`;
  }
  return stringValue(payload.text) || stringValue(payload.summary) || JSON.stringify(payload);
}

export function buildReplyText(payload, config, harvisResult) {
  if (payload.type === "mobilecode.evidence.v1") {
    return config.mobilecode.evidenceReplyTemplate
      .replace("{status}", stringValue(payload.status) || "unknown")
      .replace("{summary}", stringValue(payload.summary) || "")
      .replace("{next_action}", stringValue(payload.next_action) || "review");
  }
  const route = harvisResult?.routerMessage?.ok ? "routed" : "queued";
  return `Lark Relay ${route}: ${payloadToHarvisText(payload).slice(0, 160)}`;
}

export function redact(value) {
  if (typeof value === "string") {
    return value.replace(LOCAL_PATH_RE, "[local-path]");
  }
  if (Array.isArray(value)) return value.map((item) => redact(item));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, redact(item)]));
  }
  return value;
}

export class PayloadError extends Error {
  constructor(message) {
    super(message);
    this.name = "PayloadError";
  }
}

function extractText(event) {
  const candidates = [
    event.message_text,
    event.text,
    event.content,
    event.message?.content,
    event.event?.message?.content
  ];
  for (const candidate of candidates) {
    const text = contentToText(candidate);
    if (text) return text;
  }
  return "";
}

function contentToText(value) {
  if (typeof value !== "string") return stringValue(value);
  const trimmed = value.trim();
  if (!trimmed) return "";
  const decoded = parseJsonish(trimmed);
  if (decoded && typeof decoded.text === "string") return decoded.text;
  return trimmed;
}

function parseJsonish(text) {
  if (typeof text !== "string") return null;
  const trimmed = text.trim();
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    return null;
  }
}

function stableId(prefix, parts) {
  const hash = createHash("sha256").update(parts.filter(Boolean).join("\n")).digest("hex");
  return `${prefix}_${hash.slice(0, 16)}`;
}

function stringValue(value) {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return "";
}
